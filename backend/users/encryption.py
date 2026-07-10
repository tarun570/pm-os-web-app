"""
Encrypted Django model field using Fernet symmetric encryption.

Both `django-cryptography` and `django-fernet-fields` are abandoned and do
not work with Django 4+ (they import removed utilities like `baseconv` and
`force_text`). Rather than pin to a stale dependency, we ship a ~50-line
field that wraps `cryptography.fernet.Fernet` directly. The encryption
primitive (`cryptography`) is current, audited, and already in our
requirements.

The key is read from settings.FERNET_KEYS (a list, oldest first — supports
key rotation) and falls back to settings.FIELD_ENCRYPTION_KEY (single key)
for the simple case.

Failure modes:
- Reading a row with no key configured → returns "" (empty string). This
  means `GoogleOAuthToken.has_refresh_token()` returns False, so the
  `google_drive_status` endpoint correctly reports "not connected" rather
  than crashing the whole request. Login, registration, and unrelated
  queries keep working when the key is missing.
- Writing a row with no key configured → raises RuntimeError. We refuse
  to silently store plaintext when the schema says it should be encrypted.
- Reading a row encrypted with a different key (rotation) → returns "".
  Treated as "needs reconnect" by the Drive flow.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.db import models
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _get_fernet_or_none() -> Fernet | None:
    """Build a Fernet instance from settings, or return None if unconfigured.

    Returns None (not raise) when the key is missing, so that read paths
    can degrade gracefully. Write paths MUST check for None and refuse.
    """
    keys = getattr(settings, "FERNET_KEYS", None)
    if not keys:
        single = getattr(settings, "FIELD_ENCRYPTION_KEY", "")
        if single:
            keys = [single]
    if not keys:
        return None
    if len(keys) == 1:
        k = keys[0]
        return Fernet(k.encode() if isinstance(k, str) else k)
    return Fernet([
        k.encode() if isinstance(k, str) else k
        for k in keys
    ])


def _get_fernet() -> Fernet:
    """Build a Fernet instance from settings, or raise if unconfigured.

    Use this only on write paths where refusing to encrypt is the right
    behavior. Read paths should use `_get_fernet_or_none()` and degrade
    gracefully when no key is set.
    """
    f = _get_fernet_or_none()
    if f is None:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY (or FERNET_KEYS) is not configured. "
            "Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
    return f


class EncryptedTextField(models.TextField):
    """A TextField that Fernet-encrypts its value at rest.

    The plaintext is set / retrieved as a Python str. On disk, the column
    stores the Fernet token (a URL-safe base64 string). Reading auto-
    decrypts. Writing auto-encrypts.

    Use only for short secret strings (tokens, keys, passwords). Don't use
    for large blobs — Fernet ciphertext is ~33% larger than plaintext, and
    the entire value is read/written as one chunk.

    Behavior when FIELD_ENCRYPTION_KEY is not configured:
    - Reading returns "" (empty string). The row is treated as "no token
      stored" by consumers like `has_refresh_token()`. This is correct:
      the user just hasn't connected Drive yet, or the key was rotated.
    - Writing raises RuntimeError. We refuse to silently store plaintext
      in a column that the schema says should be encrypted.
    """

    description = "Fernet-encrypted text"

    def from_db_value(self, value, expression, connection):
        """Decrypt on read. Tolerate unconfigured key, corruption, rotation."""
        if value is None or value == "":
            return value
        f = _get_fernet_or_none()
        if f is None:
            # No key configured — log once and return empty. Don't crash
            # the request: the calling code (e.g. our has_refresh_token
            # check) treats empty as "not set", which is the safe answer.
            logger.warning(
                "EncryptedTextField read attempted with no FIELD_ENCRYPTION_KEY "
                "configured. Returning empty string. Configure the key in "
                "backend/.env to enable token reads."
            )
            return ""
        try:
            return f.decrypt(value.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError):
            # Stale ciphertext from a previous key, or corrupted value.
            # Treat as "no token stored" rather than 500ing the request.
            return ""

    def to_python(self, value):
        """Called during deserialization (e.g. from form input)."""
        if isinstance(value, str) or value is None:
            return value
        return str(value)

    def get_prep_value(self, value):
        """Encrypt on write. Refuse if no key is configured."""
        if value is None or value == "":
            return value
        if not isinstance(value, str):
            value = str(value)
        # `_get_fernet()` (not `_get_fernet_or_none()`) — we MUST refuse
        # to write plaintext to a column that the schema says is encrypted.
        return _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


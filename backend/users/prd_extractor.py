"""
Extract PRD content from a Google Doc (returned by n8n) and store as JSON.

Pipeline:
  1. Extract the document ID from the prd_url.
  2. Use the user's Google Drive access token (the same one n8n uses) to
     call Drive's `files.export` endpoint with mimeType=text/plain. This
     works under the existing `drive.file` scope — no consent screen
     change, no re-consent for existing users.
  3. Parse the plain text into {title, sections: [{heading, level, text}]}.
  4. Upsert a PRD row inside a transaction.

Auth:
  Re-uses the same GoogleOAuthToken the upload uses. Best-effort by design
  — callers should catch PrdExtractError and log without failing the parent
  flow (mirror of populate_sprint_plan_from_sheet in sheet_importer.py).
"""
from __future__ import annotations

import re

import requests as http_requests
from django.db import transaction
from django.utils import timezone

from users import google_drive
from users.models import FileUpload, PRD


class PrdExtractError(Exception):
    """Raised when the PRD doc can't be read or the text is unusable."""


# Drive export endpoint — returns the doc as plain text. Works under the
# existing `drive.file` scope (the app created the doc, so it can export).
EXPORT_URL = (
    "https://www.googleapis.com/drive/v3/files/{file_id}"
    "/export?mimeType=text/plain"
)

# A numbered heading like "1 Overview" or "3.2 Goals". We use this to
# detect section breaks in the plain-text export of an n8n-generated PRD.
_HEADING_RE = re.compile(r"^(?P<nums>(?:\d+\.)*\d+)\s+(?P<rest>.+)$")

# Headings are short and either fully uppercase or numbered. We cap length
# to avoid eating long paragraphs that happen to be all-caps.
_MAX_HEADING_LEN = 120


def extract_document_id(prd_url: str) -> str:
    """Pull the document ID out of a Google Docs URL.

    Accepts forms like:
      https://docs.google.com/document/d/<ID>/edit
      https://docs.google.com/document/d/<ID>/edit?usp=sharing
      https://docs.google.com/document/d/<ID>

    Returns the bare ID. Raises PrdExtractError if the URL is malformed
    or the ID can't be located. Mirrors sheet_importer.extract_spreadsheet_id.
    """
    if not prd_url:
        raise PrdExtractError("prd_url is empty")

    match = re.search(r"/document/d/([a-zA-Z0-9-_]+)", prd_url)
    if match:
        return match.group(1)

    raise PrdExtractError(
        f"Could not extract document ID from prd_url: {prd_url!r}"
    )


def fetch_doc_as_text(access_token: str, document_id: str) -> str:
    """Call Drive's `files.export` for one doc and return the plain text.

    Raises PrdExtractError on 404 (doc not accessible) or any other non-200.
    """
    url = EXPORT_URL.format(file_id=document_id)
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        response = http_requests.get(url, headers=headers, timeout=30)
    except http_requests.RequestException as exc:
        raise PrdExtractError(
            f"Network error exporting doc {document_id}: {exc}"
        ) from exc

    if response.status_code == 404:
        raise PrdExtractError(
            f"Doc {document_id} not found or not accessible "
            f"(user may not have Drive access)"
        )
    if response.status_code != 200:
        raise PrdExtractError(
            f"Drive export error {response.status_code} for doc "
            f"{document_id}: {response.text[:300]}"
        )

    return response.text


def _is_uppercase_heading(line: str) -> bool:
    """True if `line` looks like an ALL-CAPS heading (<= 120 chars)."""
    if len(line) > _MAX_HEADING_LEN:
        return False
    # Must contain at least one alpha char and ALL alpha chars must be upper.
    has_alpha = False
    for ch in line:
        if ch.isalpha():
            if not ch.isupper():
                return False
            has_alpha = True
    return has_alpha


def parse_text_to_sections(text: str) -> dict:
    """Split plain-text PRD into a structured {title, sections[]} dict.

    Section breaks are detected by either:
      - a numbered prefix like "1 Overview" or "3.2 Goals" (level = number
        of dot-separated components)
      - a short, all-caps line (treated as level 1)

    The first detected heading is promoted to the document title. Empty
    text is folded into a default "Overview" section so the result is
    always renderable.
    """
    lines = text.splitlines()
    sections: list[dict] = []
    title = ""

    current = {"heading": "Overview", "level": 1, "text_lines": []}

    def flush() -> None:
        text_blob = "\n".join(current["text_lines"]).strip()
        # Keep a section if it has text OR if it was explicitly named
        # (so the headings show up even when the doc is sparse).
        if text_blob or current["heading"] != "Overview":
            sections.append({
                "heading": current["heading"],
                "level":   current["level"],
                "text":    text_blob,
            })

    for raw_line in lines:
        stripped = raw_line.strip()

        new_heading = None
        new_level = None

        if stripped and len(stripped) <= _MAX_HEADING_LEN:
            m = _HEADING_RE.match(stripped)
            if m:
                new_heading = m.group("rest").strip()
                new_level = m.group("nums").count(".") + 1
            elif _is_uppercase_heading(stripped):
                new_heading = stripped.title()
                new_level = 1

        if new_heading is not None:
            flush()
            current = {
                "heading": new_heading,
                "level":   new_level,
                "text_lines": [],
            }
            if not title:
                title = new_heading
        else:
            current["text_lines"].append(raw_line)

    flush()
    if not title:
        title = "PRD"

    return {
        "title":        title,
        "sections":     sections,
        "extracted_at": timezone.now().isoformat(),
    }


def extract_and_save_prd(file_upload: FileUpload) -> dict:
    """Fetch the PRD doc, parse it, and persist to file_upload.prd.

    Idempotent: overwrites the existing PRD row for this upload in a
    single transaction. Raises PrdExtractError on hard failures (no URL,
    bad URL, no token, Drive 404, network error, etc.).

    Returns the parsed `content` dict (also what gets written to the row).
    """
    prd_url = file_upload.prd_document
    if not prd_url:
        raise PrdExtractError(
            f"FileUpload {file_upload.id} has no prd_document URL"
        )

    document_id = extract_document_id(prd_url)
    access_token = google_drive.get_valid_access_token(file_upload.user)
    text = fetch_doc_as_text(access_token, document_id)
    content = parse_text_to_sections(text)
    now = timezone.now()

    with transaction.atomic():
        PRD.objects.update_or_create(
            file_upload=file_upload,
            defaults={
                "prd_url":      prd_url,
                "content":      content,
                "extracted_at": now,
            },
        )

    print(
        f"\n[PRD EXTRACT] upload={file_upload.id} "
        f"title={content['title']!r} "
        f"sections={len(content['sections'])} "
        f"chars={len(text)}"
    )
    return content

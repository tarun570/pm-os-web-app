"""
Celery application factory for the PM OS project.

This module is imported by `config/__init__.py` (via `from .celery import app
as celery_app`) so that:

  1. `manage.py` and the runserver process have a fully-constructed Celery
     app object on hand, even though they don't run any tasks themselves.
  2. `celery -A config worker -l info` can find the app and autodiscover
     the `@shared_task` definitions in any `tasks.py` under INSTALLED_APPS.

The Celery configuration itself is read from `django.conf.settings` (see the
`CELERY_*` keys in `config/settings.py`). The `namespace='CELERY'` argument
tells Celery to only read settings prefixed with `CELERY_`, so we can mix
Django's own settings and Celery's in the same file without collisions.

This file follows the standard pattern from the official Celery + Django
docs: https://docs.celeryq.dev/en/stable/django/first-steps-with-django.html
"""
import os

from celery import Celery

# This must run BEFORE `Celery(...)` is constructed, so the app picks up the
# right settings on first import. `setdefault` only sets the variable if it
# isn't already set — safe to call from any process (runserver, worker,
# management commands, wsgi, asgi, etc.).
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# `app` is the Celery application object. The name 'config' is what gets
# passed to the `celery -A config worker` command.
app = Celery('config')

# Pull every `CELERY_*` key from Django settings into Celery's config.
# Without this, the worker wouldn't know about CELERY_BROKER_URL, etc.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Discover `@shared_task` functions in any `tasks.py` module under an
# installed app. We don't need to register them explicitly.
app.autodiscover_tasks()

"""
Project-level package init for the Django settings package.

Importing the Celery app here ensures that when any process (Django
runserver, management commands, wsgi, asgi, or the Celery worker itself)
imports `config`, the Celery application is constructed and triggers
`autodiscover_tasks()`. Without this line, the worker starts but finds
zero tasks because the @shared_task decorators never ran.

This is the standard Celery + Django integration pattern: see
https://docs.celeryq.dev/en/stable/django/first-steps-with-django.html
"""
from .celery import app as celery_app

__all__ = ('celery_app',)

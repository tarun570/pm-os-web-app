"""
Celery tasks for the `users` app.

`process_sow_upload` is the worker-side replacement for the slow parts of
`FileUploadViewSet.upload` (Google Drive token refresh + 300s n8n webhook
POST + response parsing). The view now:

  1. Saves the FileUpload row (status='pending').
  2. Extracts the SOW text (fast, local I/O).
  3. Does a Drive token fast-fail (so users without Drive connected see
     the friendly error immediately, not 5 minutes later).
  4. Enqueues this task with `.delay(file_upload.id)` and returns 202.

The frontend's existing poll loop in `FileUpload.jsx` (every 2s for ~40s)
picks up the row's status transitions as this task progresses.

Idempotency contract: the task can run more than once (worker died mid-
task, message re-delivered because `acks_late=True`). The first thing it
does is check the row's status — if already 'completed' or 'failed', it
returns early without re-POSTing to n8n.

Imports are intentionally lazy (inside the function) so that
`config/__init__.py` importing `celery_app` doesn't force-load the ORM
during Celery app construction.
"""
import json

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded


@shared_task(bind=True, max_retries=2, default_retry_delay=30, name='users.process_sow_upload')
def process_sow_upload(self, upload_id):
    """Send a previously-uploaded SOW file to n8n for processing.

    Args:
        upload_id: The FileUpload row id. The view already saved the row
            and validated the file; we just need to dispatch the slow
            external work.

    Decorator:
        bind=True: gives us `self` so we can call `self.retry(...)` on
            transient failures.
        max_retries=2: up to 3 total attempts (initial + 2 retries).
        default_retry_delay=30: wait 30s between retries.
        name='users.process_sow_upload': stable name for worker logs and
            for `celery -A config inspect registered` queries.
    """
    # Lazy imports — see module docstring for why.
    from django.conf import settings
    import requests as http_requests
    from users import google_drive
    from users.models import FileUpload

    prefix = f"[CELERY TASK process_sow_upload upload={upload_id}]"
    print(f"\n{prefix} picked up by worker")

    # ------------------------------------------------------------------
    # 1. Load the row. If it doesn't exist, the row was deleted between
    #    enqueue and pickup — nothing to do.
    # ------------------------------------------------------------------
    try:
        file_upload = FileUpload.objects.get(id=upload_id)
    except FileUpload.DoesNotExist:
        print(f"{prefix} FileUpload not found; row was deleted. Skipping.")
        return

    # ------------------------------------------------------------------
    # 2. Idempotency guard. If the row is already in a terminal state,
    #    a previous run completed (or the user re-uploaded and the
    #    duplicate task landed here). Don't re-POST to n8n.
    # ------------------------------------------------------------------
    if file_upload.status in ('completed', 'failed'):
        print(f"{prefix} row already in terminal status={file_upload.status!r}; "
              f"skipping (idempotency).")
        return

    # ------------------------------------------------------------------
    # 3. Mark as processing so the first poll shows 'processing' (vs.
    #    'pending' which the frontend already treats as "still working"
    #    via the `!== 'processing'` check).
    # ------------------------------------------------------------------
    file_upload.mark_processing()
    print(f"{prefix} marked as processing")

    # ------------------------------------------------------------------
    # 4. Resolve a fresh Google Drive access token. The refresh_token is
    #    stored encrypted on the user row; get_valid_access_token() will
    #    auto-refresh if expired. We do this here (worker) rather than in
    #    the view so a token that expires between view return and worker
    #    pickup is handled transparently.
    # ------------------------------------------------------------------
    try:
        google_access_token = google_drive.get_valid_access_token(file_upload.user)
        print(f"{prefix} Google Drive: ✓ fresh access token resolved")
    except google_drive.GoogleDriveNotConnected as exc:
        # User disconnected Drive between the view's fast-fail check and
        # the worker pickup. Mark failed and stop — retrying won't help,
        # the user has to reconnect.
        file_upload.mark_failed(str(exc))
        print(f"{prefix} Google Drive: ✗ not connected: {exc}")
        return
    except google_drive.GoogleDriveError as exc:
        file_upload.mark_failed(f"Google Drive error: {exc}")
        print(f"{prefix} Google Drive: ✗ {exc}")
        return

    # ------------------------------------------------------------------
    # 5. POST the file to n8n. This is the slow part — up to 5 minutes
    #    of wall time waiting for the workflow to produce a PRD + sheet.
    # ------------------------------------------------------------------
    webhook_url = settings.N8N_WEBHOOK_URL
    print(f"\n{prefix} [N8N CONFIGURATION]")
    print(f"{prefix}     Webhook URL: {webhook_url}")

    try:
        with open(file_upload.original_file.path, 'rb') as f:
            files = {'file': (file_upload.file_name, f, f'application/{file_upload.file_type}')}
            data = {
                'email': file_upload.user.email,
                'file_name': file_upload.file_name,
                'access_token': google_access_token,
            }

            print(f"\n{prefix} [SENDING TO N8N]")
            print(f"{prefix}     Method: POST")
            print(f"{prefix}     URL: {webhook_url}")
            print(f"{prefix}     Data fields: {list(data.keys())}")
            print(f"{prefix}     File: {file_upload.file_name}")

            response = http_requests.post(
                webhook_url,
                files=files,
                data=data,
                timeout=300,
            )

            print(f"\n{prefix} [N8N RESPONSE]")
            print(f"{prefix}     Status code: {response.status_code}")
            print(f"{prefix}     Headers: {dict(response.headers)}")
            print(f"{prefix}     Body: {response.text[:500] if response.text else '(empty)'}")

        # ------------------------------------------------------------------
        # 6. Handle the response. n8n either:
        #    (a) Returns 200/201 with the final result fields inline (sync
        #        path — we mark completed immediately), or
        #    (b) Returns 200/201 with no result fields (async path — n8n
        #        will POST back to webhook_callback when done), or
        #    (c) Returns a non-2xx (failure).
        # ------------------------------------------------------------------
        if response.status_code in [200, 201]:
            response_data = {}
            if response.text:
                try:
                    response_data = response.json()
                    print(f"{prefix}     Parsed JSON: {response_data}")
                except ValueError:
                    print(f"{prefix}     Could not parse JSON")
                    response_data = {}

            normalized_response = {}
            if isinstance(response_data, list) and response_data:
                first_item = response_data[0]
                if isinstance(first_item, dict):
                    normalized_response = first_item
            elif isinstance(response_data, dict):
                normalized_response = response_data

            def has_direct_result(payload):
                # Accept both 'share_with' (canonical Django name) and
                # 'shared_with' (English past-tense, what one of our
                # n8n workflows sends). Treat as the same key so neither
                # side has to remember which is right.
                return bool(
                    payload.get('processing_result') or
                    payload.get('results') or
                    payload.get('doc_link') or
                    payload.get('sheet_link') or
                    payload.get('share_with') or
                    payload.get('shared_with') or
                    payload.get('prd_url') or
                    payload.get('prd_document')
                )

            if normalized_response and has_direct_result(normalized_response):
                # (a) Sync result path — n8n gave us everything inline.
                print(f"{prefix}     ✓ n8n returned direct result data, "
                      f"completing upload immediately")
                processing_result = (normalized_response.get('processing_result')
                                     or normalized_response.get('results'))
                if processing_result is None:
                    result = {}
                    for k in ['doc_link', 'sheet_link', 'share_with', 'prd_url', 'prd_document']:
                        if payload_k := normalized_response.get(k):
                            result[k] = payload_k
                    if 'share_with' not in result and normalized_response.get('shared_with'):
                        result['share_with'] = normalized_response['shared_with']
                    processing_result = result

                file_upload.processing_result = processing_result
                # n8n currently sends the PRD doc URL as `doc_link` (not
                # `prd_url` / `prd_document`). Fall back through both
                # names so the PRD extractor and the frontend's PRD chip
                # can find it regardless of which n8n workflow version
                # POSTed back. Mirrors the same fallback in
                # views.py:webhook_callback.
                file_upload.prd_document = (normalized_response.get('prd_url')
                                            or normalized_response.get('prd_document')
                                            or normalized_response.get('doc_link'))
                file_upload.project_plan = normalized_response.get('project_plan')
                file_upload.drive_folder_url = (normalized_response.get('drive_folder_url')
                                                or normalized_response.get('folder_url'))
                file_upload.mark_completed(processing_result)
                print(f"{prefix}     ✓ FileUpload marked as completed")

                # Best-effort PRD extraction on the sync path. The async
                # path is covered by webhook_callback (which also calls
                # extract_and_save_prd in a best-effort block). Failures
                # here are logged but don't fail the worker — the upload
                # is already marked completed, the user can always
                # re-trigger via POST /uploads/{id}/refresh_prd/.
                try:
                    from users.prd_extractor import (
                        extract_and_save_prd,
                        PrdExtractError,
                    )
                    if file_upload.prd_document:
                        extract_and_save_prd(file_upload)
                        print(f"{prefix}     ✓ PRD extracted")
                except PrdExtractError as exc:
                    print(f"{prefix}     ⚠️  PRD extract skipped: {exc}")
                except Exception as exc:
                    import traceback
                    print(f"{prefix}     ⚠️  PRD extract failed: {type(exc).__name__}: {exc}")
                    print(traceback.format_exc())

                workflow_id = normalized_response.get('workflow_id')
                if workflow_id:
                    file_upload.n8n_workflow_id = workflow_id
                    file_upload.save()
                    print(f"{prefix}     Workflow ID saved: {workflow_id}")
                return

            # (b) Async callback path — n8n accepted the upload and will
            # POST back to webhook_callback when the workflow finishes.
            file_upload.mark_processing()
            print(f"{prefix}     ✓ Response OK, marked as processing (async callback)")

            workflow_id = None
            if isinstance(response_data, dict):
                workflow_id = response_data.get('workflow_id')
            elif isinstance(response_data, list) and response_data:
                first_item = response_data[0]
                if isinstance(first_item, dict):
                    workflow_id = first_item.get('workflow_id')

            if workflow_id:
                file_upload.n8n_workflow_id = workflow_id
                file_upload.save()
                print(f"{prefix}     Workflow ID saved: {workflow_id}")
            return

        # (c) Non-2xx from n8n. Treat as failure.
        details = response.text
        try:
            parsed = response.json()
            if isinstance(parsed, dict):
                details = parsed.get('message') or parsed.get('detail') or details
        except ValueError:
            pass

        print(f"{prefix}     ❌ Response ERROR: {response.status_code}")
        print(f"{prefix}     Details: {details}")
        file_upload.mark_failed(f"n8n webhook error: {response.status_code} {details}")
        return

    except SoftTimeLimitExceeded:
        # Celery's soft time limit hit (9 minutes). n8n hung past its 300s
        # timeout and we waited. Mark failed; do not retry — n8n is the
        # problem, not us.
        msg = "n8n did not respond in time (soft time limit exceeded)"
        file_upload.mark_failed(msg)
        print(f"{prefix}     ❌ {msg}")
        return

    except http_requests.RequestException as exc:
        # Network/timeout talking to n8n. Retryable — n8n may be having
        # a transient blip.
        try:
            file_upload.mark_failed(f"Network error reaching n8n: {exc}")
        except Exception:
            pass
        print(f"{prefix}     ❌ RequestException: {type(exc).__name__}: {exc}")
        # self.retry raises a Retry exception that Celery catches; the
        # task is re-queued and re-run after `countdown` seconds.
        # exc=e preserves the original exception's traceback in the logs.
        raise self.retry(exc=exc, countdown=60)

    except Exception as exc:
        # Catch-all for anything we didn't expect (file deleted from
        # disk, OOM, etc.). Don't retry — these are usually permanent.
        import traceback
        msg = f"{type(exc).__name__}: {exc}"
        file_upload.mark_failed(msg)
        print(f"{prefix}\n❌ EXCEPTION: {msg}")
        print(f"{prefix}     Traceback:\n{traceback.format_exc()}")
        return

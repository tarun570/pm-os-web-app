from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
# Both `django-cryptography` and `django-fernet-fields` are abandoned and
# don't work with Django 4+. We use a small custom field that wraps the
# `cryptography` library directly (already in requirements).
from users.encryption import EncryptedTextField

class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    is_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    google_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.email

    def mark_verified(self):
        self.is_verified = True
        self.email_verified_at = timezone.now()
        self.save()

    def update_last_login(self):
        self.last_login_at = timezone.now()
        self.save()

  


class EmailVerificationToken(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE)
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    def __str__(self):
        return f"Token for {self.user.email}"

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at


class GoogleOAuthToken(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='google_oauth')
    google_id = models.CharField(max_length=255, unique=True)
    # Token columns are Fernet-encrypted at rest (django-fernet-fields).
    # The encryption key is FIELD_ENCRYPTION_KEY in settings.py — never the DB.
    access_token = EncryptedTextField()
    refresh_token = EncryptedTextField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Google OAuth for {self.user.email}"

    def is_token_expired(self):
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False

    def has_refresh_token(self):
        # Encrypted fields return an empty string (not None) when blank=True.
        return bool(self.refresh_token)


class FileUpload(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='file_uploads')
    original_file = models.FileField(upload_to='uploads/%Y/%m/%d/')
    file_name = models.CharField(max_length=255)
    file_size = models.BigIntegerField()  # in bytes
    file_type = models.CharField(max_length=50)  # e.g., 'pdf', 'docx', 'txt'
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    n8n_workflow_id = models.CharField(max_length=255, null=True, blank=True)

    # Results from n8n — links only, no content. The actual PRD/sprint plan
    # text lives in the user's Google Drive, not here. These columns are
    # cheap (a few hundred bytes of URL strings) and exist purely so the
    # user can jump from "completed upload" in PM OS to the artifact in
    # their Drive with one click.
    processing_result = models.JSONField(null=True, blank=True)
    prd_document = models.URLField(null=True, blank=True)
    project_plan = models.JSONField(null=True, blank=True)
    # The Drive folder n8n wrote outputs to. Lets the user find every
    # artifact PM OS ever generated for them in one place.
    drive_folder_url = models.URLField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    # CSV export state — separate from the main `status` field (which
    # tracks the SOW → PRD/sheet pipeline). The user can request a Jira
    # or Trello export of the sprint plan sheet at any time after the
    # upload completes, and each export has its own independent lifecycle
    # (processing → ready / failed). Possible values for the *_status
    # fields: 'processing', 'ready', 'failed'. NULL means "not requested".
    csv_jira_status = models.CharField(max_length=20, null=True, blank=True)
    csv_trello_status = models.CharField(max_length=20, null=True, blank=True)
    csv_jira_file = models.FileField(upload_to='csv_exports/jira/%Y/%m/%d/', null=True, blank=True)
    csv_trello_file = models.FileField(upload_to='csv_exports/trello/%Y/%m/%d/', null=True, blank=True)
    csv_jira_error = models.TextField(null=True, blank=True)
    csv_trello_error = models.TextField(null=True, blank=True)
    # Direct download URL returned by n8n when the export completes.
    # The browser opens this URL to download the CSV. We persist it so
    # repeat clicks re-download the cached file without re-running n8n.
    # Nullable so existing rows (and rows for which n8n never returned
    # a URL) keep working. Stored on the row because the public Drive
    # link can rotate, and we want the *current* URL on every read.
    csv_jira_url = models.URLField(max_length=2048, null=True, blank=True)
    csv_trello_url = models.URLField(max_length=2048, null=True, blank=True)

    # Parsed Google Sheets ID, extracted from sheet_link at callback time.
    # Forwarded to the Jira/Trello export webhooks so n8n can address the
    # sheet directly without re-parsing the URL. Nullable so existing rows
    # without this field keep working; older rows get the ID re-parsed on
    # demand in _trigger_csv_export.
    sheet_id = models.CharField(max_length=128, null=True, blank=True)

    # Timestamps
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Extracted plain-text content of the SOW (PDF / DOCX / TXT). Filled in
    # right after upload by `users.text_extraction.extract_text`. The file
    # itself remains on disk via `original_file` above — this column is
    # for fast querying (icontains search) and lightweight preview without
    # round-tripping through MEDIA_ROOT. NULL means "not extracted yet"
    # (extraction failed, unsupported type, or row predates this column).
    sow_text = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.file_name} - {self.user.email}"

    def mark_processing(self):
        self.status = 'processing'
        self.processing_started_at = timezone.now()
        self.save()

    def mark_completed(self, result_data):
        self.status = 'completed'
        self.completed_at = timezone.now()
        self.processing_result = result_data
        self.save()

    def mark_failed(self, error_msg):
        self.status = 'failed'
        self.completed_at = timezone.now()
        self.error_message = error_msg
        self.save()


# ----------------------------------------------------------------------------
# Sprint-plan data tables
#
# These three tables are the system of record for everything n8n (or a future
# Django-side LLM) writes into the user's Google Sheet. The user's sheet in
# Drive is a human-readable projection of this data; the chatbot reads from
# here, not from the sheet.
#
# Flow:
#   1. n8n creates the sheet in the user's Drive and POSTs back to
#      webhook_callback with the sheet_link.
#   2. webhook_callback (or a manual /resync_sheet_plan/ call) hands the link
#      to users.sheet_importer.populate_sprint_plan_from_sheet, which uses
#      the user's fresh Drive access token to read the 3 sub-sheets and
#      bulk_create rows into the tables below.
#   3. The chatbot queries these tables through the read endpoints in
#      FileUploadViewSet (sprint_plan, user_stories, resources, sprint_plan_rows).
#
# Re-runs are idempotent: a wipe-then-rewrite of this file_upload's rows
# happens inside a single transaction, so a partially-populated import
# never leaks into the chatbot's view.
# ----------------------------------------------------------------------------

class UserStory(models.Model):
    """One row from the UserStories sub-sheet.

    The sheet has two columns: ProjectName, UserStories (the "As a user, I
    want to..." sentence). We don't synthesize a US_ID here — that's a label
    that only lives on the Sprint Plan sub-sheet, keyed by user_story text.
    """
    file_upload  = models.ForeignKey(
        FileUpload, on_delete=models.CASCADE, related_name='user_stories'
    )
    project_name = models.CharField(max_length=255, db_index=True)
    user_story   = models.TextField()

    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['file_upload', 'id']
        indexes = [
            models.Index(fields=['file_upload', 'project_name']),
        ]

    def __str__(self):
        return f"{self.project_name}: {self.user_story[:60]}"


class Resource(models.Model):
    """One row from the Resources sub-sheet.

    Columns in the sheet: ProjectName, ResourceType, ResourceName,
    AvailableHours, SprintDuration. resource_name is indexed because the
    SprintPlanRow join key is the resource name string.
    """
    file_upload      = models.ForeignKey(
        FileUpload, on_delete=models.CASCADE, related_name='resources'
    )
    project_name     = models.CharField(max_length=255, db_index=True)
    resource_type    = models.CharField(max_length=100, blank=True)
    resource_name    = models.CharField(max_length=255, db_index=True)
    available_hours  = models.IntegerField(null=True, blank=True)
    sprint_duration  = models.CharField(max_length=50, blank=True)

    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['file_upload', 'id']
        indexes = [
            models.Index(fields=['file_upload', 'project_name']),
            models.Index(fields=['file_upload', 'resource_name']),
        ]

    def __str__(self):
        return f"{self.resource_name} ({self.sprint_duration})"


class SprintPlanRow(models.Model):
    """One row from the Sprint Plan sub-sheet.

    Columns in the sheet: ProjectName, UserStory, US_ID, Task, Resources,
    StartDate, EndDate, EstHours, Sprint, Priority, Status.

    user_story and resources are FKs back to the UserStory and Resource
    tables of the SAME file_upload. The raw strings (us_id, resource_name)
    are kept alongside so the chatbot can answer questions about US_ID
    labels without joining, and so a Sprint Plan row can exist even when
    the user_story / resources rows haven't been created yet (FKs are
    nullable; the import code does best-effort resolution by string match).
    """
    file_upload    = models.ForeignKey(
        FileUpload, on_delete=models.CASCADE, related_name='sprint_plan_rows'
    )
    project_name   = models.CharField(max_length=255, db_index=True)

    user_story     = models.ForeignKey(
        UserStory, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sprint_plan_rows',
    )
    us_id          = models.CharField(max_length=50, db_index=True)

    task           = models.TextField()
    resources      = models.ForeignKey(
        Resource, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_sprint_plan_rows',
    )
    resource_name  = models.CharField(max_length=255, blank=True, db_index=True)

    start_date     = models.DateField(null=True, blank=True)
    end_date       = models.DateField(null=True, blank=True)
    est_hours      = models.IntegerField(null=True, blank=True)
    sprint         = models.CharField(max_length=50, blank=True, db_index=True)
    priority       = models.CharField(max_length=20, blank=True, db_index=True)
    status         = models.CharField(max_length=50, blank=True)

    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['file_upload', 'sprint', 'us_id']
        # One row per US_ID per upload. Re-runs overwrite by US_ID.
        constraints = [
            models.UniqueConstraint(
                fields=['file_upload', 'us_id'],
                name='unique_us_id_per_upload',
            )
        ]
        indexes = [
            models.Index(fields=['file_upload', 'sprint']),
            models.Index(fields=['file_upload', 'priority']),
            models.Index(fields=['file_upload', 'status']),
        ]

    def __str__(self):
        return f"{self.us_id} — {self.task[:60]}"

from django.contrib import admin
from django.contrib.auth import authenticate
from django.contrib.auth.admin import UserAdmin
from django.contrib.admin.forms import AdminAuthenticationForm
from users.models import (
    CustomUser, EmailVerificationToken, GoogleOAuthToken, FileUpload,
    UserStory, Resource, SprintPlanRow,PRD
)


class EmailOrUsernameAuthenticationForm(AdminAuthenticationForm):
    """Admin login form that accepts the user's email OR username.

    The default `AdminAuthenticationForm` only checks the `username` field
    against `USERNAME_FIELD` on the model. Our `CustomUser` keeps
    `USERNAME_FIELD = 'email'` but inherits a `username` column from
    `AbstractUser` — the signup view fills `username` with the local-part
    of the email (e.g. `sahuramakant0610` for `sahuramakant0610@gmail.com`).
    So a user typing their email into the admin login box would never match.

    This form accepts either the email or the username, then routes through
    the model's `USERNAME_FIELD` so `authenticate()` still works correctly.
    """
    def clean(self):
        username = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")

        if username is not None and password:
            # CustomUser.USERNAME_FIELD = 'email', so `authenticate(username=...)`
            # ALWAYS looks the user up by email, regardless of the kwarg name.
            # That means we must pass the user's EMAIL to authenticate(), not
            # their `username` column (which is the local-part of the email
            # like `sahuramakant0610`). So if the user typed their `username`
            # column value, convert it to their email first.
            lookup = username
            if "@" not in username:
                # The user typed the `username` column value, not the email.
                # Resolve it to the email so authenticate() can find them.
                try:
                    lookup = CustomUser.objects.get(username=username).email
                except CustomUser.DoesNotExist:
                    pass  # let the default error path run below
            self.user_cache = authenticate(
                self.request, username=lookup, password=password
            )
            if self.user_cache is None:
                raise self.get_invalid_login_error()
            else:
                self.confirm_login_allowed(self.user_cache)

        return self.cleaned_data


class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ("id",'email', 'username', 'is_verified', 'google_id', 'created_at')
    list_filter = ('is_verified', 'created_at')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('is_verified', 'email_verified_at', 'last_login_at', 'google_id')}),
    )


class FileUploadAdmin(admin.ModelAdmin):
    model = FileUpload
    list_display = ('file_name', 'user', 'status', 'file_size', 'has_sow_text', 'uploaded_at', 'completed_at')
    list_filter = ('status', 'uploaded_at', 'completed_at')
    # Auto-managed fields: id, uploaded_at (auto_now_add), updated_at (auto_now),
    # and the timestamps we set in code (processing_started_at, completed_at).
    # `sow_text` is also read-only — the upload view populates it via
    # `users.text_extraction.extract_text` and the API marks it read-only
    # in the serializer, so it shouldn't be hand-edited here.
    readonly_fields = (
        'id', 'uploaded_at', 'processing_started_at', 'completed_at',
        'updated_at', 'processing_result', 'original_file', 'sow_text',
    )
    fieldsets = (
        ('File Information', {
            'fields': ('id', 'user', 'file_name', 'file_size', 'file_type', 'original_file')
        }),
        ('Processing', {
            'fields': ('status', 'n8n_workflow_id', 'processing_started_at', 'error_message')
        }),
        ('Results', {
            'fields': ('processing_result', 'prd_document', 'project_plan', 'drive_folder_url')
        }),
        ('SOW Text (extracted)', {
            'fields': ('sow_text',),
            'description': (
                'Plain-text content extracted from the SOW at upload time '
                '(via users.text_extraction.extract_text). Populated for PDF / '
                'DOCX / TXT; NULL means extraction hasn\'t run or the type is '
                'unsupported. Use the JSON output or the get_text API for the '
                'frontend — this textarea is for debugging.'
            )
        }),
        ('CSV Exports', {
            'fields': (
                'csv_jira_status', 'csv_jira_file', 'csv_jira_error',
                'csv_trello_status', 'csv_trello_file', 'csv_trello_error',
            ),
            'description': (
                'Jira/Trello export state, independent of the main upload status. '
                'Set to processing by export_jira/export_trello actions, then updated '
                'to ready (with a file) or failed (with an error) by csv_callback.'
            )
        }),
        ('Timestamps', {
            'fields': ('uploaded_at', 'completed_at', 'updated_at')
        }),
    )

    def has_sow_text(self, obj):
        """Boolean indicator for the list view — don't render the full text."""
        return bool(obj.sow_text)
    has_sow_text.boolean = True
    has_sow_text.short_description = 'SOW text'


class UserStoryAdmin(admin.ModelAdmin):
    """Admin view for UserStory rows (one per "As a user..." sentence).

    Filters by project_name and the parent FileUpload. Both FKs and the
    user_story text are searchable so the admin can find a story by a
    keyword from the SOW.
    """
    list_display = ('id', 'project_name', 'truncated_user_story', 'file_upload', 'created_at')
    list_filter = ('project_name', 'file_upload')
    search_fields = ('project_name', 'user_story')
    readonly_fields = ('id', 'created_at', 'updated_at')
    list_select_related = ('file_upload',)
    list_per_page = 50

    def truncated_user_story(self, obj):
        # Don't render the full sentence in the list view — most rows
        # have the same "As a user, I want to..." prefix and 200+ chars.
        text = obj.user_story or ''
        return text if len(text) <= 80 else f"{text[:77]}…"
    truncated_user_story.short_description = 'User story'


class ResourceAdmin(admin.ModelAdmin):
    """Admin view for Resource rows.

    Filters by project_name and sprint_duration. resource_name is
    searchable so the admin can locate a role across uploads.
    """
    list_display = ('id', 'resource_name', 'resource_type', 'available_hours',
                    'sprint_duration', 'project_name', 'file_upload', 'created_at')
    list_filter = ('project_name', 'sprint_duration', 'resource_type')
    search_fields = ('resource_name', 'resource_type', 'project_name')
    readonly_fields = ('id', 'created_at', 'updated_at')
    list_select_related = ('file_upload',)
    list_per_page = 50


class SprintPlanRowAdmin(admin.ModelAdmin):
    """Admin view for SprintPlanRow rows (one per US_ID per upload).

    The user_story / resources FKs are the relational links to the
    other two tables; we also keep the raw `us_id` and `resource_name`
    columns so the admin can spot rows where the FK resolution failed
    (e.g. n8n wrote a US_ID that doesn't match any user_story text).
    """
    list_display = ('us_id', 'task', 'sprint', 'priority', 'status',
                    'resource_name', 'start_date', 'end_date', 'est_hours',
                    'project_name', 'file_upload')
    list_filter = ('sprint', 'priority', 'status', 'project_name', 'file_upload')
    search_fields = ('us_id', 'task', 'resource_name', 'project_name')
    # Auto-managed fields and the two FKs that the importer sets — admins
    # shouldn't be hand-editing these to avoid breaking the relational
    # integrity that the chatbot relies on.
    readonly_fields = ('id', 'created_at', 'updated_at')
    list_select_related = ('file_upload', 'user_story', 'resources')
    list_per_page = 50


class PRDAdmin(admin.ModelAdmin):
    list_display = ("file_upload","prd_url","content","extracted_at")

admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(EmailVerificationToken)
admin.site.register(GoogleOAuthToken)
admin.site.register(FileUpload, FileUploadAdmin)
admin.site.register(UserStory, UserStoryAdmin)
admin.site.register(Resource, ResourceAdmin)
admin.site.register(SprintPlanRow, SprintPlanRowAdmin)
admin.site.register(PRD , PRDAdmin)

# Replace Django's default admin login form with one that accepts email OR
# username. See `EmailOrUsernameAuthenticationForm` above for the rationale.
admin.site.login_form = EmailOrUsernameAuthenticationForm
admin.site.login_template = "admin/login.html"  # keep the default template

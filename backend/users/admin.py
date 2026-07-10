from django.contrib import admin
from django.contrib.auth import authenticate
from django.contrib.auth.admin import UserAdmin
from django.contrib.admin.forms import AdminAuthenticationForm
from users.models import CustomUser, EmailVerificationToken, GoogleOAuthToken, FileUpload


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
    list_display = ('email', 'username', 'is_verified', 'google_id', 'created_at')
    list_filter = ('is_verified', 'created_at')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('is_verified', 'email_verified_at', 'last_login_at', 'google_id')}),
    )


class FileUploadAdmin(admin.ModelAdmin):
    model = FileUpload
    list_display = ('file_name', 'user', 'status', 'file_size', 'uploaded_at', 'completed_at')
    list_filter = ('status', 'uploaded_at', 'completed_at')
    readonly_fields = ('id', 'uploaded_at', 'processing_started_at', 'completed_at', 'processing_result')
    fieldsets = (
        ('File Information', {
            'fields': ('id', 'user', 'file_name', 'file_size', 'file_type', 'original_file')
        }),
        ('Processing', {
            'fields': ('status', 'n8n_workflow_id', 'processing_started_at', 'error_message')
        }),
        ('Results', {
            'fields': ('processing_result', 'prd_document', 'project_plan')
        }),
        ('Timestamps', {
            'fields': ('uploaded_at', 'completed_at', 'created_at', 'updated_at')
        }),
    )


admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(EmailVerificationToken)
admin.site.register(GoogleOAuthToken)
admin.site.register(FileUpload, FileUploadAdmin)

# Replace Django's default admin login form with one that accepts email OR
# username. See `EmailOrUsernameAuthenticationForm` above for the rationale.
admin.site.login_form = EmailOrUsernameAuthenticationForm
admin.site.login_template = "admin/login.html"  # keep the default template

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from users.models import CustomUser, EmailVerificationToken, GoogleOAuthToken, FileUpload


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

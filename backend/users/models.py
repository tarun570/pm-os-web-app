from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

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
    access_token = models.TextField()
    refresh_token = models.TextField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Google OAuth for {self.user.email}"

    def is_token_expired(self):
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False


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
    
    # Results from n8n
    processing_result = models.JSONField(null=True, blank=True)
    prd_document = models.URLField(null=True, blank=True)
    project_plan = models.JSONField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    
    # Timestamps
    uploaded_at = models.DateTimeField(auto_now_add=True)
    processing_started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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

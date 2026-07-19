from rest_framework import serializers
from django.contrib.auth import get_user_model
from users.models import (
    EmailVerificationToken, GoogleOAuthToken, FileUpload,
    UserStory, Resource, SprintPlanRow, PRD,
)
import secrets
from django.utils import timezone
from datetime import timedelta
from google.auth.transport import requests
from google.oauth2 import id_token

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    # Computed field: True iff the user has completed the OAuth code-flow
    # consent and has a refresh_token (i.e. can actually call Google Drive
    # APIs on their own behalf). Plain ID-token logins report False.
    has_google_drive_connected = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'first_name', 'last_name',
            'is_verified', 'has_google_drive_connected', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'is_verified', 'has_google_drive_connected')

    def get_has_google_drive_connected(self, obj):
        try:
            return obj.google_oauth.has_refresh_token()
        except GoogleOAuthToken.DoesNotExist:
            return False


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ('email', 'username', 'password', 'password_confirm')

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password': "Passwords don't match"})
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(**validated_data)
        
        # Create verification token
        token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(hours=24)
        EmailVerificationToken.objects.create(
            user=user,
            token=token,
            expires_at=expires_at
        )
        
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class GoogleLoginSerializer(serializers.Serializer):
    token = serializers.CharField()


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class TokenSerializer(serializers.Serializer):
    refresh = serializers.CharField()
    access = serializers.CharField()
    user = UserSerializer()


class FileUploadSummarySerializer(serializers.ModelSerializer):
    """Lightweight projection of FileUpload for list endpoints.

    Used by `GET /api/uploads/list_uploads/` to power the dashboard's
    workspace card. Skips the heavy `sow_text` TextField, the full
    `processing_result` JSON, and the CSV file fields — those are
    still available on the per-row detail endpoint.

    The per-row fields we DO return (id, file_name, status,
    drive_folder_url, timestamps) are small and indexed, so a user
    with N prior uploads produces a response that scales with N rows
    rather than N × hundreds-of-KB.
    """
    class Meta:
        model = FileUpload
        fields = (
            'id', 'file_name', 'file_size', 'file_type', 'status',
            'drive_folder_url',
            'csv_jira_status', 'csv_trello_status',
            'uploaded_at', 'processing_started_at', 'completed_at',
        )
        read_only_fields = fields


class FileUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FileUpload
        fields = (
            'id', 'file_name', 'file_size', 'file_type', 'status',
            'processing_result', 'prd_document', 'project_plan',
            'drive_folder_url', 'error_message',
            'csv_jira_status', 'csv_trello_status',
            'csv_jira_file', 'csv_trello_file',
            'csv_jira_error', 'csv_trello_error',
            'csv_jira_url', 'csv_trello_url',
            'uploaded_at', 'processing_started_at', 'completed_at',
            'original_file',
            'sow_text',
        )
        read_only_fields = (
            'id', 'status', 'processing_result', 'prd_document',
            'project_plan', 'drive_folder_url', 'error_message',
            'csv_jira_status', 'csv_trello_status',
            'csv_jira_file', 'csv_trello_file',
            'csv_jira_error', 'csv_trello_error',
            'csv_jira_url', 'csv_trello_url',
            'uploaded_at', 'processing_started_at', 'completed_at',
            'sow_text',
        )


class FileUploadCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FileUpload
        fields = ('original_file',)

    def create(self, validated_data):
        file_obj = validated_data['original_file']
        file_upload = FileUpload.objects.create(
            user=self.context['request'].user,
            original_file=file_obj,
            file_name=file_obj.name,
            file_size=file_obj.size,
            file_type=file_obj.name.split('.')[-1].lower(),
            status='pending'
        )
        return file_upload


class UserStorySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserStory
        fields = (
            'id', 'project_name', 'user_story',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = (
            'id', 'project_name', 'resource_type', 'resource_name',
            'available_hours', 'sprint_duration',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')


class SprintPlanRowSerializer(serializers.ModelSerializer):
    # Read-only nested representations so the chatbot / UI can render a
    # full sprint plan snapshot in one request without making N+1 queries
    # to expand user_story / resources FKs on the frontend.
    user_story_detail = UserStorySerializer(source='user_story', read_only=True)
    resources_detail  = ResourceSerializer(source='resources', read_only=True)

    class Meta:
        model = SprintPlanRow
        fields = (
            'id', 'project_name',
            'user_story', 'user_story_detail',
            'us_id', 'task',
            'resources', 'resources_detail', 'resource_name',
            'start_date', 'end_date', 'est_hours',
            'sprint', 'priority', 'status',
            'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'user_story_detail', 'resources_detail',
            'created_at', 'updated_at',
        )


class PRDSerializer(serializers.ModelSerializer):
    """Read-only view of an extracted PRD.

    All fields are read-only — PRD rows are written by the webhook_callback
    / Celery task pipeline (best-effort), never by user POST. The frontend
    (and chatbot) hit the `prd` action on FileUploadViewSet to read this.
    """
    class Meta:
        model = PRD
        fields = (
            'id', 'file_upload', 'prd_url', 'content',
            'extracted_at', 'created_at', 'updated_at',
        )
        read_only_fields = fields

from rest_framework import serializers
from django.contrib.auth import get_user_model
from users.models import (
    EmailVerificationToken, GoogleOAuthToken, FileUpload,
    UserStory, Resource, SprintPlanRow,
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
        fields = ('email', 'username', 'first_name', 'last_name', 'password', 'password_confirm')

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

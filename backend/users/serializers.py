from rest_framework import serializers
from django.contrib.auth import get_user_model
from users.models import EmailVerificationToken, GoogleOAuthToken, FileUpload
import secrets
from django.utils import timezone
from datetime import timedelta
from google.auth.transport import requests
from google.oauth2 import id_token

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'username', 'first_name', 'last_name', 'is_verified', 'created_at')
        read_only_fields = ('id', 'created_at', 'is_verified')


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
            'error_message', 'uploaded_at', 'processing_started_at',
            'completed_at', 'original_file'
        )
        read_only_fields = (
            'id', 'status', 'processing_result', 'prd_document',
            'project_plan', 'error_message', 'uploaded_at',
            'processing_started_at', 'completed_at'
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

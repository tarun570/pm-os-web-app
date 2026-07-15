from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from django.core.files.base import ContentFile
from django.shortcuts import redirect
from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from datetime import timedelta
from google.auth.transport import requests
from google.oauth2 import id_token
import uuid
import requests as http_requests
import json
import secrets
import base64
import sys

# Force UTF-8 on stdout/stderr so the emoji-laden debug print() calls
# below don't crash the request handler on Windows (cp1252 default).
# On *nix this is a no-op since stdout is already UTF-8.
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, ValueError):
    # Python < 3.7 or already-detached streams — print() will fall back
    # to the locale default, but debug logs are best-effort anyway.
    pass

from users import google_drive
from users.models import EmailVerificationToken, GoogleOAuthToken, FileUpload, UserStory, Resource, SprintPlanRow
from users.serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer,
    VerifyEmailSerializer, TokenSerializer, GoogleLoginSerializer,
    FileUploadSerializer, FileUploadCreateSerializer,
    UserStorySerializer, ResourceSerializer, SprintPlanRowSerializer,
)
from users.text_extraction import extract_text

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def register(self, request):
        email = request.data.get('email', '').strip()
        if email and User.objects.filter(email__iexact=email).exists():
            return Response(
                {
                    'success': False,
                    'message': 'This email has already been used. Please use a different email or contact the team.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # Get verification token
            token_obj = EmailVerificationToken.objects.get(user=user)
            
            # Send verification email
            verification_link = f"{settings.FRONTEND_URL}/verify-email/{token_obj.token}"
            send_mail(
                subject='Verify your PM OS account',
                message=f'Click here to verify your email: {verification_link}',
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[user.email],
                html_message=f'''
                <html>
                    <body style="font-family: Arial, sans-serif; background-color: #f8f9fc; padding: 20px;">
                        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 32px;">
                            <h2 style="color: #0f1117; margin-bottom: 16px;">Welcome to PM OS</h2>
                            <p style="color: #3a3d4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                                Click the button below to verify your email address and activate your account.
                            </p>
                            <a href="{verification_link}" style="display: inline-block; background: linear-gradient(135deg, #e8365d, #ff4d5a); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-bottom: 24px;">
                                Verify Email
                            </a>
                            <p style="color: #8a8d9a; font-size: 13px; margin-bottom: 0;">
                                Or copy this link: {verification_link}
                            </p>
                        </div>
                    </body>
                </html>
                '''
            )
            
            return Response(
                {
                    'success': True,
                    'message': 'Registration successful. Please check your email to verify your account.',
                    'user': UserSerializer(user).data
                },
                status=status.HTTP_201_CREATED
            )

        if 'email' in serializer.errors:
            return Response(
                {
                    'success': False,
                    'message': 'This email has already been used. Please use a different email or contact the team.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                'success': False,
                'message': 'Registration failed. Please check the submitted data.',
                'errors': serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def login(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']
            password = serializer.validated_data['password']
            
            try:
                user = User.objects.get(email=email)

        
                # USERNAME_FIELD is 'email' on CustomUser, so authenticate()
                # looks up by the email column — not by the 'username' column.
                # Passing user.username here returns None even with a correct
                # password, which surfaces as a 401 "Invalid credentials".
                user = authenticate(username=user.email, password=password)
                
                if user is None:
                    return Response(
                        {'error': 'Invalid credentials'},
                        status=status.HTTP_401_UNAUTHORIZED
                    )
                
                if not user.is_verified:
                    return Response(
                        {'error': 'Please verify your email first'},
                        status=status.HTTP_403_FORBIDDEN
                    )
                
                # Update last login
                user.update_last_login()
                
                # Generate tokens
                refresh = RefreshToken.for_user(user)
                
                return Response(
                    {
                        'refresh': str(refresh),
                        'access': str(refresh.access_token),
                        'user': UserSerializer(user).data
                    },
                    status=status.HTTP_200_OK
                )
            except User.DoesNotExist:
                return Response(
                    {'error': 'Invalid credentials'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def google_login(self, request):
        """Handle Google OAuth login"""
        serializer = GoogleLoginSerializer(data=request.data)
        if serializer.is_valid():
            try:
                # Verify token with Google
                idinfo = id_token.verify_oauth2_token(
                    serializer.validated_data['token'],
                    requests.Request(),
                    settings.GOOGLE_OAUTH_CLIENT_ID
                )
                
                google_id = idinfo.get('sub')
                email = idinfo.get('email')
                first_name = idinfo.get('given_name', '')
                last_name = idinfo.get('family_name', '')
                
                # Try to get existing user
                try:
                    user = User.objects.get(google_id=google_id)
                except User.DoesNotExist:
                    # Try to get by email
                    try:
                        user = User.objects.get(email=email)
                        user.google_id = google_id
                        user.save()
                    except User.DoesNotExist:
                        # Create new user
                        username = email.split('@')[0]
                        # Ensure unique username
                        base_username = username
                        counter = 1
                        while User.objects.filter(username=username).exists():
                            username = f"{base_username}{counter}"
                            counter += 1
                        
                        user = User.objects.create_user(
                            email=email,
                            username=username,
                            first_name=first_name,
                            last_name=last_name,
                            google_id=google_id,
                            is_verified=True,  # Auto-verify for Google accounts
                            password=None  # No password for Google accounts
                        )
                
                # Update last login
                user.update_last_login()
                
                # Generate tokens
                refresh = RefreshToken.for_user(user)

                # Mark this user as having authenticated via Google, but do
                # NOT store any token here. The GoogleOAuthToken model used
                # to write the ID token into `access_token`, which is a
                # category error — ID tokens cannot call Google APIs. Drive
                # access requires the separate OAuth code flow (Connect
                # Google Drive), which populates access_token / refresh_token
                # with real Google OAuth tokens.
                GoogleOAuthToken.objects.update_or_create(
                    user=user,
                    defaults={'google_id': google_id},
                )
                
                return Response(
                    {
                        'refresh': str(refresh),
                        'access': str(refresh.access_token),
                        'user': UserSerializer(user).data,
                        'message': 'Google login successful'
                    },
                    status=status.HTTP_200_OK
                )
            except Exception as e:
                return Response(
                    {'error': f'Google authentication failed: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[AllowAny], authentication_classes=[])
    def verify_email(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        if serializer.is_valid():
            token = serializer.validated_data['token']
            
            try:
                token_obj = EmailVerificationToken.objects.get(token=token)
                
                if not token_obj.is_valid():
                    return Response(
                        {'error': 'Token expired or already used'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                user = token_obj.user
                user.mark_verified()
                token_obj.is_used = True
                token_obj.save()
                
                return Response(
                    {'message': 'Email verified successfully', 'user': UserSerializer(user).data},
                    status=status.HTTP_200_OK
                )
            except EmailVerificationToken.DoesNotExist:
                return Response(
                    {'error': 'Invalid token'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def google_drive_status(self, request):
        """Returns whether the user has connected their Google Drive.

        True only when the user has completed the OAuth code flow AND has a
        stored refresh_token. Users who only ever logged in via the Google
        ID-token flow report False — they need to click "Connect Google
        Drive" to grant the drive.file scope.
        """
        try:
            token_row = request.user.google_oauth
            connected = token_row.has_refresh_token()
        except GoogleOAuthToken.DoesNotExist:
            connected = False
        return Response({'connected': connected}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def google_drive_connect(self, request):
        """Returns a Google consent-screen URL for the user to visit.

        We do not 302-redirect here — the frontend wants JSON so it can react
        uniformly. The frontend does `window.location.href = auth_url` and
        Google handles the rest, eventually landing on the OAuth callback
        (a separate plain Django view).

        A one-time `state` ticket is stored in the user's session so the
        callback can verify the redirect came from a user we issued it to
        (CSRF defense — prevents an attacker from binding the attacker's
        Google account to a victim's PM OS account).
        """
        ticket = secrets.token_urlsafe(32)
        request.session['gdrive_ticket'] = ticket
        request.session['gdrive_user_id'] = request.user.id
    
       


        # Make the session cookie live long enough to survive the Google
        # round-trip. The default is two weeks, which is plenty.
        request.session.set_expiry(60 * 30)  # 30 minutes
        request.session.save()

        try:
            auth_url = google_drive.build_auth_url(ticket)
        except google_drive.GoogleDriveError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'auth_url': auth_url}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete'], permission_classes=[IsAuthenticated])
    def google_drive_disconnect(self, request):
        """Revoke the user's stored tokens and delete the row.

        After this, the user must complete the Connect Drive flow again
        before n8n can write files to their Drive.
        """
        google_drive.disconnect(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        return Response({'message': 'Logged out successfully'}, status=status.HTTP_200_OK)


# ----------------------------------------------------------------------
# Plain Django view (not a DRF @action) for the OAuth callback.
#
# Google's redirect is a GET from the user's browser, after they've been
# redirected to Google from /users/google_drive_connect/. The user is
# NOT authenticated at this point (no JWT in the request) — instead we
# identify them via the one-time `state` ticket stored in their session.
# ----------------------------------------------------------------------
def google_drive_callback(request):
    """OAuth 2.0 redirect target after the user approves Drive access."""
    code = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    # DEBUG: trace which branch we land in. Remove once Drive is working.
    print(f"\n[GD CALLBACK] code={bool(code)} state={bool(state)} "
          f"session_ticket={bool(request.session.get('gdrive_ticket'))} "
          f"session_user_id={request.session.get('gdrive_user_id')}")

    frontend_fallback = f"{settings.FRONTEND_URL}/welcome?gdrive=error"

    if error:
        # User denied consent or Google returned an error.
        return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=denied")

    if not code or not state:
        return redirect(frontend_fallback)

    # Verify the state ticket. The session must contain one and it must
    # match the state Google echoed back. This prevents an attacker from
    # binding their own Google account to a victim's PM OS account by
    # tricking the victim into clicking a crafted URL.
    expected_ticket = request.session.get('gdrive_ticket')
    expected_user_id = request.session.get('gdrive_user_id')
    if not expected_ticket or expected_ticket != state or not expected_user_id:
        return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=invalid_state")

    # The ticket is single-use — pop it now, before the network call,
    # so a refresh of this URL can't replay the exchange.
    request.session.pop('gdrive_ticket', None)
    request.session.pop('gdrive_user_id', None)

    try:
        tokens = google_drive.exchange_code_for_tokens(code)
    except google_drive.GoogleDriveError as exc:
        print(f"google_drive_callback: token exchange failed: {exc}")
        return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=exchange_failed")

    access_token = tokens.get('access_token')
    refresh_token = tokens.get('refresh_token')
    expires_in = tokens.get('expires_in', 3600)
    id_token_str = tokens.get('id_token')

    if not access_token or not refresh_token:
        # A successful token response without a refresh_token is a strong
        # signal that the consent screen was bypassed. The only fix is to
        # force re-consent, so we send the user back to the connect step.
        print("google_drive_callback: token response missing access_token or refresh_token")
        return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=missing_tokens")

    # Identify the user: prefer the session's stored user id, fall back to
    # decoding the id_token. Session is the trusted path.
    user = None
    try:
        user = User.objects.get(id=expected_user_id)
    except User.DoesNotExist:
        # Session referenced a user that no longer exists. Try the id_token.
        if id_token_str:
            try:
                claims = google_drive.decode_id_token(id_token_str)
                email = claims.get('email')
                if email:
                    user = User.objects.filter(email=email).first()
            except (ValueError, Exception):
                pass

    if user is None:
        return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=user_not_found")

    # Use the id_token to get the stable Google user id (sub) if we have
    # one; otherwise keep the existing google_id on the row.
    google_id = None
    if id_token_str:
        try:
            claims = google_drive.decode_id_token(id_token_str)
            google_id = claims.get('sub')
        except (ValueError, Exception):
            pass

    defaults = {
        'access_token': access_token,
        'refresh_token': refresh_token,
        'expires_at': timezone.now() + timedelta(seconds=int(expires_in)),
    }
    if google_id:
        defaults['google_id'] = google_id

    GoogleOAuthToken.objects.update_or_create(
        user=user,
        defaults=defaults,
    )

    return redirect(f"{settings.FRONTEND_URL}/welcome?gdrive=connected")


class FileUploadViewSet(viewsets.ModelViewSet):
    serializer_class = FileUploadSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return FileUpload.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def upload(self, request):
        """Upload a file and send it to n8n webhook"""
        print("\n" + "="*60)
        print("📤 FILE UPLOAD INITIATED")
        print("="*60)
        
        serializer = FileUploadCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            file_upload = serializer.save()
            print(f"\n[1] FILE CREATED:")
            print(f"    Upload ID: {file_upload.id}")
            print(f"    File name: {file_upload.file_name}")
            print(f"    File size: {file_upload.file_size} bytes")
            print(f"    Status: {file_upload.status}")

            # Best-effort SOW text extraction. Persists the plain-text
            # content of the upload to FileUpload.sow_text so the frontend
            # can preview / search without round-tripping through MEDIA_ROOT,
            # and so future features (semantic search, "ask the SOW") have
            # the text on hand. Never fails the upload: extraction is
            # independent of the n8n pipeline that runs further down.
            try:
                extracted = extract_text(
                    file_upload.original_file.path,
                    file_upload.file_type,
                )
                if extracted:
                    file_upload.sow_text = extracted
                    file_upload.save(update_fields=['sow_text', 'updated_at'])
                    print(f"    SOW text: ✓ extracted {len(extracted)} chars")
                else:
                    print(f"    SOW text: — (no text returned for {file_upload.file_type})")
            except Exception as exc:
                print(f"    SOW text: ✗ {exc}")

            try:
                # Trigger n8n webhook
                webhook_url = settings.N8N_WEBHOOK_URL
                # callback_url = settings.N8N_CALLBACK_URL
                
                print(f"\n[2] N8N CONFIGURATION:")
                print(f"    Webhook URL: {webhook_url}")
                # print(f"    Callback URL: {callback_url}")

                # Resolve a fresh Google Drive access token for the user. This
                # may trigger a refresh-token round-trip to Google if the
                # stored access_token is expired. The refresh_token NEVER
                # leaves the server — only the short-lived access_token is
                # sent to n8n below.
                try:
                    google_access_token = google_drive.get_valid_access_token(request.user)
                    print(f"    Google Drive: ✓ fresh access token resolved")
                except google_drive.GoogleDriveNotConnected as exc:
                    file_upload.mark_failed(str(exc))
                    print(f"    Google Drive: ✗ {exc}")
                    return Response(
                        {
                            'error': str(exc),
                            'code': 'gdrive_not_connected',
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                except google_drive.GoogleDriveError as exc:
                    file_upload.mark_failed(f"Google Drive error: {exc}")
                    print(f"    Google Drive: ✗ {exc}")
                    return Response(
                        {
                            'error': f"Google Drive error: {exc}",
                            'code': 'gdrive_error',
                        },
                        status=status.HTTP_502_BAD_GATEWAY,
                    )

                # Prepare file data
                with open(file_upload.original_file.path, 'rb') as f:
                    files = {'file': (file_upload.file_name, f, f'application/{file_upload.file_type}')}
                    data = {
                        # 'upload_id': str(file_upload.id),
                        # 'user_id': str(request.user.id),
                        'email': request.user.email,
                        'file_name': file_upload.file_name,
                        # 'callback_url': callback_url,
                        'access_token': google_access_token,
                    }
                    
                    print(f"\n[3] SENDING TO N8N:")
                    print(f"    Method: POST")
                    print(f"    URL: {webhook_url}")
                    print(f"    Data fields: {list(data.keys())}")
                    print(f"    File: {file_upload.file_name}")
                    
                    # Send to n8n webhook
                    response = http_requests.post(
                        webhook_url,
                        files=files,
                        data=data,
                        timeout=300
                    )
                    
                    print(f"\n[4] N8N RESPONSE:")
                    print(f"    Status code: {response.status_code}")
                    print(f"    Headers: {dict(response.headers)}")
                    print(f"    Body: {response.text[:500] if response.text else '(empty)'}")
                    
                    if response.status_code in [200, 201]:
                        response_data = {}
                        if response.text:
                            try:
                                response_data = response.json()
                                print(f"    Parsed JSON: {response_data}")
                            except ValueError:
                                print(f"    Could not parse JSON")
                                response_data = {}

                        normalized_response = {}
                        if isinstance(response_data, list) and response_data:
                            first_item = response_data[0]
                            if isinstance(first_item, dict):
                                normalized_response = first_item
                        elif isinstance(response_data, dict):
                            normalized_response = response_data

                        def has_direct_result(payload):
                            # Accept both spellings. n8n workflows in the wild
                            # use 'share_with' (Django's canonical name) AND
                            # 'shared_with' (English past-tense). We treat
                            # them as the same key here so neither side has
                            # to remember which name is right.
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
                            print(f"    ✓ n8n returned direct result data, completing upload immediately")
                            processing_result = normalized_response.get('processing_result') or normalized_response.get('results')
                            if processing_result is None:
                                # Build the dict from individual keys, accepting
                                # both 'share_with' and 'shared_with'. If both
                                # are present, prefer the canonical 'share_with'.
                                result = {}
                                for k in ['doc_link', 'sheet_link', 'share_with', 'prd_url', 'prd_document']:
                                    if payload_k := normalized_response.get(k):
                                        result[k] = payload_k
                                # Backfill the alias — only store it if the
                                # canonical key wasn't already provided.
                                if 'share_with' not in result and normalized_response.get('shared_with'):
                                    result['share_with'] = normalized_response['shared_with']
                                processing_result = result

                            file_upload.processing_result = processing_result
                            file_upload.prd_document = normalized_response.get('prd_url') or normalized_response.get('prd_document')
                            file_upload.project_plan = normalized_response.get('project_plan')
                            file_upload.drive_folder_url = normalized_response.get('drive_folder_url') or normalized_response.get('folder_url')
                            file_upload.mark_completed(processing_result)
                            print(f"    ✓ FileUpload marked as completed")

                            workflow_id = normalized_response.get('workflow_id')
                            if workflow_id:
                                file_upload.n8n_workflow_id = workflow_id
                                file_upload.save()
                                print(f"    Workflow ID saved: {workflow_id}")

                            print(f"\n[5] RESPONSE TO FRONTEND:")
                            print(f"    Status: 201 Created")
                            print(f"    Upload ID: {file_upload.id}")
                            print(f"    Final status: {file_upload.status}")
                            print("="*60 + "\n")
                            return Response(
                                {
                                    'message': 'File uploaded and processed',
                                    'upload': FileUploadSerializer(file_upload).data
                                },
                                status=status.HTTP_201_CREATED
                            )

                        file_upload.mark_processing()
                        print(f"    ✓ Response OK, marked as processing")
                        
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
                            print(f"    Workflow ID saved: {workflow_id}")
                        
                        print(f"\n[5] RESPONSE TO FRONTEND:")
                        print(f"    Status: 201 Created")
                        print(f"    Upload ID: {file_upload.id}")
                        print("="*60 + "\n")
                        
                        return Response(
                            {
                                'message': 'File uploaded and sent to processing',
                                'upload': FileUploadSerializer(file_upload).data
                            },
                            status=status.HTTP_201_CREATED
                        )
                    else:
                        details = response.text
                        try:
                            parsed = response.json()
                            if isinstance(parsed, dict):
                                details = parsed.get('message') or parsed.get('detail') or details
                        except ValueError:
                            pass
                        
                        print(f"    ❌ Response ERROR: {response.status_code}")
                        print(f"    Details: {details}")
                        file_upload.mark_failed(f"n8n webhook error: {response.status_code} {details}")
                        print("="*60 + "\n")
                        return Response(
                            {
                                'error': 'Failed to send file to processing',
                                'details': details,
                                'status_code': response.status_code,
                            },
                            status=status.HTTP_400_BAD_REQUEST
                        )
            except Exception as e:
                file_upload.mark_failed(str(e))
                print(f"\n❌ EXCEPTION: {type(e).__name__}")
                print(f"    Message: {str(e)}")
                import traceback
                print(f"    Traceback:\n{traceback.format_exc()}")
                print("="*60 + "\n")
                return Response(
                    {'error': f'Error processing upload: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        print(f"\n❌ VALIDATION FAILED:")
        print(f"    Errors: {serializer.errors}")
        print("="*60 + "\n")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def list_uploads(self, request):
        """Get all files uploaded by the user"""
        uploads = self.get_queryset().order_by('-uploaded_at')
        serializer = FileUploadSerializer(uploads, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def get_text(self, request, pk=None):
        """Return just the extracted SOW text for an upload.

        Lightweight alternative to GET /uploads/{id}/ when the frontend
        only needs the text (preview pane, search highlighting) and the
        full row payload (status, processing_result, csv_*, etc.) is
        wasteful. Returns 404 if the row doesn't exist for this user, and
        an empty string if extraction hasn't run / failed.
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'upload_id': file_upload.id,
                'file_name': file_upload.file_name,
                'file_type': file_upload.file_type,
                'sow_text': file_upload.sow_text or '',
            },
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # Sprint-plan read endpoints
    #
    # These four endpoints expose the 3 tables (UserStory, Resource,
    # SprintPlanRow) that webhook_callback populates by reading the
    # user's Google Sheet. The chatbot will hit these — never the raw
    # Google Sheets API — so queries are fast, indexed, and scoped to
    # the authenticated user.
    # ------------------------------------------------------------------

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def sprint_plan(self, request, pk=None):
        """GET /api/uploads/{id}/sprint_plan/

        Returns the full snapshot: all 3 sub-sheets in one response, plus
        derived counts so the UI can show "12 stories, 4 resources, 12
        tasks" without extra round-trips.
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        # Project name is repeated on every row; just grab it from the
        # first one. Empty string if no rows.
        first_sp = file_upload.sprint_plan_rows.first()
        project_name = first_sp.project_name if first_sp else ''

        return Response(
            {
                'upload_id': file_upload.id,
                'project_name': project_name,
                'counts': {
                    'user_stories': file_upload.user_stories.count(),
                    'resources': file_upload.resources.count(),
                    'sprint_plan_rows': file_upload.sprint_plan_rows.count(),
                },
                'user_stories': UserStorySerializer(
                    file_upload.user_stories.all(), many=True
                ).data,
                'resources': ResourceSerializer(
                    file_upload.resources.all(), many=True
                ).data,
                'sprint_plan_rows': SprintPlanRowSerializer(
                    file_upload.sprint_plan_rows.all(), many=True
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def user_stories(self, request, pk=None):
        """GET /api/uploads/{id}/user_stories/

        Optional query params (all substring matches, case-insensitive):
          ?project_name=AI%20Project
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = file_upload.user_stories.all()
        project_name = request.query_params.get('project_name')
        if project_name:
            qs = qs.filter(project_name__icontains=project_name)
        return Response(UserStorySerializer(qs, many=True).data)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def resources(self, request, pk=None):
        """GET /api/uploads/{id}/resources/

        Optional query params:
          ?project_name=&resource_name=&sprint_duration=
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = file_upload.resources.all()
        for field in ('project_name', 'resource_name', 'sprint_duration', 'resource_type'):
            value = request.query_params.get(field)
            if value:
                qs = qs.filter(**{f'{field}__icontains': value})
        return Response(ResourceSerializer(qs, many=True).data)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def sprint_plan_rows(self, request, pk=None):
        """GET /api/uploads/{id}/sprint_plan_rows/

        Optional query params (all substring matches, case-insensitive):
          ?sprint=Sprint%201&priority=HIGH&status=running&us_id=US1
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        qs = file_upload.sprint_plan_rows.all()
        for field in ('sprint', 'priority', 'status', 'us_id',
                      'resource_name', 'project_name'):
            value = request.query_params.get(field)
            if value:
                qs = qs.filter(**{f'{field}__icontains': value})
        return Response(SprintPlanRowSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def resync_sheet_plan(self, request, pk=None):
        """POST /api/uploads/{id}/resync_sheet_plan/

        Manual re-trigger: re-reads the 3 sub-sheets from the user's
        Google Sheet and rewrites the local tables. Use when the webhook
        import failed (logged but the upload is still marked completed)
        or when the user edited the sheet in Drive and wants the chatbot
        to see the updated data.
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        from users.sheet_importer import populate_sprint_plan_from_sheet, SheetImportError
        try:
            counts = populate_sprint_plan_from_sheet(file_upload)
        except SheetImportError as exc:
            return Response(
                {'error': str(exc), 'code': 'sheet_import_failed'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except google_drive.GoogleDriveNotConnected as exc:
            return Response(
                {'error': str(exc), 'code': 'gdrive_not_connected'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                'message': 'Sprint plan resynced from Google Sheet',
                'counts': counts,
                'upload': FileUploadSerializer(file_upload).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def webhook_callback(self, request):
        """Receive results from n8n webhook"""
        import json
        print("\n" + "="*60)
        print("🔔 N8N WEBHOOK CALLBACK RECEIVED")
        print("="*60)
        
        print(f"\n[1] RAW REQUEST DATA:")
        print(f"    Type: {type(request.data)}")
        print(f"    Content: {request.data}")
        
        print(f"\n[2] REQUEST HEADERS:")
        print(f"    Content-Type: {request.META.get('CONTENT_TYPE', 'N/A')}")
        print(f"    Authorization: {request.META.get('HTTP_AUTHORIZATION', 'None (AllowAny)')}")
        
        try:
            data = request.data

            # Normalize payload: n8n may send a list of items with nested 'json' or 'body'
            print(f"\n[3] PAYLOAD NORMALIZATION:")
            print(f"    Input is list: {isinstance(data, list)}")
            print(f"    Input is dict: {isinstance(data, dict)}")
            
            payload = {}
            if isinstance(data, list):
                print(f"    List length: {len(data)}")
                first = data[0] if len(data) > 0 else {}
                print(f"    First item: {first}")
                if isinstance(first, dict):
                    payload = first.get('json') or first.get('body') or first
                    print(f"    Normalized from list: {payload}")
                else:
                    payload = {}
            elif isinstance(data, dict):
                print(f"    Dict keys: {data.keys()}")
                payload = data.get('json') or data.get('body') or data
                print(f"    Normalized from dict: {payload}")
            else:
                payload = {}
                print(f"    Unknown type, defaulting to empty dict")

            print(f"\n[4] PAYLOAD KEYS AVAILABLE:")
            print(f"    {list(payload.keys())}")

            # Try multiple locations for upload_id
            print(f"\n[5] EXTRACTING UPLOAD_ID:")
            upload_id = payload.get('upload_id') or payload.get('data', {}).get('upload_id')
            print(f"    Found upload_id: {upload_id}")

            if not upload_id:
                print(f"    ❌ ERROR: upload_id is missing!")
                return Response({'error': 'Missing upload_id'}, status=status.HTTP_400_BAD_REQUEST)

            print(f"\n[6] LOOKING UP FILEUPLOAD RECORD:")
            try:
                if request.user and request.user.is_authenticated:
                    file_upload = FileUpload.objects.get(id=upload_id, user=request.user)
                    print(f"    ✓ Found for authenticated user: {request.user.email}")
                else:
                    file_upload = FileUpload.objects.get(id=upload_id)
                    print(f"    ✓ Found (no user filter)")
                print(f"    Current status: {file_upload.status}")
            except FileUpload.DoesNotExist:
                print(f"    ❌ ERROR: FileUpload with id={upload_id} not found!")
                raise

            # Extract result fields. n8n workflows in the wild use BOTH
            # 'share_with' (Django's canonical name) AND 'shared_with'
            # (English past-tense, what one of our workflows sends). We
            # resolve the alias here so the DB row stores the value under
            # the canonical key regardless of which the workflow used.
            print(f"\n[7] EXTRACTING RESULT FIELDS:")
            doc_link = payload.get('doc_link')
            sheet_link = payload.get('sheet_link')
            share_with = payload.get('share_with') or payload.get('shared_with')
            print(f"    doc_link: {doc_link}")
            print(f"    sheet_link: {sheet_link}")
            print(f"    share_with: {share_with}")

            # Best-effort: extract the bare Google Sheets ID from sheet_link
            # so the Jira/Trello export webhooks can address the sheet
            # directly without re-parsing the URL. A malformed legacy URL
            # is logged and skipped — the export endpoint will re-parse on
            # demand. We deliberately do not fail the callback over this.
            sheet_id = None
            if sheet_link:
                try:
                    from users.sheet_importer import extract_spreadsheet_id, SheetImportError
                    sheet_id = extract_spreadsheet_id(sheet_link)
                    print(f"    sheet_id: {sheet_id}")
                except SheetImportError as exc:
                    print(f"    ⚠️  Could not parse sheet_id from sheet_link: {exc}")
                except Exception as exc:
                    print(f"    ⚠️  sheet_id parse error: {type(exc).__name__}: {exc}")

            # Build processing_result from common keys or use provided field
            processing_result = payload.get('processing_result') or payload.get('results')
            print(f"\n[8] BUILDING PROCESSING_RESULT:")
            print(f"    Has processing_result field: {payload.get('processing_result') is not None}")
            print(f"    Has results field: {payload.get('results') is not None}")
            
            if processing_result is None:
                keys = ['doc_link', 'sheet_link', 'share_with', 'prd_url', 'prd_document']
                result = {}
                for k in keys:
                    if payload.get(k) is not None:
                        result[k] = payload.get(k)

                # Backfill 'shared_with' under the canonical 'share_with' key
                # if it wasn't already provided. We don't store the alias
                # itself — the frontend (FileHistory.jsx) only reads
                # processing_result.share_with.
                if 'share_with' not in result and payload.get('shared_with') is not None:
                    result['share_with'] = payload.get('shared_with')

                if result:
                    processing_result = result
                    print(f"    Built from individual keys: {result}")
                else:
                    excluded = {'upload_id', 'status', 'error', 'prd_url', 'prd_document'}
                    processing_result = {k: v for k, v in payload.items() if k not in excluded and v is not None}
                    print(f"    Built from remaining payload: {processing_result}")
            else:
                print(f"    Using provided field: {processing_result}")

            # Check for errors
            print(f"\n[9] CHECKING FOR ERRORS:")
            share_error = payload.get('share_error') or payload.get('share_with_error')
            payload_status = payload.get('status')
            payload_error = payload.get('error')
            print(f"    payload status: {payload_status}")
            print(f"    payload error: {payload_error}")
            print(f"    share_error: {share_error}")
            
            if payload_status == 'failed' or payload_error or share_error:
                print(f"    ⚠️  MARKING AS FAILED")
                msg = payload_error or payload.get('message') or share_error or 'Unknown error'
                print(f"    Error message: {msg}")
                
                if isinstance(processing_result, dict):
                    processing_result['share_error'] = msg
                    if share_error:
                        processing_result['share_with_status'] = 'failed'

                file_upload.processing_result = processing_result
                file_upload.prd_document = payload.get('prd_url') or payload.get('prd_document')
                file_upload.project_plan = payload.get('project_plan')
                if sheet_id:
                    file_upload.sheet_id = sheet_id
                print(f"    Calling mark_failed()...")
                file_upload.mark_failed(msg)
                print(f"    ✓ Status set to: failed")
                
                serialized_upload = FileUploadSerializer(file_upload).data
                print(f"\n[10] RESPONSE:")
                print(f"    Status: 200 OK")
                print(f"    Message: Upload marked as failed")
                print("="*60 + "\n")
                return Response({'message': 'Upload marked as failed', 'upload': serialized_upload, 'processing_result': serialized_upload.get('processing_result')}, status=status.HTTP_200_OK)

            print(f"    ✅ NO ERRORS - MARKING AS COMPLETED")
            file_upload.processing_result = processing_result
            file_upload.prd_document = payload.get('prd_url') or payload.get('prd_document')
            file_upload.project_plan = payload.get('project_plan')
            file_upload.drive_folder_url = payload.get('drive_folder_url') or payload.get('folder_url')
            if sheet_id:
                file_upload.sheet_id = sheet_id
            print(f"    Calling mark_completed()...")
            file_upload.mark_completed(processing_result)
            print(f"    ✓ Status set to: completed")

            # Best-effort sprint-plan import: read the 3 sub-sheets from
            # the user's Google Sheet (which n8n just created) and populate
            # UserStory / Resource / SprintPlanRow tables. Failure here
            # does NOT fail the callback — the user's links are still
            # valid, the chatbot just won't have data until they hit
            # /resync_sheet_plan/ or we re-run from a retry. We log and
            # move on.
            try:
                from users.sheet_importer import (
                    populate_sprint_plan_from_sheet,
                    extract_spreadsheet_id,
                    SheetImportError,
                )
                counts = populate_sprint_plan_from_sheet(file_upload)
                print(f"    ✓ Sprint plan imported: {counts}")
            except SheetImportError as exc:
                print(f"    ⚠️  Sprint plan import skipped: {exc}")
            except Exception as exc:
                import traceback
                print(f"    ⚠️  Sprint plan import failed: {type(exc).__name__}: {exc}")
                print(traceback.format_exc())

            serialized_upload = FileUploadSerializer(file_upload).data
            print(f"\n[10] RESPONSE:")
            print(f"    Status: 200 OK")
            print(f"    Message: Results received and saved")
            print(f"    Serialized upload: {serialized_upload}")
            print("="*60 + "\n")
            return Response({'message': 'Results received and saved', 'upload': serialized_upload, 'processing_result': serialized_upload.get('processing_result')}, status=status.HTTP_200_OK)
            
        except FileUpload.DoesNotExist:
            print(f"\n❌ EXCEPTION: FileUpload not found")
            print("="*60 + "\n")
            return Response(
                {'error': 'Upload not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            print(f"\n❌ EXCEPTION: {type(e).__name__}")
            print(f"    Message: {str(e)}")
            import traceback
            print(f"    Traceback:\n{traceback.format_exc()}")
            print("="*60 + "\n")
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    # ------------------------------------------------------------------
    # CSV export endpoints
    #
    # The user clicks "Export to Jira" / "Export to Trello" on a completed
    # upload. We POST the sheet link, the parsed sheet_id, and (best-effort)
    # a fresh Google access token to a dedicated n8n webhook
    # (JIRA_N8N_WEBHOOK_URL / TRELLO_N8N_WEBHOOK_URL) and mark the export
    # as 'processing'. n8n fetches the sheet, builds the right CSV, and
    # POSTs the bytes back to csv_callback. The frontend polls the upload
    # row until the status flips to 'ready', then hits download_csv to
    # get the file. The access_token is best-effort — if the user has not
    # connected Drive, the export still proceeds against the shared
    # public sheet.
    # ------------------------------------------------------------------

    def _trigger_csv_export(self, request, pk=None, csv_type='jira'):
        """Shared body for export_jira and export_trello.

        csv_type must be 'jira' or 'trello'. The function picks the right
        n8n URL, the right status field, and the right error field.
        """
        if csv_type not in ('jira', 'trello'):
            return Response({'error': 'Invalid csv_type'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Look up the row, scoped to the authenticated user.
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        # 2. Guardrails. The upload must be completed AND have a sheet link.
        if file_upload.status != 'completed':
            return Response(
                {'error': 'Upload is not completed yet', 'status': file_upload.status},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sheet_link = None
        result = file_upload.processing_result
        if isinstance(result, dict):
            sheet_link = result.get('sheet_link')
        elif isinstance(result, list) and result and isinstance(result[0], dict):
            sheet_link = result[0].get('sheet_link')

        if not sheet_link:
            return Response(
                {'error': 'No sheet link available for this upload'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Pick the right n8n URL.
        webhook_url = (
            settings.JIRA_N8N_WEBHOOK_URL if csv_type == 'jira'
            else settings.TRELLO_N8N_WEBHOOK_URL
        )
        if not webhook_url:
            return Response(
                {
                    'error': f'{csv_type.upper()} n8n webhook URL is not configured. '
                             f'Set Jira_n8n_webhook_url / Trello_n8n_webhook_url in .env.',
                    'code': f'{csv_type}_webhook_not_configured',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # 4. Mark the export as 'processing' and persist. The status is
        # per-type (csv_jira_status vs csv_trello_status) so a Jira export
        # in flight doesn't block a Trello export, and vice versa.
        status_field = f'csv_{csv_type}_status'
        setattr(file_upload, status_field, 'processing')
        # Clear any previous error from a prior attempt.
        setattr(file_upload, f'csv_{csv_type}_error', None)
        file_upload.save(update_fields=[status_field, f'csv_{csv_type}_error', 'updated_at'])

        # 5. Best-effort: extract the bare Google Sheets ID. webhook_callback
        # populates file_upload.sheet_id at the moment the sheet is created;
        # older rows may not have it, so re-parse sheet_link as a fallback.
        # A failure here is non-fatal — n8n can still fall back to the
        # public-link path.
        sheet_id = file_upload.sheet_id
        if not sheet_id:
            try:
                from users.sheet_importer import extract_spreadsheet_id, SheetImportError
                sheet_id = extract_spreadsheet_id(sheet_link)
            except SheetImportError as exc:
                print(f"[CSV EXPORT {csv_type.upper()}] upload={file_upload.id} "
                      f"could not parse sheet_id from sheet_link: {exc}")
            except Exception as exc:
                print(f"[CSV EXPORT {csv_type.upper()}] upload={file_upload.id} "
                      f"sheet_id parse error: {type(exc).__name__}: {exc}")

        # 6. Best-effort: mint a fresh Google access token so n8n can read
        # the sheet with the user's own Drive credentials. If the user has
        # not connected Drive, or the token refresh fails, we proceed
        # anyway — the sheet is still shared publicly as a fallback.
        access_token = None
        try:
            access_token = google_drive.get_valid_access_token(file_upload.user)
        except google_drive.GoogleDriveNotConnected:
            # User hasn't connected Drive; fall through with access_token=None.
            pass
        except google_drive.GoogleDriveError as exc:
            # Refresh failed; the user will see this in the n8n logs if
            # the workflow later requires the token. Don't fail the export.
            print(f"[CSV EXPORT {csv_type.upper()}] upload={file_upload.id} "
                  f"token refresh failed for user {file_upload.user_id}: {exc}")

        # 7. Fire-and-forget POST to n8n. n8n does all the heavy lifting
        # and returns the CSV via the csv_callback action below. We send
        # JSON (not multipart) because the payload is tiny.
        payload = {
            'upload_id': str(file_upload.id),
            'sheet_link': sheet_link,
            'sheet_id': sheet_id,
            'access_token': access_token,
            'callback_url': settings.N8N_CSV_CALLBACK_URL,
            'platform': csv_type,
        }

        try:
            response = http_requests.post(webhook_url, json=payload, timeout=30)
            print(f"\n[CSV EXPORT {csv_type.upper()}] upload={file_upload.id} "
                  f"n8n_status={response.status_code} body={response.text[:200] if response.text else '(empty)'}")
        except http_requests.RequestException as exc:
            # Network failure talking to n8n — flip the export to 'failed'
            # so the UI doesn't sit in 'processing' forever.
            err_msg = f'Failed to reach {csv_type} n8n webhook: {exc}'
            setattr(file_upload, status_field, 'failed')
            setattr(file_upload, f'csv_{csv_type}_error', err_msg)
            file_upload.save(update_fields=[status_field, f'csv_{csv_type}_error', 'updated_at'])
            return Response(
                {'error': err_msg, 'code': f'{csv_type}_webhook_unreachable'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 8. n8n acknowledged and gave us a direct download link.
        # Surface it to the frontend — the button will open it and the
        # browser will download the file. No async callback, no polling.
        if 200 <= response.status_code < 300:
            download_url = None
            try:
                n8n_body = response.json()
                if isinstance(n8n_body, dict):
                    download_url = n8n_body.get('download_url')
            except (ValueError, json.JSONDecodeError):
                # n8n returned non-JSON. Treat as no URL available.
                pass

            # Persist the URL on the row so repeat clicks can re-download
            # the cached file without re-running n8n. Flip the status to
            # 'ready' immediately — work is done from our side.
            url_field = f'csv_{csv_type}_url'
            setattr(file_upload, status_field, 'ready')
            setattr(file_upload, url_field, download_url)
            setattr(file_upload, f'csv_{csv_type}_error', None)
            file_upload.save(update_fields=[
                status_field, url_field, f'csv_{csv_type}_error', 'updated_at'
            ])

            # n8n said OK but didn't include a download_url. That's a
            # failure of the n8n workflow's contract — surface it to the
            # user instead of pretending success.
            if not download_url:
                err_msg = (
                    f'n8n returned {response.status_code} without a '
                    f'download_url in the body. Expected {{"success":true,'
                    f'"download_url":"..."}}.'
                )
                setattr(file_upload, status_field, 'failed')
                setattr(file_upload, f'csv_{csv_type}_error', err_msg)
                file_upload.save(update_fields=[
                    status_field, f'csv_{csv_type}_error', 'updated_at'
                ])
                return Response(
                    {'error': err_msg, 'code': f'{csv_type}_webhook_no_url'},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            return Response(
                {
                    'message': f'{csv_type.capitalize()} export ready',
                    'status': 'ready',
                    'download_url': download_url,
                    'upload': FileUploadSerializer(file_upload).data,
                },
                status=status.HTTP_200_OK,
            )

        # n8n returned non-2xx. Treat as failure.
        err_msg = f'n8n returned {response.status_code}: {response.text[:200]}'
        setattr(file_upload, status_field, 'failed')
        setattr(file_upload, f'csv_{csv_type}_error', err_msg)
        file_upload.save(update_fields=[status_field, f'csv_{csv_type}_error', 'updated_at'])
        return Response(
            {'error': err_msg, 'code': f'{csv_type}_webhook_error'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def export_jira(self, request, pk=None):
        """Trigger a Jira-shaped CSV export of the sprint plan sheet."""
        return self._trigger_csv_export(request, pk=pk, csv_type='jira')

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def export_trello(self, request, pk=None):
        """Trigger a Trello-shaped CSV export of the sprint plan sheet."""
        return self._trigger_csv_export(request, pk=pk, csv_type='trello')

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def cancel_export(self, request, pk=None):
        """Soft-cancel an in-flight Jira or Trello CSV export.

        Query param: ?type=jira|trello

        Soft cancel means:
        - The frontend stops polling immediately (the UI flips back to the
          idle "Export to <X>" button so the user can retry).
        - n8n is NOT notified — it will keep working server-side until it
          POSTs the result back to csv_callback. The guard in csv_callback
          (see below) checks the row's status and silently discards the
          late result if it sees 'cancelled', so the user never sees a
          stale "ready" appear after cancelling.
        - The row's csv_<type>_status is flipped to 'cancelled'. The button
          reverts to "Export to <X>" because the UI logic treats 'cancelled'
          like the never-requested state (see FileHistory.jsx handleExport
          step 1 — only 'ready' short-circuits to download).

        Only valid while the export is 'processing'. Cancelling a 'ready'
        or 'failed' export returns 400 — there's nothing to cancel and the
        file (if ready) is still on disk for the user to download.
        """
        csv_type = (request.query_params.get('type') or '').lower()
        if csv_type not in ('jira', 'trello'):
            return Response(
                {'error': 'Query param `type` must be jira or trello'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        status_field = f'csv_{csv_type}_status'
        error_field = f'csv_{csv_type}_error'
        current_status = getattr(file_upload, status_field)

        if current_status != 'processing':
            return Response(
                {
                    'error': f'Cannot cancel: {csv_type} export is not in progress '
                             f'(current status: {current_status or "not started"})',
                    'current_status': current_status,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        setattr(file_upload, status_field, 'cancelled')
        setattr(file_upload, error_field, None)
        file_upload.save(update_fields=[status_field, error_field, 'updated_at'])

        return Response(
            {
                'message': f'{csv_type.capitalize()} export cancelled',
                'upload': FileUploadSerializer(file_upload).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def csv_callback(self, request):
        """Receive the generated CSV from n8n.

        Payload shape (defined here; configure your n8n workflow to match):
            {
                "upload_id": "<FileUpload.id>",
                "csv_type": "jira" | "trello",
                "csv_content": "<base64-encoded CSV bytes>",  # or csv_url
                "status": "ready" | "failed",
                "error": null  # or an error message string
            }

        n8n is unauthenticated (AllowAny) — same as the existing
        webhook_callback. We resolve the user from the upload row itself
        and scope the lookup to that user to prevent cross-user IDOR.
        """
        try:
            data = request.data

            # Normalize payload shape (list-wrapped, json/body envelope)
            # — same trick used by webhook_callback at line 693-709.
            payload = {}
            if isinstance(data, list) and data:
                first = data[0]
                if isinstance(first, dict):
                    payload = first.get('json') or first.get('body') or first
            elif isinstance(data, dict):
                payload = data.get('json') or data.get('body') or data

            upload_id = payload.get('upload_id')
            csv_type = (payload.get('csv_type') or '').lower()
            status_value = (payload.get('status') or '').lower()

            if not upload_id:
                return Response({'error': 'Missing upload_id'}, status=status.HTTP_400_BAD_REQUEST)
            if csv_type not in ('jira', 'trello'):
                return Response(
                    {'error': 'csv_type must be jira or trello'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if status_value not in ('ready', 'failed'):
                return Response(
                    {'error': 'status must be ready or failed'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Look up the row. We use FileUpload.objects.get (not get_queryset)
            # because this endpoint is AllowAny and has no request.user to
            # scope by. The id itself is treated as a capability — anyone who
            # knows the id can complete the export. The id is a BigAutoField
            # and not enumerated by default; this matches the existing
            # webhook_callback's trust model (views.py:729).
            try:
                file_upload = FileUpload.objects.get(id=upload_id)
            except FileUpload.DoesNotExist:
                return Response(
                    {'error': f'FileUpload {upload_id} not found'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            status_field = f'csv_{csv_type}_status'
            error_field = f'csv_{csv_type}_error'
            file_field = f'csv_{csv_type}_file'

            # Soft-cancel guard: if the user clicked Cancel while n8n was
            # working, the row's status is now 'cancelled'. n8n doesn't know
            # about the cancel and will eventually POST back here. We
            # acknowledge the callback with 200 (so n8n's retry logic, if
            # any, stops) but discard the bytes and leave the row's status
            # untouched — so the UI can show the "Export to <X>" button
            # again for a fresh attempt.
            if getattr(file_upload, status_field) == 'cancelled':
                return Response(
                    {'message': f'{csv_type.capitalize()} export was cancelled; ignoring late result'},
                    status=status.HTTP_200_OK,
                )

            if status_value == 'failed':
                # n8n reported a processing failure. Persist the error and
                # flip the status so the UI can show "Export failed".
                file_upload.csv_trello_error = None  # clear the OTHER type's error
                setattr(file_upload, error_field, payload.get('error') or payload.get('message') or 'n8n reported failure')
                setattr(file_upload, status_field, 'failed')
                file_upload.save(update_fields=[error_field, status_field, 'updated_at'])
                return Response({'message': 'Export marked as failed'}, status=status.HTTP_200_OK)

            # status == 'ready' — n8n sent the CSV bytes. We accept either
            # csv_content (base64 string) or csv_url (an http(s) URL we fetch).
            csv_bytes = None
            csv_content = payload.get('csv_content')
            csv_url = payload.get('csv_url')

            if csv_content:
                try:
                    csv_bytes = base64.b64decode(csv_content)
                except (TypeError, ValueError) as exc:
                    return Response(
                        {'error': f'csv_content is not valid base64: {exc}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            elif csv_url:
                try:
                    fetched = http_requests.get(csv_url, timeout=60)
                    fetched.raise_for_status()
                    csv_bytes = fetched.content
                except http_requests.RequestException as exc:
                    return Response(
                        {'error': f'Failed to fetch csv_url: {exc}'},
                        status=status.HTTP_502_BAD_GATEWAY,
                    )
            else:
                return Response(
                    {'error': 'Either csv_content (base64) or csv_url is required when status=ready'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Persist the file. Django's FileField will write it to the
            # configured upload_to path under MEDIA_ROOT.
            filename = f"{file_upload.file_name}_{csv_type}.csv"
            # ContentFile wraps the bytes; .save() writes to disk.
            getattr(file_upload, file_field).save(filename, ContentFile(csv_bytes), save=False)
            setattr(file_upload, status_field, 'ready')
            setattr(file_upload, error_field, None)
            file_upload.save(update_fields=[file_field, status_field, error_field, 'updated_at'])

            return Response(
                {
                    'message': f'{csv_type.capitalize()} CSV saved',
                    'upload': FileUploadSerializer(file_upload).data,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as exc:
            print(f"\n❌ CSV CALLBACK EXCEPTION: {type(exc).__name__}: {exc}")
            import traceback
            print(traceback.format_exc())
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def download_csv(self, request, pk=None):
        """Stream a previously-generated CSV back to the user.

        Query param: ?type=jira|trello
        """
        try:
            file_upload = self.get_queryset().get(pk=pk)
        except FileUpload.DoesNotExist:
            return Response({'error': 'Upload not found'}, status=status.HTTP_404_NOT_FOUND)

        csv_type = (request.query_params.get('type') or '').lower()
        if csv_type not in ('jira', 'trello'):
            return Response(
                {'error': 'Query param `type` must be jira or trello'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_field = f'csv_{csv_type}_file'
        csv_file = getattr(file_upload, file_field)
        if not csv_file:
            return Response(
                {'error': f'No {csv_type} CSV available for this upload'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Stream the file as an attachment so the browser triggers a
        # download instead of trying to render the CSV.
        response = FileResponse(
            csv_file.open('rb'),
            as_attachment=True,
            filename=f"{file_upload.file_name}_{csv_type}.csv",
            content_type='text/csv',
        )
        return response

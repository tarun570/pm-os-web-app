from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from django.shortcuts import redirect
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from google.auth.transport import requests
from google.oauth2 import id_token
import uuid
import requests as http_requests
import json
import secrets

from users import google_drive
from users.models import EmailVerificationToken, GoogleOAuthToken, FileUpload
from users.serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer,
    VerifyEmailSerializer, TokenSerializer, GoogleLoginSerializer,
    FileUploadSerializer, FileUploadCreateSerializer
)

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
                user = authenticate(username=user.username, password=password)
                
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
            
            try:
                # Trigger n8n webhook
                webhook_url = settings.N8N_WEBHOOK_URL
                callback_url = settings.N8N_CALLBACK_URL
                
                print(f"\n[2] N8N CONFIGURATION:")
                print(f"    Webhook URL: {webhook_url}")
                print(f"    Callback URL: {callback_url}")

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
                    files = {'file_0': (file_upload.file_name, f, f'application/{file_upload.file_type}')}
                    data = {
                        'upload_id': str(file_upload.id),
                        'user_id': str(request.user.id),
                        'email': request.user.email,
                        'file_name': file_upload.file_name,
                        'callback_url': callback_url,
                        'google_access_token': google_access_token,
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
                            return bool(
                                payload.get('processing_result') or
                                payload.get('results') or
                                payload.get('doc_link') or
                                payload.get('sheet_link') or
                                payload.get('share_with') or
                                payload.get('prd_url') or
                                payload.get('prd_document')
                            )

                        if normalized_response and has_direct_result(normalized_response):
                            print(f"    ✓ n8n returned direct result data, completing upload immediately")
                            processing_result = normalized_response.get('processing_result') or normalized_response.get('results')
                            if processing_result is None:
                                processing_result = {
                                    k: normalized_response[k]
                                    for k in ['doc_link', 'sheet_link', 'share_with', 'prd_url', 'prd_document']
                                    if k in normalized_response and normalized_response[k] is not None
                                }

                            file_upload.processing_result = processing_result
                            file_upload.prd_document = normalized_response.get('prd_url') or normalized_response.get('prd_document')
                            file_upload.project_plan = normalized_response.get('project_plan')
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

            # Extract result fields
            print(f"\n[7] EXTRACTING RESULT FIELDS:")
            doc_link = payload.get('doc_link')
            sheet_link = payload.get('sheet_link')
            share_with = payload.get('share_with')
            print(f"    doc_link: {doc_link}")
            print(f"    sheet_link: {sheet_link}")
            print(f"    share_with: {share_with}")

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
            print(f"    Calling mark_completed()...")
            file_upload.mark_completed(processing_result)
            print(f"    ✓ Status set to: completed")

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

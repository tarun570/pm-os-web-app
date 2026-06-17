# Google OAuth Setup Guide for PM OS

This guide explains how to set up Google OAuth authentication for both the backend (Django) and frontend (React) of the PM OS application.

## Backend Setup (Django)

### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the "Google+ API"
4. Go to "Credentials" > "Create Credentials" > "OAuth 2.0 Client ID"
5. Choose "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:5173` (for development)
   - `http://localhost:8000` (for backend)
   - Your production domain
7. Copy the Client ID (you'll need this for the frontend)

### Step 2: Configure Backend Environment

Edit `backend/.env`:
```
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

The backend automatically validates Google tokens without needing a Client Secret (using implicit flow for frontend).

### Step 3: Backend Database Models

The backend now includes:
- **CustomUser**: Added `google_id` field to link Google accounts
- **GoogleOAuthToken**: Stores Google OAuth tokens for future API calls

These models were automatically created via migrations.

### Step 4: Google OAuth Login Endpoint

**Endpoint**: `POST /api/users/google_login/`

**Request**:
```json
{
  "token": "google_id_token_from_frontend"
}
```

**Response**:
```json
{
  "refresh": "refresh_token_jwt",
  "access": "access_token_jwt",
  "user": {
    "id": 1,
    "email": "user@gmail.com",
    "username": "username",
    "first_name": "John",
    "last_name": "Doe",
    "is_verified": true,
    "created_at": "2026-06-04T14:00:00Z"
  },
  "message": "Google login successful"
}
```

## Frontend Setup (React)

### Step 1: Install Google OAuth Library

✅ Already installed via npm:
```bash
npm install @react-oauth/google
```

### Step 2: Configure Frontend Environment

Edit `frontend/.env`:
```
VITE_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**Use the same Client ID from Google Cloud Console.**

### Step 3: Google OAuth Integration

The frontend now includes:
1. **GoogleOAuthProvider**: Wraps the entire app in `App.jsx`
2. **Login Page**: Shows Google Sign-In button
3. **useGoogleLogin Hook**: Handles token exchange with Google
4. **Google Login API**: Sends token to backend at `/api/users/google_login/`

### Step 4: How Google Login Works

1. User clicks "Sign in with Google" button on login page
2. Google OAuth dialog appears
3. User selects their Google account
4. Frontend receives ID token from Google
5. Frontend sends token to backend: `POST /api/users/google_login/`
6. Backend verifies token with Google using Client ID
7. Backend creates/updates user account
8. Backend returns JWT tokens
9. Frontend stores tokens and redirects to welcome page

## Features

### Automatic Account Creation
- If user logs in with Google for the first time:
  - New user account is automatically created
  - Email is automatically verified (Google handles verification)
  - User is ready to use the app immediately

### Email Linking
- If user's Google email matches an existing PM OS account:
  - Google ID is linked to existing account
  - Both login methods work with same account
  - User is automatically verified

### Auto-Verified Accounts
- Google OAuth users are marked as verified automatically
- No email verification required for Google accounts
- Immediate access to the platform

## Security Considerations

### Token Validation
- Backend validates Google tokens using `google-auth` library
- Tokens verified against `GOOGLE_OAUTH_CLIENT_ID`
- Invalid tokens are rejected immediately

### No Client Secret
- Frontend uses implicit OAuth flow
- No sensitive Client Secret exposed in frontend code
- Backend validates tokens received from frontend

### JWT Tokens
- Backend generates JWT tokens after validation
- JWT tokens expire in 1 hour
- Refresh tokens expire in 7 days
- Tokens stored in browser localStorage (consider using httpOnly cookies in production)

## Testing Google OAuth Locally

### Test Credentials
For testing purposes, you can use any valid Google account:
1. Personal Gmail account
2. Google Workspace account
3. Any Google account with the configured Client ID

### Manual Testing Steps
1. Start backend: `python manage.py runserver`
2. Start frontend: `npm run dev`
3. Navigate to `http://localhost:5173/login`
4. Click "Sign in with Google"
5. Select your test Google account
6. You should be redirected to the welcome page

## Production Deployment

### Backend Changes
1. Update `ALLOWED_HOSTS` in settings
2. Set `DEBUG=False`
3. Configure real email backend (Gmail SMTP, SendGrid, etc.)
4. Add production domain to Google OAuth redirect URIs

### Frontend Changes
1. Update `VITE_GOOGLE_CLIENT_ID` in `.env`
2. Update `VITE_API_URL` to production API URL
3. Build for production: `npm run build`
4. Deploy built files

### Google Cloud Setup
1. Create production OAuth Client ID with:
   - Authorized JavaScript origins: `https://yourdomain.com`
   - Authorized redirect URIs: `https://yourdomain.com`, `https://api.yourdomain.com`

## Troubleshooting

### "Invalid Google token" Error
- Ensure `GOOGLE_OAUTH_CLIENT_ID` in backend `.env` matches frontend
- Check token is fresh (not expired)
- Verify Google+ API is enabled in Cloud Console

### "Sign in with Google" button doesn't work
- Check `VITE_GOOGLE_CLIENT_ID` in frontend `.env`
- Browser console for CORS errors
- Ensure `GoogleOAuthProvider` wraps the app

### CORS Errors
- Update `CORS_ALLOWED_ORIGINS` in backend `.env`
- Should include frontend URL: `http://localhost:5173`

### User not created after Google login
- Check backend console for errors
- Verify database migrations ran: `python manage.py migrate`
- Check user permissions and database connection

## API Endpoints Summary

### Authentication Endpoints
- `POST /api/users/register/` - Email registration
- `POST /api/users/login/` - Email login
- `POST /api/users/google_login/` - Google OAuth login ✨ **NEW**
- `POST /api/users/verify_email/` - Email verification
- `POST /api/users/logout/` - Logout
- `GET /api/users/me/` - Get current user
- `POST /api/token/refresh/` - Refresh JWT token

## Next Steps

1. Get Google OAuth Client ID from Cloud Console
2. Update `GOOGLE_OAUTH_CLIENT_ID` in both backend and frontend `.env`
3. Test Google login locally
4. Deploy with production credentials when ready

For more information, see:
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [React OAuth Google Documentation](https://www.npmjs.com/package/@react-oauth/google)
- [Django Rest Framework Documentation](https://www.django-rest-framework.org/)

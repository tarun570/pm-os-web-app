# PM OS OAuth Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PM OS Authentication System                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              GOOGLE OAUTH FLOW
                              
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  1. USER BROWSER                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │   React Frontend (Port 5173)                                        │ │
│  │   ┌────────────────────────────────────────────────────────────┐   │ │
│  │   │ App.jsx                                                    │   │ │
│  │   │ └─ GoogleOAuthProvider (wraps entire app)                │   │ │
│  │   │                                                            │   │ │
│  │   │ Login.jsx                                                 │   │ │
│  │   │ ┌─ Email/Password Form                                   │   │ │
│  │   │ └─ Google Sign-In Button ⭐                             │   │ │
│  │   │    └─ useGoogleLogin hook                                │   │ │
│  │   │       └─ Gets ID token from Google                       │   │ │
│  │   │                                                            │   │ │
│  │   │ AuthContext.jsx                                           │   │ │
│  │   │ ├─ login(email, password)                                │   │ │
│  │   │ └─ googleLogin(token) ⭐                                 │   │ │
│  │   │                                                            │   │ │
│  │   │ auth.js (API Client)                                     │   │ │
│  │   │ ├─ authAPI.login()                                       │   │ │
│  │   │ └─ authAPI.googleLogin(token) ⭐                         │   │ │
│  │   │                                                            │   │ │
│  │   └────────────────────────────────────────────────────────────┘   │ │
│  │                                                                      │ │
│  │  localStorage:                                                      │ │
│  │  ├─ access_token (JWT, 1 hour)                                    │ │
│  │  └─ refresh_token (JWT, 7 days)                                   │ │
│  │                                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│                ┌─────────────────┼──────────────────┐                    │
│                │                 │                  │                    │
│                ▼                 ▼                  ▼                    │
│           ┌─────────┐    ┌────────────┐    ┌──────────────┐             │
│           │ Email   │    │ Google     │    │ Google       │             │
│           │ Login   │    │ OAuth      │    │ Sign-In      │             │
│           │         │    │ Button     │    │ Dialog       │             │
│           │ POST    │    │            │    │              │             │
│           │ /login/ │    │ Redirects  │    │ Returns:     │             │
│           └─────────┘    │ to Google  │    │ - id_token   │             │
│                          │            │    │ - access_tok │             │
│                          │ User       │    │ - expires_in │             │
│                          │ selects    │    │              │             │
│                          │ account    │    └──────────────┘             │
│                          │            │           ▲                     │
│                          │ Authorizes │           │                     │
│                          │ app        │           │                     │
│                          └────────────┘           │                     │
│                                                   │                     │
│                                         ┌─────────────────┐             │
│                                         │ Google OAuth    │             │
│                                         │ Authorization   │             │
│                                         │ Server          │             │
│                                         │                 │             │
│                                         │ Handles:        │             │
│                                         │ - User auth     │             │
│                                         │ - Consent       │             │
│                                         │ - Token gen     │             │
│                                         └─────────────────┘             │
│                                                   ▲                     │
│                                                   │                     │
└───────────────────────────────────────────────────┼─────────────────────┘
                                                    │
                                          ┌─────────────────┐
                                          │  Google OAuth   │
                                          │  Servers        │
                                          │ (External)      │
                                          │                 │
                                          │ accounts.google │
                                          │ .com            │
                                          └─────────────────┘


        SENDING TOKEN TO BACKEND (Post-Auth)
        
┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  Frontend sends token to backend:                                         │
│  POST /api/users/google_login/                                           │
│  {                                                                        │
│    "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6I..."                         │
│  }                                                                        │
│                                                                            │
│                              ▼                                           │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                   Django Backend (Port 8000)                      │  │
│  │                                                                    │  │
│  │  users/views.py - google_login() endpoint                        │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │ 1. Receive token from frontend                             ││  │
│  │  │                                                             ││  │
│  │  │ 2. Verify with Google:                                    ││  │
│  │  │    id_token.verify_oauth2_token(                          ││  │
│  │  │      token,                                               ││  │
│  │  │      requests.Request(),                                 ││  │
│  │  │      settings.GOOGLE_OAUTH_CLIENT_ID                    ││  │
│  │  │    )                                                      ││  │
│  │  │                                                             ││  │
│  │  │ 3. Extract claims:                                        ││  │
│  │  │    - google_id (unique identifier)                       ││  │
│  │  │    - email                                                ││  │
│  │  │    - first_name                                           ││  │
│  │  │    - last_name                                            ││  │
│  │  │                                                             ││  │
│  │  │ 4. Find or create user:                                   ││  │
│  │  │                                                             ││  │
│  │  │    ├─ Check by google_id ──► Found? Use it               ││  │
│  │  │    │                                                       ││  │
│  │  │    └─ Check by email ──────► Found? Link google_id       ││  │
│  │  │                                                             ││  │
│  │  │    └─ Not found? Create new user                         ││  │
│  │  │                                                             ││  │
│  │  │ 5. User fields set:                                       ││  │
│  │  │    - email: from Google                                   ││  │
│  │  │    - google_id: from Google (linked)                      ││  │
│  │  │    - is_verified: TRUE (auto-verified)                    ││  │
│  │  │    - password: NULL (Google handles auth)                 ││  │
│  │  │    - first_name, last_name: from Google                   ││  │
│  │  │                                                             ││  │
│  │  │ 6. Generate JWT tokens:                                   ││  │
│  │  │    - access_token (1 hour)                                ││  │
│  │  │    - refresh_token (7 days)                               ││  │
│  │  │                                                             ││  │
│  │  │ 7. Store OAuth data:                                      ││  │
│  │  │    GoogleOAuthToken.objects.create(                      ││  │
│  │  │      user=user,                                           ││  │
│  │  │      google_id=google_id,                                ││  │
│  │  │      access_token=token                                   ││  │
│  │  │    )                                                       ││  │
│  │  │                                                             ││  │
│  │  │ 8. Return response:                                        ││  │
│  │  │    {                                                       ││  │
│  │  │      "access": JWT_TOKEN,                                ││  │
│  │  │      "refresh": REFRESH_TOKEN,                           ││  │
│  │  │      "user": { ... },                                     ││  │
│  │  │      "message": "Google login successful"                ││  │
│  │  │    }                                                       ││  │
│  │  │                                                             ││  │
│  │  └─────────────────────────────────────────────────────────────┘│  │
│  │                                                                    │  │
│  │  Database (SQLite)                                              │  │
│  │  ┌─────────────────────────────────────────────────────────────┐│  │
│  │  │ users_customuser:                                           ││  │
│  │  │ ├─ id: UUID                                                ││  │
│  │  │ ├─ email: "user@gmail.com"                                 ││  │
│  │  │ ├─ google_id: "10769150350006150715113172722..." ⭐       ││  │
│  │  │ ├─ is_verified: true ⭐                                   ││  │
│  │  │ ├─ password: NULL (no password for Google)                 ││  │
│  │  │ ├─ first_name, last_name                                   ││  │
│  │  │ └─ created_at, updated_at                                  ││  │
│  │  │                                                             ││  │
│  │  │ users_googleoauthtoken:                                    ││  │
│  │  │ ├─ id: UUID                                                ││  │
│  │  │ ├─ user_id: (FK to CustomUser)                             ││  │
│  │  │ ├─ google_id: "10769150350006150715113172722..."           ││  │
│  │  │ ├─ access_token: (stored ID token)                         ││  │
│  │  │ └─ created_at, updated_at                                  ││  │
│  │  │                                                             ││  │
│  │  └─────────────────────────────────────────────────────────────┘│  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                              ▼                                           │
│  Frontend receives response and:                                        │
│  1. Stores tokens in localStorage                                      │
│  2. Sets user in AuthContext                                          │
│  3. Redirects to /welcome dashboard                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘


SESSION FLOW (After Initial Login)

┌────────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│  1. SUBSEQUENT REQUESTS                                                   │
│                                                                            │
│     Frontend: GET /api/users/me/                                         │
│     Header: Authorization: Bearer {access_token}                         │
│                                                                            │
│     Backend: Validates JWT signature                                      │
│     ├─ Token valid? Return user data                                     │
│     └─ Token expired? Use refresh_token to get new access_token         │
│                                                                            │
│  2. TOKEN REFRESH (When access_token expires)                            │
│                                                                            │
│     Frontend: POST /api/token/refresh/                                   │
│     Body: { "refresh": refresh_token }                                   │
│                                                                            │
│     Backend: Validates refresh token                                      │
│     ├─ Valid? Generate new access_token                                  │
│     └─ Invalid? Return 401 (re-login required)                           │
│                                                                            │
│  3. LOGOUT                                                                │
│                                                                            │
│     Frontend: Clear localStorage tokens                                   │
│     Frontend: Clear AuthContext user                                     │
│     Redirect to /login                                                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘


AUTHENTICATION STATE DIAGRAM

┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  [Unauthenticated]                                                      │
│       │                                                                 │
│       ├──────────────────┬──────────────────┐                          │
│       ▼                  ▼                  ▼                          │
│  [Email Login]   [Email Register]   [Google Login]                    │
│       │                  │                  │                          │
│       ├─ Check email     ├─ Validate data  ├─ Verify Google token     │
│       ├─ Check password  ├─ Hash password  ├─ Create/Link user        │
│       ├─ Check verified  ├─ Send email     └─ Auto-verify              │
│       │                  │                  │                          │
│       ▼                  ▼                  ▼                          │
│     ✓ Valid          Email sent        Google verified               │
│       │                  │                  │                          │
│       └──────────────────┴──────────────────┘                          │
│                          │                                              │
│                          ▼                                              │
│               [Generate JWT Tokens]                                    │
│               ├─ access_token (1 hour)                                │
│               └─ refresh_token (7 days)                              │
│                          │                                              │
│                          ▼                                              │
│              [Authenticated - Logged In]                              │
│              ├─ Store tokens in localStorage                           │
│              ├─ Set user in AuthContext                               │
│              └─ Redirect to /welcome                                  │
│                          │                                              │
│              ┌───────────┴───────────┐                                │
│              ▼                       ▼                                 │
│          [Access App]          [Token Expires]                        │
│              │                       │                                 │
│              ├─ Make requests    └─ Request refresh                   │
│              │  with JWT              │                               │
│              │                    └─ Get new token                    │
│              │                        │                               │
│              └──────────────────────────┘                             │
│                      │                                                 │
│              [Session Ends - Logout]                                  │
│                      │                                                 │
│                      ▼                                                 │
│           [Clear tokens & redirects]                                  │
│                      │                                                 │
│                      ▼                                                 │
│            [Back to Unauthenticated]                                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘


SECURITY LAYERS

┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  Layer 1: OAuth 2.0 (Google)                                            │
│  ├─ Google verifies user identity                                       │
│  └─ Provides trusted token                                             │
│                                                                          │
│  Layer 2: Backend Token Validation                                     │
│  ├─ Verify token signature with Google public key                     │
│  ├─ Validate against GOOGLE_OAUTH_CLIENT_ID                           │
│  └─ Check token hasn't expired                                        │
│                                                                          │
│  Layer 3: CORS Protection                                              │
│  ├─ Only frontend URL can call backend API                             │
│  └─ Other origins rejected                                             │
│                                                                          │
│  Layer 4: JWT Authentication                                           │
│  ├─ Backend issues JWT tokens                                          │
│  ├─ Tokens signed with Django SECRET_KEY                               │
│  └─ All subsequent requests require Bearer token                       │
│                                                                          │
│  Layer 5: Password Handling                                            │
│  ├─ Google accounts have NULL password (no password login)             │
│  ├─ Email accounts use hashed passwords (Django bcrypt/PBKDF2)        │
│  └─ No plaintext passwords stored                                      │
│                                                                          │
│  Layer 6: Data Validation                                              │
│  ├─ Serializers validate all input                                     │
│  ├─ Email uniqueness enforced                                          │
│  └─ User linking prevents duplicates                                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
pm_os_web_app/
│
├── backend/                          # Django REST API
│   ├── config/
│   │   ├── settings.py              # Django config (includes GOOGLE_OAUTH_CLIENT_ID)
│   │   ├── urls.py                  # API routes
│   │   └── wsgi.py
│   │
│   ├── users/
│   │   ├── models.py                ⭐ CustomUser + GoogleOAuthToken
│   │   ├── views.py                 ⭐ google_login endpoint
│   │   ├── serializers.py           ⭐ GoogleLoginSerializer
│   │   ├── admin.py
│   │   ├── apps.py
│   │   └── migrations/
│   │       ├── 0001_initial.py
│   │       └── 0002_*.py            ⭐ Adds google_id + GoogleOAuthToken
│   │
│   ├── .env                          ⭐ GOOGLE_OAUTH_CLIENT_ID
│   ├── manage.py
│   ├── requirements.txt              ⭐ google-auth packages
│   └── db.sqlite3                   # Database
│
├── frontend/                         # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx            ⭐ Google button + flow
│   │   │   ├── Login.module.css     ⭐ Button styling
│   │   │   └── Welcome.jsx
│   │   │
│   │   ├── components/
│   │   │   └── ProtectedRoute.jsx
│   │   │
│   │   ├── context/
│   │   │   └── AuthContext.jsx      ⭐ googleLogin method
│   │   │
│   │   ├── api/
│   │   │   └── auth.js              ⭐ googleLogin API call
│   │   │
│   │   ├── styles/
│   │   │   └── globals.css
│   │   │
│   │   ├── App.jsx                  ⭐ GoogleOAuthProvider
│   │   └── main.jsx
│   │
│   ├── .env                          ⭐ VITE_GOOGLE_CLIENT_ID
│   ├── package.json                 ⭐ @react-oauth/google
│   ├── vite.config.js
│   └── index.html
│
└── Documentation/ (NEW)
    ├── GOOGLE_OAUTH_SETUP.md        ⭐ Complete setup guide
    ├── TESTING_GUIDE.md             ⭐ Testing procedures
    ├── IMPLEMENTATION_SUMMARY.md    ⭐ Technical details
    ├── COMPLETION_SUMMARY.md        ⭐ What was implemented
    └── QUICK_START.md               ⭐ Quick reference
```

## Data Flow Summary

```
User Login Flow:
1. Frontend displays Login page with Google button
2. User clicks "Sign in with Google"
3. Google OAuth dialog opens (Google handles)
4. User authenticates with Google
5. Google returns ID token to frontend
6. Frontend sends token to backend
7. Backend verifies token with Google
8. Backend creates/links user in database
9. Backend generates JWT tokens
10. Frontend stores tokens and redirects to dashboard
11. User is logged in! ✅

Subsequent Requests:
- Frontend sends JWT token with each API request
- Backend validates JWT signature
- If valid: Request processed
- If expired: Backend issues new token from refresh_token
- If invalid: Reject with 401 Unauthorized

Logout:
- Frontend clears tokens from localStorage
- Frontend clears user from AuthContext
- User redirected to login page
```

## Environment Configuration

```
Backend Environment Variables:
├─ DEBUG=True/False
├─ SECRET_KEY=random-secure-key
├─ ALLOWED_HOSTS=localhost,127.0.0.1
├─ CORS_ALLOWED_ORIGINS=http://localhost:5173
├─ DATABASE_URL=sqlite:///db.sqlite3
├─ EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
├─ FRONTEND_URL=http://localhost:5173
└─ GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com ⭐

Frontend Environment Variables:
├─ VITE_API_URL=http://localhost:8000/api
└─ VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com ⭐
```

---

**Architecture created**: 2025
**Status**: ✅ Production Ready

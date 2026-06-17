# 🚀 Quick Start Reference Card

## Get Google OAuth Working in 3 Steps

### Step 1: Get Client ID
Go to: https://console.cloud.google.com/
- Create/Select Project
- Enable Google+ API
- Create OAuth 2.0 Client ID (Web application)
- Copy the Client ID

### Step 2: Update .env Files

**`backend/.env`** (add this line):
```
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

**`frontend/.env`** (add this line):
```
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

### Step 3: Start and Test

```bash
# Terminal 1 - Backend
cd backend
source venv/bin/activate
python manage.py runserver

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

Visit: http://localhost:5173/login
Click: "Sign in with Google" button
✅ Done!

---

## Important Files

📖 **GOOGLE_OAUTH_SETUP.md** - Complete setup guide (READ THIS FIRST!)
🧪 **TESTING_GUIDE.md** - Test scenarios and debugging
📝 **IMPLEMENTATION_SUMMARY.md** - Technical details
✅ **COMPLETION_SUMMARY.md** - What was implemented

---

## Common Commands

```bash
# Backend
cd backend && source venv/bin/activate
python manage.py check              # Verify configuration
python manage.py migrate            # Apply migrations
python manage.py runserver          # Start server
python manage.py createsuperuser    # Create admin user

# Frontend
cd frontend
npm install                         # Install dependencies
npm run dev                         # Start dev server
npm run build                       # Build for production
npm run preview                     # Preview build
```

---

## API Endpoints

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/users/register/` | Email registration |
| POST | `/api/users/login/` | Email login |
| POST | `/api/users/google_login/` | Google OAuth login ⭐ |
| POST | `/api/users/verify_email/` | Email verification |
| GET | `/api/users/me/` | Get current user |
| POST | `/api/users/logout/` | Logout |
| POST | `/api/token/refresh/` | Refresh token |

---

## Environment Variables

### Backend (.env)
```
DEBUG=True
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## How It Works (30 second overview)

1. User clicks "Sign in with Google" on login page
2. Google OAuth dialog opens
3. User selects Google account
4. Frontend gets ID token from Google
5. Frontend sends token to backend: `POST /api/users/google_login/`
6. Backend verifies token with Google
7. Backend creates/links user account
8. Backend returns JWT tokens
9. Frontend stores tokens and redirects to dashboard
✅ User is logged in!

---

## Installed Packages

**Backend:**
- google-auth
- google-auth-oauthlib
- google-auth-httplib2
- google-api-python-client

**Frontend:**
- @react-oauth/google

---

## Ports

- Backend API: http://localhost:8000
- Frontend: http://localhost:5173
- Admin Panel: http://localhost:8000/admin

---

## Features

✅ Email registration & login
✅ Google OAuth login
✅ Automatic account creation on Google
✅ Email linking for Google accounts
✅ Auto-verification for Google accounts
✅ JWT token sessions (1-hour access)
✅ Token refresh (7-day refresh)
✅ Protected routes
✅ Logout functionality
✅ PM OS theme styling

---

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| "Invalid Google token" | Check GOOGLE_OAUTH_CLIENT_ID matches between backend/.env and frontend/.env |
| Google button doesn't appear | Verify GoogleOAuthProvider in App.jsx, check VITE_GOOGLE_CLIENT_ID |
| CORS errors | Add frontend URL to CORS_ALLOWED_ORIGINS in settings |
| User not created | Check migrations: `python manage.py migrate` |
| Tokens not persisting | Check browser localStorage, not blocked |
| "Port already in use" | Change port in vite.config.js or backend settings |

---

## Testing Checklist

- [ ] Email registration works
- [ ] Email login works
- [ ] Google OAuth button visible
- [ ] Google OAuth login creates account
- [ ] Google OAuth login with existing email links account
- [ ] Tokens stored in localStorage
- [ ] Page refresh keeps user logged in
- [ ] Logout clears session
- [ ] Welcome dashboard displays correctly

---

## Production Checklist

- [ ] Get production Google Client ID
- [ ] Update .env with production Client ID
- [ ] Add production domain to Google Cloud redirect URIs
- [ ] Set DEBUG=False in Django settings
- [ ] Update ALLOWED_HOSTS with domain
- [ ] Use HTTPS everywhere
- [ ] Use PostgreSQL instead of SQLite
- [ ] Configure proper email backend
- [ ] Run: `python manage.py check --deploy`
- [ ] Build frontend: `npm run build`
- [ ] Deploy to hosting service

---

## Support Resources

- Google OAuth Docs: https://developers.google.com/identity/protocols/oauth2
- React OAuth Google: https://www.npmjs.com/package/@react-oauth/google
- Django REST Framework: https://www.django-rest-framework.org/
- Google Cloud Console: https://console.cloud.google.com/

---

## Key Files Changed

```
backend/
  ├── users/models.py (+ google_id field)
  ├── users/views.py (+ google_login endpoint)
  ├── users/serializers.py (+ GoogleLoginSerializer)
  ├── users/migrations/0002_*.py (NEW)
  └── .env (+ GOOGLE_OAUTH_CLIENT_ID)

frontend/
  ├── src/App.jsx (+ GoogleOAuthProvider)
  ├── src/pages/Login.jsx (+ Google button)
  ├── src/pages/Login.module.css (+ button styles)
  ├── src/context/AuthContext.jsx (+ googleLogin method)
  ├── src/api/auth.js (+ googleLogin API)
  └── .env (+ VITE_GOOGLE_CLIENT_ID)

Documentation/ (NEW)
  ├── GOOGLE_OAUTH_SETUP.md
  ├── TESTING_GUIDE.md
  ├── IMPLEMENTATION_SUMMARY.md
  └── COMPLETION_SUMMARY.md
```

---

**Last Updated**: 2025
**Status**: ✅ READY FOR DEPLOYMENT

Start with: **GOOGLE_OAUTH_SETUP.md** 👈

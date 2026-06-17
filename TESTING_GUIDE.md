# PM OS OAuth Integration Testing Guide

## Pre-Test Checklist

- [ ] Backend running on `http://localhost:8000`
- [ ] Frontend running on `http://localhost:5173`
- [ ] Database migrations applied
- [ ] Google OAuth Client ID obtained from Cloud Console
- [ ] Environment variables configured in both backend and frontend

## Test 1: Email Registration + Verification

**Steps:**
1. Navigate to `http://localhost:5173/login`
2. Go to register page
3. Create account with email
4. Check backend console for verification email
5. Verify email using token
6. Should redirect to login page

**Expected Result:** Account created and verified ✅

## Test 2: Email Login

**Steps:**
1. Navigate to login page
2. Enter registered email and password
3. Click "Sign In"
4. Should redirect to welcome page

**Expected Result:** Successfully logged in ✅

## Test 3: Google OAuth - New Account

**Steps:**
1. Navigate to login page
2. Click "Sign in with Google"
3. Select your Google account
4. Authorize application
5. Should redirect to welcome page

**Expected Result:** New user account created, Google ID linked, automatically verified ✅

## Test 4: Google OAuth - Existing Account

**Steps:**
1. Create an account with email: `test@gmail.com`
2. Log out
3. Click "Sign in with Google"
4. Select same Google account with same email
5. Should log in successfully

**Expected Result:** Existing account linked with Google ID ✅

## Test 5: Token Refresh

**Steps:**
1. Log in successfully (any method)
2. Open browser DevTools > Application > Cookies/Storage
3. Verify tokens stored in localStorage
4. Wait a moment, then refresh page
5. Should remain logged in

**Expected Result:** User stays logged in, tokens refreshed ✅

## Test 6: Logout

**Steps:**
1. Log in
2. Click logout button on welcome page
3. Navigate to welcome page
4. Should redirect to login

**Expected Result:** Logout successful, session cleared ✅

## Testing Script

Save as `test_oauth.sh` in project root and run:

```bash
#!/bin/bash

echo "Starting PM OS OAuth Integration Tests..."
echo "========================================"

# Start backend
echo "Starting Django backend..."
cd backend
source venv/bin/activate
python manage.py runserver 0.0.0.0:8000 &
BACKEND_PID=$!

# Start frontend
echo "Starting React frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

sleep 5

echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "========================================"
echo ""
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Ready for testing!"
echo "Press Ctrl+C to stop both servers"

wait
```

## Manual Test Flow

### Flow 1: Complete Email Authentication
```
Register → Verify Email → Login → Welcome Page → Logout
```

### Flow 2: Google OAuth - First Time
```
Click Google Sign-In → Select Account → Authorize → Welcome Page
```

### Flow 3: Google OAuth - Existing User
```
Email Register → Google Login with same email → Same Account
```

### Flow 4: Session Persistence
```
Login → Close Tab → New Tab → Still Logged In
```

## Debugging Tips

### Backend Logs
```bash
# Check for Google token validation errors
tail -f backend/debug.log

# Watch for database queries
python manage.py runserver --verbosity=3
```

### Frontend Logs
```bash
# Open browser DevTools (F12)
# Check Console tab for errors
# Check Network tab for API calls

# Build log viewer
npm run dev -- --debug
```

### Common Issues

**1. Google OAuth button not appearing**
- Check if GoogleOAuthProvider is wrapping App
- Verify VITE_GOOGLE_CLIENT_ID in .env
- Check browser console for errors

**2. "Invalid token" error after Google login**
- Ensure GOOGLE_OAUTH_CLIENT_ID matches between .env files
- Verify in Google Cloud Console the Client ID is correct
- Check backend error logs

**3. CORS errors on /api/users/google_login/**
- Verify CORS_ALLOWED_ORIGINS includes frontend URL
- Backend should return "Access-Control-Allow-Origin: http://localhost:5173"

**4. User not created**
- Check database migrations: `python manage.py showmigrations users`
- Verify database write permissions
- Check backend console for validation errors

**5. Tokens not persisting**
- Check browser localStorage in DevTools
- Verify localStorage is not blocked by browser
- Check application is storing tokens after login

## Load Testing (Optional)

For production readiness:

```bash
# Install Apache Bench
brew install httpd

# Test login endpoint
ab -n 100 -c 10 http://localhost:8000/api/users/login/

# Test Google login endpoint
ab -n 100 -c 10 http://localhost:8000/api/users/google_login/
```

## Performance Monitoring

**Check response times:**
- Email login: < 1 second
- Google login: < 2 seconds (includes Google verification)
- Page load: < 3 seconds

**Monitor:**
- Backend memory usage
- Database connection pool
- Token generation time

## Success Criteria

✅ All tests pass
✅ No console errors
✅ No network errors (200/201 status codes)
✅ Tokens persist across sessions
✅ Google OAuth fully functional
✅ Logout clears session
✅ Welcome page loads correctly

---

Once all tests pass, the application is ready for production deployment!

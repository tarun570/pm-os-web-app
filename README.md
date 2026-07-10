# PM OS Web App

AI-powered project planning platform with email authentication. Built with Django REST API backend and React frontend.

## Project Structure

```
pm_os_web_app/
├── backend/              # Django REST API
│   ├── config/          # Django settings
│   ├── users/           # User authentication app
│   ├── .env             # Environment variables
│   ├── manage.py
│   └── requirements.txt
├── frontend/            # React + Vite frontend
│   ├── src/
│   │   ├── pages/       # Page components (Login, Welcome)
│   │   ├── components/  # Reusable components
│   │   ├── context/     # React context (AuthContext)
│   │   ├── api/         # API service files
│   │   ├── styles/      # Global styles
│   │   └── App.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Setup Instructions

### Backend Setup

1. Navigate to backend folder:
```bash
cd backend
```

2. Activate virtual environment:
```bash
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate     # On Windows
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
# Edit .env file with your settings
nano .env
```

Key environment variables:
- `DEBUG=True` (set to False in production)
- `SECRET_KEY=your-secret-key`
- `ALLOWED_HOSTS=localhost,127.0.0.1`
- `CORS_ALLOWED_ORIGINS=http://localhost:5173`
- `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend` (for development)

5. Run migrations:
```bash
python manage.py migrate
```

6. Create superuser (optional):
```bash
python manage.py createsuperuser
```

7. Start development server:
```bash
python manage.py runserver
```

Server runs on `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend folder:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# .env file is already configured
cat .env
```

4. Start development server:
```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

## Features

### Authentication
- ✅ Email-based registration and login
- ✅ Google OAuth 2.0 sign-in (NEW)
- ✅ Email verification system
- ✅ JWT token-based authentication
- ✅ Secure password hashing
- ✅ Auto token refresh
- ✅ Automatic account creation on Google login
- ✅ Email linking for Google accounts

### Pages
- **Login Page**: Email, password, and Google OAuth authentication with clean UI
- **Welcome Page**: Dashboard showing user info and app features
- **Protected Routes**: Automatic redirection to login if not authenticated

### Color Theme
- Primary Accent: `#e8365d` (PM OS Red)
- Secondary Accent: `#ff4d5a` (Bright Red)
- Success Green: `#00a86b`
- Typography: `Inter` (headings) & `DM Sans` (body)

## API Endpoints

### User Management & Authentication
- `POST /api/users/register/` - Create new account with email
- `POST /api/users/login/` - Login with email and password
- `POST /api/users/google_login/` - Login or create account via Google OAuth (NEW)
- `POST /api/users/verify_email/` - Verify email with token
- `GET /api/users/me/` - Get current user (requires auth)
- `POST /api/users/logout/` - Logout (requires auth)
- `POST /api/token/refresh/` - Refresh access token

## Development Tips

### Backend
- Admin panel available at `http://localhost:8000/admin`
- Test API endpoints using Postman or cURL
- Email verification emails sent to console during development

### Frontend
- Hot reload enabled - changes reflected instantly
- Inspect component state in React DevTools
- Network requests visible in Browser DevTools

## Environment Configuration

### Backend (.env)
```
DEBUG=True
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1,localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
DATABASE_URL=sqlite:///db.sqlite3
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
FRONTEND_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

## Google OAuth Setup

Google OAuth 2.0 authentication is fully integrated! To set it up:

1. Get Google OAuth Client ID from [Google Cloud Console](https://console.cloud.google.com/)
2. Add Client ID to both backend and frontend `.env` files as `GOOGLE_OAUTH_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`
3. Update authorized redirect URIs in Google Cloud Console
4. Read [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for complete setup instructions

## Troubleshooting

### Backend Issues
- **CORS errors**: Check `CORS_ALLOWED_ORIGINS` in settings
- **Database errors**: Run `python manage.py migrate`
- **Import errors**: Ensure virtual environment is activated

### Frontend Issues
- **API connection errors**: Verify backend is running on `http://localhost:8000`
- **Module not found**: Run `npm install` to install all dependencies
- **Port already in use**: Change port in `vite.config.js`

## Production Deployment

1. Set `DEBUG=False` in backend settings
2. Generate secure `SECRET_KEY`
3. Update `ALLOWED_HOSTS` with domain
4. Configure proper email backend
5. Use PostgreSQL instead of SQLite
6. Build frontend: `npm run build`
7. Serve static files with production server (Nginx/Apache)
8. Use HTTPS everywhere

## Next Steps

- [ ] Get Google OAuth credentials and configure .env files
- [ ] Test Google OAuth login flow
- [ ] Add email verification email template
- [ ] Implement password reset functionality
- [ ] Add user profile settings page
- [ ] Create project upload and planning features
- [ ] Add payment integration
- [ ] Deploy to production

For Google OAuth testing, see [TESTING_GUIDE.md](./TESTING_GUIDE.md)

## Support

For issues or questions, contact: yadavmanoj354@gmail.com

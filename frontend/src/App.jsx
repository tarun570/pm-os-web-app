
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import OverviewPage from './pages/OverviewPage'
import ProjectsPage from './pages/ProjectsPage'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout/AppLayout'
import './styles/globals.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com'

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            {/* Email verification landing page — public so a user clicking the
                link in their inbox can hit it without being logged in. */}
            <Route path="/verify-email/:token" element={<VerifyEmail />} />

            {/* Authenticated shell — Sidebar + <Outlet /> + ChatPanel.
                All post-login routes are nested under AppLayout. */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/projects" element={<ProjectsPage />} />

              {/* /welcome is the legacy single-page route — redirect to /overview
                  so old links, deep links from history, and bookmarks keep working. */}
              <Route path="/welcome" element={<Navigate to="/overview" replace />} />
            </Route>

            <Route path="/" element={<Navigate to="/overview" replace />} />
          </Routes>
        </AuthProvider>
      </Router>
    </GoogleOAuthProvider>
  )
}

export default App

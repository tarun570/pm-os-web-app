
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useOutletContext } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import OverviewPage from './pages/OverviewPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectPage from './pages/ProjectPage'
import DrivePage from './pages/DrivePage'
import OverviewTab from './components/ProjectDetailModal/OverviewTab'
import MeetingsTab from './components/ProjectDetailModal/MeetingsTab'
import SprintPlanTab from './components/ProjectDetailModal/SprintPlanTab'
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
              {/* /drive owns its own copy of the Google Drive card so the
                  sidebar's "Google Drive" item is functional. The AppLayout
                  footer rail is hidden on this route to avoid duplication. */}
              <Route path="/drive" element={<DrivePage />} />

              {/* Project workspace — nested routes for the three sections
                  of an open project. ProjectPage owns the header +
                  context; the section tabs mount into its <Outlet />. */}
              <Route path="/projects/:uploadId" element={<ProjectPage />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewRoute />} />
                <Route path="meetings" element={<MeetingsRoute />} />
                <Route path="sprint" element={<SprintRoute />} />
              </Route>

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

// ---- Route adapters ---------------------------------------------------
//
// The Overview / Meetings / Sprint Plan tab components were originally
// written to receive `uploadId` as a prop from ProjectDetailModal. Under
// the new route structure they read it from useParams() instead. These
// thin wrappers translate the URL param into the prop each tab expects.

function useUploadId() {
  const { uploadId } = useParams()
  return uploadId ? Number(uploadId) : null
}

function OverviewRoute() {
  const uploadId = useUploadId()
  // The parent ProjectPage already fetched the upload (so the page
  // header can show the name + status pill). Re-use it via outlet
  // context instead of forcing OverviewTab to do a second round-trip
  // — without this OverviewTab would render the "Loading project
  // details…" placeholder forever, because it only ever calls
  // `fileAPI.getUpload` from a manual `refreshUpload` callback.
  const { upload } = useOutletContext() || {}
  return <OverviewTab uploadId={uploadId} upload={upload} />
}

function MeetingsRoute() {
  const uploadId = useUploadId()
  return <MeetingsTab uploadId={uploadId} />
}

function SprintRoute() {
  const uploadId = useUploadId()
  return <SprintPlanTab uploadId={uploadId} />
}

export default App

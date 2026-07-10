import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI, fileAPI } from '../api/auth'
import FileUpload from '../components/FileUpload'
import FileHistory from '../components/FileHistory'
import styles from './Welcome.module.css'

export default function Welcome() {
  const { user, logout, fetchCurrentUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [uploads, setUploads] = useState([])
  const [showUploadSection, setShowUploadSection] = useState(false)
  const [gdriveToast, setGdriveToast] = useState(null)
  const [gdriveBusy, setGdriveBusy] = useState(false)

  useEffect(() => {
    fetchUploads()
  }, [])

  // Handle the redirect from the Google Drive OAuth flow. Google lands the
  // user back on /welcome?gdrive=connected (or one of the error variants).
  // We re-fetch the user so the toggle state updates, show a toast, and
  // strip the query string so a page refresh doesn't re-fire the toast.
  useEffect(() => {
    const gdriveStatus = searchParams.get('gdrive')
    if (!gdriveStatus) return

    let message
    switch (gdriveStatus) {
      case 'connected':
        message = '✓ Google Drive connected. Outputs will save to your Drive.'
        fetchCurrentUser()
        break
      case 'denied':
        message = 'Google Drive connection was cancelled. You can try again anytime.'
        break
      case 'invalid_state':
        message = 'Connection failed: security check did not pass. Please try again.'
        break
      case 'exchange_failed':
        message = 'Connection failed: Google did not return a valid token. Please try again.'
        break
      case 'missing_tokens':
        message = 'Connection failed: refresh token missing. Please try again.'
        break
      case 'user_not_found':
        message = 'Connection failed: your user account could not be found.'
        break
      case 'error':
      default:
        message = 'Google Drive connection could not be completed. Please try again.'
    }

    setGdriveToast(message)
    setSearchParams({}, { replace: true })

    const timer = setTimeout(() => setGdriveToast(null), 5000)
    return () => clearTimeout(timer)
  }, [searchParams, setSearchParams, fetchCurrentUser])

  const fetchUploads = async () => {
    try {
      const response = await fileAPI.listUploads()
      setUploads(response.data)
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
    }
  }

  const handleUploadSuccess = (newUpload) => {
    setUploads((prev) => [newUpload, ...prev])
    setShowUploadSection(false)

    // Optionally show success message
    alert('File uploaded successfully! Processing has started.')
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleConnectDrive = async () => {
    setGdriveBusy(true)
    try {
      const res = await authAPI.getGoogleDriveAuthUrl()
      window.location.href = res.data.auth_url
    } catch (err) {
      console.error('Failed to start Google Drive connect flow:', err)
      setGdriveToast('Could not start Google Drive connection. Please try again.')
      setTimeout(() => setGdriveToast(null), 5000)
    } finally {
      // No finally reset — we're navigating away on success.
    }
  }

  const handleDisconnectDrive = async () => {
    if (!window.confirm('Disconnect Google Drive? Generated outputs will no longer save to your Drive.')) {
      return
    }
    setGdriveBusy(true)
    try {
      await authAPI.disconnectGoogleDrive()
      await fetchCurrentUser()
      setGdriveToast('Google Drive disconnected.')
      setTimeout(() => setGdriveToast(null), 5000)
    } catch (err) {
      console.error('Failed to disconnect Google Drive:', err)
      setGdriveToast('Could not disconnect Google Drive. Please try again.')
      setTimeout(() => setGdriveToast(null), 5000)
    } finally {
      setGdriveBusy(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={styles.logoIcon}>P</div>
          <span>PM OS</span>
        </div>

        <div className={styles.navLinks}>
          <button onClick={handleLogout} disabled={isLoggingOut} className={styles.logoutBtn}>
            {isLoggingOut ? '⏳ Signing out...' : '→ Sign Out'}
          </button>
        </div>
      </nav>

      {/* Toast for Google Drive connect/disconnect results */}
      {gdriveToast && (
        <div className={styles.gdriveToast} role="status">
          {gdriveToast}
        </div>
      )}

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeDot}></span> Welcome to PM OS
          </div>

          <h1>
            Hello, <span className="gradient-text">{user?.first_name || user?.email.split('@')[0]}</span>!
          </h1>

          <p className={styles.subtitle}>
            You're all set to start creating AI-powered project plans. Upload your SOW and get a complete execution-ready project plan in minutes.
          </p>

          <div className={styles.actions}>
            <button 
              className={`${styles.primaryBtn} gradient-button`}
              onClick={() => setShowUploadSection(!showUploadSection)}
            >
              ⚡ {showUploadSection ? 'Hide Upload' : 'Upload Your First SOW'}
            </button>
            <button className={styles.secondaryBtn}>
              📖 View Documentation
            </button>
          </div>
        </div>

        <div className={styles.heroImage}>
          <div className={styles.placeholderCard}>
            <div className={styles.cardContent}>
              <div className={styles.cardIcon}>📊</div>
              <h3>{uploads.length} Project{uploads.length !== 1 ? 's' : ''}</h3>
              <p>{uploads.filter(u => u.status === 'completed').length} completed • {uploads.filter(u => u.status === 'processing').length} processing</p>
            </div>
          </div>
        </div>
      </section>

      {/* File Upload Section */}
      {showUploadSection && (
        <section className={styles.uploadSection}>
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        </section>
      )}

      {/* File History Section */}
      <section className={styles.historySection}>
        <FileHistory uploads={uploads} onRefresh={fetchUploads} />
      </section>

      {/* Features Grid */}
      <section className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2>What You Can Do</h2>
          <p>Everything you need to transform your project planning</p>
        </div>

        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📄</div>
            <h3>Generate PRD</h3>
            <p>Create enterprise-grade Product Requirements Documents from your SOW automatically.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📝</div>
            <h3>Task Planning</h3>
            <p>Get actionable user stories mapped directly from your requirements.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>👥</div>
            <h3>Team Planning</h3>
            <p>Clear team structure with roles, availability and sprint allocation.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🗓️</div>
            <h3>Sprint Execution</h3>
            <p>Week-by-week sprint breakdown with tasks, priorities and timelines.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚙️</div>
            <h3>Execution Tasks</h3>
            <p>Granular daily tasks per developer — no ambiguity, no wasted standups.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📊</div>
            <h3>Export & Share</h3>
            <p>Export to Google Docs & Sheets, ready to import to Jira, Notion, or Linear.</p>
          </div>
        </div>
      </section>

      {/* Google Drive Connection */}
      <section className={styles.userInfo}>
        <div className={styles.userCard}>
          <h3>Google Drive</h3>
          <p className={styles.gdriveDescription}>
            Connect your Google Drive to save generated PRDs and sprint plans
            directly to your account. PM OS only sees files it creates — your
            other Drive files are never accessible.
          </p>

          {user?.has_google_drive_connected ? (
            <div className={styles.gdriveConnected}>
              <div className={styles.gdriveStatus}>
                <span className={styles.gdriveCheckmark}>✓</span>
                <span>Connected to Google Drive</span>
              </div>
              <p className={styles.gdriveHint}>
                Generated documents will save to a "PM OS" folder in your Drive.
                You can move, rename, or delete them anytime.
              </p>
              <button
                className={styles.gdriveDisconnectBtn}
                onClick={handleDisconnectDrive}
                disabled={gdriveBusy}
              >
                {gdriveBusy ? '⏳ Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className={styles.gdriveDisconnected}>
              <div className={styles.gdriveStatus}>
                <span className={styles.gdriveX}>○</span>
                <span>Not connected</span>
              </div>
              <p className={styles.gdriveHint}>
                You'll need to connect Google Drive before uploading a SOW,
                so generated outputs have somewhere to be saved.
              </p>
              <button
                className={`${styles.gdriveConnectBtn} gradient-button`}
                onClick={handleConnectDrive}
                disabled={gdriveBusy}
              >
                {gdriveBusy ? '⏳ Opening Google...' : '🔗 Connect Google Drive'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* User Info Section */}
      <section className={styles.userInfo}>
        <div className={styles.userCard}>
          <h3>Your Account</h3>
          <div className={styles.userDetails}>
            <div className={styles.detail}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{user?.email}</span>
            </div>
            {user?.first_name && (
              <div className={styles.detail}>
                <span className={styles.label}>Name</span>
                <span className={styles.value}>
                  {user.first_name} {user.last_name || ''}
                </span>
              </div>
            )}
            <div className={styles.detail}>
              <span className={styles.label}>Account Status</span>
              <span className={`${styles.value} ${styles.verified}`}>
                ✓ Verified
              </span>
            </div>
            <div className={styles.detail}>
              <span className={styles.label}>Member Since</span>
              <span className={styles.value}>
                {new Date(user?.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>&copy; 2026 PM OS by CodeGrameen. All rights reserved.</p>
        <div className={styles.footerLinks}>
          <a href="mailto:yadavmanoj354@gmail.com">Support</a>
          <a href="https://codegrameen.com" target="_blank" rel="noopener noreferrer">Company</a>
        </div>
      </footer>
    </div>
  )
}

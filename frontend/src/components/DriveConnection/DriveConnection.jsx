import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authAPI } from '../../api/auth'
import {
  CheckCircle2,
  Circle,
  Folder,
  Plug,
  Unplug,
  Loader2,
} from 'lucide-react'
import styles from './DriveConnection.module.css'

/**
 * DriveConnection — owns the Google Drive connect/disconnect flow.
 *
 * Mounted in AppLayout so it's available on every authenticated route
 * and so the ?gdrive=… post-OAuth redirect query string is captured no
 * matter which page the user lands on.
 *
 * The handlers + 8-case `?gdrive=…` effect are copied from the legacy
 * pages/Welcome.jsx (which is now a redirect shim) so the behavior is
 * identical: same error messages, same 5s toast, same
 * `setSearchParams({}, { replace: true })` to strip the param.
 *
 * Renders a `<section id="drive">` so the existing Sidebar's `#drive`
 * hash link still scrolls to a meaningful anchor.
 */
export default function DriveConnection() {
  const { user, fetchCurrentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [gdriveToast, setGdriveToast] = useState(null)
  const [gdriveBusy, setGdriveBusy] = useState(false)

  // Drive the post-redirect toast from a single effect. Mirrors the
  // legacy behavior on Welcome.jsx exactly so error messages and the
  // 5s auto-dismiss match the previous UX.
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
    if (
      !window.confirm(
        'Disconnect Google Drive? Generated outputs will no longer save to your Drive.',
      )
    ) {
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

  const driveConnected = !!user?.has_google_drive_connected

  return (
    <section id="drive" className={styles.card} aria-label="Google Drive connection">
      {gdriveToast && (
        <div className={styles.toast} role="status">
          {gdriveToast}
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.iconBubble}>
          <Folder size={18} />
        </div>
        <div>
          <h3 className={styles.title}>Google Drive</h3>
          <p className={styles.description}>
            Connect your Google Drive to save generated PRDs and sprint plans
            directly to your account. PM OS only sees files it creates — your
            other Drive files are never accessible.
          </p>
        </div>
      </div>

      {driveConnected ? (
        <>
          <div className={styles.statusRow}>
            <span className={`${styles.statusDot} ${styles.statusDotOn}`}>
              <CheckCircle2 size={12} strokeWidth={2.5} />
            </span>
            <span>Connected to Google Drive</span>
          </div>
          <p className={styles.hint}>
            Generated documents will save to a "PM OS" folder in your Drive.
            You can move, rename, or delete them anytime.
          </p>
          <button
            type="button"
            className={styles.disconnectBtn}
            onClick={handleDisconnectDrive}
            disabled={gdriveBusy}
          >
            {gdriveBusy ? (
              <>
                <Loader2 size={14} className={styles.spin} /> Disconnecting...
              </>
            ) : (
              <>
                <Unplug size={14} /> Disconnect
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className={styles.statusRow}>
            <span className={styles.statusDot}>
              <Circle size={12} />
            </span>
            <span>Not connected</span>
          </div>
          <p className={styles.hint}>
            You'll need to connect Google Drive before uploading a SOW,
            so generated outputs have somewhere to be saved.
          </p>
          <button
            type="button"
            className={`${styles.connectBtn} gradient-button`}
            onClick={handleConnectDrive}
            disabled={gdriveBusy}
          >
            {gdriveBusy ? (
              <>
                <Loader2 size={14} className={styles.spin} /> Opening Google...
              </>
            ) : (
              <>
                <Plug size={14} /> Connect Google Drive
              </>
            )}
          </button>
        </>
      )}
    </section>
  )
}

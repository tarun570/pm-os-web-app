import DriveConnection from '../components/DriveConnection'
import { Folder } from 'lucide-react'
import styles from './DrivePage.module.css'

/**
 * DrivePage — the standalone Google Drive settings page.
 *
 * Renders at `/drive` and is reached by clicking "Google Drive" in the
 * sidebar. Owns its own copy of the <DriveConnection /> card (the
 * AppLayout footer rail is deliberately hidden on this route so the
 * card is not duplicated).
 *
 * No data fetching here — the card itself reads `user.has_google_drive_connected`
 * from AuthContext and handles the OAuth flow.
 */
export default function DrivePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Google Drive</h1>
          <p className={styles.lead}>
            Connect your Google Drive to save generated PRDs and sprint plans
            directly to your account. PM OS only sees files it creates — your
            other Drive files are never accessible.
          </p>
        </div>
        <div className={styles.headerIcon} aria-hidden="true">
          <Folder size={22} />
        </div>
      </header>

      <DriveConnection />
    </div>
  )
}

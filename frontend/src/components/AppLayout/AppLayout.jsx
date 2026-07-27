import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../Sidebar'
import ChatPanel from '../Chatbot/ChatPanel'
import DriveConnection from '../DriveConnection'
import styles from './AppLayout.module.css'

/**
 * AppLayout — the persistent shell for all authenticated pages.
 *
 *   ┌─────────┬───────────────────────────────┬──────────────┐
 *   │         │                               │              │
 *   │ Sidebar │  <Outlet /> (routed page)     │  ChatPanel   │
 *   │         │                               │              │
 *   │         │  (DriveConnection footer rail│
 *   │         │   only on /overview)          │
 *   └─────────┴───────────────────────────────┴──────────────┘
 *
 * Sidebar derives its own active-highlight + nested project sub-nav
 * from the URL via react-router hooks — it doesn't need any props
 * from this layout. The middle <Outlet /> renders the matched route
 * (Overview / Projects / ProjectDetail / Drive). The DriveConnection
 * card sits below the main content on the global Overview page so
 * the post-OAuth `?gdrive=…` redirect query is captured no matter
 * which page the user lands on. The /drive route owns its own copy
 * of the card (so the sidebar's "Google Drive" item is functional)
 * and the card is deliberately hidden on /projects and on all
 * /projects/:id/... sub tabs so it does not appear inside the
 * project workspace.
 */
export default function AppLayout() {
  const { pathname } = useLocation()
  // Footer rail is only meaningful on the global Overview page. The
  // /drive route owns its own copy of the DriveConnection card (so
  // the sidebar's "Google Drive" item is functional); showing the
  // rail there too would render two cards. Project routes —
  // /projects and /projects/:id/... — also should not show the
  // Drive card.
  const showDriveCard = pathname === '/overview'

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
        {showDriveCard && (
          <div className={styles.driveAside}>
            <DriveConnection />
          </div>
        )}
      </main>
      <ChatPanel />
    </div>
  )
}

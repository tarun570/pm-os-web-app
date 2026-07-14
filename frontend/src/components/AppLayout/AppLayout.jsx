import { useState } from 'react'
import { Outlet } from 'react-router-dom'
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
 *   │         ├───────────────────────────────┴──────────────┤
 *   │         │  DriveConnection (footer rail)                │
 *   └─────────┴──────────────────────────────────────────────┘
 *
 * Sidebar nav is rendered exactly as it was on the old Welcome page
 * (sticky, left-rail, full height). The right-rail ChatPanel replaces
 * the floating Chatbot — same conversation engine, but docked as a
 * persistent column. The middle <Outlet /> renders the matched route
 * (Overview / Projects / ProjectDetail). The DriveConnection card sits
 * below the main content, mounted here (not in a page) so it's
 * available on every authenticated route and so the post-OAuth
 * `?gdrive=…` redirect query is captured no matter which page the
 * user lands on.
 */
export default function AppLayout() {
  // Sidebar still calls onNavigate to drive its own active highlight;
  // for now we mirror that with local state so it has something to
  // bind to. Routing is handled reactively via <Outlet />.
  const [activeId, setActiveId] = useState('overview')

  return (
    <div className={styles.layout}>
      <Sidebar activeId={activeId} onNavigate={setActiveId} />
      <main className={styles.main}>
        <Outlet />
        <div className={styles.driveAside}>
          <DriveConnection />
        </div>
      </main>
      <ChatPanel />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { fileAPI } from '../../api/auth'
import {
  LayoutDashboard,
  Upload,
  Folder,
  ListChecks,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react'
import styles from './Sidebar.module.css'

// Top-level nav. `id` is the active-highlight key; `to` is the real
// React Router path. `match` is an array of pathname prefixes that
// should mark this item as active (so `/projects` AND `/projects/:id`
// both light up the "Project Details" item).
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',         to: '/overview', Icon: LayoutDashboard, match: ['/overview'] },
  { id: 'upload',   label: 'Add New Project',  to: '/projects', Icon: Upload,         match: [] }, // No dedicated route; lands on the project list which has its own Add button.
  { id: 'projects', label: 'Project Details',  to: '/projects', Icon: ListChecks,     match: ['/projects'] },
  { id: 'drive',    label: 'Google Drive',     to: '/drive',    Icon: Folder,         match: ['/drive'] },
]

// Nested project sub-nav. Each child is a <Link> to /projects/:uploadId/<section>.
const PROJECT_SUB_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'sprint',   label: 'Sprint Plan' },
]

// Derive the active top-level id from the current pathname. First match
// in NAV_ITEMS wins, so the more-specific entries (e.g. /projects)
// shadow the more-general ones.
function activeTopLevelId(pathname) {
  for (const item of NAV_ITEMS) {
    if (item.match.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return item.id
    }
  }
  return 'overview'
}

function getInitials(user) {
  if (!user) return '?'
  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  const name = user.username || user.email || ''
  return name.slice(0, 2).toUpperCase()
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // useMatch lets us read the :uploadId param AND the trailing section
  // from the URL in a single hook, without needing useParams() (which
  // would not work in this position relative to <Routes>).
  const projectMatch = useMatch('/projects/:uploadId/*')
  const activeProjectId = projectMatch?.params?.uploadId
    ? Number(projectMatch.params.uploadId)
    : null
  const activeProjectSection = projectMatch?.pathname?.endsWith('/meetings')
    ? 'meetings'
    : projectMatch?.pathname?.endsWith('/sprint')
    ? 'sprint'
    : projectMatch
    ? 'overview'
    : null

  // Project name — fetched lazily when a project is open. Silent fail
  // falls back to "Project #<id>".
  const [projectName, setProjectName] = useState('')
  useEffect(() => {
    if (!activeProjectId) {
      setProjectName('')
      return undefined
    }
    let cancelled = false
    fileAPI
      .getUpload(activeProjectId)
      .then((res) => {
        if (!cancelled) setProjectName(res?.data?.file_name || '')
      })
      .catch(() => {
        if (!cancelled) setProjectName('')
      })
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  // Close the mobile sheet on every navigation.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

  const displayName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      user.username ||
      user.email
    : 'Guest'

  const topLevelActiveId = activeTopLevelId(location.pathname)

  return (
    <>
      {/* Mobile top bar — visible only below 1024px. */}
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop on mobile when sheet is open. */}
      {mobileOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`}
        aria-label="Primary navigation"
      >
        <div className={styles.brand}>
          <div className={styles.logoIcon}>P</div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>PM OS</span>
            <span className={styles.brandTag}>AI Project Planner</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon
            const isActive = topLevelActiveId === item.id
            return (
              <Link
                key={item.id}
                to={item.to}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                title={item.label}
              >
                <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                <span className={styles.navLabel}>{item.label}</span>
                {isActive && <span className={styles.activeBar} aria-hidden="true" />}
              </Link>
            )
          })}

          {/* Nested project sub-nav — only when a project route is active. */}
          {activeProjectId != null && (
            <div className={styles.projectBlock}>
              <Link
                to="/projects"
                className={styles.backLink}
                title="Back to all projects"
              >
                <ChevronLeft size={13} />
                <span>All projects</span>
              </Link>

              <div
                className={`${styles.projectParent} ${
                  activeProjectSection ? styles.projectParentActive : ''
                }`}
                title={projectName || `Project #${activeProjectId}`}
              >
                <ListChecks size={13} className={styles.projectParentIcon} />
                <span className={styles.projectParentLabel}>
                  {projectName || `Project #${activeProjectId}`}
                </span>
              </div>

              <div className={styles.subList} role="group" aria-label="Project sections">
                {PROJECT_SUB_ITEMS.map((sub) => {
                  const isActive = activeProjectSection === sub.id
                  return (
                    <Link
                      key={sub.id}
                      to={`/projects/${activeProjectId}/${sub.id}`}
                      className={`${styles.subItem} ${isActive ? styles.subItemActive : ''}`}
                      title={sub.label}
                    >
                      <span className={styles.subDot} aria-hidden="true" />
                      <span className={styles.subLabel}>{sub.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        <div className={styles.userCard}>
          <div className={styles.avatar}>{getInitials(user)}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userEmail}>{user?.email || 'Not signed in'}</span>
          </div>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  )
}

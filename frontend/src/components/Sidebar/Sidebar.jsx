import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  LayoutDashboard,
  Upload,
  Files,
  Folder,
  UserCircle2,
  Plug,
  ListChecks,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import styles from './Sidebar.module.css'

// Nav items. `id` matches the section's DOM id on the Welcome page so
// we can smooth-scroll to it and observe it for the active highlight.
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  // { id: 'upload', label: 'Upload SOW', icon: Upload },
  // { id: 'projects', label: 'Project Details', icon: ListChecks },
  // { id: 'files', label: 'Files', icon: Files },
  // { id: 'drive', label: 'Google Drive', icon: Folder },
  // { id: 'integrations', label: 'Integrations', icon: Plug },
  // { id: 'account', label: 'Your Account', icon: UserCircle2 },
]

function getInitials(user) {
  if (!user) return '?'
  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  const name = user.username || user.email || ''
  return name.slice(0, 2).toUpperCase()
}

export default function Sidebar({ activeId, onNavigate }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close the mobile sheet when the active section changes (i.e. user
  // tapped a link).
  useEffect(() => {
    setMobileOpen(false)
  }, [activeId])

  const handleNavClick = (e, id) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Update the URL hash without a hard navigation.
      if (typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', `#${id}`)
      }
    }
    if (onNavigate) onNavigate(id)
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

  const displayName = user
    ? `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      user.username ||
      user.email
    : 'Guest'

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

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeId === item.id
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => handleNavClick(e, item.id)}
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                title={item.label}
              >
                <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                <span className={styles.navLabel}>{item.label}</span>
                {isActive && <span className={styles.activeBar} aria-hidden="true" />}
              </a>
            )
          })}
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

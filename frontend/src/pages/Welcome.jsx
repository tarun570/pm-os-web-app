import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authAPI, fileAPI } from '../api/auth'
import Sidebar from '../components/Sidebar'
import FileUpload from '../components/FileUpload'
import FileHistory from '../components/FileHistory'
import ProjectDetails from '../components/ProjectDetails/ProjectDetails'
import Chatbot from '../components/Chatbot'
import Integrations from '../components/Integrations'
import {
  Zap,
  BookOpen,
  FileText,
  CheckCircle2,
  Folder,
  Files,
  UserCircle2,
  CalendarDays,
  BadgeCheck,
  Sparkles,
  Circle,
  Plug,
  Unplug,
  Loader2,
  LayoutDashboard,
  ListChecks,
} from 'lucide-react'
import useInView from '../hooks/useInView'
import styles from './Welcome.module.css'

// Drives the sidebar's active highlight via IntersectionObserver.
// We only need a single observer because the sections are static.
const SECTION_IDS = ['overview', 'projects', 'upload', 'files', 'drive', 'integrations', 'account']

function getInitials(user) {
  if (!user) return '?'
  const first = (user.first_name || '').trim()
  const last = (user.last_name || '').trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  const name = user.username || user.email || ''
  return name.slice(0, 2).toUpperCase()
}

function StatTile({ icon: Icon, value, label, accent }) {
  return (
    <div className={styles.statTile}>
      <div className={`${styles.statIcon} ${accent ? styles[accent] : ''}`}>
        <Icon size={18} />
      </div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

export default function Welcome() {
  const { user, fetchCurrentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [uploads, setUploads] = useState([])
  const [showUploadSection, setShowUploadSection] = useState(false)
  const [gdriveToast, setGdriveToast] = useState(null)
  const [gdriveBusy, setGdriveBusy] = useState(false)
  const [activeId, setActiveId] = useState('overview')
  const mainRef = useRef(null)

  // Section refs for the IntersectionObserver that powers the active
  // highlight in the sidebar.
  const [overviewRef, overviewInView] = useInView({ threshold: 0.15 })
  const [projectsRef] = useInView({ threshold: 0.15 })
  const [uploadRef] = useInView({ threshold: 0.15 })
  const [filesRef] = useInView({ threshold: 0.15 })
  const [driveRef] = useInView({ threshold: 0.15 })
  const [integrationsRef] = useInView({ threshold: 0.15 })
  const [accountRef] = useInView({ threshold: 0.15 })

  useEffect(() => {
    fetchUploads()
  }, [])

  // Drive the activeId from a single observer on the main column so the
  // sidebar highlight follows the scroll without per-section observers.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const visible = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio)
          } else {
            visible.delete(entry.target.id)
          }
        }
        if (visible.size > 0) {
          // Pick the section with the highest visible ratio; ties broken
          // by source order (first match wins).
          let best = null
          let bestRatio = -1
          for (const id of SECTION_IDS) {
            const ratio = visible.get(id)
            if (ratio != null && ratio > bestRatio) {
              best = id
              bestRatio = ratio
            }
          }
          if (best) setActiveId(best)
        }
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.15, 0.3, 0.6] },
    )

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  // If the user lands on /welcome with a hash, scroll to it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace('#', '')
    if (hash && SECTION_IDS.includes(hash)) {
      // Wait one tick so the DOM is rendered.
      setTimeout(() => {
        const el = document.getElementById(hash)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }, [])

  // Drive the success-toast pattern with a single timer ref.
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
    setGdriveToast('✓ File uploaded. Processing has started.')
    setTimeout(() => setGdriveToast(null), 4000)
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

  const completedCount = uploads.filter((u) => u.status === 'completed').length
  const processingCount = uploads.filter((u) => u.status === 'processing').length
  const firstName = user?.first_name || (user?.email || '').split('@')[0] || 'there'
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || user?.email
  const driveConnected = !!user?.has_google_drive_connected
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : '—'

  return (
    <div className={styles.layout}>
      <Sidebar activeId={activeId} />

      <main className={styles.main} ref={mainRef}>
        {/* Toasts float above the main content */}
        {gdriveToast && (
          <div className={styles.gdriveToast} role="status">
            {gdriveToast}
          </div>
        )}

        {/* ===== Overview (hero + stat tiles) ===== */}
        <section id="overview" ref={overviewRef} className={`${styles.section} ${styles.overview}`}>
          <div className={styles.hero}>
            <div className={styles.heroContent}>
              <div className={styles.badge}>
                <span className={styles.badgeDot}></span> Welcome to PM OS
              </div>
              <h1>
                Hello, <span className="gradient-text">{firstName}</span>!
              </h1>
              <p className={styles.subtitle}>
                You're all set to start creating AI-powered project plans. Upload your SOW
                and get a complete execution-ready project plan in minutes.
              </p>
              <div className={styles.actions}>
                <button
                  className={`${styles.primaryBtn} gradient-button`}
                  onClick={() => {
                    setShowUploadSection((v) => !v)
                    const el = document.getElementById('upload')
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  <Zap size={16} /> {showUploadSection ? 'Hide Upload' : 'Upload Your First SOW'}
                </button>
                <a className={styles.secondaryBtn} href="#projects">
                  <ListChecks size={16} /> View Project Details
                </a>
              </div>
            </div>

            <div className={styles.statsCard}>
              <div className={styles.statsHeader}>
                <div className={styles.statsIconBubble}>
                  <LayoutDashboard size={20} />
                </div>
                <div>
                  <h3>Your Workspace</h3>
                  <p>Snapshot of your projects and Drive</p>
                </div>
              </div>
              <div className={styles.statsGrid}>
                <div className={styles.statsTile}>
                  <div className={styles.statsTileLabel}>Projects</div>
                  <div className={styles.statsTileValue}>{uploads.length}</div>
                </div>
                <div className={styles.statsTile}>
                  <div className={styles.statsTileLabel}>Completed</div>
                  <div className={`${styles.statsTileValue} ${styles.statGreen}`}>
                    {completedCount}
                  </div>
                </div>
                <div className={styles.statsTile}>
                  <div className={styles.statsTileLabel}>Processing</div>
                  <div className={`${styles.statsTileValue} ${styles.statBlue}`}>
                    {processingCount}
                  </div>
                </div>
                <div className={styles.statsTile}>
                  <div className={styles.statsTileLabel}>Drive</div>
                  <div
                    className={`${styles.statsTileValue} ${driveConnected ? styles.statGreen : styles.statMuted}`}
                  >
                    {driveConnected ? 'On' : 'Off'}
                  </div>
                </div>
              </div>
              {uploads.some((u) => u.status === 'completed' && u.drive_folder_url) && (
                <p className={styles.driveHint}>
                  All generated files live in your Google Drive. Open any completed project below to view.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ===== Project Details ===== */}
        <section
          id="projects"
          ref={projectsRef}
          className={`${styles.section} ${styles.projectsSection}`}
        >
          <ProjectDetails />
        </section>

        {/* ===== Upload SOW ===== */}
        <section id="upload" ref={uploadRef} className={`${styles.section} ${styles.uploadSection}`}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionHeadingIcon}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2>Upload a new SOW</h2>
              <p>Drop a PDF, DOCX, or TXT and PM OS will generate a complete plan.</p>
            </div>
          </div>
          {showUploadSection || uploads.length === 0 ? (
            <FileUpload onUploadSuccess={handleUploadSuccess} />
          ) : (
            <button
              className={`${styles.primaryBtn} gradient-button`}
              onClick={() => setShowUploadSection(true)}
            >
              <Zap size={16} /> Show upload zone
            </button>
          )}
        </section>

        {/* ===== File History ===== */}
        <section id="files" ref={filesRef} className={`${styles.section} ${styles.historySection}`}>
          <FileHistory uploads={uploads} onRefresh={fetchUploads} />
        </section>

        {/* ===== Google Drive ===== */}
        <section id="drive" ref={driveRef} className={`${styles.section} ${styles.userInfo}`}>
          <div className={`${styles.userCard} ${styles.driveCard}`}>
            <div className={styles.driveHeader}>
              <div className={styles.driveIcon}>
                <Folder size={20} />
              </div>
              <div>
                <h3>Google Drive</h3>
                <p className={styles.gdriveDescription}>
                  Connect your Google Drive to save generated PRDs and sprint plans
                  directly to your account. PM OS only sees files it creates — your
                  other Drive files are never accessible.
                </p>
              </div>
            </div>

            {driveConnected ? (
              <div className={styles.gdriveConnected}>
                <div className={styles.gdriveStatus}>
                  <span className={`${styles.gdriveCheckmark} ${styles.gdriveCheckmarkOn}`}>
                    <CheckCircle2 size={14} strokeWidth={2.5} />
                  </span>
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
              </div>
            ) : (
              <div className={styles.gdriveDisconnected}>
                <div className={styles.gdriveStatus}>
                  <span className={styles.gdriveCheckmark}>
                    <Circle size={14} />
                  </span>
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
              </div>
            )}
          </div>
        </section>

        {/* ===== Integrations ===== */}
        <section
          id="integrations"
          ref={integrationsRef}
          className={`${styles.section} ${styles.integrationsSection}`}
        >
          <Integrations />
        </section>

        {/* ===== Account ===== */}
        <section
          id="account"
          ref={accountRef}
          className={`${styles.section} ${styles.accountSection}`}
        >
          <div className={styles.accountCard}>
            <div className={styles.accountHeader}>
              <div className={styles.accountAvatar}>{getInitials(user)}</div>
              <div className={styles.accountIdentity}>
                <h3>{fullName}</h3>
                <p>{user?.email}</p>
              </div>
              <div className={styles.accountVerified}>
                <BadgeCheck size={14} />
                <span>Verified</span>
              </div>
            </div>

            <div className={styles.accountStats}>
              <StatTile icon={Files} value={uploads.length} label="Total uploads" accent="accent" />
              <StatTile
                icon={CheckCircle2}
                value={completedCount}
                label="Completed"
                accent="green"
              />
              <StatTile
                icon={Folder}
                value={driveConnected ? 'On' : 'Off'}
                label="Google Drive"
                accent={driveConnected ? 'green' : 'muted'}
              />
            </div>

            <div className={styles.accountDetails}>
              <div className={styles.accountRow}>
                <div className={styles.accountRowLeft}>
                  <UserCircle2 size={16} />
                  <span className={styles.accountLabel}>Full name</span>
                </div>
                <span className={styles.accountValue}>{fullName}</span>
              </div>
              <div className={styles.accountRow}>
                <div className={styles.accountRowLeft}>
                  <FileText size={16} />
                  <span className={styles.accountLabel}>Email</span>
                </div>
                <span className={styles.accountValue}>{user?.email}</span>
              </div>
              <div className={styles.accountRow}>
                <div className={styles.accountRowLeft}>
                  <BadgeCheck size={16} />
                  <span className={styles.accountLabel}>Account status</span>
                </div>
                <span className={`${styles.accountValue} ${styles.accountVerifiedText}`}>
                  <CheckCircle2 size={14} /> Verified
                </span>
              </div>
              <div className={styles.accountRow}>
                <div className={styles.accountRowLeft}>
                  <CalendarDays size={16} />
                  <span className={styles.accountLabel}>Member since</span>
                </div>
                <span className={styles.accountValue}>{memberSince}</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Features ===== */}
        <section className={`${styles.section} ${styles.features}`}>
          <div className={styles.sectionHeader}>
            <h2>What You Can Do</h2>
            <p>Everything you need to transform your project planning</p>
          </div>
          <div className={styles.featureGrid}>
            <FeatureCard icon={FileText} title="Generate PRD" desc="Create enterprise-grade Product Requirements Documents from your SOW automatically." />
            <FeatureCard icon={ListChecks} title="Task Planning" desc="Get actionable user stories mapped directly from your requirements." />
            <FeatureCard icon={UserCircle2} title="Team Planning" desc="Clear team structure with roles, availability and sprint allocation." />
            <FeatureCard icon={CalendarDays} title="Sprint Execution" desc="Week-by-week sprint breakdown with tasks, priorities and timelines." />
            <FeatureCard icon={Zap} title="Execution Tasks" desc="Granular daily tasks per developer — no ambiguity, no wasted standups." />
            <FeatureCard icon={Folder} title="Export & Share" desc="Export to Google Docs & Sheets, ready to import to Jira, Notion, or Linear." />
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
      </main>

      {/* Help / AI Assistant — floating bubble + panel. */}
      <Chatbot />
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  )
}

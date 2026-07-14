import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fileAPI } from '../api/auth'
import FileUpload from '../components/FileUpload'
import {
  Zap,
  ListChecks,
  LayoutDashboard,
  Loader2,
  Sparkles,
  FilePlus2,
} from 'lucide-react'
import styles from './OverviewPage.module.css'

export default function OverviewPage() {
  const { user } = useAuth()
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  // Fetch on mount. If the user has no uploads, we render the empty
  // state and skip the workspace card entirely.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fileAPI.listUploads()
        if (!cancelled) setUploads(res.data || [])
      } catch (err) {
        console.error('Failed to fetch uploads:', err)
        if (!cancelled) setUploads([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleUploadSuccess = (newUpload) => {
    // Prepend the new row so counts update immediately without a refetch.
    setUploads((prev) => [newUpload, ...prev])
    setShowUpload(false)
  }

  // First name fallbacks — same shape Welcome.jsx used.
  const firstName =
    user?.first_name || (user?.email || '').split('@')[0] || 'there'
  const fullName =
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.username ||
    user?.email

  // Counts pulled from real data — never hardcoded.
  const totalCount = uploads.length
  const completedCount = uploads.filter((u) => u.status === 'completed').length
  const processingCount = uploads.filter((u) => u.status === 'processing').length
  const driveConnected = !!user?.has_google_drive_connected
  const hasCompletedUploadsWithFolder = uploads.some(
    (u) => u.status === 'completed' && u.drive_folder_url,
  )

  return (
    <div className={styles.page}>
      {/* ===== Hero ===== */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeDot}></span> Welcome to PM OS
          </div>

          <h1>
            Hello, <span className="gradient-text">{firstName}</span>!
          </h1>

          <p className={styles.subtitle}>
            You're all set to start creating AI-powered project plans. Upload your
            SOW and get a complete execution-ready project plan in minutes.
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.primaryBtn} gradient-button`}
              onClick={() => setShowUpload((v) => !v)}
            >
              <Zap size={16} /> {showUpload ? 'Hide upload' : 'Upload Your First SOW'}
            </button>
            <Link to="/projects" className={styles.secondaryBtn}>
              <ListChecks size={16} /> View Project Details
            </Link>
          </div>
        </div>

        {/* ===== Right column: workspace summary OR empty state ===== */}
        {loading ? (
          <div className={styles.workspaceCard} aria-busy="true">
            <div className={styles.workspaceHeader}>
              <div className={styles.workspaceIconBubble}>
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h3>Your Workspace</h3>
                <p>Loading your projects…</p>
              </div>
            </div>
            <div className={styles.workspaceLoadingRow}>
              <Loader2 size={16} className={styles.spin} />
              <span>Fetching uploads</span>
            </div>
          </div>
        ) : totalCount === 0 ? (
          <div className={`${styles.workspaceCard} ${styles.workspaceCardEmpty}`}>
            <div className={styles.workspaceHeader}>
              <div className={styles.workspaceIconBubble}>
                <FilePlus2 size={20} />
              </div>
              <div>
                <h3>No projects yet</h3>
                <p>
                  Upload your first SOW and PM OS will generate a complete
                  project plan for you.
                </p>
              </div>
            </div>
            <div className={styles.emptySteps}>
              <div className={styles.emptyStep}>
                <span className={styles.emptyStepNum}>1</span>
                <span>Upload a PDF, DOCX, or TXT SOW</span>
              </div>
              <div className={styles.emptyStep}>
                <span className={styles.emptyStepNum}>2</span>
                <span>We'll generate a PRD, sprint plan, and user stories</span>
              </div>
              <div className={styles.emptyStep}>
                <span className={styles.emptyStepNum}>3</span>
                <span>Export to Jira or Trello when you're ready</span>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.workspaceCard}>
            <div className={styles.workspaceHeader}>
              <div className={styles.workspaceIconBubble}>
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
                <div className={styles.statsTileValue}>{totalCount}</div>
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
                  className={`${styles.statsTileValue} ${
                    driveConnected ? styles.statGreen : styles.statMuted
                  }`}
                >
                  {driveConnected ? 'On' : 'Off'}
                </div>
              </div>
            </div>

            {hasCompletedUploadsWithFolder && (
              <p className={styles.driveHint}>
                All generated files live in your Google Drive. Open any completed
                project below to view.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ===== Inline upload section (toggled by the primary CTA) ===== */}
      {showUpload && (
        <section className={styles.uploadSection}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionHeadingIcon}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2>Upload a new SOW</h2>
              <p>Drop a PDF, DOCX, or TXT and PM OS will generate a complete plan.</p>
            </div>
          </div>
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        </section>
      )}

      {/* Quick links below the hero — present regardless of empty state
          so the page always has somewhere for the user to go next. */}
      {totalCount > 0 && (
        <section className={styles.quickLinks}>
          <Link to="/projects" className={styles.quickLink}>
            <ListChecks size={16} />
            <span>Browse all projects</span>
            <span className={styles.quickLinkCount}>{totalCount}</span>
          </Link>
        </section>
      )}

      {/* Account teaser — just a small "signed in as" line; the full
          account card will live on its own /account page later. */}
      {fullName && (
        <p className={styles.signedInAs}>
          Signed in as <strong>{fullName}</strong>
        </p>
      )}
    </div>
  )
}

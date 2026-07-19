import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fileAPI } from '../api/auth'
import FileUpload from '../components/FileUpload'
import {
  Zap,
  ListChecks,
  LayoutDashboard,
  Sparkles,
  FilePlus2,
} from 'lucide-react'
import styles from './OverviewPage.module.css'

export default function OverviewPage() {
  const { user } = useAuth()
  const [uploads, setUploads] = useState([])
  const [showUpload, setShowUpload] = useState(false)

  // Fetch on mount. We optimistically assume there are no projects and
  // render the empty state immediately — the page is usable the moment
  // the React tree mounts. When the API responds, we only swap to the
  // workspace card if the user actually has uploads. This avoids
  // blocking the whole hero on a network round-trip that, for new
  // users, is just going to return [].
  //
  // We hit the dedicated /summary/ endpoint (not /list_uploads/) so the
  // dashboard doesn't pull the heavy `sow_text` TextField or the full
  // `processing_result` JSON for every row — the workspace card only
  // needs counts + status + drive_folder_url.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fileAPI.getUploadsSummary()
        if (!cancelled) setUploads(res.data?.uploads || [])
      } catch (err) {
        console.error('Failed to fetch uploads summary:', err)
        if (!cancelled) setUploads([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // FileUpload internally calls navigate('/projects') on a successful
  // upload, so we don't need to do anything here besides prepending
  // the new row to local state for the workspace counts.
  const handleUploadSuccess = (newUpload) => {
    setUploads((prev) => [newUpload, ...prev.filter((u) => u.id !== newUpload.id)])
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
              <Zap size={16} /> {showUpload ? 'Hide upload' : 'Upload Your SOW'}
            </button>
            <Link to="/projects" className={styles.secondaryBtn}>
              <ListChecks size={16} /> View Project Details
            </Link>
          </div>
        </div>

        {/* ===== Right column: workspace summary OR empty state =====
            Render the empty state optimistically. We only show the
            loading skeleton if we already know the user has uploads
            (we'd rather keep their workspace card stable than flicker
            it to "no projects" and back). The first paint never
            blocks on the network. */}
        {totalCount === 0 ? (
          <div className={`${styles.workspaceCard} ${styles.workspaceCardEmpty}`}>
            <div className={styles.workspaceHeader}>
              <div className={styles.workspaceIconBubble}>
                <FilePlus2 size={20} />
              </div>
              <div>
                <h3>No projects yet</h3>
                <p>
                  Upload your SOW and PM OS will generate a complete
                  project plan for you.
                </p>
              </div>
            </div>
            <div className={styles.emptySteps}>
              <div className={styles.emptyStep}>
                <span className={styles.emptyStepNum}>1</span>
                <span>Upload a PDF SOW</span>
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

      {/* ===== Inline upload section (toggled by the primary CTA) =====
          FileUpload redirects to /projects on success, so the user lands
          on the Projects page where their new card shows the live
          status badge (Processing → Completed). */}
      {showUpload && (
        <section className={styles.uploadSection}>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionHeadingIcon}>
              <Sparkles size={18} />
            </div>
            <div>
              <h2>Upload a new SOW</h2>
              <p>Drop a PDF PM OS will generate a complete plan.</p>
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

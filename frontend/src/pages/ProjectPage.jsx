import { useEffect, useState, useMemo } from 'react'
import { Outlet, useParams, useLocation, Link } from 'react-router-dom'
import { ChevronLeft, Loader2, FolderOpen } from 'lucide-react'
import { fileAPI } from '../api/auth'
import { ProjectSectionContext } from '../context/ProjectSectionContext'
import styles from './ProjectPage.module.css'

// Map URL path tail → section id consumed by ProjectSectionContext.
function sectionFromPathname(pathname) {
  if (pathname.endsWith('/meetings')) return 'meetings'
  if (pathname.endsWith('/sprint')) return 'sprint'
  // Default: '/projects/:id' and '/projects/:id/overview' both → 'overview'.
  return 'overview'
}

/**
 * ProjectPage — the route view for `/projects/:uploadId/...`.
 *
 * Renders inside AppLayout's <Outlet />, so the surrounding
 * Sidebar / ChatPanel / DriveConnection chrome is already in place
 * from the parent layout. This component only owns the middle column
 * for the project area: a small header (project name + status + back
 * link) plus the nested <Outlet /> that renders the active section
 * (Overview / Meetings / Sprint Plan).
 *
 * The active project + section are published via
 * `ProjectSectionContext` so the right-column ChatPanel can read them
 * and switch into section-aware mode.
 */
export default function ProjectPage() {
  const { uploadId } = useParams()
  const numericUploadId = uploadId ? Number(uploadId) : null
  const location = useLocation()
  const section = useMemo(() => sectionFromPathname(location.pathname), [location.pathname])

  const [upload, setUpload] = useState(null)
  const [loadingUpload, setLoadingUpload] = useState(false)

  // Fetch the latest FileUpload row on mount / when the id changes.
  // The header shows project name + status from this row; the
  // OverviewTab also receives it as a prop.
  useEffect(() => {
    if (!numericUploadId) return undefined
    let cancelled = false
    setLoadingUpload(true)
    fileAPI
      .getUpload(numericUploadId)
      .then((res) => {
        if (!cancelled) setUpload(res?.data || null)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load project:', err)
          setUpload(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUpload(false)
      })
    return () => {
      cancelled = true
    }
  }, [numericUploadId])

  const projectName = upload?.file_name || (numericUploadId ? `Project #${numericUploadId}` : 'Project')

  return (
    <ProjectSectionContext.Provider value={{ uploadId: numericUploadId, section }}>
      <div className={styles.page}>
        <header className={styles.header}>
          <Link to="/projects" className={styles.backLink} aria-label="Back to all projects">
            <ChevronLeft size={16} />
            <span>All projects</span>
          </Link>
          <div className={styles.titleBlock}>
            <h1 className={styles.title} title={projectName}>
              {projectName}
            </h1>
            {loadingUpload ? (
              <span className={styles.statusPill}>
                <Loader2 size={12} className={styles.spin} /> Loading…
              </span>
            ) : upload ? (
              <span
                className={`${styles.statusPill} ${
                  styles[`status_${upload.status}`] || ''
                }`}
              >
                {upload.status}
              </span>
            ) : null}
          </div>
          {upload?.drive_folder_url && (
            <a
              href={upload.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.driveLink}
              title="Open project folder in Google Drive"
            >
              <FolderOpen size={14} />
              <span>Open in Drive</span>
            </a>
          )}
        </header>

        {/* Active section. The route children (Overview / Meetings /
            Sprint Plan) render here. They read uploadId from
            useParams(), or — for OverviewTab — receive `upload` as a
            prop so it can render header info without a second fetch. */}
        <div className={styles.body}>
          <Outlet context={{ upload, refreshUpload: () => {} }} />
        </div>
      </div>
    </ProjectSectionContext.Provider>
  )
}

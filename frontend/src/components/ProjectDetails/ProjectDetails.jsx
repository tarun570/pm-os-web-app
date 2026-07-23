import React, { useState, useEffect } from 'react'
import { FolderOpen, Loader2, FileText, ExternalLink } from 'lucide-react'
import { fileAPI } from '../../api/auth'
import styles from './ProjectDetails.module.css'

// Map FileUpload.status (pending | processing | completed | failed) to
// the visual status used by the project card. The card treats anything
// that isn't completed as "running" so the UI matches the prior design
// while still reflecting real backend state.
const STATUS_META = {
  completed: { label: 'Complete', pillClass: 'pillComplete', fillClass: 'fill_complete', progress: 100 },
  processing: { label: 'Running', pillClass: 'pillRunning', fillClass: 'fill_running', progress: 50 },
  pending: { label: 'Running', pillClass: 'pillRunning', fillClass: 'fill_running', progress: 10 },
  failed: { label: 'On Hold', pillClass: 'pillOnHold', fillClass: 'fill_on-hold', progress: 0 },
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function pickSummary(upload) {
  // Prefer the SOW text snippet if extracted; otherwise show the file
  // name. The SOW text is the plain text the backend extracted from
  // the PDF/DOCX, so the first ~140 chars make a decent one-liner.
  if (upload.sow_text && upload.sow_text.trim()) {
    const clean = upload.sow_text.replace(/\s+/g, ' ').trim()
    return clean.length > 160 ? `${clean.slice(0, 160)}…` : clean
  }
  return `SOW uploaded as ${upload.file_name || 'document'}.`
}

function pickProjectName(upload) {
  // Once the webhook callback runs the upload row may carry a project
  // name (set by the backend from the SOW or Google Sheet). Until then
  // we fall back to the file name.
  if (upload.processing_result && typeof upload.processing_result === 'object') {
    const pr = upload.processing_result
    if (pr.project_name) return pr.project_name
  }
  if (upload.project_name) return upload.project_name
  if (upload.file_name) {
    // Strip common SOW suffixes for a friendlier title.
    return upload.file_name.replace(/\.(pdf|docx?|txt)$/i, '').replace(/[_-]+/g, ' ').trim() || upload.file_name
  }
  return `Project #${upload.id}`
}

function pickOwner(upload) {
  if (upload.processing_result && typeof upload.processing_result === 'object') {
    if (upload.processing_result.owner) return upload.processing_result.owner
  }
  if (upload.user) {
    const u = upload.user
    if (u.first_name || u.last_name) {
      return `${u.first_name || ''} ${u.last_name || ''}`.trim()
    }
    if (u.username) return u.username
    if (u.email) return u.email.split('@')[0]
  }
  return 'You'
}

/**
 * ProjectDetails
 *
 * Lists the user's real FileUpload rows as project cards. Clicking a
 * card calls `onCardClick(uploadId)` so the parent (Welcome.jsx) can
 * open the ProjectDetailModal for that project.
 *
 * Props:
 *   - onCardClick(uploadId): optional — when provided, cards become
 *     clickable and a "view details" hint is shown. When omitted, the
 *     component renders a non-interactive list (still useful for the
 *     "no projects yet" empty state on first login).
 *   - refreshKey: optional number — increment to force a re-fetch.
 */
export default function ProjectDetails({ onCardClick, refreshKey }) {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fileAPI
      .listUploads()
      .then((res) => {
        if (cancelled) return
        // Backend returns the list in newest-first order, but normalize
        // just in case.
        const list = Array.isArray(res?.data) ? res.data : []
        list.sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0))
        setUploads(list)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load projects:', err)
        setError(err?.response?.data?.error || err.message || 'Failed to load projects')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Your Projects</h2>
          <p>Click any project to open the workspace — chat, meetings, and the live sprint plan.</p>
        </div>
      </div>

      {loading && (
        <div className={styles.loadingState}>
          <Loader2 size={20} className={styles.spin} />
          <span>Loading projects…</span>
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorState}>
          <p>Could not load your projects.</p>
          <p className={styles.errorDetail}>{error}</p>
        </div>
      )}

      {!loading && !error && uploads.length === 0 && (
        <div className={styles.emptyState}>
          <FileText size={28} />
          <h3>No projects yet</h3>
          <p>
            Upload a SOW (Statement of Work) above and PM OS will turn it into a
            complete execution-ready project plan. Your projects will appear here.
          </p>
        </div>
      )}

      {!loading && !error && uploads.length > 0 && (
        <div className={styles.grid}>
          {uploads.map((upload) => {
            const meta = STATUS_META[upload.status] || STATUS_META.processing
            const projectName = pickProjectName(upload)
            const owner = pickOwner(upload)
            const summary = pickSummary(upload)
            const startDate = upload.uploaded_at
            const endDate = upload.completed_at || null

            return (
              <article
                key={upload.id}
                className={`${styles.card} ${onCardClick ? styles.cardClickable : ''}`}
                onClick={onCardClick ? () => onCardClick(upload.id) : undefined}
                onKeyDown={
                  onCardClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onCardClick(upload.id)
                        }
                      }
                    : undefined
                }
                role={onCardClick ? 'button' : undefined}
                tabIndex={onCardClick ? 0 : undefined}
                aria-label={onCardClick ? `Open project ${projectName}` : undefined}
              >
                <div className={styles.cardHeaderTop}>
                  <div className={styles.cardTitleBlock}>
                    <h3 className={styles.cardTitle}>{projectName}</h3>
                    <p className={styles.cardOwner}>Owner · {owner}</p>
                  </div>
                  <span className={`${styles.pill} ${styles[meta.pillClass]}`}>
                    <span className={styles.pillDot}></span>
                    {meta.label}
                  </span>
                </div>

                <p className={styles.cardSummary}>{summary}</p>

                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Started</span>
                    <span className={styles.metaValue}>{formatDate(startDate)}</span>
                  </div>
                  {endDate && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Completed</span>
                      <span className={styles.metaValue}>{formatDate(endDate)}</span>
                    </div>
                  )}
                </div>

                <div className={styles.progressRow}>
                  <div className={styles.progressTrack}>
                    <div
                      className={`${styles.progressFill} ${styles[meta.fillClass]}`}
                      style={{ width: `${meta.progress}%` }}
                    ></div>
                  </div>
                  <span className={styles.progressLabel}>{meta.progress}%</span>
                </div>

                <div className={styles.cardFooter}>
                  {onCardClick ? (
                    <span className={styles.expandHint}>Open workspace →</span>
                  ) : (
                    <span className={styles.expandHint}>No actions available</span>
                  )}
                  {upload.drive_folder_url && (
                    <a
                      href={upload.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.driveLink}
                      onClick={(e) => e.stopPropagation()}
                      title="Open in Google Drive"
                    >
                      <FolderOpen size={12} /> Drive
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

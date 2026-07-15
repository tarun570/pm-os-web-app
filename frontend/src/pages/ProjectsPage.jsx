import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { fileAPI } from '../api/auth'
import useCsvExport from '../hooks/useCsvExport'
import ExportButtons from '../components/ExportButtons'
import FileUpload from '../components/FileUpload'
import {
  Plus,
  RefreshCw,
  Inbox,
  FileText,
  FileType,
  FileCode,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  HelpCircle,
  X,
  FolderOpen,
  ExternalLink,
  Sheet,
  AlertCircle,
  Trash2,
} from 'lucide-react'
import styles from './ProjectsPage.module.css'

// Status config — same shape as FileHistory.jsx, kept here so the cards
// can render their own badge without importing FileHistory.
const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: '#f59e0b', Icon: Clock },
  processing: { label: 'Processing', color: '#3b82f6', Icon: Loader2 },
  completed:  { label: 'Completed',  color: '#10b981', Icon: CheckCircle2 },
  failed:     { label: 'Failed',     color: '#ef4444', Icon: XCircle },
}

// File-type → icon mapping (matches FileHistory).
const FileIconFor = {
  pdf:  FileText,
  docx: FileType,
  txt:  FileCode,
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

export default function ProjectsPage() {
  const { user } = useAuth()
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Per-upload delete-in-flight flag — disables the Delete button while
  // the DELETE request is in flight so a double-click can't fire two
  // requests. Keyed by upload id.
  const [deletingIds, setDeletingIds] = useState(() => new Set())

  // Tracks per-upload poll loops. Cleared on unmount.
  const pollersRef = useRef({})   // { [uploadId]: { active, timer } }

  // ---- Data fetching ----

  // Single fetch path used by the initial load AND by the polling loop.
  // Returns the fresh array so callers can decide whether to update state.
  const fetchUploads = useCallback(async () => {
    const res = await fileAPI.listUploads()
    return res.data || []
  }, [])

  // Initial load + manual refresh. Polling for `processing` rows happens
  // separately (see useEffect below) to keep the two paths independent.
  const loadOnce = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setIsRefreshing(true)
    try {
      const fresh = await fetchUploads()
      setUploads(fresh)
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
      setUploads([])
    } finally {
      setLoading(false)
      if (showSpinner) setIsRefreshing(false)
    }
  }, [fetchUploads])

  useEffect(() => {
    loadOnce()
  }, [loadOnce])

  // ---- Polling for `processing` rows ----
  //
  // We poll *only* the rows currently in 'processing' (not all uploads).
  // For each, fire GET /uploads/{id}/ every 2s, up to 20 attempts (~40s,
  // matching the existing FileUpload.jsx timeout). When a row's status
  // flips away from 'processing', the row is re-rendered with the new
  // status badge and we stop polling for it. On unmount, all timers are
  // invalidated via the `active` flag.
  useEffect(() => {
    if (uploads.length === 0) return

    const processingIds = uploads.filter((u) => u.status === 'processing').map((u) => u.id)

    // Start a poller for each processing row that doesn't already have one.
    processingIds.forEach((id) => {
      if (pollersRef.current[id]) return

      const state = { active: true, attempts: 0 }
      pollersRef.current[id] = state

      const tick = async () => {
        if (!state.active) return
        if (state.attempts >= 20) {
          pollersRef.current[id] = null
          return
        }
        state.attempts += 1
        try {
          const res = await fileAPI.getUpload(id)
          const fresh = res.data
          setUploads((prev) => prev.map((u) => (u.id === id ? fresh : u)))
          if (fresh.status !== 'processing') {
            pollersRef.current[id] = null
            return
          }
        } catch (err) {
          // Network blip — log and try again on the next tick.
          console.warn(`Polling upload ${id} failed:`, err)
        }
        if (!state.active) return
        state.timer = setTimeout(tick, 2000)
      }

      // Kick off the first tick after the standard 2s delay.
      state.timer = setTimeout(tick, 2000)
    })

    // Mark any pollers whose row is no longer in `processing` as inactive.
    Object.keys(pollersRef.current).forEach((idStr) => {
      const id = Number(idStr)
      const stillProcessing = processingIds.includes(id)
      if (!stillProcessing && pollersRef.current[id]) {
        pollersRef.current[id].active = false
        if (pollersRef.current[id].timer) clearTimeout(pollersRef.current[id].timer)
        pollersRef.current[id] = null
      }
    })
  }, [uploads])

  // Cancel all pollers on unmount.
  useEffect(() => {
    return () => {
      Object.values(pollersRef.current).forEach((s) => {
        if (s) {
          s.active = false
          if (s.timer) clearTimeout(s.timer)
        }
      })
      pollersRef.current = {}
    }
  }, [])

  // ---- Actions ----

  // Insert a freshly-uploaded row at the top of the list. The modal polls
  // internally (FileUpload.jsx's existing 2s/40s loop), so we trust its
  // callback for the initial row and let our own poller pick up the
  // 'processing' → 'completed' transition.
  const handleUploadSuccess = (newUpload) => {
    setUploads((prev) => [newUpload, ...prev.filter((u) => u.id !== newUpload.id)])
    // Don't close the modal here — the user might want to see the
    // "Upload started" state. They can dismiss it themselves.
  }

  // Delete a project from both the backend and local state. The backend
  // DELETE is the source of truth: `fileAPI.deleteUpload` hits
  // `DELETE /uploads/{id}/` which is provided by the default
  // ModelViewSet routing (FileUploadViewSet is a ModelViewSet, and its
  // `get_queryset()` is already scoped to `request.user`, so a user can
  // only delete their own rows). On success, the row stays gone after a
  // page refresh — fixing the previous "delete is local-only" bug.
  //
  // We optimistically remove the row from state BEFORE the network call
  // so the UI feels instant. The poller for that id is torn down first
  // (defensive: a stale poll response that lands while the DELETE is
  // in flight can't update state for a row we've already removed). On
  // failure we re-insert the original row so the user can retry.
  const handleDeleteUpload = async (uploadId) => {
    if (deletingIds.has(uploadId)) return

    if (
      !window.confirm(
        'Delete this project? This will permanently remove it from your dashboard and the server. The original file, generated documents, and CSV exports will be deleted.',
      )
    ) {
      return
    }

    // Mark the row as deleting so the button can show a spinner and
    // ignore further clicks.
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.add(uploadId)
      return next
    })

    // Tear down any in-flight poller for this row first.
    const poller = pollersRef.current[uploadId]
    if (poller) {
      poller.active = false
      if (poller.timer) clearTimeout(poller.timer)
      pollersRef.current[uploadId] = null
    }

    // Snapshot the row so we can restore it on failure.
    let removedRow = null
    setUploads((prev) => {
      removedRow = prev.find((u) => u.id === uploadId) || null
      return prev.filter((u) => u.id !== uploadId)
    })

    try {
      await fileAPI.deleteUpload(uploadId)
    } catch (err) {
      console.error('Failed to delete upload:', err)
      // Re-insert the original row at its old position so the user can
      // retry. We push to the end — the original ordering is hard to
      // reconstruct from a single row.
      if (removedRow) {
        setUploads((prev) =>
          prev.some((u) => u.id === uploadId) ? prev : [...prev, removedRow],
        )
      }
      window.alert(
        `Failed to delete this project. ${
          err?.response?.data?.detail || err?.message || 'Please try again.'
        }`,
      )
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(uploadId)
        return next
      })
    }
  }

  const handleCloseModal = () => {
    setShowUploadModal(false)
  }

  // ---- Render ----

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Projects</h1>
          <p className={styles.lead}>
            Every SOW you've uploaded, with quick links to its generated
            documents and Drive folder.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => loadOnce({ showSpinner: true })}
            disabled={isRefreshing || loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={isRefreshing ? styles.spin : ''} />
            <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className={`${styles.addBtn} gradient-button`}
            onClick={() => setShowUploadModal(true)}
          >
            <Plus size={16} /> Add New Project
          </button>
        </div>
      </header>

      {loading ? (
        <div className={styles.loadingCard} aria-busy="true">
          <Loader2 size={20} className={styles.spin} />
          <span>Loading your projects…</span>
        </div>
      ) : uploads.length === 0 ? (
        <EmptyState onAdd={() => setShowUploadModal(true)} />
      ) : (
        <div className={styles.grid}>
          {/* "Add" tile is always first in the grid so it's discoverable. */}
          <button
            type="button"
            className={`${styles.card} ${styles.addCard}`}
            onClick={() => setShowUploadModal(true)}
          >
            <div className={styles.addCardInner}>
              <div className={styles.addCardIcon}>
                <Plus size={24} />
              </div>
              <span className={styles.addCardTitle}>Add New Project</span>
              <span className={styles.addCardSubtitle}>
                Upload a new SOW to generate a project plan.
              </span>
            </div>
          </button>

          {uploads.map((upload) => (
            <ProjectCard
              key={upload.id}
              upload={upload}
              ownerName={user?.first_name || user?.email}
              onRefresh={loadOnce}
              onDelete={handleDeleteUpload}
              isDeleting={deletingIds.has(upload.id)}
            />
          ))}
        </div>
      )}

      {showUploadModal && (
        <UploadModal onClose={handleCloseModal} onSuccess={handleUploadSuccess} />
      )}
    </div>
  )
}

// (useCsvExport + ExportButton used to live here. Both are now
// imported from frontend/src/hooks/useCsvExport and
// frontend/src/components/ExportButtons so the same code drives
// the buttons on FileHistory, ProjectDetailPage, and ProjectsPage.)


// ============================================================
// ProjectCard — one upload as a card.
// ============================================================
function ProjectCard({ upload, ownerName, onRefresh, onDelete, isDeleting = false }) {
  const config = STATUS_CONFIG[upload.status] || { label: 'Unknown', color: '#6b7280', Icon: HelpCircle }
  const StatusIcon = config.Icon
  const FileIcon = FileIconFor[upload.file_type] || FileText

  // processing_result can be a single object or an array of objects
  // (FileHistory handles both). Normalize to an array for rendering.
  const results = (() => {
    if (!upload.processing_result) return []
    return Array.isArray(upload.processing_result)
      ? upload.processing_result
      : [upload.processing_result]
  })()

  const firstResult = results[0] || {}
  const hasAnyLink = !!(upload.drive_folder_url || upload.prd_document || firstResult.doc_link || firstResult.sheet_link)

  // CSV export buttons. Each card gets its own per-button poller keyed
  // by `${upload.id}:${csvType}`. `onRefresh` is `loadOnce` from the
  // parent — it re-fetches the full list when the export state changes.
  const { handleExport, handleCancel } = useCsvExport(upload.id, upload, onRefresh)

  return (
    <div
      className={`${styles.card} ${styles.projectCard} ${styles[`status_${upload.status}`] || ''}`}
    >
      <div className={styles.cardTopRow}>
        <div className={styles.fileIcon}>
          <FileIcon size={20} />
        </div>
        <div className={styles.statusBadge} style={{ backgroundColor: config.color }}>
          <StatusIcon size={12} className={upload.status === 'processing' ? styles.spin : ''} />
          {config.label}
        </div>
      </div>

      <h3 className={styles.cardTitle} title={upload.file_name}>
        {upload.file_name}
      </h3>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem} title="Owner">
          {ownerName || 'You'}
        </span>
        <span className={styles.metaDot}>•</span>
        <span className={styles.metaItem}>{formatFileSize(upload.file_size)}</span>
      </div>

      <div className={styles.timeline}>
        <div className={styles.timelineRow}>
          <Clock size={12} />
          <span>Uploaded {formatDate(upload.uploaded_at)}</span>
        </div>
        {upload.completed_at && (
          <div className={styles.timelineRow}>
            <CheckCircle2 size={12} />
            <span>Completed {formatDate(upload.completed_at)}</span>
          </div>
        )}
        {upload.status === 'processing' && (
          <div className={`${styles.timelineRow} ${styles.timelineRowLive}`}>
            <Loader2 size={12} className={styles.spin} />
            <span>Generating plan…</span>
          </div>
        )}
      </div>

      {upload.status === 'failed' && upload.error_message && (
        <div className={styles.errorBox}>
          <AlertCircle size={14} />
          <span>{upload.error_message}</span>
        </div>
      )}

      {/* Quick-link chips — only when something is actually linked. */}
      {hasAnyLink && (
        <div className={styles.quickLinks}>
          {upload.drive_folder_url && (
            <a
              href={upload.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.quickLinkChip}
              title="Open in Google Drive"
            >
              <FolderOpen size={12} /> Drive
              <ExternalLink size={10} />
            </a>
          )}
          {upload.prd_document && (
            <a
              href={upload.prd_document}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.quickLinkChip}
              title="Open PRD"
            >
              <FileText size={12} /> PRD
              <ExternalLink size={10} />
            </a>
          )}
          {firstResult.doc_link && (
            <a
              href={firstResult.doc_link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.quickLinkChip}
              title="Open generated document"
            >
              <FileText size={15} /> Doc
              <ExternalLink size={15} />
            </a>
          )}
          {firstResult.sheet_link && (
            <a
              href={firstResult.sheet_link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.quickLinkChip}
              title="Open generated sheet"
            >
              <Sheet size={15} /> Sheet
              <ExternalLink size={15} />
            </a>
          )}
        </div>
      )}

      {/* CSV export row — only when a sheet exists (matches the
          Sheet chip gate above). */}
      {firstResult.sheet_link && (
        <ExportButtons
          upload={upload}
          onExport={handleExport}
          onCancel={handleCancel}
          className={styles.exportRow}
        />
      )}

      <div className={styles.cardFooter}>
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={() => onDelete?.(upload.id)}
          disabled={isDeleting}
          title={isDeleting ? 'Deleting…' : 'Delete from server and dashboard'}
          aria-label="Delete project from server and dashboard"
        >
          {isDeleting ? (
            <>
              <Loader2 size={13} className={styles.spin} /> Deleting…
            </>
          ) : (
            <>
              <Trash2 size={13} /> Delete
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// EmptyState — shown when the user has zero uploads.
// ============================================================
function EmptyState({ onAdd }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <Inbox size={48} strokeWidth={1.5} />
      </div>
      <h3>No projects yet</h3>
      <p>
        Upload a SOW and PM OS will generate a complete project plan —
        a PRD, sprint plan, and user stories you can export to Jira or Trello.
      </p>
      <button
        type="button"
        className={`${styles.addBtn} gradient-button`}
        onClick={onAdd}
      >
        <Plus size={16} /> Upload Your First SOW
      </button>
    </div>
  )
}

// ============================================================
// UploadModal — renders the existing FileUpload component in a
// dialog so we reuse its polling/drag-drop logic verbatim.
// ============================================================
function UploadModal({ onClose, onSuccess }) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={styles.modalBackdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upload a new SOW"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>Upload a new SOW</h2>
            <p>PDF, DOCX, or TXT — we'll generate a complete project plan.</p>
          </div>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label="Close upload dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div className={styles.modalBody}>
          <FileUpload onUploadSuccess={onSuccess} />
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState, useCallback } from 'react'
import {
  CalendarDays,
  FileText,
  ExternalLink,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  ClipboardList,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { fileAPI, summaryAPI } from '../../api/auth'
import ExportButtons from '../ExportButtons'
import useCsvExport from '../../hooks/useCsvExport'
import styles from './OverviewTab.module.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function pickProjectName(upload) {
  if (!upload) return 'Project'
  if (upload.processing_result && typeof upload.processing_result === 'object') {
    if (upload.processing_result.project_name) return upload.processing_result.project_name
  }
  if (upload.project_name) return upload.project_name
  if (upload.file_name) return upload.file_name.replace(/\.(pdf|docx?|txt)$/i, '')
  return `Project #${upload.id}`
}

function pickSheetLink(upload) {
  if (!upload) return null
  const pr = upload.processing_result
  if (pr && typeof pr === 'object') {
    if (pr.sheet_link) return pr.sheet_link
    if (pr.sheet_url) return pr.sheet_url
    if (Array.isArray(pr.results)) {
      const r = pr.results.find((x) => x?.sheet_link || x?.sheet_url)
      if (r) return r.sheet_link || r.sheet_url
    }
  }
  return null
}

function pickDocLink(upload) {
  if (!upload) return null
  const pr = upload.processing_result
  if (pr && typeof pr === 'object') {
    if (pr.doc_link) return pr.doc_link
    if (Array.isArray(pr.results)) {
      const r = pr.results.find((x) => x?.doc_link || x?.doc_url)
      if (r) return r.doc_link || r.doc_url
    }
  }
  return upload.prd_document || null
}

/**
 * OverviewTab — the default tab inside ProjectDetailModal.
 * Shows: project metadata, Drive / PRD / Sheet links, Jira + Trello
 * export buttons, a "Generate weekly summary" action, and the latest
 * cached project summary (collapsible).
 */
export default function OverviewTab({ uploadId, upload: initialUpload }) {
  const [upload, setUpload] = useState(initialUpload || null)
  const [refreshing, setRefreshing] = useState(false)

  // PRD preview (best-effort — not all projects have one).
  const [prd, setPrd] = useState(null)
  const [prdLoading, setPrdLoading] = useState(false)

  // Latest summary state.
  const [latestSummary, setLatestSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [generatingSummary, setGeneratingSummary] = useState(false)
  const [summaryError, setSummaryError] = useState(null)
  const [summaryOpen, setSummaryOpen] = useState(true)

  // Local toast (replaces the gdrive toast pattern; per-modal).
  const [toast, setToast] = useState(null)
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // CSV export — reuses the existing useCsvExport hook from FileHistory.
  const refreshUpload = useCallback(async () => {
    if (!uploadId) return
    setRefreshing(true)
    try {
      const res = await fileAPI.getUpload(uploadId)
      setUpload(res?.data || null)
    } catch (err) {
      console.error('Failed to refresh project:', err)
    } finally {
      setRefreshing(false)
    }
  }, [uploadId])

  const { handleExport, handleCancel, exportingType } = useCsvExport(uploadId, upload, refreshUpload)

  // Fetch PRD on mount (best-effort, 404 means no PRD yet).
  useEffect(() => {
    if (!uploadId) return
    let cancelled = false
    setPrdLoading(true)
    fileAPI
      .getPrd(uploadId)
      .then((res) => {
        if (!cancelled) setPrd(res?.data || null)
      })
      .catch(() => {
        if (!cancelled) setPrd(null)
      })
      .finally(() => {
        if (!cancelled) setPrdLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uploadId])

  // Fetch the latest cached summary on mount.
  useEffect(() => {
    if (!uploadId) return
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError(null)
    summaryAPI
      .getLatestSummary(uploadId)
      .then((res) => {
        if (!cancelled) setLatestSummary(res || null)
      })
      .catch((err) => {
        if (!cancelled) {
          setSummaryError(err?.message || 'Could not load the latest summary.')
          setLatestSummary(null)
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uploadId])

  // "Generate weekly summary" — kicks off the mock pipeline, polls
  // the list, and surfaces the result as a toast + populates the
  // collapsible summary section.
  const handleGenerateSummary = useCallback(async () => {
    if (generatingSummary) return
    setGeneratingSummary(true)
    setSummaryError(null)
    try {
      const res = await summaryAPI.generateSummary(uploadId, 'weekly')
      showToast('Summary generation started. This usually takes a few seconds.', 'info')
      // Poll for completion — the mock flips to 'completed' after 1.2s,
      // but real LLM calls take 10-30s, so we poll for up to ~30s.
      const deadline = Date.now() + 30_000
      let latest = null
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500))
        try {
          const list = await summaryAPI.listSummaries(uploadId)
          const found = list.find((s) => s.id === res.summary_id)
          if (found && found.status === 'completed') {
            latest = found
            break
          }
        } catch {
          /* ignore */
        }
      }
      if (latest) {
        setLatestSummary(latest)
        setSummaryOpen(true)
        showToast('Weekly summary ready.', 'success')
      } else {
        showToast('Summary is taking longer than expected. Check back shortly.', 'info')
      }
    } catch (err) {
      console.error('Failed to generate summary:', err)
      const detail = err?.response?.data?.error || err.message
      showToast(`Could not generate summary: ${detail}`, 'error')
    } finally {
      setGeneratingSummary(false)
    }
  }, [uploadId, generatingSummary, showToast])

  if (!upload) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={20} className={styles.spin} />
        <span>Loading project details…</span>
      </div>
    )
  }

  const projectName = pickProjectName(upload)
  const driveLink = upload.drive_folder_url
  const docLink = pickDocLink(upload)
  const sheetLink = pickSheetLink(upload)
  const isCompleted = upload.status === 'completed'
  const isFailed = upload.status === 'failed'

  return (
    <div className={styles.container}>
      {/* Per-modal toast */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`} role="status">
          {toast.type === 'success' && <CheckCircle2 size={14} />}
          {toast.type === 'error' && <AlertCircle size={14} />}
          {toast.type === 'info' && <Sparkles size={14} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header block: name + status */}
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>{projectName}</h3>
          <p className={styles.subtitle}>
            {upload.file_name}
            {upload.file_size && (
              <span className={styles.fileSize}>
                {' '}
                · {(upload.file_size / 1024).toFixed(0)} KB
              </span>
            )}
          </p>
        </div>
        <span className={`${styles.statusPill} ${styles[`status_${upload.status}`] || ''}`}>
          {upload.status}
        </span>
      </header>

      {/* Metadata grid */}
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Project info</h4>
        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>
              <CalendarDays size={12} /> Uploaded
            </span>
            <span className={styles.metaValue}>{formatDate(upload.uploaded_at)}</span>
          </div>
          {upload.processing_started_at && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>
                <Loader2 size={12} /> Processing started
              </span>
              <span className={styles.metaValue}>{formatDate(upload.processing_started_at)}</span>
            </div>
          )}
          {upload.completed_at && (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>
                <CheckCircle2 size={12} /> Completed
              </span>
              <span className={styles.metaValue}>{formatDate(upload.completed_at)}</span>
            </div>
          )}
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>
              <FileText size={12} /> File type
            </span>
            <span className={styles.metaValue}>{(upload.file_type || 'document').toUpperCase()}</span>
          </div>
        </div>
      </section>

      {/* External links (Drive, PRD, Sheet) */}
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Open in</h4>
        <div className={styles.linksRow}>
          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
            >
              <FolderOpen size={14} />
              Google Drive
              <ExternalLink size={11} />
            </a>
          )}
          {docLink && (
            <a
              href={docLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
            >
              <FileText size={14} />
              PRD
              <ExternalLink size={11} />
            </a>
          )}
          {sheetLink && (
            <a
              href={sheetLink}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
            >
              <ClipboardList size={14} />
              Sprint Sheet
              <ExternalLink size={11} />
            </a>
          )}
          {!driveLink && !docLink && !sheetLink && (
            <p className={styles.muted}>
              {isCompleted
                ? 'No external links available for this project.'
                : isFailed
                ? 'Project processing failed — retry from the upload section.'
                : 'External links will appear here once processing completes.'}
            </p>
          )}
        </div>
      </section>

      {/* Export buttons (Jira / Trello). Disabled if not completed. */}
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Export</h4>
        {isCompleted ? (
          <ExportButtons
            upload={upload}
            onExport={handleExport}
            onCancel={handleCancel}
            exportingType={exportingType}
          />
        ) : (
          <p className={styles.muted}>
            Exports will be available once processing finishes.
          </p>
        )}
      </section>

      {/* PRD preview (first few sections if available). */}
      {prd && prd.content && prd.content.sections && prd.content.sections.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>PRD preview</h4>
          <div className={styles.prdPreview}>
            {prd.content.sections.slice(0, 3).map((s, i) => (
              <div key={i} className={styles.prdSection}>
                <h5 className={styles.prdHeading}>{s.heading}</h5>
                <p className={styles.prdText}>
                  {s.text && s.text.length > 200 ? `${s.text.slice(0, 200)}…` : s.text}
                </p>
              </div>
            ))}
            {docLink && (
              <a
                href={docLink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.prdOpenLink}
              >
                Read the full PRD <ExternalLink size={11} />
              </a>
            )}
          </div>
        </section>
      )}

      {/* Summary section: collapsible, with Generate action. */}
      <section className={styles.section}>
        <div className={styles.summaryHeader}>
          <button
            type="button"
            className={styles.summaryToggle}
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
          >
            {summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>Latest summary</span>
            {latestSummary && (
              <span className={styles.summaryBadge}>
                {new Date(latestSummary.generated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </button>
          <button
            type="button"
            className={styles.generateBtn}
            onClick={handleGenerateSummary}
            disabled={generatingSummary}
          >
            {generatingSummary ? (
              <>
                <Loader2 size={13} className={styles.spin} /> Generating…
              </>
            ) : (
              <>
                <Sparkles size={13} /> Generate weekly summary
              </>
            )}
          </button>
        </div>

        {summaryOpen && (
          <div className={styles.summaryBody}>
            {summaryLoading && (
              <p className={styles.muted}>Loading the latest summary…</p>
            )}
            {!summaryLoading && summaryError && (
              <p className={styles.muted}>Could not load summary: {summaryError}</p>
            )}
            {!summaryLoading && !summaryError && latestSummary && (
              <div className={styles.summaryText}>
                {latestSummary.text.split('\n').map((line, i) => (
                  <p key={i}>{line || ' '}</p>
                ))}
                <p className={styles.summaryMeta}>
                  <Download size={11} /> Generated{' '}
                  {new Date(latestSummary.generated_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            )}
            {!summaryLoading && !summaryError && !latestSummary && (
              <p className={styles.muted}>
                No summary yet — click <strong>Generate weekly summary</strong> to create one.
              </p>
            )}
          </div>
        )}
      </section>

      {refreshing && (
        <p className={styles.refreshingNote}>
          <Loader2 size={11} className={styles.spin} /> Refreshing project…
        </p>
      )}
    </div>
  )
}

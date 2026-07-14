import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fileAPI } from '../api/auth'
import useCsvExport from '../hooks/useCsvExport'
import ExportButtons from '../components/ExportButtons'
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  HelpCircle,
  FileText,
  ExternalLink,
  Copy,
  AlertCircle,
  FolderOpen,
  Sheet,
  ListChecks,
  Users,
  CalendarRange,
  Sparkles,
  FileBarChart,
} from 'lucide-react'
import styles from './ProjectDetailPage.module.css'

// ============================================================
// Constants
// ============================================================
const STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: '#f59e0b', Icon: Clock },
  processing: { label: 'Processing', color: '#3b82f6', Icon: Loader2 },
  completed:  { label: 'Completed',  color: '#10b981', Icon: CheckCircle2 },
  failed:     { label: 'Failed',     color: '#ef4444', Icon: XCircle },
}

const TABS = [
  { id: 'sow',         label: 'SOW',         Icon: FileText },
  { id: 'sprintPlan',  label: 'Sprint Plan', Icon: ListChecks },
  { id: 'prd',         label: 'PRD',         Icon: FileBarChart },
  { id: 'summary',     label: 'Summary',     Icon: Sparkles },
]

// ============================================================
// Main page
// ============================================================
export default function ProjectDetailPage() {
  const { id } = useParams()
  const uploadId = Number(id)

  const [upload, setUpload] = useState(null)
  const [headerLoading, setHeaderLoading] = useState(true)
  const [headerError, setHeaderError] = useState(null)
  const [activeTab, setActiveTab] = useState('sow')
  const [copied, setCopied] = useState(false)

  // Re-fetch the upload row. Used by the export hook to refresh
  // csv_*_status after starting/cancelling an export.
  const refreshUpload = useCallback(async () => {
    try {
      const res = await fileAPI.getUpload(uploadId)
      setUpload(res.data)
      return res.data
    } catch (err) {
      console.warn('refreshUpload failed:', err)
      throw err
    }
  }, [uploadId])

  // ---- Header fetch + status polling ----
  //
  // Initial fetch on mount / id change. If the upload is still in
  // 'pending' or 'processing', poll every 2s for up to 40s so the page
  // reacts the moment n8n marks it completed. This mirrors the polling
  // in ProjectsPage and FileUpload.jsx.
  useEffect(() => {
    let cancelled = false
    let pollTimer = null
    let pollAttempts = 0
    const MAX_POLL_ATTEMPTS = 20
    const POLL_INTERVAL_MS = 2000

    const load = async () => {
      try {
        const res = await fileAPI.getUpload(uploadId)
        if (cancelled) return
        setUpload(res.data)
        setHeaderError(null)
        setHeaderLoading(false)

        // If still in flight, poll.
        if (res.data && (res.data.status === 'pending' || res.data.status === 'processing')) {
          const tick = async () => {
            if (cancelled) return
            pollAttempts += 1
            if (pollAttempts > MAX_POLL_ATTEMPTS) return
            try {
              const r = await fileAPI.getUpload(uploadId)
              if (cancelled) return
              setUpload(r.data)
              if (r.data.status === 'pending' || r.data.status === 'processing') {
                pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
              }
            } catch (err) {
              console.warn('Header poll failed:', err)
              pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
            }
          }
          pollTimer = setTimeout(tick, POLL_INTERVAL_MS)
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to fetch upload:', err)
        const status = err?.response?.status
        setHeaderError(
          status === 404
            ? 'This project could not be found.'
            : 'Could not load this project. Please try again.'
        )
        setHeaderLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [uploadId])

  // ---- Tab content ----
  const renderTab = () => {
    if (!upload) return null
    const isCompleted = upload.status === 'completed'
    const isFailed = upload.status === 'failed'

    switch (activeTab) {
      case 'sow':
        return <SowTab uploadId={uploadId} isCompleted={isCompleted} isFailed={isFailed} />
      case 'sprintPlan':
        return (
          <SprintPlanTab
            uploadId={uploadId}
            upload={upload}
            isCompleted={isCompleted}
            isFailed={isFailed}
            onUploadUpdated={refreshUpload}
          />
        )
      case 'prd':
        return <PrdTab upload={upload} isCompleted={isCompleted} isFailed={isFailed} onCopy={() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        }} copied={copied} />
      case 'summary':
        return <SummaryTab upload={upload} />
      default:
        return null
    }
  }

  // ---- Header chrome ----
  if (headerLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingCard}>
          <Loader2 size={20} className={styles.spin} />
          <span>Loading project…</span>
        </div>
      </div>
    )
  }

  if (headerError) {
    return (
      <div className={styles.page}>
        <Link to="/projects" className={styles.backLink}>
          <ArrowLeft size={14} /> Back to projects
        </Link>
        <div className={styles.errorCard}>
          <AlertCircle size={32} />
          <h2>{headerError}</h2>
          <Link to="/projects" className={`${styles.primaryBtn} gradient-button`}>
            Back to projects
          </Link>
        </div>
      </div>
    )
  }

  const config = STATUS_CONFIG[upload.status] || { label: 'Unknown', color: '#6b7280', Icon: HelpCircle }
  const StatusIcon = config.Icon

  // Resolve primary Drive link: prefer the folder (everything n8n made
  // for this upload lives there), then the PRD doc as a fallback.
  const primaryDriveLink = upload.drive_folder_url || upload.prd_document

  return (
    <div className={styles.page}>
      <Link to="/projects" className={styles.backLink}>
        <ArrowLeft size={14} /> Back to projects
      </Link>

      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.title} title={upload.file_name}>{upload.file_name}</h1>
            <div className={styles.statusBadge} style={{ backgroundColor: config.color }}>
              <StatusIcon size={12} className={upload.status === 'processing' ? styles.spin : ''} />
              {config.label}
            </div>
          </div>
          <div className={styles.headerMeta}>
            <span>Uploaded {formatDateTime(upload.uploaded_at)}</span>
            {upload.completed_at && <span>• Completed {formatDateTime(upload.completed_at)}</span>}
            {upload.file_size ? <span>• {formatFileSize(upload.file_size)}</span> : null}
          </div>
          {upload.status === 'failed' && upload.error_message && (
            <div className={styles.errorBanner}>
              <AlertCircle size={14} />
              <span>{upload.error_message}</span>
            </div>
          )}
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refreshUpload}
            title="Refresh"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          {primaryDriveLink && (
            <a
              href={primaryDriveLink}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.primaryBtn} gradient-button`}
            >
              <FolderOpen size={14} />
              <span>Open in Drive</span>
            </a>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.Icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.tabContent} role="tabpanel">
        {renderTab()}
      </div>
    </div>
  )
}

// ============================================================
// SOW tab
// ============================================================
function SowTab({ uploadId, isCompleted, isFailed }) {
  const [text, setText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fileAPI
      .get(`/uploads/${uploadId}/get_text/`)
      .then((res) => {
        if (cancelled) return
        setText(res.data?.sow_text ?? '')
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to fetch SOW text:', err)
        setError('Could not load the SOW text.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [uploadId])

  if (loading) {
    return (
      <TabStateCard>
        <Loader2 size={20} className={styles.spin} />
        <span>Loading SOW text…</span>
      </TabStateCard>
    )
  }
  if (error) {
    return <TabStateCard variant="error"><AlertCircle size={20} /><span>{error}</span></TabStateCard>
  }
  if (!text || text.trim().length === 0) {
    return (
      <TabStateCard>
        <FileText size={28} />
        <h3>No SOW text available</h3>
        <p>
          {isFailed
            ? 'This project failed before text could be extracted.'
            : isCompleted
            ? 'Text extraction produced an empty result for this file.'
            : 'The SOW is still being processed — text will appear once extraction completes.'}
        </p>
      </TabStateCard>
    )
  }

  return (
    <div className={styles.sowBody}>
      <div className={styles.sowHeader}>
        <FileText size={16} />
        <span>Extracted SOW text</span>
        <span className={styles.sowCount}>{text.length.toLocaleString()} characters</span>
      </div>
      <pre className={styles.sowText}>{text}</pre>
    </div>
  )
}

// ============================================================
// Sprint Plan tab
// ============================================================
function SprintPlanTab({ uploadId, upload, isCompleted, isFailed, onUploadUpdated }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPlan = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fileAPI.get(`/uploads/${uploadId}/sprint_plan/`)
      setData(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch sprint plan:', err)
      setError('Could not load the sprint plan.')
    } finally {
      setLoading(false)
    }
  }, [uploadId])

  useEffect(() => { fetchPlan() }, [fetchPlan])

  // Reuse the export logic moved from FileHistory.jsx.
  const { handleExport, handleCancel } = useCsvExport(uploadId, upload, onUploadUpdated)

  if (!isCompleted && !isFailed) {
    return (
      <TabStateCard>
        <Loader2 size={20} className={styles.spin} />
        <h3>Sprint plan not ready yet</h3>
        <p>PM OS is still generating this project's plan. It will appear here as soon as processing completes.</p>
      </TabStateCard>
    )
  }

  if (isFailed) {
    return (
      <TabStateCard variant="error">
        <AlertCircle size={20} />
        <h3>Processing failed</h3>
        <p>The sprint plan wasn't generated because this project failed during processing.</p>
      </TabStateCard>
    )
  }

  if (loading) {
    return (
      <TabStateCard>
        <Loader2 size={20} className={styles.spin} />
        <span>Loading sprint plan…</span>
      </TabStateCard>
    )
  }
  if (error) {
    return (
      <TabStateCard variant="error">
        <AlertCircle size={20} />
        <span>{error}</span>
        <button type="button" className={styles.retryBtn} onClick={fetchPlan}>Try again</button>
      </TabStateCard>
    )
  }

  const counts = data?.counts || { user_stories: 0, resources: 0, sprint_plan_rows: 0 }
  const userStories = data?.user_stories || []
  const resources = data?.resources || []
  const sprintRows = data?.sprint_plan_rows || []
  const projectName = data?.project_name || ''

  const allEmpty = counts.user_stories === 0 && counts.resources === 0 && counts.sprint_plan_rows === 0

  return (
    <div className={styles.sprintBody}>
      {/* Summary + export row */}
      <div className={styles.sprintHeader}>
        <div className={styles.sprintCounts}>
          <div className={styles.countPill}>
            <ListChecks size={14} />
            <span><strong>{counts.user_stories}</strong> user stories</span>
          </div>
          <div className={styles.countPill}>
            <Users size={14} />
            <span><strong>{counts.resources}</strong> resources</span>
          </div>
          <div className={styles.countPill}>
            <CalendarRange size={14} />
            <span><strong>{counts.sprint_plan_rows}</strong> sprint tasks</span>
          </div>
          {projectName && (
            <div className={styles.projectNamePill} title={projectName}>
              {projectName}
            </div>
          )}
        </div>

        <ExportButtons
          upload={upload}
          onExport={handleExport}
          onCancel={handleCancel}
          className={styles.exportRow}
        />
      </div>

      {/* Error hints for failed exports */}
      {upload.csv_jira_error && upload.csv_jira_status === 'failed' && (
        <p className={styles.exportError}>Jira export failed: {upload.csv_jira_error}</p>
      )}
      {upload.csv_trello_error && upload.csv_trello_status === 'failed' && (
        <p className={styles.exportError}>Trello export failed: {upload.csv_trello_error}</p>
      )}

      {allEmpty ? (
        <TabStateCard>
          <Sheet size={28} />
          <h3>No sprint plan rows imported</h3>
          <p>The Google Sheet was generated but no rows were imported. Try the "Resync sheet" action from the project list.</p>
        </TabStateCard>
      ) : (
        <div className={styles.tables}>
          {sprintRows.length > 0 && (
            <DataTable
              title="Sprint Plan"
              icon={CalendarRange}
              columns={[
                { key: 'us_id',         label: 'US ID' },
                { key: 'sprint',        label: 'Sprint' },
                { key: 'task',          label: 'Task' },
                { key: 'resource_name', label: 'Resource' },
                { key: 'priority',      label: 'Priority' },
                { key: 'status',        label: 'Status' },
                { key: 'est_hours',     label: 'Hrs' },
              ]}
              rows={sprintRows}
              renderCell={(col, row) => {
                if (col.key === 'priority' && row.priority) {
                  return <PriorityBadge value={row.priority} />
                }
                if (col.key === 'est_hours' && row.est_hours != null) {
                  return <span className={styles.muted}>{row.est_hours}h</span>
                }
                return <span className={col.key === 'task' ? styles.taskCell : ''}>{row[col.key] || '—'}</span>
              }}
            />
          )}

          {userStories.length > 0 && (
            <DataTable
              title="User Stories"
              icon={ListChecks}
              columns={[
                { key: 'user_story', label: 'Story' },
              ]}
              rows={userStories}
              renderCell={(_, row) => <span>{row.user_story}</span>}
            />
          )}

          {resources.length > 0 && (
            <DataTable
              title="Resources"
              icon={Users}
              columns={[
                { key: 'resource_name',   label: 'Name' },
                { key: 'resource_type',   label: 'Type' },
                { key: 'sprint_duration', label: 'Sprint' },
                { key: 'available_hours', label: 'Hours' },
              ]}
              rows={resources}
              renderCell={(col, row) => {
                if (col.key === 'available_hours' && row.available_hours != null) {
                  return <span className={styles.muted}>{row.available_hours}h</span>
                }
                return <span>{row[col.key] || '—'}</span>
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PRD tab — link-out, not inline (PRDs live in Drive as docs).
// ============================================================
function PrdTab({ upload, isCompleted, isFailed, onCopy, copied }) {
  // Resolve PRD URL with the same priority the backend uses:
  //   1. upload.prd_document (top-level URL field)
  //   2. processing_result[0].doc_link
  // processing_result is an object or array — normalize.
  const prdUrl = (() => {
    if (upload.prd_document) return upload.prd_document
    const result = upload.processing_result
    if (!result) return null
    if (Array.isArray(result) && result.length > 0) return result[0]?.doc_link || null
    if (typeof result === 'object') return result.doc_link || null
    return null
  })()

  if (!isCompleted) {
    return (
      <TabStateCard>
        <FileBarChart size={28} />
        <h3>PRD not ready yet</h3>
        <p>{isFailed ? 'This project failed before the PRD could be generated.' : 'The PRD will be available here once processing completes.'}</p>
      </TabStateCard>
    )
  }

  if (!prdUrl) {
    return (
      <TabStateCard>
        <FileBarChart size={28} />
        <h3>No PRD link available</h3>
        <p>Processing completed but no PRD document URL was returned by the workflow.</p>
      </TabStateCard>
    )
  }

  return (
    <div className={styles.prdBody}>
      <div className={styles.prdCard}>
        <div className={styles.prdIcon}>
          <FileText size={28} />
        </div>
        <div className={styles.prdText}>
          <h3>Product Requirements Document</h3>
          <p>
            The PRD was generated as a Google Doc and saved to your Drive.
            Open it in a new tab to read the full document.
          </p>
          <code className={styles.prdUrl}>{prdUrl}</code>
        </div>
      </div>

      <div className={styles.prdActions}>
        <a
          href={prdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.primaryBtn} gradient-button`}
        >
          <ExternalLink size={15} /> Open PRD
        </a>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => {
            navigator.clipboard?.writeText(prdUrl)
            onCopy()
          }}
        >
          {copied ? <><CheckCircle2 size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Summary tab — pulls from processing_result and project_plan.
// ============================================================
function SummaryTab({ upload }) {
  const processingResult = upload.processing_result
  const projectPlan = upload.project_plan

  const hasProcessing = !!processingResult && (
    (Array.isArray(processingResult) && processingResult.length > 0) ||
    (typeof processingResult === 'object' && Object.keys(processingResult).length > 0)
  )
  const hasProjectPlan = !!projectPlan && (
    (Array.isArray(projectPlan) && projectPlan.length > 0) ||
    (typeof projectPlan === 'object' && Object.keys(projectPlan).length > 0)
  )

  if (!hasProcessing && !hasProjectPlan) {
    return (
      <TabStateCard>
        <Sparkles size={28} />
        <h3>No summary available</h3>
        <p>Processing hasn't produced a summary yet. Check back once the project is completed.</p>
      </TabStateCard>
    )
  }

  return (
    <div className={styles.summaryBody}>
      {hasProcessing && (
        <section className={styles.summarySection}>
          <div className={styles.summarySectionHeader}>
            <Sparkles size={16} />
            <h3>Processing result</h3>
          </div>
          {Array.isArray(processingResult) ? (
            processingResult.map((item, idx) => (
              <SummaryKV key={idx} data={item} />
            ))
          ) : (
            <SummaryKV data={processingResult} />
          )}
        </section>
      )}

      {hasProjectPlan && (
        <section className={styles.summarySection}>
          <div className={styles.summarySectionHeader}>
            <ListChecks size={16} />
            <h3>Project plan</h3>
          </div>
          {Array.isArray(projectPlan) ? (
            projectPlan.map((item, idx) => (
              <SummaryKV key={idx} data={item} />
            ))
          ) : (
            <SummaryKV data={projectPlan} />
          )}
        </section>
      )}
    </div>
  )
}

function SummaryKV({ data }) {
  if (!data || typeof data !== 'object') {
    return <p className={styles.muted}>{String(data)}</p>
  }
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className={styles.muted}>Empty</p>
  }
  return (
    <dl className={styles.kvList}>
      {entries.map(([key, value]) => (
        <div key={key} className={styles.kvRow}>
          <dt className={styles.kvKey}>{prettifyKey(key)}</dt>
          <dd className={styles.kvValue}>{formatKV(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function prettifyKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatKV(value) {
  if (value == null) return <span className={styles.muted}>—</span>
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className={styles.muted}>—</span>
    return (
      <ul className={styles.kvListInner}>
        {value.map((v, i) => <li key={i}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>)}
      </ul>
    )
  }
  if (typeof value === 'object') return JSON.stringify(value)
  const s = String(value)
  // Auto-link URLs.
  if (/^https?:\/\//i.test(s)) {
    return <a href={s} target="_blank" rel="noopener noreferrer" className={styles.kvLink}>{s}</a>
  }
  return s
}

// ============================================================
// DataTable — generic table for sprint plan rows / stories / resources.
// ============================================================
function DataTable({ title, icon: Icon, columns, rows, renderCell }) {
  return (
    <section className={styles.tableSection}>
      <div className={styles.tableSectionHeader}>
        <Icon size={15} />
        <h3>{title}</h3>
        <span className={styles.tableCount}>{rows.length}</span>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map((c) => <td key={c.key}>{renderCell(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ============================================================
// TabStateCard — loading / empty / error card shared by all tabs.
// ============================================================
function TabStateCard({ children, variant }) {
  return (
    <div className={`${styles.tabState} ${variant === 'error' ? styles.tabStateError : ''}`}>
      {children}
    </div>
  )
}

// ============================================================
// Formatters
// ============================================================
function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

function PriorityBadge({ value }) {
  const v = String(value).toLowerCase()
  const tier = v.includes('high') || v === 'p0' || v === 'p1' || v === 'critical'
    ? 'high'
    : v.includes('medium') || v === 'p2'
    ? 'med'
    : v.includes('low') || v === 'p3' || v === 'p4'
    ? 'low'
    : 'default'
  return <span className={`${styles.priorityBadge} ${styles[`priority_${tier}`]}`}>{value}</span>
}

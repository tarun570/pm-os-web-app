import React, { useState, useEffect, useRef } from 'react'
import { fileAPI } from '../api/auth'
import {
  FileText,
  FileType,
  FileCode,
  RefreshCw,
  FolderOpen,
  Clock,
  CheckCircle2,
  Loader2,
  XCircle,
  HelpCircle,
  Inbox,
  Download,
  AlertCircle,
} from 'lucide-react'
import styles from './FileHistory.module.css'

export default function FileHistory({ uploads, onRefresh }) {
  const [isLoading, setIsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchUploads()
  }, [])

  const fetchUploads = async () => {
    setIsLoading(true)
    try {
      await onRefresh()
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending', color: '#f59e0b', Icon: Clock },
      processing: { label: 'Processing', color: '#3b82f6', Icon: Loader2 },
      completed: { label: 'Completed', color: '#10b981', Icon: CheckCircle2 },
      failed: { label: 'Failed', color: '#ef4444', Icon: XCircle },
    }
    return statusConfig[status] || { label: 'Unknown', color: '#6b7280', Icon: HelpCircle }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const handleDownload = (url, fileName) => {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Save a Blob response from the download endpoint as a file. We use
  // an object URL + <a download> trick instead of window.location so
  // we can set the filename and the Content-Type is preserved.
  const saveBlob = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob)
    handleDownload(url, fileName)
    // Revoke the URL after a tick so the browser has time to start the
    // download. Otherwise the URL leaks until the page is unloaded.
    setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  }

  // handleExport is the workhorse for both buttons. Flow:
  //   1. If the export is already 'ready', just download the cached file.
  //   2. Otherwise POST to /export_jira/ or /export_trello/. n8n does the
  //      work and POSTs the CSV back to /csv_callback/, which sets the
  //      status to 'ready' on the row.
  //   3. Poll getUpload every 2s for up to 40s waiting for the status
  //      to flip to 'ready'. On success, fetch the file as a blob and
  //      trigger a download. On timeout, leave the UI in a "still
  //      processing" state with a hint to refresh.
  // Polling is per-button (a ref) so a Jira export in flight doesn't
  // also poll for Trello. Stale polls are guarded with an `active` flag.
  const exportPollRefs = useRef({})

  const handleExport = async (uploadId, csvType) => {
    const statusKey = `csv_${csvType}_status`
    const upload = uploads.find((u) => u.id === uploadId)
    const currentStatus = upload?.[statusKey]

    // Step 1: cache hit — download the previously-generated file.
    if (currentStatus === 'ready') {
      try {
        const res = await fileAPI.downloadCsv(uploadId, csvType)
        const fileName = `${upload?.file_name || 'export'}_${csvType}.csv`
        saveBlob(res.data, fileName)
      } catch (err) {
        console.error(`Failed to download ${csvType} CSV:`, err)
        alert(`Failed to download ${csvType} CSV. Please try again.`)
      }
      return
    }

    // Step 2: kick off the export. POST returns 202 with the new row.
    try {
      await (csvType === 'jira'
        ? fileAPI.exportJira(uploadId)
        : fileAPI.exportTrello(uploadId))
    } catch (err) {
      console.error(`Failed to start ${csvType} export:`, err)
      const detail = err?.response?.data?.error || err.message
      alert(`Failed to start ${csvType} export: ${detail}`)
      // Refresh the row so the user sees the new (failed) status.
      try { await onRefresh() } catch { /* ignore */ }
      return
    }

    // Reflect the processing state in the parent list immediately so
    // the button shows a spinner without waiting for the next poll.
    try { await onRefresh() } catch { /* ignore */ }

    // Step 3: poll for completion. 20 attempts × 2s = 40s timeout,
    // matching the existing upload-flow polling in FileUpload.jsx.
    const MAX_ATTEMPTS = 20
    const POLL_INTERVAL_MS = 2000
    const pollKey = `${uploadId}:${csvType}`

    // If a previous poll is running for this exact button, cancel it.
    if (exportPollRefs.current[pollKey]) {
      exportPollRefs.current[pollKey].active = false
    }

    const state = { active: true, timer: null }
    exportPollRefs.current[pollKey] = state

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (!state.active) return
      await new Promise((resolve) => {
        state.timer = setTimeout(resolve, POLL_INTERVAL_MS)
      })
      if (!state.active) return

      let fresh
      try {
        const res = await fileAPI.getUpload(uploadId)
        fresh = res.data
      } catch (err) {
        console.warn(`Polling upload ${uploadId} failed:`, err)
        continue
      }

      const freshStatus = fresh[statusKey]

      if (freshStatus === 'ready') {
        // Step 4: download. If the blob fetch fails, the user can still
        // click "Download CSV" again on the next page load.
        try {
          const blobRes = await fileAPI.downloadCsv(uploadId, csvType)
          const fileName = `${fresh.file_name || 'export'}_${csvType}.csv`
          saveBlob(blobRes.data, fileName)
        } catch (err) {
          console.error(`Download failed after export ready:`, err)
        }
        try { await onRefresh() } catch { /* ignore */ }
        state.active = false
        return
      }

      if (freshStatus === 'failed') {
        try { await onRefresh() } catch { /* ignore */ }
        state.active = false
        return
      }
    }

    // 40s elapsed and still not ready. Leave the UI in the existing
    // "processing" state and refresh anyway so the user sees the
    // current server-side status.
    state.active = false
    try { await onRefresh() } catch { /* ignore */ }
  }

  // Cleanup any in-flight polls when the component unmounts.
  useEffect(() => {
    return () => {
      Object.values(exportPollRefs.current).forEach((s) => { s.active = false })
    }
  }, [])

  // handleCancel stops the frontend poll and asks the backend to flip
  // the row's csv_<type>_status to 'cancelled'. The backend doesn't
  // notify n8n — the late result, if it arrives, is dropped at the
  // csv_callback guard in views.py. After this returns, the row's
  // status is 'cancelled' which the UI treats as "not yet exported"
  // (the same path as a fresh click), so the user can retry.
  const handleCancel = async (uploadId, csvType) => {
    const pollKey = `${uploadId}:${csvType}`

    // 1. Stop the local poll loop for this exact button. Same pattern
    // as handleExport uses to invalidate a stale poll (line ~138).
    if (exportPollRefs.current[pollKey]) {
      exportPollRefs.current[pollKey].active = false
      exportPollRefs.current[pollKey] = null
    }

    // 2. Tell the backend. Errors get an alert matching the existing
    // pattern in handleExport (line ~120).
    try {
      await fileAPI.cancelExport(uploadId, csvType)
    } catch (err) {
      console.error(`Failed to cancel ${csvType} export:`, err)
      const detail = err?.response?.data?.error || err.message
      alert(`Failed to cancel ${csvType} export: ${detail}`)
      return
    }

    // 3. Pull the fresh row so the UI shows the cancelled state. The
    // backend's response already includes the serialized upload, but
    // going through onRefresh keeps the rest of the dashboard in sync
    // (counts, badges, etc.) and matches what handleExport does after
    // kicking off an export.
    try { await onRefresh() } catch { /* ignore */ }
  }

  if (!uploads || uploads.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>
          <Inbox size={48} strokeWidth={1.5} />
        </div>
        <h3>No files uploaded yet</h3>
        <p>Upload your first SOW to get started</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Your Project Files</h2>
        <button
          className={styles.refreshBtn}
          onClick={fetchUploads}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? styles.spin : ''} />
          <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </div>

      <div className={styles.filesList}>
        {uploads.map((upload) => {
          const status = getStatusBadge(upload.status)
          const isExpanded = expandedId === upload.id
          const StatusIcon = status.Icon

          const FileIcon =
            upload.file_type === 'pdf'
              ? FileText
              : upload.file_type === 'docx'
              ? FileType
              : FileCode

          return (
            <div key={upload.id} className={`${styles.fileCard} ${styles[upload.status]}`}>
              <div
                className={styles.fileHeader}
                onClick={() => setExpandedId(isExpanded ? null : upload.id)}
              >
                <div className={styles.fileBasic}>
                  <div className={styles.fileIcon}>
                    <FileIcon size={20} />
                  </div>

                  <div className={styles.fileMainInfo}>
                    <h3 className={styles.fileName}>{upload.file_name}</h3>
                    <p className={styles.fileDetails}>
                      {formatFileSize(upload.file_size)} • Uploaded {formatDate(upload.uploaded_at)}
                    </p>
                  </div>
                </div>

                <div className={styles.statusBadge} style={{ backgroundColor: status.color }}>
                  <StatusIcon size={12} className={upload.status === 'processing' ? styles.spin : ''} />
                  {status.label}
                </div>
              </div>

              {isExpanded && (
                <div className={styles.fileDetails}>
                  <div className={styles.detailRow}>
                    <span className={styles.label}>Status:</span>
                    <span>{upload.status.charAt(0).toUpperCase() + upload.status.slice(1)}</span>
                  </div>

                  {upload.processing_started_at && (
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Processing Started:</span>
                      <span>{formatDate(upload.processing_started_at)}</span>
                    </div>
                  )}

                  {upload.completed_at && (
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Completed:</span>
                      <span>{formatDate(upload.completed_at)}</span>
                    </div>
                  )}

                  {upload.error_message && (
                    <div className={styles.detailRow}>
                      <span className={styles.label}>Error:</span>
                      <span className={styles.errorText}>{upload.error_message}</span>
                    </div>
                  )}

                  {upload.status === 'completed' && (
                    <div className={styles.results}>
                      <h4>Results</h4>

                      {/* Primary action: jump to the user's Drive folder.
                          This is the single click that takes them from
                          "I uploaded a SOW" to "here are my generated files".
                          The folder is the canonical home for everything
                          n8n created for this upload. */}
                      {upload.drive_folder_url && (
                        <div className={styles.folderLink}>
                          <a
                            className={styles.folderButton}
                            href={upload.drive_folder_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FolderOpen size={16} /> Open in Google Drive
                          </a>
                          <p className={styles.folderHint}>
                            All generated files for this SOW live in this folder in your Drive.
                          </p>
                        </div>
                      )}

                      {/* CSV export row — sits below the primary Drive
                          button. Shows two secondary buttons: one per
                          platform. Each button has three visual states:
                          - 'ready': green-ish "Download CSV" with download icon
                          - 'processing': disabled with spinner
                          - 'failed': error-tinted with alert icon, hover
                            shows the n8n error message from the server */}
                      <div className={styles.exportRow}>
                        {(() => {
                          const jiraStatus = upload.csv_jira_status
                          const isJiraProcessing = jiraStatus === 'processing'
                          const isJiraReady = jiraStatus === 'ready'
                          const isJiraFailed = jiraStatus === 'failed'
                          return (
                            <>
                              <button
                                className={`${styles.exportBtn} ${isJiraFailed ? styles.exportBtnError : ''}`}
                                onClick={() => handleExport(upload.id, 'jira')}
                                disabled={isJiraProcessing}
                                title={isJiraFailed ? (upload.csv_jira_error || 'Export failed') : undefined}
                              >
                                {isJiraProcessing ? (
                                  <Loader2 size={14} className={styles.spin} />
                                ) : isJiraReady ? (
                                  <Download size={14} />
                                ) : isJiraFailed ? (
                                  <AlertCircle size={14} />
                                ) : null}
                                {isJiraReady ? 'Download Jira CSV' : isJiraProcessing ? 'Exporting…' : isJiraFailed ? 'Retry Jira export' : 'Export to Jira'}
                              </button>
                              {/* Cancel sits next to the primary button
                                  only while the export is in flight. After
                                  cancel, the row's status becomes 'cancelled'
                                  and the primary button reverts to its
                                  default "Export to Jira" state — so a
                                  second Cancel button would never be visible. */}
                              {isJiraProcessing && (
                                <button
                                  className={`${styles.exportBtn} ${styles.exportBtnCancel}`}
                                  onClick={() => handleCancel(upload.id, 'jira')}
                                  title="Stop the export"
                                >
                                  <XCircle size={14} />
                                  Cancel
                                </button>
                              )}
                            </>
                          )
                        })()}

                        {(() => {
                          const trelloStatus = upload.csv_trello_status
                          const isTrelloProcessing = trelloStatus === 'processing'
                          const isTrelloReady = trelloStatus === 'ready'
                          const isTrelloFailed = trelloStatus === 'failed'
                          return (
                            <>
                              <button
                                className={`${styles.exportBtn} ${isTrelloFailed ? styles.exportBtnError : ''}`}
                                onClick={() => handleExport(upload.id, 'trello')}
                                disabled={isTrelloProcessing}
                                title={isTrelloFailed ? (upload.csv_trello_error || 'Export failed') : undefined}
                              >
                                {isTrelloProcessing ? (
                                  <Loader2 size={14} className={styles.spin} />
                                ) : isTrelloReady ? (
                                  <Download size={14} />
                                ) : isTrelloFailed ? (
                                  <AlertCircle size={14} />
                                ) : null}
                                {isTrelloReady ? 'Download Trello CSV' : isTrelloProcessing ? 'Exporting…' : isTrelloFailed ? 'Retry Trello export' : 'Export to Trello'}
                              </button>
                              {isTrelloProcessing && (
                                <button
                                  className={`${styles.exportBtn} ${styles.exportBtnCancel}`}
                                  onClick={() => handleCancel(upload.id, 'trello')}
                                  title="Stop the export"
                                >
                                  <XCircle size={14} />
                                  Cancel
                                </button>
                              )}
                            </>
                          )
                        })()}
                      </div>

                      {/* Error hints under the row. Only shown when the
                          server told us about a failure. */}
                      {upload.csv_jira_error && upload.csv_jira_status === 'failed' && (
                        <p className={styles.exportError}>
                          Jira export failed: {upload.csv_jira_error}
                        </p>
                      )}
                      {upload.csv_trello_error && upload.csv_trello_status === 'failed' && (
                        <p className={styles.exportError}>
                          Trello export failed: {upload.csv_trello_error}
                        </p>
                      )}

                      {upload.processing_result && (
                        <div className={styles.resultSummary}>
                          <strong>Processing Details:</strong>

                          {Array.isArray(upload.processing_result) ? (
                            <div className={styles.resultList}>
                              {upload.processing_result.map((item, index) => (
                                <div key={index} className={styles.resultItem}>
                                  <div className={styles.resultItemHeader}>Result {index + 1}</div>
                                  <ul>
                                    {item.doc_link && (
                                      <li>
                                        <span className={styles.resultKey}>Document:</span>
                                        <a className={styles.resultLink} href={item.doc_link} target="_blank" rel="noopener noreferrer">Open Document</a>
                                      </li>
                                    )}

                                    {item.sheet_link && (
                                      <li>
                                        <span className={styles.resultKey}>Sheet:</span>
                                        <a className={styles.resultLink} href={item.sheet_link} target="_blank" rel="noopener noreferrer">Open Sheet</a>
                                      </li>
                                    )}

                                    {item.share_with && (
                                      <li>
                                        <span className={styles.resultKey}>Shared with:</span>
                                        <span>{item.share_with}</span>
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ul>
                              {upload.processing_result.doc_link && (
                                <li>
                                  <span className={styles.resultKey}>Document:</span>
                                  <a className={styles.resultLink} href={upload.processing_result.doc_link} target="_blank" rel="noopener noreferrer">Open Document</a>
                                </li>
                              )}

                              {upload.processing_result.sheet_link && (
                                <li>
                                  <span className={styles.resultKey}>Sheet:</span>
                                  <a className={styles.resultLink} href={upload.processing_result.sheet_link} target="_blank" rel="noopener noreferrer">Open Sheet</a>
                                </li>
                              )}

                              {upload.processing_result.share_with && (
                                <li>
                                  <span className={styles.resultKey}>Shared with:</span>
                                  <span>{upload.processing_result.share_with}</span>
                                </li>
                              )}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

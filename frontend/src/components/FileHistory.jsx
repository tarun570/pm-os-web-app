import React, { useState, useEffect } from 'react'
import { fileAPI } from '../api/auth'
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
      pending: { label: '⏳ Pending', color: '#f59e0b' },
      processing: { label: '⚙️ Processing', color: '#3b82f6' },
      completed: { label: '✅ Completed', color: '#10b981' },
      failed: { label: '❌ Failed', color: '#ef4444' },
    }
    return statusConfig[status] || { label: '❓ Unknown', color: '#6b7280' }
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

  if (!uploads || uploads.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>📁</div>
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
          {isLoading ? '⏳' : '🔄'} Refresh
        </button>
      </div>

      <div className={styles.filesList}>
        {uploads.map((upload) => {
          const status = getStatusBadge(upload.status)
          const isExpanded = expandedId === upload.id

          return (
            <div key={upload.id} className={`${styles.fileCard} ${styles[upload.status]}`}>
              <div 
                className={styles.fileHeader}
                onClick={() => setExpandedId(isExpanded ? null : upload.id)}
              >
                <div className={styles.fileBasic}>
                  <div className={styles.fileIcon}>
                    {upload.file_type === 'pdf' && '📄'}
                    {upload.file_type === 'docx' && '📝'}
                    {upload.file_type === 'txt' && '📋'}
                  </div>
                  
                  <div className={styles.fileMainInfo}>
                    <h3 className={styles.fileName}>{upload.file_name}</h3>
                    <p className={styles.fileDetails}>
                      {formatFileSize(upload.file_size)} • Uploaded {formatDate(upload.uploaded_at)}
                    </p>
                  </div>
                </div>

                <div className={styles.statusBadge} style={{ backgroundColor: status.color }}>
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

import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  LayoutDashboard,
  Users,
  ListChecks,
  ChevronLeft,
} from 'lucide-react'
import { fileAPI } from '../../api/auth'
import Chatbot from '../Chatbot'
import OverviewTab from './OverviewTab'
import MeetingsTab from './MeetingsTab'
import SprintPlanTab from './SprintPlanTab'
import styles from './ProjectDetailModal.module.css'

const TABS = [
  { id: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { id: 'meetings', label: 'Meetings', Icon: Users },
  { id: 'sprint', label: 'Sprint Plan', Icon: ListChecks },
]

/**
 * Project Detail Modal — opens when a project card is clicked on the
 * dashboard.
 *
 * Layout: 3-column inside a centered panel —
 *   - Left sidebar with the section nav (Overview / Meetings / Sprint Plan)
 *   - Center column with the active section's body
 *   - Right column with a static, project-scoped Chatbot
 *
 * Props:
 *   - uploadId: number | null — the FileUpload row to display, or null
 *     to render nothing.
 *   - isOpen: boolean — controlled open flag. When false the modal
 *     unmounts entirely.
 *   - onClose(): () => void — called when the user dismisses the modal
 *     (close button, ESC, or backdrop click).
 *
 * Internal state:
 *   - activeTab: which of the 3 sections is currently rendered in the
 *     center column.
 *   - upload: the FileUpload row (fetched on mount / when uploadId changes).
 *   - highlightUsId: cross-tab state — when the Meetings tab applies a
 *     suggested change, this is set to the affected us_id so the
 *     Sprint Plan tab can flash the row. Auto-clears after 2s.
 *   - visitedTabs: tracks which center-column sections have been
 *     mounted, so switching back doesn't refetch.
 */
export default function ProjectDetailModal({ uploadId, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [upload, setUpload] = useState(null)
  const [loadingUpload, setLoadingUpload] = useState(false)
  const [highlightUsId, setHighlightUsId] = useState(null)
  const [visitedTabs, setVisitedTabs] = useState(new Set(['overview']))

  // Reset internal state when the modal opens for a new project or closes.
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('overview')
      setHighlightUsId(null)
      setVisitedTabs(new Set(['overview']))
    }
  }, [isOpen, uploadId])

  // Lock body scroll while the modal is open. Cleanup on unmount.
  useEffect(() => {
    if (!isOpen) return undefined
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  // ESC key closes the modal.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Fetch the latest FileUpload row whenever the modal opens or the
  // uploadId changes. The card grid in Welcome may be stale; this
  // ensures the header / Overview tab show current data.
  useEffect(() => {
    if (!isOpen || !uploadId) return
    let cancelled = false
    setLoadingUpload(true)
    fileAPI
      .getUpload(uploadId)
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
  }, [isOpen, uploadId])

  // Cross-tab callback: Meetings tab calls this when the user applies
  // a suggested change. We briefly highlight the matching sprint plan
  // row and (optionally) bounce the user to the Sprint Plan tab. We
  // deliberately do NOT auto-switch tabs — see plan §Cross-Tab
  // Communication for the rationale.
  const handleChangeApplied = useCallback((usId) => {
    setHighlightUsId(usId || null)
    // Auto-clear the highlight after 2s so the next change can fire.
    setTimeout(() => setHighlightUsId(null), 2000)
  }, [])

  const handleTabClick = (id) => {
    setActiveTab(id)
    setVisitedTabs((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  if (!isOpen || !uploadId) return null

  const projectName = upload?.file_name || `Project #${uploadId}`

  // Render the overlay into document.body via a portal so it escapes
  // any ancestor stacking context (transform, filter, will-change,
  // isolation, etc.) that the dashboard's <main> wrapper might
  // accidentally create. Without this, the modal can be hidden behind
  // or clipped by an ancestor's overflow/transform even with z-index.
  const modalNode = (
    <div
      className={styles.overlay}
      onClick={(e) => {
        // Backdrop click closes — but only if the click was directly on
        // the overlay (not bubbled from the panel).
        if (e.target === e.currentTarget) onClose?.()
      }}
      role="presentation"
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
      >
        {/* Header strip: project name + status + close button */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={onClose}
              aria-label="Back to dashboard"
              title="Back to dashboard"
            >
              <ChevronLeft size={18} />
            </button>
            <div className={styles.headerTitleBlock}>
              <h2 id="project-modal-title" className={styles.headerTitle}>
                {projectName}
              </h2>
              <div className={styles.headerMeta}>
                {loadingUpload ? (
                  <span className={styles.headerStatus}>Loading…</span>
                ) : upload ? (
                  <span className={`${styles.statusPill} ${styles[`status_${upload.status}`] || ''}`}>
                    {upload.status}
                  </span>
                ) : (
                  <span className={styles.headerStatus}>Not found</span>
                )}
              </div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close project details"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Body: 3-column — sidebar | center | chat */}
        <div className={styles.body}>
          {/* Left sidebar nav */}
          <nav className={styles.sidebar} aria-label="Project sections">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`${styles.tabBtn} ${activeTab === id ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabClick(id)}
                aria-current={activeTab === id ? 'page' : undefined}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Center column — the active section's body. Visited tabs
              stay mounted so switching back doesn't refetch. */}
          <main className={styles.center}>
            {visitedTabs.has('overview') && (
              <div hidden={activeTab !== 'overview'} className={styles.tabPanel}>
                {activeTab === 'overview' && <OverviewTab uploadId={uploadId} upload={upload} />}
              </div>
            )}
            {visitedTabs.has('meetings') && (
              <div hidden={activeTab !== 'meetings'} className={styles.tabPanel}>
                {activeTab === 'meetings' && (
                  <MeetingsTab uploadId={uploadId} onChangeApplied={handleChangeApplied} />
                )}
              </div>
            )}
            {visitedTabs.has('sprint') && (
              <div hidden={activeTab !== 'sprint'} className={styles.tabPanel}>
                {activeTab === 'sprint' && (
                  <SprintPlanTab
                    uploadId={uploadId}
                    highlightUsId={highlightUsId}
                    onChangeApplied={handleChangeApplied}
                  />
                )}
              </div>
            )}
          </main>

          {/* Right column — static, project-scoped chat. Always mounted
              while the modal is open so the conversation persists across
              tab switches. */}
          <aside className={styles.chatColumn} aria-label="Project chat">
            <Chatbot projectId={uploadId} embedded />
          </aside>
        </div>
      </div>
    </div>
  )
  return createPortal(modalNode, document.body)
}

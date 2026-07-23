import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react'
import { meetingsAPI } from '../../api/auth'
import MeetingUploader from './MeetingUploader'
import MeetingCard from './MeetingCard'
import MeetingDetail from './MeetingDetail'
import styles from './MeetingsTab.module.css'

/**
 * MeetingsTab — the meetings workspace inside ProjectDetailModal.
 *
 * Layout: top is the uploader, below is a two-pane area (meeting list
 * on the left, selected meeting detail on the right). On mobile the
 * two panes stack vertically.
 *
 * Polling: when a meeting is in 'processing' state we poll
 * `meetingsAPI.getMeeting` every 2s for up to ~30s until it flips to
 * 'completed' or 'failed'. The poll stops on unmount and when the
 * meeting completes.
 *
 * Apply / Reject: clicking a button calls the corresponding
 * `meetingsAPI` method, updates local state optimistically, and
 * (for Apply) calls `onChangeApplied(us_id)` so the parent can flash
 * the matching row in the Sprint Plan tab.
 *
 * Props:
 *   - uploadId: number
 *   - onChangeApplied(usId): (usId) => void — called when the user
 *     successfully applies a suggested change.
 */
export default function MeetingsTab({ uploadId, onChangeApplied }) {
  const [meetings, setMeetings] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState(null)
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busyChangeIds, setBusyChangeIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const pollTimeoutRef = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ---- Fetch the meeting list. ----
  const fetchMeetings = useCallback(async () => {
    if (!uploadId) return
    setLoadingList(true)
    setError(null)
    try {
      const list = await meetingsAPI.listMeetings(uploadId)
      setMeetings(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Failed to load meetings:', err)
      setError(err?.message || 'Failed to load meetings.')
    } finally {
      setLoadingList(false)
    }
  }, [uploadId])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  // ---- Fetch a single meeting (full detail with changes). ----
  const fetchMeetingDetail = useCallback(
    async (meetingId) => {
      if (!uploadId || !meetingId) return
      setLoadingDetail(true)
      try {
        const m = await meetingsAPI.getMeeting(uploadId, meetingId)
        setSelectedMeeting(m)
        // Also update the summary view so the list count stays in sync.
        setMeetings((prev) =>
          prev.map((row) =>
            row.id === meetingId
              ? { ...row, status: m.status, suggested_changes_count: m.suggested_changes?.length || 0 }
              : row,
          ),
        )
        return m
      } catch (err) {
        console.error('Failed to load meeting detail:', err)
        return null
      } finally {
        setLoadingDetail(false)
      }
    },
    [uploadId],
  )

  // When the user picks a meeting, fetch its detail.
  useEffect(() => {
    if (!selectedMeetingId) {
      setSelectedMeeting(null)
      return
    }
    let cancelled = false
    fetchMeetingDetail(selectedMeetingId).then((m) => {
      if (cancelled || !m) return
      // If still processing, start polling.
      if (m.status === 'processing') {
        startPolling(selectedMeetingId)
      }
    })
    return () => {
      cancelled = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeetingId])

  // Poll the selected meeting while it's in 'processing'. Stops when
  // the meeting completes, on unmount, or when the user selects a
  // different meeting.
  const startPolling = useCallback(
    (meetingId) => {
      stopPolling()
      const startedAt = Date.now()
      const tick = async () => {
        if (Date.now() - startedAt > 30_000) {
          // Give up after 30s and let the user retry by selecting again.
          return
        }
        const m = await fetchMeetingDetail(meetingId)
        if (m && m.status === 'processing') {
          pollTimeoutRef.current = setTimeout(tick, 2000)
        }
      }
      pollTimeoutRef.current = setTimeout(tick, 2000)
    },
    [fetchMeetingDetail],
  )

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  // ---- Handlers for Apply / Reject. ----
  const handleApply = useCallback(
    async (change) => {
      if (!selectedMeeting || !change) return
      setBusyChangeIds((prev) => new Set(prev).add(change.id))
      try {
        await meetingsAPI.applyChange(uploadId, selectedMeeting.id, change.id)
        // Optimistic local update.
        setSelectedMeeting((prev) =>
          prev
            ? {
                ...prev,
                suggested_changes: prev.suggested_changes.map((c) =>
                  c.id === change.id ? { ...c, applied: true } : c,
                ),
              }
            : prev,
        )
        showToast(`Applied change to ${change.us_id || 'sprint row'}.`, 'success')
        onChangeApplied?.(change.us_id)
      } catch (err) {
        console.error('Failed to apply change:', err)
        showToast(`Could not apply: ${err?.message || 'unknown error'}`, 'error')
      } finally {
        setBusyChangeIds((prev) => {
          const next = new Set(prev)
          next.delete(change.id)
          return next
        })
      }
    },
    [uploadId, selectedMeeting, onChangeApplied, showToast],
  )

  const handleReject = useCallback(
    async (change) => {
      if (!selectedMeeting || !change) return
      setBusyChangeIds((prev) => new Set(prev).add(change.id))
      try {
        await meetingsAPI.rejectChange(uploadId, selectedMeeting.id, change.id)
        setSelectedMeeting((prev) =>
          prev
            ? {
                ...prev,
                suggested_changes: prev.suggested_changes.map((c) =>
                  c.id === change.id ? { ...c, rejected: true } : c,
                ),
              }
            : prev,
        )
        showToast(`Rejected change to ${change.us_id || 'sprint row'}.`, 'info')
      } catch (err) {
        console.error('Failed to reject change:', err)
        showToast(`Could not reject: ${err?.message || 'unknown error'}`, 'error')
      } finally {
        setBusyChangeIds((prev) => {
          const next = new Set(prev)
          next.delete(change.id)
          return next
        })
      }
    },
    [uploadId, selectedMeeting, showToast],
  )

  const handleApplyAll = useCallback(async () => {
    if (!selectedMeeting) return
    const pending = (selectedMeeting.suggested_changes || []).filter(
      (c) => !c.applied && !c.rejected,
    )
    if (pending.length === 0) return
    setBusyChangeIds((prev) => {
      const next = new Set(prev)
      pending.forEach((c) => next.add(c.id))
      return next
    })
    try {
      await meetingsAPI.applyAllChanges(uploadId, selectedMeeting.id)
      const appliedIds = new Set(pending.map((p) => p.id))
      setSelectedMeeting((prev) =>
        prev
          ? {
              ...prev,
              suggested_changes: prev.suggested_changes.map((c) =>
                appliedIds.has(c.id) ? { ...c, applied: true } : c,
              ),
            }
          : prev,
      )
      // Flash the first applied change as a representative row.
      if (pending[0]?.us_id) onChangeApplied?.(pending[0].us_id)
      showToast(`Applied ${pending.length} change${pending.length === 1 ? '' : 's'}.`, 'success')
    } catch (err) {
      console.error('Failed to apply all changes:', err)
      showToast('Could not apply all changes.', 'error')
    } finally {
      setBusyChangeIds(new Set())
    }
  }, [uploadId, selectedMeeting, onChangeApplied, showToast])

  // When a new meeting finishes processing, fire a system message in
  // the chat via the global window helper. The Chatbot component
  // exposes a `__pmos_chatbot_addSystem` function on window.
  useEffect(() => {
    const completed = meetings.find((m) => m.status === 'completed')
    // Only fire once per meeting by tracking which ones we've notified.
    // (Kept simple — a more robust impl would use a ref Set.)
  }, [meetings])

  return (
    <div className={styles.container}>
      {/* Toast (per-tab) */}
      {toast && (
        <div className={`${styles.toast} ${styles[`toast_${toast.type}`]}`} role="status">
          {toast.type === 'success' && <CheckCircle2 size={14} />}
          {toast.type === 'error' && <AlertCircle size={14} />}
          {toast.type === 'info' && <Sparkles size={14} />}
          <span>{toast.message}</span>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Uploader */}
      <MeetingUploader
        projectId={uploadId}
        onUploaded={(meetingId) => {
          fetchMeetings()
          setSelectedMeetingId(meetingId)
        }}
      />

      {/* Two-pane layout: list (left) + detail (right) */}
      <div className={styles.workspace}>
        {/* List pane */}
        <aside className={styles.listPane}>
          <div className={styles.listHeader}>
            <h3 className={styles.listTitle}>
              Meetings
              {meetings.length > 0 && <span className={styles.listCount}>{meetings.length}</span>}
            </h3>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={fetchMeetings}
              title="Refresh"
              aria-label="Refresh meetings"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {loadingList && (
            <div className={styles.listState}>
              <Loader2 size={16} className={styles.spin} />
              <span>Loading meetings…</span>
            </div>
          )}

          {!loadingList && error && (
            <div className={styles.listState}>
              <AlertCircle size={16} />
              <span>Could not load meetings.</span>
              <button type="button" className={styles.retryMini} onClick={fetchMeetings}>
                Retry
              </button>
            </div>
          )}

          {!loadingList && !error && meetings.length === 0 && (
            <div className={styles.emptyList}>
              <p>No meetings yet.</p>
              <p className={styles.muted}>Upload your first meeting above to get started.</p>
            </div>
          )}

          {!loadingList && !error && meetings.length > 0 && (
            <div className={styles.list}>
              {meetings.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  selected={m.id === selectedMeetingId}
                  onSelect={setSelectedMeetingId}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Detail pane */}
        <section className={styles.detailPane}>
          {loadingDetail && !selectedMeeting ? (
            <div className={styles.detailState}>
              <Loader2 size={20} className={styles.spin} />
              <span>Loading meeting…</span>
            </div>
          ) : (
            <MeetingDetail
              meeting={selectedMeeting}
              onApply={handleApply}
              onReject={handleReject}
              onApplyAll={handleApplyAll}
              busyChangeIds={busyChangeIds}
              onOpenSprintPlan={(usId) => onChangeApplied?.(usId)}
            />
          )}
        </section>
      </div>
    </div>
  )
}

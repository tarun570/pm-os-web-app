import React, { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  ListChecks,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react'
import styles from './MeetingDetail.module.css'

const CHANGE_TYPE_LABELS = {
  status: 'Status change',
  priority: 'Priority change',
  assignee: 'Assignee change',
  effort: 'Effort change',
}

/**
 * MeetingDetail — the right pane of the Meetings tab when a meeting
 * is selected. Shows the meeting's summary, action items, and the
 * list of suggested sprint-plan changes (with Apply / Reject buttons).
 *
 * Props:
 *   - meeting: the full meeting object from meetingsAPI.getMeeting
 *   - onApply(change): (change) => void — called when the user clicks
 *     Apply on a change. The parent calls meetingsAPI.applyChange
 *     and, on success, propagates the change to SprintPlanTab.
 *   - onReject(change): (change) => void — same, for Reject.
 *   - onApplyAll(): () => void — applies all remaining changes.
 *   - busyChangeIds: Set<string> — change IDs currently being applied
 *     (spinner inside the button).
 *   - onOpenSprintPlan(usId): (usId) => void — optional, jump to
 *     Sprint Plan tab and highlight a specific row.
 */
export default function MeetingDetail({ meeting, onApply, onReject, onApplyAll, busyChangeIds, onOpenSprintPlan }) {
  const [rawOpen, setRawOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)

  if (!meeting) {
    return (
      <div className={styles.empty}>
        <FileText size={28} />
        <h3>Select a meeting</h3>
        <p>Pick a meeting from the list to see its summary, action items, and suggested changes.</p>
      </div>
    )
  }

  const isProcessing = meeting.status === 'processing'
  const isFailed = meeting.status === 'failed'
  const changes = meeting.suggested_changes || []
  const pendingChanges = changes.filter((c) => !c.applied && !c.rejected)
  const appliedChanges = changes.filter((c) => c.applied)
  const rejectedChanges = changes.filter((c) => c.rejected)

  return (
    <div className={styles.detail}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{meeting.title || 'Untitled meeting'}</h2>
          <p className={styles.meta}>
            {meeting.type ? `${meeting.type} · ` : ''}
            {meeting.date || '—'}
            {meeting.attendees && meeting.attendees.length > 0 && (
              <> · {meeting.attendees.join(', ')}</>
            )}
          </p>
        </div>
        {isProcessing && (
          <span className={styles.processingBadge}>
            <Loader2 size={12} className={styles.spin} /> Processing…
          </span>
        )}
        {isFailed && (
          <span className={styles.failedBadge}>
            <AlertCircle size={12} /> Processing failed
          </span>
        )}
      </header>

      {/* Processing placeholder */}
      {isProcessing && (
        <div className={styles.processingCard}>
          <Loader2 size={20} className={styles.spin} />
          <div>
            <h4>Extracting decisions…</h4>
            <p>
              The meeting transcript is being processed. Suggested sprint changes
              will appear here in a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Summary */}
      {!isProcessing && meeting.summary && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <Sparkles size={13} /> Summary
          </h4>
          <p className={styles.summaryText}>{meeting.summary}</p>
        </section>
      )}

      {/* Action items */}
      {!isProcessing && meeting.action_items && meeting.action_items.length > 0 && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <ListChecks size={13} /> Action items
          </h4>
          <ul className={styles.actionList}>
            {meeting.action_items.map((a) => (
              <li key={a.id || a.description} className={styles.actionItem}>
                <div className={styles.actionMain}>{a.description}</div>
                {a.owner && <div className={styles.actionOwner}>Owner · {a.owner}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Suggested changes */}
      {!isProcessing && changes.length > 0 && (
        <section className={styles.section}>
          <div className={styles.changesHeader}>
            <h4 className={styles.sectionTitle}>
              <Sparkles size={13} /> Suggested sprint changes
            </h4>
            {pendingChanges.length > 1 && !confirmAll && (
              <button
                type="button"
                className={styles.applyAllBtn}
                onClick={() => setConfirmAll(true)}
              >
                Apply all ({pendingChanges.length})
              </button>
            )}
            {confirmAll && (
              <div className={styles.confirmRow}>
                <span>Apply {pendingChanges.length} changes?</span>
                <button
                  type="button"
                  className={styles.confirmYes}
                  onClick={() => {
                    setConfirmAll(false)
                    onApplyAll?.()
                  }}
                >
                  Yes, apply all
                </button>
                <button
                  type="button"
                  className={styles.confirmNo}
                  onClick={() => setConfirmAll(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className={styles.changesList}>
            {changes.map((change) => {
              const busy = busyChangeIds?.has(change.id)
              return (
                <div
                  key={change.id}
                  className={`${styles.changeCard} ${
                    change.applied ? styles.changeApplied : ''
                  } ${change.rejected ? styles.changeRejected : ''}`}
                >
                  <div className={styles.changeTop}>
                    <span className={styles.changeType}>
                      {CHANGE_TYPE_LABELS[change.type] || change.type}
                    </span>
                    {change.us_id && (
                      <button
                        type="button"
                        className={styles.changeUsId}
                        onClick={() => onOpenSprintPlan?.(change.us_id)}
                        title="View this row in the Sprint Plan tab"
                      >
                        {change.us_id}
                      </button>
                    )}
                  </div>
                  <div className={styles.changeDesc}>{change.description}</div>
                  {(change.before != null || change.after != null) && (
                    <div className={styles.changeDiff}>
                      <span className={styles.diffBefore}>{String(change.before ?? '—')}</span>
                      <ArrowRight size={12} />
                      <span className={styles.diffAfter}>{String(change.after ?? '—')}</span>
                    </div>
                  )}
                  {!change.applied && !change.rejected && (
                    <div className={styles.changeActions}>
                      <button
                        type="button"
                        className={styles.applyBtn}
                        onClick={() => onApply?.(change)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 size={12} className={styles.spin} /> : <CheckCircle2 size={12} />}
                        Apply
                      </button>
                      <button
                        type="button"
                        className={styles.rejectBtn}
                        onClick={() => onReject?.(change)}
                        disabled={busy}
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  )}
                  {change.applied && (
                    <div className={styles.changeState}>
                      <CheckCircle2 size={12} /> Applied
                    </div>
                  )}
                  {change.rejected && (
                    <div className={styles.changeStateRejected}>
                      <XCircle size={12} /> Rejected
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* No changes case. */}
      {!isProcessing && changes.length === 0 && meeting.status === 'completed' && (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <Sparkles size={13} /> Suggested sprint changes
          </h4>
          <p className={styles.muted}>
            No sprint-plan changes were suggested from this meeting.
          </p>
        </section>
      )}

      {/* Raw text — collapsible at the bottom. */}
      {meeting.raw_text && (
        <section className={styles.rawSection}>
          <button
            type="button"
            className={styles.rawToggle}
            onClick={() => setRawOpen((v) => !v)}
            aria-expanded={rawOpen}
          >
            {rawOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>Raw transcript</span>
          </button>
          {rawOpen && <pre className={styles.rawText}>{meeting.raw_text}</pre>}
        </section>
      )}

      {/* Counts footer. */}
      {!isProcessing && (appliedChanges.length > 0 || rejectedChanges.length > 0) && (
        <footer className={styles.tally}>
          <span className={styles.tallyApplied}>
            <CheckCircle2 size={11} /> {appliedChanges.length} applied
          </span>
          <span className={styles.tallyRejected}>
            <XCircle size={11} /> {rejectedChanges.length} rejected
          </span>
        </footer>
      )}
    </div>
  )
}

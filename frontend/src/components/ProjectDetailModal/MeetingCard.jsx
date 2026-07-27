import React from 'react'
import { FileText, Calendar, Users, ChevronRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import styles from './MeetingCard.module.css'

const TYPE_LABELS = {
  daily: 'Daily standup',
  weekly: 'Weekly sync',
  monthly: 'Monthly review',
  other: 'Meeting',
}

const STATUS_META = {
  processing: { label: 'Processing', Icon: Loader2, className: 'statusProcessing' },
  completed: { label: 'Ready', Icon: CheckCircle2, className: 'statusCompleted' },
  failed: { label: 'Failed', Icon: AlertTriangle, className: 'statusFailed' },
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * MeetingCard — a single row in the Meetings list. Shows the meeting
 * title, type, date, attendees, status, and a count of suggested
 * changes. Clicking the card (or the row) calls onSelect(meetingId).
 */
export default function MeetingCard({ meeting, selected, onSelect }) {
  const meta = STATUS_META[meeting.status] || STATUS_META.processing
  const StatusIcon = meta.Icon
  const changeCount = meeting.suggested_changes_count || 0

  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      onClick={() => onSelect?.(meeting.id)}
    >
      <div className={styles.cardTop}>
        <div className={styles.iconBox}>
          <FileText size={16} />
        </div>
        <div className={styles.titleBlock}>
          <h4 className={styles.title}>{meeting.title || 'Untitled meeting'}</h4>
          <p className={styles.type}>{TYPE_LABELS[meeting.type] || meeting.type || 'Meeting'}</p>
        </div>
        <ChevronRight size={16} className={styles.chevron} />
      </div>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          <Calendar size={11} />
          {formatDate(meeting.date || meeting.uploaded_at)}
        </span>
        {meeting.attendees && meeting.attendees.length > 0 && (
          <span className={styles.metaItem}>
            <Users size={11} />
            {meeting.attendees.length} attendee{meeting.attendees.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className={styles.cardFooter}>
        <span className={`${styles.statusBadge} ${styles[meta.className]}`}>
          <StatusIcon size={11} className={meeting.status === 'processing' ? styles.spin : ''} />
          {meta.label}
        </span>
        {meeting.status === 'completed' && changeCount > 0 && (
          <span className={styles.changeCount}>
            {changeCount} suggested change{changeCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </button>
  )
}

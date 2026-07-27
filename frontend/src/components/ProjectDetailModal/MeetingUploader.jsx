import React, { useState, useRef } from 'react'
import { Upload, FileText, X, Loader2, Calendar, Users } from 'lucide-react'
import { meetingsAPI } from '../../api/auth'
import styles from './MeetingUploader.module.css'

const MEETING_TYPES = [
  { value: 'daily', label: 'Daily standup' },
  { value: 'weekly', label: 'Weekly sync' },
  { value: 'monthly', label: 'Monthly review' },
  { value: 'other', label: 'Other' },
]

/**
 * MeetingUploader — drag/drop or click-to-browse uploader for meeting
 * notes. Sits at the top of the MeetingsTab.
 *
 * Props:
 *   - projectId: number — passed to meetingsAPI.uploadMeeting.
 *   - onUploaded(meetingId): () => void — called after a successful
 *     upload so the parent can refresh the meeting list.
 */
export default function MeetingUploader({ projectId, onUploaded }) {
  const [file, setFile] = useState(null)
  const [type, setType] = useState('weekly')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [attendees, setAttendees] = useState('')
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    setError(null)
    // Soft size cap: 20 MB.
    if (f.size > 20 * 1024 * 1024) {
      setError('File is too large (max 20 MB).')
      return
    }
    setFile(f)
    if (!title) {
      // Default the title to the filename (without extension).
      setTitle(f.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) handleFile(f)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleClear = () => {
    setFile(null)
    setError(null)
    setTitle('')
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!file || uploading) return
    setUploading(true)
    setError(null)
    try {
      const meta = {
        type,
        date,
        attendees: attendees
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        title: title || file.name,
      }
      const res = await meetingsAPI.uploadMeeting(projectId, file, meta)
      onUploaded?.(res.meeting_id)
      // Reset the form but keep the type/date so the user can drop
      // another meeting quickly.
      setFile(null)
      setTitle('')
      setAttendees('')
    } catch (err) {
      console.error('Failed to upload meeting:', err)
      setError(err?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className={styles.uploader} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>
            <Upload size={16} /> Upload meeting notes
          </h3>
          <p className={styles.subtitle}>
            Drop a transcript, notes file, or paste text. PM OS will extract decisions and suggest sprint changes.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneOver : ''} ${file ? styles.dropZoneHasFile : ''}`}
        onClick={() => !file && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !file) {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx,.doc,text/plain,application/pdf"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className={styles.fileInput}
        />

        {!file ? (
          <div className={styles.dropPrompt}>
            <Upload size={22} />
            <p>
              <strong>Drop a file here</strong> or click to browse
            </p>
            <span className={styles.dropHint}>TXT, MD, PDF, DOCX up to 20 MB</span>
          </div>
        ) : (
          <div className={styles.fileRow}>
            <FileText size={18} />
            <div className={styles.fileInfo}>
              <div className={styles.fileName}>{file.name}</div>
              <div className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</div>
            </div>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={(e) => {
                e.stopPropagation()
                handleClear()
              }}
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Metadata fields */}
      <div className={styles.metaGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input
            type="text"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Weekly sprint sync"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            <Calendar size={11} /> Date
          </span>
          <input
            type="date"
            className={styles.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            className={styles.input}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {MEETING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            <Users size={11} /> Attendees (comma-separated)
          </span>
          <input
            type="text"
            className={styles.input}
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Priya, Arjun, Neha"
          />
        </label>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={!file || uploading}
        >
          {uploading ? (
            <>
              <Loader2 size={14} className={styles.spin} /> Uploading…
            </>
          ) : (
            <>
              <Upload size={14} /> Upload meeting
            </>
          )}
        </button>

        <button
          type="button"
          className={styles.dailyBtn}
          onClick={() => {
            setType('daily')
            setDate(new Date().toISOString().slice(0, 10))
            setTitle('Daily standup')
          }}
          title="Quick-action: prefill for a daily standup"
        >
          Quick: daily standup
        </button>
      </div>
    </form>
  )
}

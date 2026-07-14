import React, { useState } from 'react'
import { CircleDot, Check, RotateCcw } from 'lucide-react'
import styles from './ProjectDetails.module.css'

// Static sample data — in-memory only, no backend integration.
const INITIAL_PROJECTS = [
  {
    id: 1,
    name: 'AI Customer Portal',
    description:
      'Self-service portal where customers can submit tickets, track deliveries, and manage subscriptions using natural language.',
    startDate: '2026-06-15',
    endDate: '2026-09-30',
    status: 'running',
    owner: 'Manoj Yadav',
    progress: 62,
  },
  {
    id: 2,
    name: 'Mobile App v2',
    description:
      'Full rewrite of the consumer mobile app in React Native with offline-first sync, biometric login, and dark mode.',
    startDate: '2026-04-01',
    endDate: '2026-08-15',
    status: 'on-hold',
    owner: 'Priya Sharma',
    progress: 38,
  },
  {
    id: 3,
    name: 'Data Warehouse Migration',
    description:
      'Move analytics workloads from legacy on-prem SQL Server to a cloud-native Snowflake + dbt pipeline.',
    startDate: '2026-02-10',
    endDate: '2026-07-05',
    status: 'complete',
    owner: 'Arjun Mehta',
    progress: 100,
  },
  {
    id: 4,
    name: 'Brand Refresh',
    description:
      'New visual identity, marketing site redesign, and updated component library across all customer-facing apps.',
    startDate: '2026-07-20',
    endDate: '2026-11-10',
    status: 'running',
    owner: 'Neha Verma',
    progress: 12,
  },
]

const STATUS_OPTIONS = [
  { value: 'running', label: 'Running', icon: CircleDot },
  { value: 'on-hold', label: 'On Hold', icon: CircleDot },
  { value: 'complete', label: 'Complete', icon: Check },
]

const STATUS_META = {
  running: { label: 'Running', pillClass: 'pillRunning' },
  'on-hold': { label: 'On Hold', pillClass: 'pillOnHold' },
  complete: { label: 'Complete', pillClass: 'pillComplete' },
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const diff = Math.round((new Date(endIso) - new Date(startIso)) / (1000 * 60 * 60 * 24))
  return diff
}

export default function ProjectDetails() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS)
  const [expandedId, setExpandedId] = useState(null)

  const updateProject = (id, patch) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const handleReset = () => {
    setProjects(INITIAL_PROJECTS)
    setExpandedId(null)
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>Project Details</h2>
          <p>Track active work, timelines, and status across your portfolio</p>
        </div>
        <button className={styles.resetBtn} onClick={handleReset} type="button">
          <RotateCcw size={14} strokeWidth={2.2} />
          <span>Reset</span>
        </button>
      </div>

      <div className={styles.grid}>
        {projects.map((project) => {
          const isExpanded = expandedId === project.id
          const meta = STATUS_META[project.status] || STATUS_META.running
          const duration = daysBetween(project.startDate, project.endDate)

          return (
            <article
              key={project.id}
              className={`${styles.card} ${isExpanded ? styles.cardExpanded : ''}`}
            >
              {/* Header — always visible */}
              <header
                className={styles.cardHeader}
                onClick={() => setExpandedId(isExpanded ? null : project.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandedId(isExpanded ? null : project.id)
                  }
                }}
              >
                <div className={styles.cardHeaderTop}>
                  <div className={styles.cardTitleBlock}>
                    <h3 className={styles.cardTitle}>{project.name}</h3>
                    <p className={styles.cardOwner}>Owner · {project.owner}</p>
                  </div>
                  <span className={`${styles.pill} ${styles[meta.pillClass]}`}>
                    <span className={styles.pillDot}></span>
                    {meta.label}
                  </span>
                </div>

                <p className={styles.cardSummary}>{project.description}</p>

                <div className={styles.cardMeta}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Timeline</span>
                    <span className={styles.metaValue}>
                      {formatDate(project.startDate)} → {formatDate(project.endDate)}
                    </span>
                  </div>
                  {duration != null && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>Duration</span>
                      <span className={styles.metaValue}>{duration} days</span>
                    </div>
                  )}
                </div>

                <div className={styles.progressRow}>
                  <div className={styles.progressTrack}>
                    <div
                      className={`${styles.progressFill} ${styles[`fill_${project.status}`]}`}
                      style={{ width: `${project.progress}%` }}
                    ></div>
                  </div>
                  <span className={styles.progressLabel}>{project.progress}%</span>
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.expandHint}>
                    {isExpanded ? 'Hide details' : 'Edit details'}
                  </span>
                </div>
              </header>

              {/* Editable details — visible when expanded */}
              {isExpanded && (
                <div className={styles.cardBody}>
                  <div className={styles.bodyGrid}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Start date</span>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={project.startDate}
                        onChange={(e) => updateProject(project.id, { startDate: e.target.value })}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>End date</span>
                      <input
                        type="date"
                        className={styles.dateInput}
                        value={project.endDate}
                        onChange={(e) => updateProject(project.id, { endDate: e.target.value })}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Status</span>
                      <select
                        className={`${styles.statusSelect} ${styles[`select_${project.status}`]}`}
                        value={project.status}
                        onChange={(e) => updateProject(project.id, { status: e.target.value })}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Progress (%)</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className={styles.dateInput}
                        value={project.progress}
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                          updateProject(project.id, { progress: n })
                        }}
                      />
                    </label>
                  </div>

                  <p className={styles.bodyNote}>
                    Changes are kept in memory only — refreshing the page restores the original values.
                  </p>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

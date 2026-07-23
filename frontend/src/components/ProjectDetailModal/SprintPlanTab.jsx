import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Loader2, Filter, X, Search } from 'lucide-react'
import { fileAPI } from '../../api/auth'
import styles from './SprintPlanTab.module.css'

/**
 * SprintPlanTab — the live, filterable sprint-plan table.
 *
 * Pulls the combined sprint-plan payload from
 * `GET /api/uploads/{id}/sprint_plan/` (one round-trip returns
 * user_stories + resources + sprint_plan_rows). Renders the rows in a
 * table with filters for sprint, priority, status, and a free-text
 * search.
 *
 * Cross-tab highlight: when the Meetings tab applies a suggested
 * change, the parent passes `highlightUsId` (a string like "US-3").
 * We scroll the matching row into view, apply a brief flash class
 * for 2s, and then let CSS animation fade it out.
 *
 * Props:
 *   - uploadId: number
 *   - highlightUsId: string | null — when set, scroll to and flash
 *     the row whose `us_id` matches.
 *   - onChangeApplied: (usId) => void — not used here directly, but
 *     accepted so the prop shape stays consistent across tabs.
 */
export default function SprintPlanTab({ uploadId, highlightUsId, onChangeApplied: _onChangeApplied }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sprintPlan, setSprintPlan] = useState({ user_stories: [], resources: [], sprint_plan_rows: [] })

  // Filters.
  const [sprintFilter, setSprintFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Track which row id is currently flashing (so multiple highlight
  // events don't fight each other).
  const [flashRowId, setFlashRowId] = useState(null)
  const rowRefs = useRef(new Map())
  const flashTimerRef = useRef(null)

  const fetchPlan = useCallback(async () => {
    if (!uploadId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fileAPI.getSprintPlan(uploadId)
      const data = res?.data || {}
      setSprintPlan({
        user_stories: data.user_stories || [],
        resources: data.resources || [],
        sprint_plan_rows: data.sprint_plan_rows || [],
      })
    } catch (err) {
      console.error('Failed to load sprint plan:', err)
      setError(err?.response?.data?.error || err.message || 'Failed to load sprint plan')
    } finally {
      setLoading(false)
    }
  }, [uploadId])

  useEffect(() => {
    fetchPlan()
  }, [fetchPlan])

  // When the parent sets a new highlightUsId, scroll the matching row
  // into view and flash it. We do this in an effect (rather than in
  // the parent's callback) so we have access to the row ref map.
  useEffect(() => {
    if (!highlightUsId) return
    const row = sprintPlan.sprint_plan_rows.find((r) => r.us_id === highlightUsId)
    if (!row) return
    setFlashRowId(row.id)
    // Scroll into view (smooth).
    const el = rowRefs.current.get(row.id)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlashRowId(null), 2000)
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [highlightUsId, sprintPlan.sprint_plan_rows])

  // Derive filter option lists from the actual data so the dropdowns
  // show only values that exist.
  const sprintOptions = useMemo(() => {
    const set = new Set()
    sprintPlan.sprint_plan_rows.forEach((r) => { if (r.sprint) set.add(r.sprint) })
    return Array.from(set).sort()
  }, [sprintPlan.sprint_plan_rows])

  const priorityOptions = useMemo(() => {
    const set = new Set()
    sprintPlan.sprint_plan_rows.forEach((r) => { if (r.priority) set.add(r.priority) })
    return Array.from(set).sort()
  }, [sprintPlan.sprint_plan_rows])

  const statusOptions = useMemo(() => {
    const set = new Set()
    sprintPlan.sprint_plan_rows.forEach((r) => { if (r.status) set.add(r.status) })
    return Array.from(set).sort()
  }, [sprintPlan.sprint_plan_rows])

  // Apply filters.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sprintPlan.sprint_plan_rows.filter((r) => {
      if (sprintFilter !== 'all' && r.sprint !== sprintFilter) return false
      if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (q) {
        const hay = `${r.us_id || ''} ${r.task || ''} ${r.user_story_text || ''} ${r.resource_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sprintPlan.sprint_plan_rows, sprintFilter, priorityFilter, statusFilter, search])

  const clearFilters = () => {
    setSprintFilter('all')
    setPriorityFilter('all')
    setStatusFilter('all')
    setSearch('')
  }

  const hasActiveFilters =
    sprintFilter !== 'all' || priorityFilter !== 'all' || statusFilter !== 'all' || !!search.trim()

  // ---- Render ----

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 size={20} className={styles.spin} />
        <span>Loading sprint plan…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <p>Could not load the sprint plan.</p>
        <p className={styles.errorDetail}>{error}</p>
        <button type="button" className={styles.retryBtn} onClick={fetchPlan}>
          Retry
        </button>
      </div>
    )
  }

  if (sprintPlan.sprint_plan_rows.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Filter size={28} />
        <h3>No sprint plan yet</h3>
        <p>
          The sprint plan will appear here once your SOW is processed. If this
          project has been completed but the table is empty, try resyncing the
          plan from the file's actions.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <Filter size={14} className={styles.filterIcon} />
          <span className={styles.filterLabel}>Filters</span>
        </div>

        <select
          className={styles.filterSelect}
          value={sprintFilter}
          onChange={(e) => setSprintFilter(e.target.value)}
          aria-label="Sprint"
        >
          <option value="all">All sprints</option>
          {sprintOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Priority"
        >
          <option value="all">All priorities</option>
          {priorityOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className={styles.searchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search story, task, owner…"
            aria-label="Search"
          />
        </div>

        {hasActiveFilters && (
          <button type="button" className={styles.clearBtn} onClick={clearFilters}>
            <X size={12} /> Clear
          </button>
        )}

        <span className={styles.resultCount}>
          {filteredRows.length} of {sprintPlan.sprint_plan_rows.length} rows
        </span>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Sprint</th>
              <th>US ID</th>
              <th>Task</th>
              <th>Owner</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Est. Hrs</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.noResults}>
                  No rows match the current filters.
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const isFlashing = flashRowId === row.id
              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(row.id, el)
                    else rowRefs.current.delete(row.id)
                  }}
                  className={isFlashing ? styles.rowFlash : ''}
                >
                  <td className={styles.sprintCell}>{row.sprint || '—'}</td>
                  <td className={styles.usIdCell}>{row.us_id || '—'}</td>
                  <td className={styles.taskCell}>
                    <div className={styles.taskTitle}>
                      {row.user_story_text || row.user_story_detail?.user_story || row.task || '—'}
                    </div>
                    {row.task && row.user_story_text && (
                      <div className={styles.taskSub}>{row.task}</div>
                    )}
                  </td>
                  <td>{row.resource_name || '—'}</td>
                  <td>
                    <span className={`${styles.pill} ${styles[`prio_${(row.priority || '').toLowerCase().replace(/\s+/g, '_')}`] || styles.priDefault}`}>
                      {row.priority || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.pill} ${styles[`status_${(row.status || '').toLowerCase().replace(/\s+/g, '_')}`] || styles.statusDefault}`}>
                      {row.status || '—'}
                    </span>
                  </td>
                  <td className={styles.hoursCell}>{row.est_hours != null ? `${row.est_hours}h` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

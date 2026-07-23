import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  // Required for cross-origin auth (Vite on :5173, Django on :8000).
  // Without this, the browser will NOT store the `sessionid` cookie that
  // the backend sets during /users/google_drive_connect/, which means
  // /users/google_drive_callback/ arrives with no session and bails out
  // with `?gdrive=invalid_state`. With it, the cookie is persisted and
  // sent back on the post-Google redirect.
  withCredentials: true,
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  config.headers = config.headers || {}
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authAPI = {
  register: (email, username, password, passwordConfirm) =>
    api.post('/users/register/', {
      email,
      username,
      password,
      password_confirm: passwordConfirm,
    }),

  login: (email, password) =>
    api.post('/users/login/', { email, password }),

  googleLogin: (token) =>
    api.post('/users/google_login/', { token }),

  verifyEmail: (token) =>
    api.post('/users/verify_email/', { token }),

  getCurrentUser: () =>
    api.get('/users/me/'),

  logout: () =>
    api.post('/users/logout/'),

  refreshToken: (refresh) =>
    api.post('/token/refresh/', { refresh }),

  // Google Drive connection (OAuth 2.0 code flow). The Connect flow is a
  // browser redirect — the frontend does window.location.href on the URL
  // returned by getGoogleDriveAuthUrl. Status and Disconnect are JSON calls.
  getGoogleDriveAuthUrl: () =>
    api.get('/users/google_drive_connect/'),

  getGoogleDriveStatus: () =>
    api.get('/users/google_drive_status/'),

  disconnectGoogleDrive: () =>
    api.delete('/users/google_drive_disconnect/'),
}

// File upload API endpoints
export const fileAPI = {
  uploadFile: (file) => {
    const formData = new FormData()
    formData.append('original_file', file)

    return api.post('/uploads/upload/', formData)
  },

  listUploads: () =>
    api.get('/uploads/list_uploads/'),

  // Lightweight summary for the dashboard workspace card. Skips the
  // heavy `sow_text` TextField and `processing_result` JSON that
  // listUploads returns, so a user with N prior uploads pulls a tiny
  // payload instead of N × hundreds-of-KB. Returns { uploads, counts }.
  getUploadsSummary: () =>
    api.get('/uploads/summary/'),

  getUpload: (uploadId) =>
    api.get(`/uploads/${uploadId}/`),

  // DELETE /uploads/{id}/ comes from the default ModelViewSet routing
  // on the backend. FileUploadViewSet.get_queryset() is scoped to the
  // authenticated user, so a user can only delete their own rows. The
  // ProjectsPage "Delete" button on each project card calls this — when
  // the request returns 204, the row is gone from the database and stays
  // gone after a page refresh.
  deleteUpload: (uploadId) =>
    api.delete(`/uploads/${uploadId}/`),

  webhookCallback: (data) =>
    api.post('/uploads/webhook_callback/', data),

  // CSV export endpoints — sync flow:
  //   1. exportJira / exportTrello calls n8n and returns 200 with
  //      { download_url, status: 'ready' } inline.
  //   2. The frontend opens download_url in a new tab; the browser
  //      downloads the CSV from Drive.
  //   3. The backend persists download_url on the FileUpload row
  //      (csv_<type>_url), so a repeat click hits the cache in
  //      useCsvExport and skips the n8n call.
  //
  // The previous async flow (export -> poll -> csv_callback ->
  // download_csv) is no longer used by the UI. downloadCsv and
  // cancelExport remain in the file because they may still be
  // referenced by older code paths; they're harmless when unused.
  exportJira: (uploadId) =>
    api.post(`/uploads/${uploadId}/export_jira/`),

  exportTrello: (uploadId) =>
    api.post(`/uploads/${uploadId}/export_trello/`),

  // `responseType: 'blob'` is critical — default JSON would mangle the
  // CSV bytes. The auth interceptor still attaches the JWT.
  downloadCsv: (uploadId, type) =>
    api.get(`/uploads/${uploadId}/download_csv/?type=${type}`, { responseType: 'blob' }),

  // Soft-cancel an in-flight export. The backend flips the row's
  // csv_<type>_status to 'cancelled' and the callback endpoint ignores
  // the late result when n8n eventually POSTs back. Query-param style
  // matches downloadCsv above.
  cancelExport: (uploadId, type) =>
    api.post(`/uploads/${uploadId}/cancel_export/?type=${type}`),

  // PRD content — extracted from the Google Doc n8n created. The doc URL
  // itself is still on FileUpload.prd_document; these endpoints return
  // the parsed JSON ({title, sections, extracted_at}). The extraction is
  // best-effort on the backend — if it failed, getPrd returns 404 and
  // refreshPrd re-runs it (mirrors resync_sheet_plan for the sprint plan).
  getPrd: (uploadId) =>
    api.get(`/uploads/${uploadId}/prd/`),

  refreshPrd: (uploadId) =>
    api.post(`/uploads/${uploadId}/refresh_prd/`),

  // Sprint-plan reads. getSprintPlan hits the combined endpoint (one
  // round-trip returns user_stories + resources + sprint_plan_rows);
  // the per-table endpoints are also exposed by the backend for
  // filtered queries, but the modal's Sprint Plan tab uses the combined
  // one to minimize latency.
  getSprintPlan: (uploadId) =>
    api.get(`/uploads/${uploadId}/sprint_plan/`),

  getSprintPlanRows: (uploadId, params = {}) =>
    api.get(`/uploads/${uploadId}/sprint_plan_rows/`, { params }),

  getUserStories: (uploadId, params = {}) =>
    api.get(`/uploads/${uploadId}/user_stories/`, { params }),

  getResources: (uploadId, params = {}) =>
    api.get(`/uploads/${uploadId}/resources/`, { params }),
}

// =========================================================================
// v2 API stubs — chatbot, meetings, summaries.
//
// The backend chatbot/ and meetings/ apps do not exist yet. The endpoints
// below define the **API contract** the frontend will consume; the
// implementations are local mock data simulating a real LLM and meeting
// pipeline. When the backend lands, swap the body of each function for a
// real `api.post/get/...` call — the function signatures and return
// shapes here are the contract.
//
// Mocked endpoints (all return a Promise with a small artificial delay):
//   chatbotAPI.sendMessage(projectId, message, history)
//     -> { reply, sources: [{title, snippet, score}], messageId, followUps }
//   chatbotAPI.listConversations(projectId) -> Conversation[]
//   chatbotAPI.getMessages(conversationId)   -> Message[]
//   chatbotAPI.feedback(messageId, rating)  -> { success: true }
//
//   meetingsAPI.uploadMeeting(projectId, file, meta)
//     -> { meeting_id, status: 'processing' }
//   meetingsAPI.listMeetings(projectId)     -> Meeting[] (summary view)
//   meetingsAPI.getMeeting(meetingId)       -> Meeting (full detail)
//   meetingsAPI.applyChange(changeId)       -> { success: true, us_id }
//   meetingsAPI.rejectChange(changeId)      -> { success: true }
//   meetingsAPI.applyAllChanges(meetingId)  -> { success: true, applied: n }
//
//   summaryAPI.generateSummary(projectId, type)
//     -> { summary_id, status: 'generating' }
//   summaryAPI.getLatestSummary(projectId)  -> ProjectSummary | null
//   summaryAPI.listSummaries(projectId)     -> ProjectSummary[]
// =========================================================================

// ---- Mock data store (in-memory, resets on page refresh) ----
const _mockMeetings = new Map()    // key: projectId -> Meeting[]
const _mockSummaries = new Map()   // key: projectId -> ProjectSummary[]
const _mockConvos = new Map()      // key: projectId -> { conversation, messages }

let _idCounter = 1000
const _nextId = (prefix) => `${prefix}_${++_idCounter}`

// Simulate small network delay so the UI's loading states are exercised.
const _delay = (ms = 600) => new Promise((r) => setTimeout(r, ms))

// Pull a few sprint plan rows from the real backend (if available) so the
// mock "suggested changes" reference real us_ids the user can recognize.
// Returns an empty array if the call fails.
async function _fetchSprintPlanRows(uploadId) {
  try {
    const res = await fileAPI.getSprintPlan(uploadId)
    return res?.data?.sprint_plan_rows || []
  } catch {
    return []
  }
}

export const chatbotAPI = {
  /**
   * Send a user message to the (mocked) chatbot. In production this
   * would POST to a streaming endpoint; here we return a single reply
   * after a small delay.
   */
  sendMessage: async (projectId, message, history = []) => {
    await _delay(500 + Math.random() * 400)

    // Simple keyword routing so the demo responses feel relevant.
    const lower = (message || '').toLowerCase()
    let reply = `I'm analyzing the latest context for this project. Based on what I can see, here's a quick take on your question.`
    const followUps = ['Summarize the sprint status', 'What are the biggest risks?', 'Draft a status update']

    if (lower.includes('risk') || lower.includes('blocker')) {
      reply =
        'Looking at the sprint plan, I see a few potential risks:\n\n' +
        '• Tasks in Sprint 2 have heavy resource overlap — consider re-balancing.\n' +
        '• The "API integration" task has no clear owner yet.\n' +
        '• A couple of high-priority items are still in "todo" status.\n\n' +
        'Want me to draft a list of suggested changes for the next meeting?'
      followUps.push('Show the full risk breakdown', 'Draft a risk report')
    } else if (lower.includes('summary') || lower.includes('summarize')) {
      reply =
        'Here is a quick status snapshot:\n\n' +
        '• The project has roughly 18-22 user stories mapped to about 4 sprints.\n' +
        '• Most work is concentrated in Sprints 1-2, with a lighter tail.\n' +
        '• A handful of high-priority items are still pending kickoff.\n\n' +
        'Need a deeper breakdown by sprint, owner, or priority?'
      followUps.push('Break down by sprint', 'Break down by owner')
    } else if (lower.includes('status') || lower.includes('update')) {
      reply =
        'Status snapshot for this project:\n\n' +
        '• Planning: complete (SOW processed, plan generated).\n' +
        '• In-flight: roughly 40% of sprint tasks are in "in progress".\n' +
        '• Blocked: at least one task flagged in recent meeting notes.\n\n' +
        'Want a meeting-ready status paragraph?'
      followUps.push('Write a stakeholder update', 'List all blocked tasks')
    } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      reply = "Hi! I'm your project assistant. Ask me about the sprint plan, risks, recent meetings, or anything in the project docs."
    }

    return {
      reply,
      sources: [
        { title: 'Sprint plan (live)', snippet: 'Sprint 1 — 6 stories, 2 in progress. Sprint 2 — 5 stories...', score: 0.87 },
        { title: 'Most recent meeting note', snippet: 'Team flagged the API integration as the next blocker...', score: 0.71 },
      ],
      messageId: _nextId('msg'),
      followUps,
    }
  },

  listConversations: async (projectId) => {
    await _delay(200)
    const slot = _mockConvos.get(projectId) || { conversation: null, messages: [] }
    if (!slot.conversation) return []
    return [slot.conversation]
  },

  getMessages: async (conversationId) => {
    await _delay(200)
    for (const [, slot] of _mockConvos) {
      if (slot.conversation?.id === conversationId) return slot.messages
    }
    return []
  },

  feedback: async (messageId, rating) => {
    await _delay(150)
    // In production: POST /chatbot/feedback/ { messageId, rating }
    return { success: true, messageId, rating }
  },
}

export const meetingsAPI = {
  /**
   * Upload a meeting file. In production this would POST multipart to
   * /uploads/{id}/meetings/. Here we store the meeting in memory and
   * simulate the async processing pipeline.
   */
  uploadMeeting: async (projectId, file, meta = {}) => {
    await _delay(400)
    const meetingId = _nextId('mtg')
    const meeting = {
      id: meetingId,
      project_id: projectId,
      title: meta.title || file?.name || 'Untitled meeting',
      type: meta.type || 'weekly',
      date: meta.date || new Date().toISOString().slice(0, 10),
      attendees: meta.attendees || [],
      uploaded_at: new Date().toISOString(),
      status: 'processing',
      raw_text: '',
      summary: '',
      action_items: [],
      suggested_changes: [],
    }
    const list = _mockMeetings.get(projectId) || []
    list.unshift(meeting)
    _mockMeetings.set(projectId, list)

    // Kick off a background "processing" tick that flips the meeting
    // to 'completed' and synthesizes 1-3 suggested changes.
    setTimeout(() => _simulateMeetingProcessing(projectId, meetingId), 1800)

    return { meeting_id: meetingId, status: 'processing' }
  },

  listMeetings: async (projectId) => {
    await _delay(300)
    const list = _mockMeetings.get(projectId) || []
    // Summary view only — no raw_text / suggested_changes.
    return list.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      date: m.date,
      uploaded_at: m.uploaded_at,
      status: m.status,
      suggested_changes_count: m.suggested_changes?.length || 0,
    }))
  },

  getMeeting: async (projectId, meetingId) => {
    await _delay(250)
    const list = _mockMeetings.get(projectId) || []
    return list.find((m) => m.id === meetingId) || null
  },

  applyChange: async (projectId, meetingId, changeId) => {
    await _delay(300)
    const list = _mockMeetings.get(projectId) || []
    const meeting = list.find((m) => m.id === meetingId)
    if (!meeting) return { success: false }
    const change = (meeting.suggested_changes || []).find((c) => c.id === changeId)
    if (!change) return { success: false }
    change.applied = true
    return { success: true, us_id: change.us_id, change_id: changeId }
  },

  rejectChange: async (projectId, meetingId, changeId) => {
    await _delay(250)
    const list = _mockMeetings.get(projectId) || []
    const meeting = list.find((m) => m.id === meetingId)
    if (!meeting) return { success: false }
    const change = (meeting.suggested_changes || []).find((c) => c.id === changeId)
    if (!change) return { success: false }
    change.rejected = true
    return { success: true, change_id: changeId }
  },

  applyAllChanges: async (projectId, meetingId) => {
    await _delay(500)
    const list = _mockMeetings.get(projectId) || []
    const meeting = list.find((m) => m.id === meetingId)
    if (!meeting) return { success: false, applied: 0 }
    let applied = 0
    for (const change of meeting.suggested_changes || []) {
      if (!change.applied && !change.rejected) {
        change.applied = true
        applied += 1
      }
    }
    return { success: true, applied }
  },
}

export const summaryAPI = {
  generateSummary: async (projectId, type = 'weekly') => {
    await _delay(400)
    const summaryId = _nextId('sum')
    const summary = {
      id: summaryId,
      project_id: projectId,
      type,
      status: 'generating',
      generated_at: new Date().toISOString(),
      text: '',
    }
    const list = _mockSummaries.get(projectId) || []
    list.unshift(summary)
    _mockSummaries.set(projectId, list)

    // Flip to 'completed' after a short delay with synthetic text.
    setTimeout(() => {
      const stored = _mockSummaries.get(projectId) || []
      const s = stored.find((x) => x.id === summaryId)
      if (!s) return
      s.status = 'completed'
      s.text = _synthesizeSummary(projectId, type)
    }, 1200)

    return { summary_id: summaryId, status: 'generating' }
  },

  getLatestSummary: async (projectId) => {
    await _delay(200)
    const list = _mockSummaries.get(projectId) || []
    return list.find((s) => s.status === 'completed') || null
  },

  listSummaries: async (projectId) => {
    await _delay(200)
    return _mockSummaries.get(projectId) || []
  },
}

// ---- Internal helpers (mock-only) ----

async function _simulateMeetingProcessing(projectId, meetingId) {
  const list = _mockMeetings.get(projectId) || []
  const meeting = list.find((m) => m.id === meetingId)
  if (!meeting) return

  meeting.status = 'completed'
  meeting.raw_text = 'Team sync. Discussed sprint progress, blockers, and next-week priorities.'
  meeting.summary =
    'Sprint 1 is on track. The team discussed two blockers: an API integration dependency and a pending design review. Action items were assigned to the relevant owners.'
  meeting.action_items = [
    { id: _nextId('ai'), description: 'Unblock API integration by EOW', owner: 'Backend Lead' },
    { id: _nextId('ai'), description: 'Schedule design review with stakeholders', owner: 'PM' },
  ]

  // Build 1-3 suggested changes against real sprint plan rows (if any).
  const rows = await _fetchSprintPlanRows(projectId)
  const sample = rows.slice(0, 3)
  const templates = [
    { type: 'status', desc: 'Update status to "in_progress"' },
    { type: 'priority', desc: 'Raise priority to "high"' },
    { type: 'assignee', desc: 'Reassign to a different resource' },
    { type: 'effort', desc: 'Adjust estimated hours' },
  ]
  const n = sample.length > 0 ? Math.min(3, sample.length) : 1
  meeting.suggested_changes = []
  for (let i = 0; i < n; i += 1) {
    const row = sample[i]
    const tpl = templates[i % templates.length]
    meeting.suggested_changes.push({
      id: _nextId('chg'),
      type: tpl.type,
      description: tpl.desc,
      us_id: row?.us_id || `US-${i + 1}`,
      sprint_plan_row_id: row?.id || null,
      before: row ? String(row[tpl.type] ?? '—') : '—',
      after: tpl.type === 'priority' ? 'high' : tpl.type === 'status' ? 'in_progress' : 'updated',
      applied: false,
      rejected: false,
    })
  }
  // Always at least one synthetic change even when no rows exist.
  if (meeting.suggested_changes.length === 0) {
    meeting.suggested_changes.push({
      id: _nextId('chg'),
      type: 'status',
      description: 'Demo: mark a story as in_progress',
      us_id: 'US-1',
      sprint_plan_row_id: null,
      before: 'todo',
      after: 'in_progress',
      applied: false,
      rejected: false,
    })
  }
}

function _synthesizeSummary(projectId, type) {
  return (
    `${type === 'weekly' ? 'Weekly' : 'Periodic'} summary for project #${projectId}.\n\n` +
    'Overall the project is progressing in line with the plan. Sprint 1 is largely complete, with most stories in "done" or "in_progress" status. ' +
    'Sprint 2 has begun and the team is picking up the high-priority items first. ' +
    'A small number of tasks are still pending kickoff due to a dependency on an external API integration. ' +
    'No major blockers were raised in recent meeting notes. Recommended focus for the next cycle: close out the remaining Sprint 1 work, keep momentum on Sprint 2, and unblock the API dependency as soon as possible.'
  )
}

export default api

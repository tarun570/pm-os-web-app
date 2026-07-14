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
  register: (email, username, firstName, lastName, password, passwordConfirm) =>
    api.post('/users/register/', {
      email,
      username,
      first_name: firstName,
      last_name: lastName,
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

  getUpload: (uploadId) =>
    api.get(`/uploads/${uploadId}/`),

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
}

export default api

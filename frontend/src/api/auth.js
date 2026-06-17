import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
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
}

export default api

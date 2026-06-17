import React, { createContext, useState, useContext, useEffect } from 'react'
import api, { authAPI } from '../api/auth'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('access_token')
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`
      fetchCurrentUser()
    } else {
      setLoading(false)
    }
  }, [])

  const fetchCurrentUser = async () => {
    try {
      const response = await authAPI.getCurrentUser()
      setUser(response.data)
      setError(null)
    } catch (err) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  const register = async (email, username, firstName, lastName, password, passwordConfirm) => {
    try {
      setLoading(true)
      setError(null)
      const response = await authAPI.register(email, username, firstName, lastName, password, passwordConfirm)
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Registration failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const response = await authAPI.login(email, password)
      const { access, refresh, user: userData } = response.data
      
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      api.defaults.headers.common.Authorization = `Bearer ${access}`
      setUser(userData)
      
      return userData
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Login failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const googleLogin = async (token) => {
    try {
      setLoading(true)
      setError(null)
      const response = await authAPI.googleLogin(token)
      const { access, refresh, user: userData } = response.data
      
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      api.defaults.headers.common.Authorization = `Bearer ${access}`
      setUser(userData)
      
      return userData
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Google login failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const verifyEmail = async (token) => {
    try {
      setLoading(true)
      setError(null)
      const response = await authAPI.verifyEmail(token)
      setUser(response.data.user)
      return response.data
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Email verification failed'
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authAPI.logout()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      delete api.defaults.headers.common.Authorization
      setUser(null)
      setError(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, register, login, googleLogin, verifyEmail, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

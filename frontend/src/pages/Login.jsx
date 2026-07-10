import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { login, googleLogin } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/welcome')
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('')
    setIsLoading(true)

    try {
      const token = credentialResponse?.credential
      if (!token) {
        throw new Error('Google login returned no credential token. Please try again.')
      }
      await googleLogin(token)
      navigate('/welcome')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Google login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleError = () => {
    setError('Google login failed. Please try again.')
  }

  // GoogleLogin component will handle the flow automatically

  return (
    <div className={styles.container}>
      {/* Left Side - Branding */}
      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.logoIcon}>P</div>
          <span className={styles.logoText}>PM OS</span>
        </div>

        <div className={styles.content}>
          <h1>
            Welcome Back to <span className="gradient-text">PM OS</span>
          </h1>
          <p>
            AI-powered project planning. Upload your SOW and get a complete execution-ready project plan in minutes.
          </p>
        </div>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            <span>Email verification required</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            <span>Secure JWT authentication</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            <span>Google Sign-In available</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>✓</span>
            <span>24/7 access to your projects</span>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className={styles.right}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <h2>Sign In</h2>
            <p>Enter your email and password to access your account</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              type="submit"
              className={`${styles.submitBtn} gradient-button`}
              disabled={isLoading}
            >
              {isLoading ? '⏳ Signing in...' : '→ Sign In'}
            </button>
          </form>

          <div className={styles.divider}>or</div>

          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            text="signin_with"
            size="large"
            width="100%"
          />

          <p className={styles.bottomText}>
            Don't have an account? <Link to="/register">Create one</Link>
          </p>

          <p className={styles.note}>
            <span>🔒</span> Your password is encrypted and never stored in plain text.
          </p>
        </div>
      </div>
    </div>
  )
}

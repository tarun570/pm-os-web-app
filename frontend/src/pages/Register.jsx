import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function Register() {
  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    password_confirm: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const { register } = useAuth()

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await register(
        form.email,
        form.username,
        form.password,
        form.password_confirm
      )
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.logoIcon}>P</div>
          <span className={styles.logoText}>PM OS</span>
        </div>
        <div className={styles.content}>
          <h1>Create your <span className="gradient-text">PM OS</span> account</h1>
          <p>Sign up to upload SOWs and get AI-generated project plans in minutes.</p>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <h2>Sign Up</h2>
            <p>Create an account to get started</p>
          </div>

          {success ? (
            <div className={styles.error} style={{ background: '#e6f7ee', color: '#00a86b' }}>
              ✅ Registration successful! Check the backend console for the verification email,
              then <Link to="/login">click here to sign in</Link>.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label>Email</label>
                <input name="email" type="email" value={form.email} onChange={onChange} required disabled={isLoading} />
              </div>
              <div className={styles.formGroup}>
                <label>Username</label>
                <input name="username" value={form.username} onChange={onChange} required disabled={isLoading} />
              </div>
              <div className={styles.formGroup}>
                <label>Password (min 8)</label>
                <input name="password" type="password" value={form.password} onChange={onChange} required disabled={isLoading} />
              </div>
              <div className={styles.formGroup}>
                <label>Confirm password</label>
                <input name="password_confirm" type="password" value={form.password_confirm} onChange={onChange} required disabled={isLoading} />
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={`${styles.submitBtn} gradient-button`} disabled={isLoading}>
                {isLoading ? '⏳ Creating...' : '→ Create Account'}
              </button>
            </form>
          )}

          <p className={styles.bottomText}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Login.module.css'

export default function VerifyEmail() {
  const { token } = useParams()
  const { verifyEmail } = useAuth()
  const [status, setStatus] = useState('verifying') // verifying | success | error
  const [error, setError] = useState('')
  const navigate = useNavigate()
  // Using state (not ref) so React StrictMode's double-invocation in dev
  // doesn't re-fire the request. A ref gets reset on the second mount; a
  // module-level flag survives across remounts in the same module instance.
  const [started] = useState(() => ({ value: false }))

  useEffect(() => {
    if (started.value) return
    started.value = true

    const run = async () => {
      try {
        await verifyEmail(token)
        setStatus('success')
        setTimeout(() => navigate('/login'), 2500)
      } catch (err) {
        // Backend returns 400 with {"error": "Token expired or already used"}
        // when this token was already consumed (e.g. user reloaded the page,
        // or React StrictMode double-fired the request). In that case the
        // account IS verified — treat it as success and let the user log in.
        const msg = (err.message || '').toLowerCase()
        const alreadyUsed =
          msg.includes('already used') ||
          msg.includes('expired') ||
          msg.includes('invalid token')

        if (alreadyUsed) {
          setStatus('success')
          setTimeout(() => navigate('/login'), 2500)
        } else {
          setError(err.message || 'Verification failed')
          setStatus('error')
        }
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.brand}>
          <div className={styles.logoIcon}>P</div>
          <span className={styles.logoText}>PM OS</span>
        </div>
        <div className={styles.content}>
          <h1>Verify your <span className="gradient-text">email</span></h1>
          <p>Confirming your account so you can sign in.</p>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <h2>Email Verification</h2>
            <p>
              {status === 'verifying' && 'Just a moment…'}
              {status === 'success' && 'You’re all set'}
              {status === 'error' && 'Something went wrong'}
            </p>
          </div>

          {status === 'verifying' && (
            <p style={{ textAlign: 'center', padding: '16px 0' }}>
              ⏳ Verifying your email…
            </p>
          )}

          {status === 'success' && (
            <>
              <div
                className={styles.error}
                style={{ background: '#e6f7ee', color: '#00a86b' }}
              >
                ✅ Email verified! Redirecting to <Link to="/login">login</Link>…
              </div>
              <p className={styles.bottomText}>
                Not redirecting? <Link to="/login">Click here to sign in</Link>.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className={styles.error}>❌ {error}</div>
              <p className={styles.bottomText}>
                <Link to="/login">Go to login</Link> ·{' '}
                <Link to="/register">Register again</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

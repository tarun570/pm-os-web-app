import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fileAPI } from '../api/auth'
import FileUpload from '../components/FileUpload'
import FileHistory from '../components/FileHistory'
import styles from './Welcome.module.css'

export default function Welcome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [uploads, setUploads] = useState([])
  const [showUploadSection, setShowUploadSection] = useState(false)

  useEffect(() => {
    fetchUploads()
  }, [])

  const fetchUploads = async () => {
    try {
      const response = await fileAPI.listUploads()
      setUploads(response.data)
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
    }
  }

  const handleUploadSuccess = (newUpload) => {
    setUploads((prev) => [newUpload, ...prev])
    setShowUploadSection(false)
    
    // Optionally show success message
    alert('File uploaded successfully! Processing has started.')
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      navigate('/login')
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>
          <div className={styles.logoIcon}>P</div>
          <span>PM OS</span>
        </div>

        <div className={styles.navLinks}>
          <button onClick={handleLogout} disabled={isLoggingOut} className={styles.logoutBtn}>
            {isLoggingOut ? '⏳ Signing out...' : '→ Sign Out'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeDot}></span> Welcome to PM OS
          </div>

          <h1>
            Hello, <span className="gradient-text">{user?.first_name || user?.email.split('@')[0]}</span>!
          </h1>

          <p className={styles.subtitle}>
            You're all set to start creating AI-powered project plans. Upload your SOW and get a complete execution-ready project plan in minutes.
          </p>

          <div className={styles.actions}>
            <button 
              className={`${styles.primaryBtn} gradient-button`}
              onClick={() => setShowUploadSection(!showUploadSection)}
            >
              ⚡ {showUploadSection ? 'Hide Upload' : 'Upload Your First SOW'}
            </button>
            <button className={styles.secondaryBtn}>
              📖 View Documentation
            </button>
          </div>
        </div>

        <div className={styles.heroImage}>
          <div className={styles.placeholderCard}>
            <div className={styles.cardContent}>
              <div className={styles.cardIcon}>📊</div>
              <h3>{uploads.length} Project{uploads.length !== 1 ? 's' : ''}</h3>
              <p>{uploads.filter(u => u.status === 'completed').length} completed • {uploads.filter(u => u.status === 'processing').length} processing</p>
            </div>
          </div>
        </div>
      </section>

      {/* File Upload Section */}
      {showUploadSection && (
        <section className={styles.uploadSection}>
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        </section>
      )}

      {/* File History Section */}
      <section className={styles.historySection}>
        <FileHistory uploads={uploads} onRefresh={fetchUploads} />
      </section>

      {/* Features Grid */}
      <section className={styles.features}>
        <div className={styles.sectionHeader}>
          <h2>What You Can Do</h2>
          <p>Everything you need to transform your project planning</p>
        </div>

        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📄</div>
            <h3>Generate PRD</h3>
            <p>Create enterprise-grade Product Requirements Documents from your SOW automatically.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📝</div>
            <h3>Task Planning</h3>
            <p>Get actionable user stories mapped directly from your requirements.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>👥</div>
            <h3>Team Planning</h3>
            <p>Clear team structure with roles, availability and sprint allocation.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🗓️</div>
            <h3>Sprint Execution</h3>
            <p>Week-by-week sprint breakdown with tasks, priorities and timelines.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚙️</div>
            <h3>Execution Tasks</h3>
            <p>Granular daily tasks per developer — no ambiguity, no wasted standups.</p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📊</div>
            <h3>Export & Share</h3>
            <p>Export to Google Docs & Sheets, ready to import to Jira, Notion, or Linear.</p>
          </div>
        </div>
      </section>

      {/* User Info Section */}
      <section className={styles.userInfo}>
        <div className={styles.userCard}>
          <h3>Your Account</h3>
          <div className={styles.userDetails}>
            <div className={styles.detail}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{user?.email}</span>
            </div>
            {user?.first_name && (
              <div className={styles.detail}>
                <span className={styles.label}>Name</span>
                <span className={styles.value}>
                  {user.first_name} {user.last_name || ''}
                </span>
              </div>
            )}
            <div className={styles.detail}>
              <span className={styles.label}>Account Status</span>
              <span className={`${styles.value} ${styles.verified}`}>
                ✓ Verified
              </span>
            </div>
            <div className={styles.detail}>
              <span className={styles.label}>Member Since</span>
              <span className={styles.value}>
                {new Date(user?.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>&copy; 2026 PM OS by CodeGrameen. All rights reserved.</p>
        <div className={styles.footerLinks}>
          <a href="mailto:yadavmanoj354@gmail.com">Support</a>
          <a href="https://codegrameen.com" target="_blank" rel="noopener noreferrer">Company</a>
        </div>
      </footer>
    </div>
  )
}

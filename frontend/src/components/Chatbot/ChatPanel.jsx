import { useState, useEffect, useRef } from 'react'
import { getStaticReply } from './chatEngine'
import { WELCOME_MESSAGE } from './faqData'
import { useAuth } from '../../context/AuthContext'
import { useProjectSection } from '../../context/ProjectSectionContext'
import { fileAPI } from '../../api/auth'
import { Send, Sparkles } from 'lucide-react'
import styles from './ChatPanel.module.css'

// Pure, narrow ID generator so we don't have to import nanoid/uuid for this.
let _msgId = 0
const nextId = () => `m_${++_msgId}`

// Per-section greetings + follow-up chips. Used when a project is
// open; the section id comes from ProjectSectionContext. The keys
// must match the route tails in App.jsx (`overview` / `meetings` /
// `sprint`).
const SECTION_GREETINGS = {
  overview: {
    title: 'Project Assistant',
    subtitle: 'Overview section',
    reply:
      "Hi! You're on the project overview. Ask me about links, status, the PRD, or generate a weekly summary.",
    followUps: ['Show Drive folder', 'Summarize the PRD', 'Generate weekly summary'],
  },
  meetings: {
    title: 'Project Assistant',
    subtitle: 'Meetings section',
    reply:
      "Hi! You're on the meetings section. Ask about recent meetings, pending suggested changes, or upload a new meeting.",
    followUps: [
      'Summarize the latest meeting',
      'What changes are pending?',
      'List meetings this week',
    ],
  },
  sprint: {
    title: 'Project Assistant',
    subtitle: 'Sprint Plan section',
    reply:
      "Hi! You're on the sprint plan. Ask about stories, owners, sprint status, or task priorities.",
    followUps: [
      'Which sprint is at risk?',
      'List unowned tasks',
      'Show high-priority items',
    ],
  },
}

const FALLBACK_GREETING = {
  title: 'PM OS Assistant',
  subtitle: 'Always here to help',
  reply: WELCOME_MESSAGE.reply,
  followUps: WELCOME_MESSAGE.followUps,
}

/**
 * Persistent right-side chat panel — docks the existing Chatbot's
 * conversation logic into a fixed-width column so it's always visible
 * alongside the routed page content.
 *
 * Section-aware: when a project route is active (set via
 * `ProjectSectionContext`), the header subtitle and the initial /
 * section-change greeting reflect the active section (Overview /
 * Meetings / Sprint Plan). When no project is open, the panel runs
 * in global FAQ mode.
 */
export default function ChatPanel() {
  const { user } = useAuth()
  const { uploadId, section } = useProjectSection()
  const isProjectMode = uploadId != null
  const greeting = isProjectMode
    ? SECTION_GREETINGS[section] || SECTION_GREETINGS.overview
    : FALLBACK_GREETING

  const [uploads, setUploads] = useState([])

  // Fetch uploads so the chat engine can use context-aware fallback replies
  // (e.g. "you haven't uploaded anything yet"). Silent fail is fine.
  useEffect(() => {
    fileAPI
      .listUploads()
      .then((res) => setUploads(res.data || []))
      .catch(() => setUploads([]))
  }, [])

  const [messages, setMessages] = useState(() => [
    { id: nextId(), role: 'bot', text: greeting.reply, followUps: greeting.followUps },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  // Track the last (uploadId, section) we appended a greeting for, so
  // changing the section appends a fresh greeting without wiping the
  // existing conversation. We use a ref to compare against the *next*
  // render without re-firing the effect on every messages update.
  const lastGreetedRef = useRef({ uploadId: null, section: null })

  // Append a section-aware greeting when the user enters a project, or
  // when they navigate between sections inside the same project. Going
  // back to the global FAQ mode (uploadId becomes null) does NOT add
  // anything — the existing global greeting remains in place.
  useEffect(() => {
    if (!isProjectMode) {
      lastGreetedRef.current = { uploadId: null, section: null }
      return
    }
    const last = lastGreetedRef.current
    // Same project + same section as last greet → nothing to do.
    if (last.uploadId === uploadId && last.section === section) return
    // First entry into project mode, or a new section within it →
    // append a fresh greeting that reflects the new context.
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'bot', text: greeting.reply, followUps: greeting.followUps },
    ])
    lastGreetedRef.current = { uploadId, section }
  }, [isProjectMode, uploadId, section, greeting.reply, greeting.followUps])

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Auto-scroll to the bottom whenever messages or typing state change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Clean up pending timer on unmount.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [])

  const context = {
    uploadsCount: uploads.length,
    completedCount: uploads.filter((u) => u.status === 'completed').length,
    hasGdrive: user?.has_google_drive_connected ?? false,
    // Project + section context. Null when no project is open.
    projectId: uploadId,
    section,
  }

  const sendMessage = (rawText) => {
    const text = (rawText || '').trim()
    if (!text || isTyping) return

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
    setInput('')
    setIsTyping(true)

    // Simulate "thinking" delay — 900–1400ms.
    const delay = 900 + Math.floor(Math.random() * 500)
    typingTimeoutRef.current = setTimeout(() => {
      const { reply, followUps } = getStaticReply(text, context)
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'bot', text: reply, followUps },
      ])
      setIsTyping(false)
    }, delay)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleChipClick = (chipText) => {
    sendMessage(chipText)
  }

  return (
    <aside className={styles.panel} aria-label="PM OS Assistant">
      <div className={styles.header}>
        <div className={styles.headerIcon}>
          <Sparkles size={16} />
        </div>
        <div className={styles.headerTitle}>
          <h3>{greeting.title}</h3>
          <span>{greeting.subtitle}</span>
        </div>
      </div>

      <div className={styles.messages}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.message} ${
              msg.role === 'user' ? styles.userMessage : styles.botMessage
            }`}
          >
            <div
              className={msg.role === 'user' ? styles.bubble_user : styles.bubble_bot}
            >
              {msg.text}
            </div>

            {msg.role === 'bot' && msg.followUps && msg.followUps.length > 0 && (
              <div className={styles.chips}>
                {msg.followUps.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.chip}
                    onClick={() => handleChipClick(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isTyping && (
          <div className={`${styles.message} ${styles.botMessage}`}>
            <div className={styles.bubble_bot}>
              <span className={styles.typing}>
                <span className={styles.typingDot}></span>
                <span className={styles.typingDot}></span>
                <span className={styles.typingDot}></span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder="Ask a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
          rows={1}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={isTyping || !input.trim()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </aside>
  )
}

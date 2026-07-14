import { useState, useEffect, useRef } from 'react'
import { getStaticReply } from './chatEngine'
import { WELCOME_MESSAGE } from './faqData'
import { useAuth } from '../../context/AuthContext'
import { fileAPI } from '../../api/auth'
import { Send, Sparkles } from 'lucide-react'
import styles from './ChatPanel.module.css'

// Pure, narrow ID generator so we don't have to import nanoid/uuid for this.
let _msgId = 0
const nextId = () => `m_${++_msgId}`

/**
 * Persistent right-side chat panel — docks the existing Chatbot's
 * conversation logic into a fixed-width column so it's always visible
 * alongside the routed page content. Same engine, different shell.
 */
export default function ChatPanel() {
  const { user } = useAuth()
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
    { id: nextId(), role: 'bot', text: WELCOME_MESSAGE.reply, followUps: WELCOME_MESSAGE.followUps },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

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
          <h3>PM OS Assistant</h3>
          <span>Always here to help</span>
        </div>
      </div>

      <div className={styles.comingSoonBanner} role="status" aria-live="polite">
        <p className={styles.comingSoonText}>Coming Soon</p>
        <p className={styles.comingSoonSubtext}>
          Stay tuned for the new chatbot experience — smarter replies, project context, and more.
        </p>
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

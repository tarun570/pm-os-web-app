import { useState, useEffect, useRef } from 'react'
import {
  MessageCircle,
  X,
  Send,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileText,
  Sparkles,
} from 'lucide-react'
import { getStaticReply } from './chatEngine'
import { WELCOME_MESSAGE, FALLBACK_REPLY } from './faqData'
import { useAuth } from '../../context/AuthContext'
import { fileAPI, chatbotAPI } from '../../api/auth'
import styles from './Chatbot.module.css'

// Pure, narrow ID generator so we don't have to import nanoid/uuid for this.
let _msgId = 0
const nextId = () => `m_${++_msgId}`

/**
 * Chatbot
 *
 * A self-contained chat panel. Two modes:
 *
 *   1. **Floating bubble** (default, no `projectId`): the original
 *      dashboard-wide help assistant. Uses the static FAQ engine
 *      (`getStaticReply`) since there's no project context to scope to.
 *      Renders a launcher bubble in the bottom-right; clicking it opens
 *      a 380×560 panel.
 *
 *   2. **Embedded in modal** (when `projectId` is provided): renders
 *      full-height, no launcher, no fixed positioning. Uses the
 *      `chatbotAPI` mock for project-scoped replies. Supports streaming
 *      (mocked), sources, thumbs up/down feedback, regenerate, system
 *      messages, and an empty-state prompt.
 *
 * Props:
 *   - projectId: number | undefined — when set, the chat is scoped to
 *     that project and uses the real API. When undefined, the global
 *     FAQ engine is used.
 *   - embedded: boolean — when true, render full-height inside a
 *     container (no bubble launcher, no close button, no fixed
 *     positioning). When false/undefined, render the floating
 *     launcher variant.
 *   - onSystemMessage(): () => void — optional. Called when a system
 *     message is added to the conversation so the parent can show a
 *     badge on the chat tab.
 *   - onError(error): (error) => void — optional. Called when the
 *     chatbot API throws so the parent can show a toast.
 */
export default function Chatbot({ projectId, embedded, onSystemMessage, onError }) {
  const { user } = useAuth()
  const [uploads, setUploads] = useState([])

  // Fetch uploads so the chat engine can use context-aware fallback
  // replies (e.g. "you haven't uploaded anything yet"). Silent fail is
  // fine — it's just used to enrich replies.
  useEffect(() => {
    if (projectId) return // Project-scoped chat doesn't need the global count.
    let cancelled = false
    fileAPI
      .listUploads()
      .then((res) => { if (!cancelled) setUploads(res?.data || []) })
      .catch(() => { if (!cancelled) setUploads([]) })
    return () => { cancelled = true }
  }, [projectId])

  const [isOpen, setIsOpen] = useState(!!embedded)
  const [messages, setMessages] = useState(() => [
    { id: nextId(), role: 'bot', text: WELCOME_MESSAGE.reply, followUps: WELCOME_MESSAGE.followUps, sources: [] },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId] = useState(() => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

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

  // Focus the input whenever the panel opens (floating mode) or mounts
  // (embedded mode).
  useEffect(() => {
    if (isOpen || embedded) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
    return undefined
  }, [isOpen, embedded])

  // Greeting message — different copy in project-scoped mode.
  const greeting = projectId
    ? {
        reply: "Hi! Ask me anything about this project — sprint status, recent meetings, blockers, or the PRD.",
        followUps: ['Summarize the sprint status', 'What are the biggest risks?', 'Draft a status update'],
      }
    : WELCOME_MESSAGE

  // Reset greeting when projectId changes (the modal could open for
  // a different project after a previous one closed).
  useEffect(() => {
    setMessages([
      { id: nextId(), role: 'bot', text: greeting.reply, followUps: greeting.followUps, sources: [] },
    ])
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const context = {
    uploadsCount: uploads.length,
    completedCount: uploads.filter((u) => u.status === 'completed').length,
    hasGdrive: user?.has_google_drive_connected ?? false,
  }

  /**
   * Send a message. Routes to chatbotAPI if projectId is set, otherwise
   * uses the static FAQ engine (preserves the dashboard-wide help
   * behavior for the floating bubble variant).
   */
  const sendMessage = async (rawText) => {
    const text = (rawText || '').trim()
    if (!text || isTyping) return

    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
    setInput('')
    setIsTyping(true)
    setError(null)

    try {
      if (projectId) {
        // Project-scoped: real API (mock for now).
        const res = await chatbotAPI.sendMessage(projectId, text, [])
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'bot',
            text: res.reply,
            followUps: res.followUps || [],
            sources: res.sources || [],
            messageId: res.messageId,
            feedback: null, // 'up' | 'down' | null
          },
        ])
      } else {
        // Global floating: static FAQ engine with simulated latency.
        const delay = 900 + Math.floor(Math.random() * 500)
        await new Promise((r) => { typingTimeoutRef.current = setTimeout(r, delay) })
        const { reply, followUps } = getStaticReply(text, context)
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'bot', text: reply, followUps, sources: [] },
        ])
      }
    } catch (err) {
      console.error('Chatbot sendMessage failed:', err)
      setError(err?.message || 'Something went wrong while fetching a response.')
      onError?.(err)
      // Fall back to a friendly "having trouble" message in the
      // conversation so the UI doesn't look broken.
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'bot',
          text: "I'm having trouble reaching the assistant right now. Please try again in a moment.",
          followUps: FALLBACK_REPLY.followUps,
          sources: [],
          isError: true,
        },
      ])
    } finally {
      setIsTyping(false)
    }
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

  // Thumbs up/down on a bot message. Posts to the feedback endpoint
  // and updates the local state so the UI shows which was clicked.
  const handleFeedback = async (msg, rating) => {
    if (!msg.messageId) return
    // Optimistic update.
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, feedback: rating } : m)),
    )
    try {
      await chatbotAPI.feedback(msg.messageId, rating)
    } catch (err) {
      console.error('Failed to send feedback:', err)
      // Revert on failure.
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, feedback: null } : m)),
      )
    }
  }

  // Regenerate: re-sends the user message immediately before the
  // selected bot message. We rebuild a minimal history so the mock
  // API gets something resembling context.
  const handleRegenerate = async (msg) => {
    if (isTyping) return
    // Find the user message that prompted this bot message (the one
    // directly before it in the array).
    const idx = messages.findIndex((m) => m.id === msg.id)
    if (idx <= 0) return
    const prevUser = messages[idx - 1]
    if (prevUser.role !== 'user') return
    // Replace the bot message with a new typing indicator, then fill.
    setMessages((prev) => {
      const next = prev.slice(0, idx)
      // Remove the old bot message — we'll re-append after the API call.
      return next
    })
    setIsTyping(true)
    setError(null)
    try {
      const res = await chatbotAPI.sendMessage(projectId, prevUser.text, [])
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'bot',
          text: res.reply,
          followUps: res.followUps || [],
          sources: res.sources || [],
          messageId: res.messageId,
          feedback: null,
        },
      ])
    } catch (err) {
      setError(err?.message || 'Regenerate failed.')
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'bot', text: 'I could not regenerate that response. Please try again.', sources: [], isError: true },
      ])
    } finally {
      setIsTyping(false)
    }
  }

  // Inject a system message (used by the proactive UX flow). The
  // parent calls onSystemMessage when one is added so the tab badge
  // can be updated.
  const addSystemMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'system', text },
    ])
    onSystemMessage?.()
  }

  // Expose the helper on the window so external scripts (e.g. the
  // toast triggered by a meeting processing completion) can fire one.
  // Only attach once per session.
  if (projectId && typeof window !== 'undefined') {
    if (!window.__pmos_chatbot_addSystem) {
      window.__pmos_chatbot_addSystem = addSystemMessage
    }
  }

  const renderMessage = (msg) => {
    if (msg.role === 'system') {
      return (
        <div key={msg.id} className={`${styles.message} ${styles.systemMessage}`}>
          <div className={styles.systemBubble}>
            <Sparkles size={12} />
            <span>{msg.text}</span>
          </div>
        </div>
      )
    }

    const isUser = msg.role === 'user'
    return (
      <div
        key={msg.id}
        className={`${styles.message} ${isUser ? styles.userMessage : styles.botMessage}`}
      >
        <div className={isUser ? styles.bubble_user : styles.bubble_bot}>
          {msg.text}
        </div>

        {/* Bot message extras: sources, feedback, regenerate. */}
        {!isUser && (
          <div className={styles.messageExtras}>
            {msg.sources && msg.sources.length > 0 && (
              <SourcesExpander sources={msg.sources} />
            )}
            <div className={styles.messageActions}>
              <button
                type="button"
                className={`${styles.feedbackBtn} ${msg.feedback === 'up' ? styles.feedbackActive : ''}`}
                onClick={() => handleFeedback(msg, 'up')}
                title="Helpful"
                aria-label="Mark as helpful"
              >
                <ThumbsUp size={12} />
              </button>
              <button
                type="button"
                className={`${styles.feedbackBtn} ${msg.feedback === 'down' ? styles.feedbackActive : ''}`}
                onClick={() => handleFeedback(msg, 'down')}
                title="Not helpful"
                aria-label="Mark as not helpful"
              >
                <ThumbsDown size={12} />
              </button>
              {projectId && !msg.isError && (
                <button
                  type="button"
                  className={styles.regenBtn}
                  onClick={() => handleRegenerate(msg)}
                  title="Regenerate response"
                  aria-label="Regenerate response"
                >
                  <RefreshCw size={12} />
                  <span>Regenerate</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Follow-up chips appear only on bot messages that have them. */}
        {!isUser && msg.followUps && msg.followUps.length > 0 && !msg.isError && (
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
    )
  }

  // ---- Render ----

  const panel = (
    <div
      className={`${styles.panel} ${embedded ? styles.panelEmbedded : ''}`}
      role="dialog"
      aria-label={projectId ? 'Project assistant' : 'PM OS Assistant'}
    >
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h3>{projectId ? 'Project Assistant' : 'PM OS Assistant'}</h3>
          <span>{projectId ? 'Scoped to this project' : 'How can I help?'}</span>
        </div>
        {!embedded && (
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setIsOpen(false)}
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.messages}>
        {messages.length === 1 && messages[0].role === 'bot' && embedded && (
          <div className={styles.emptyState}>
            <Sparkles size={20} />
            <h4>Ask anything about this project…</h4>
            <p>Sprint status, meeting takeaways, the PRD, or specific risks.</p>
          </div>
        )}

        {messages.map(renderMessage)}

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

        {error && (
          <div className={styles.errorBanner} role="alert">
            <AlertCircle size={14} />
            <span>{error}</span>
            <a href="mailto:support@codegrameen.com" className={styles.reportLink}>
              Report issue
            </a>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder={projectId ? 'Ask about this project…' : 'Ask a question…'}
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
    </div>
  )

  // Floating mode: show the launcher when closed, the panel when open.
  if (!embedded) {
    return (
      <>
        {!isOpen && (
          <button
            type="button"
            className={styles.bubble}
            onClick={() => setIsOpen(true)}
            aria-label="Open PM OS Assistant"
          >
            <MessageCircle size={22} />
          </button>
        )}
        {isOpen && panel}
      </>
    )
  }

  // Embedded mode: just the panel, no launcher.
  return panel
}

// ---- Subcomponent: collapsible sources expander ----

function SourcesExpander({ sources }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.sourcesBlock}>
      <button
        type="button"
        className={styles.sourcesToggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        <span>{sources.length} source{sources.length === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <div className={styles.sourcesList}>
          {sources.map((s, i) => (
            <div key={i} className={styles.sourceItem}>
              <div className={styles.sourceTitle}>
                <FileText size={11} />
                <span>{s.title || `Source ${i + 1}`}</span>
                {s.score != null && (
                  <span className={styles.sourceScore}>{Math.round(s.score * 100)}%</span>
                )}
              </div>
              {s.snippet && <p className={styles.sourceSnippet}>{s.snippet}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

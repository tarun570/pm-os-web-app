import React from 'react'
import Chatbot from '../Chatbot'
import styles from './ChatTab.module.css'

/**
 * ChatTab — the chat panel inside ProjectDetailModal.
 *
 * Renders the Chatbot component in `embedded` mode so it fills the
 * tab body. The Chatbot itself handles all the chat logic (project-
 * scoped API calls, sources, feedback, regenerate). This thin wrapper
 * exists so the tab content can be styled consistently with the other
 * tabs and so we can add tab-level chrome (e.g. a "Clear conversation"
 * button) here without touching the reusable Chatbot.
 */
export default function ChatTab({ uploadId, onSystemMessage }) {
  return (
    <div className={styles.container}>
      <Chatbot
        projectId={uploadId}
        embedded
        onSystemMessage={onSystemMessage}
      />
    </div>
  )
}

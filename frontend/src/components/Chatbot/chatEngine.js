// Pure chat engine — no React, no axios, no side effects.
// Returns { reply, followUps } for a given user message and (optional) context.
//
// THIS IS THE LLM SEAM. To wire up a real LLM later, replace the body of
// getStaticReply with:
//
//   export async function getStaticReply(userMessage, context = {}) {
//     const res = await api.post('/chatbot/', { message: userMessage, context })
//     return { reply: res.data.reply, followUps: res.data.followUps ?? [] }
//   }
//
// and mark the function async in Chatbot.jsx (one-line change in handleSend).
// Nothing else in the component needs to change.

import { FAQ_DATA, FALLBACK_REPLY } from './faqData'

// Small stopword set — these tokens don't contribute to the keyword score
// but we still want them in the text so we can match against multi-word
// keywords like "google drive".
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'do', 'does', 'did',
  'i', 'you', 'we', 'they', 'he', 'she', 'it', 'me', 'us', 'them',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as',
  'and', 'or', 'but', 'if', 'so', 'than', 'then',
  'this', 'that', 'these', 'those', 'my', 'your', 'our', 'their',
  'be', 'been', 'being', 'have', 'has', 'had',
  'can', 'could', 'will', 'would', 'should', 'may', 'might',
  'how', 'what', 'when', 'where', 'why', 'which', 'who',
])

// Lowercase, trim, strip punctuation except spaces and alphanumerics.
function normalize(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
}

// Score one FAQ entry against a normalized message.
// Each keyword hit contributes its character length (so "google drive" > "drive").
function scoreEntry(entry, normalized) {
  let score = 0
  let hits = 0
  for (const keyword of entry.keywords) {
    // Use word-boundary matching so 'doc' doesn't match inside 'document'.
    // But also allow multi-word keywords to match the phrase as a whole.
    const pattern = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i')
    if (pattern.test(normalized)) {
      score += keyword.length
      hits += 1
    }
  }
  return { score, hits }
}

export function getStaticReply(userMessage, context = {}) {
  // Empty input — return fallback so the UI doesn't break.
  if (!userMessage || !userMessage.trim()) {
    return {
      reply: "Please type a question and I'll do my best to help.",
      followUps: FALLBACK_REPLY.followUps,
    }
  }

  const normalized = normalize(userMessage)

  // Score every entry, find the best.
  let best = null
  let bestScore = 0
  for (const entry of FAQ_DATA) {
    const { score } = scoreEntry(entry, normalized)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  if (best && bestScore > 0) {
    return {
      reply: best.answer,
      followUps: best.followUps ?? [],
    }
  }

  // No keyword match — context-aware fallback so the user gets a useful hint.
  // This is the place to grow context-aware replies as the FAQ grows.
  if (context.uploadsCount === 0) {
    return {
      reply:
        "I couldn't find an answer for that. You haven't uploaded any SOWs yet — try asking 'How do I upload a SOW?' to get started.",
      followUps: FALLBACK_REPLY.followUps,
    }
  }

  if (!context.hasGdrive) {
    return {
      reply:
        "I couldn't find an answer for that. Tip: connect Google Drive first so generated outputs have somewhere to live. Try: 'Connect Google Drive'.",
      followUps: FALLBACK_REPLY.followUps,
    }
  }

  return FALLBACK_REPLY
}

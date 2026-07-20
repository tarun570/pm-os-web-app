// Static FAQ knowledge base for the PM OS Assistant.
// Each entry has a set of trigger keywords (lowercase) and a canned reply.
// The chatEngine.js file scores user input against these keywords.
//
// When the LLM integration lands, this file is the ONLY place that
// hardcoded knowledge lives. The component / chatEngine signature won't change.

export const FAQ_DATA = [
  {
    keywords: ['upload', 'sow', 'file', 'document', 'pdf'],
    answer:
      "To upload a SOW, click the 'Upload Your First SOW' button on the dashboard, then drag-and-drop or browse for a PDF file (max 100 MB). Make sure you've connected Google Drive first.",
    followUps: ['Connect Google Drive', 'What does PM OS generate?'],
  },
  {
    keywords: ['google drive', 'drive', 'connect', 'gdrive'],
    answer:
      "Connect Google Drive from the dashboard so PM OS can save generated PRDs and plans to your account. Click 'Connect Google Drive' and follow the Google consent screen. You can disconnect anytime.",
    followUps: ['Why do I need Drive?', 'Disconnect Drive'],
  },
  {
    keywords: ['disconnect', 'revoke', 'remove drive'],
    answer:
      "You can disconnect Google Drive anytime from the 'Google Drive' card on the dashboard. Click 'Disconnect' — your existing files in Drive stay where they are.",
    followUps: ['Connect Google Drive', 'Privacy'],
  },
  {
    keywords: ['generate', 'output', 'prd', 'plan', 'create', 'produce', 'what', 'does'],
    answer:
      "PM OS turns your SOW into a PRD, sprint plan, task list, team structure, and execution-ready daily tasks — saved as Google Docs & Sheets in your Drive.",
    followUps: ['Upload a SOW', 'Connect Google Drive'],
  },
  {
    keywords: ['pricing', 'cost', 'free', 'subscription', 'pay'],
    answer:
      "PM OS is currently in early access. Reach out at yadavmanoj354@gmail.com for current pricing details.",
    followUps: ['Contact support', 'How do I upload a SOW?'],
  },
  {
    keywords: ['help', 'support', 'contact', 'email', 'reach'],
    answer:
      "You can reach the team at yadavmanoj354@gmail.com or use the Support link in the footer. We're happy to help.",
    followUps: ['Pricing', 'What does PM OS do?'],
  },
  {
    keywords: ['logout', 'sign out', 'signout', 'exit', 'log out'],
    answer:
      "Click 'Sign Out' in the top-right corner of the navigation bar. You'll be returned to the login page.",
    followUps: ['Upload a SOW'],
  },
  {
    keywords: ['jira', 'trello', 'export', 'integrate', 'integration', 'linear', 'asana'],
    answer:
      "Jira and Trello integration buttons are coming soon. For now, you can open the generated Google Docs & Sheets directly from your Drive folder.",
    followUps: ['What does PM OS generate?'],
  },
  {
    keywords: ['history', 'previous', 'past', 'uploads', 'files'],
    answer:
      "All your previous uploads and their generated outputs live in the 'Your Project Files' section on the dashboard. Click any file to expand and see results.",
    followUps: ['Upload a SOW', 'What does PM OS generate?'],
  },
  {
    keywords: ['processing', 'wait', 'how long', 'time', 'pending'],
    answer:
      "On average, PM OS takes about 2 minutes to generate your PRD and sprint plan. Larger or more complex SOWs can take a bit longer — the exact time depends on the size and complexity of the document. The status on each upload card updates automatically: 'Processing' → 'Completed' (or 'Failed' with details).",
    followUps: ['History of uploads'],
  },
  {
    keywords: ['file type', 'file types', 'supported', 'format', 'formats', 'what files', 'which files', 'accept', 'extension'],
    answer:
      "PM OS only accepts PDF files for SOW uploads. Please export your SOW as PDF and try again.",
    followUps: ['What is the max file size?', 'How do I upload a SOW?'],
  },
  {
    keywords: ['max size', 'maximum size', 'file size', 'size limit', 'how large', '100mb', 'mb limit'],
    answer:
      "The maximum file size for a SOW upload is 100 MB. This is enforced by the server. If your file is larger, try compressing the PDF, removing embedded images, or splitting the document before uploading.",
    followUps: ['What file types are supported?', 'How do I upload a SOW?'],
  },
  {
    keywords: ['privacy', 'secure', 'data', 'safe'],
    answer:
      "PM OS only accesses the Google Drive folder it creates for your outputs. We never read or store your other Drive files. You can disconnect Drive at any time.",
    followUps: ['Disconnect Drive', 'Contact support'],
  },
  {
    keywords: ['team', 'roles', 'sprint', 'agile'],
    answer:
      "Generated plans include a suggested team structure with roles (PM, Tech Lead, Devs, QA), sprint breakdown by week, and granular daily tasks per developer.",
    followUps: ['What does PM OS generate?'],
  },
]

export const FALLBACK_REPLY = {
  reply:
    "I don't have an answer for that yet. Try one of the suggestions below, or ask about uploading a SOW, connecting Google Drive, or what PM OS generates.",
  followUps: [
    'How do I upload a SOW?',
    'What does PM OS generate?',
    'Connect Google Drive',
  ],
}

export const WELCOME_MESSAGE = {
  reply:
    "Hi! I'm the PM OS Assistant. Ask me anything about uploading SOWs, connecting Google Drive, or what PM OS generates. I'm running on static data right now — full LLM integration is coming soon.",
  followUps: [
    'How do I upload a SOW?',
    'What does PM OS generate?',
    'Connect Google Drive',
  ],
}

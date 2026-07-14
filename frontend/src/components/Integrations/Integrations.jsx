import { useState } from 'react'
import { CheckCircle2, Circle, Plug, Unplug, Loader2 } from 'lucide-react'
import styles from './Integrations.module.css'

// Static-data integration cards for Jira and Trello.
//
// Two integration profiles, each with its own connected/disconnected state.
// The buttons currently show a friendly "coming soon" toast — the real
// OAuth flow will replace `handleConnect` (mirror the Google Drive flow
// from useAuth / api/auth.js) and `handleDisconnect` will DELETE the
// stored tokens.
//
// To add a third integration later: copy one of the two config objects
// and add a third card to the JSX. Keep the data structure uniform.

const INTEGRATIONS = [
  {
    id: 'jira',
    name: 'Jira',
    brandTagline: 'Atlassian Project Tracking',
    description:
      "Push your generated project plan directly into Jira as Epics, Stories, and Subtasks — with sprint mapping intact. PM OS only writes to the project you choose; it never reads or modifies other Jira projects.",
    features: [
      'Auto-create Epics from project milestones',
      'Map generated tasks to Jira Stories',
      'Preserve sprint boundaries from your plan',
      'Bi-directional status sync (coming soon)',
    ],
    // For real OAuth: import a Jira brand logo SVG, or use Atlassian's
    // hosted mark. For now we use a clean text mark ("J") styled with
    // the Jira brand gradient.
    mark: 'J',
    cardClass: 'cardJira',
    logoClass: 'logoJira',
    btnClass: 'connectBtnJira',
    accentColor: '#0052CC',
  },
  {
    id: 'trello',
    name: 'Trello',
    brandTagline: 'Visual Kanban Boards',
    description:
      'Export your generated task list to a Trello board in one click. Each card carries the description, priority, and links back to your generated Drive docs. Move cards between lists as work progresses.',
    features: [
      'Pick a target board from your Trello account',
      'Map PM OS columns → Trello lists (To Do / Doing / Done)',
      'Cards include links to your Drive docs',
      'Attach generated outputs directly to cards',
    ],
    mark: 'T',
    cardClass: 'cardTrello',
    logoClass: 'logoTrello',
    btnClass: 'connectBtnTrello',
    accentColor: '#0079BF',
  },
]

function IntegrationCard({ config, connected, busy, onConnect, onDisconnect }) {
  return (
    <div className={`${styles.card} ${styles[config.cardClass]}`}>
      <div className={styles.cardHead}>
        <div className={`${styles.logo} ${styles[config.logoClass]}`}>
          {config.mark}
        </div>
        <div className={styles.cardTitle}>
          <h3>{config.name}</h3>
          <span>{config.brandTagline}</span>
        </div>
      </div>

      <p className={styles.description}>{config.description}</p>

      {connected ? (
        <>
          <div className={styles.statusRow}>
            <span className={`${styles.statusIcon} ${styles.statusIconConnected}`}>
              <CheckCircle2 size={14} strokeWidth={2.5} />
            </span>
            <span>Connected to {config.name}</span>
          </div>
          <p className={styles.hint}>
            Generated project plans can now be pushed to your {config.name}{' '}
            workspace. Use the push action on any completed upload to send
            tasks to {config.name}.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.disconnectBtn}
              onClick={onDisconnect}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={14} className={styles.spin} /> Disconnecting…
                </>
              ) : (
                <>
                  <Unplug size={14} /> Disconnect
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.statusRow}>
            <span className={`${styles.statusIcon} ${styles.statusIconDisconnected}`}>
              <Circle size={14} />
            </span>
            <span>Not connected</span>
          </div>

          <div className={styles.featureList}>
            {config.features.map((f) => (
              <div key={f} className={styles.featureItem}>
                {f}
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.connectBtn} ${styles[config.btnClass]}`}
              onClick={onConnect}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Loader2 size={14} className={styles.spin} /> Opening…
                </>
              ) : (
                <>
                  <Plug size={14} /> Connect {config.name}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Integrations() {
  // Static state — flip these to true to preview the "connected" UI.
  // Later: replace with `user?.has_jira_connected` etc. once the backend
  // is wired up.
  const [jiraConnected, setJiraConnected] = useState(false)
  const [trelloConnected, setTrelloConnected] = useState(false)
  const [busyKey, setBusyKey] = useState(null)

  const handleConnect = (id) => {
    // TODO (real integration): start OAuth flow.
    //   Jira: window.location.href = (await authAPI.getJiraAuthUrl()).data.auth_url
    //   Trello: same pattern — both use a `state` ticket in the session for CSRF,
    //   then redirect back to a backend callback that exchanges the code for tokens.
    //   The callback then redirects the browser to FRONTEND_URL/welcome?jira=connected
    //   (mirrors the existing Google Drive flow — see CLAUDE.md).
    setBusyKey(id)
    setTimeout(() => {
      window.alert(
        `${id === 'jira' ? 'Jira' : 'Trello'} connect flow is not wired up yet. ` +
          `This is design-only. The real OAuth flow will be added later.`,
      )
      setBusyKey(null)
    }, 300)
  }

  const handleDisconnect = (id) => {
    // TODO (real integration): call authAPI.disconnectJira() / disconnectTrello(),
    // then refetch the user so the card state updates.
    if (!window.confirm(`Disconnect ${id === 'jira' ? 'Jira' : 'Trello'}?`)) return
    setBusyKey(id)
    setTimeout(() => {
      if (id === 'jira') setJiraConnected(false)
      else setTrelloConnected(false)
      setBusyKey(null)
    }, 300)
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>Project Management Integrations</h2>
        <p>
          Connect your team's project management tools to push generated
          project plans, tasks, and PRDs directly into your existing
          workflow. PM OS only writes to the workspaces you explicitly
          authorize.
        </p>
      </div>

      <div className={styles.grid}>
        {INTEGRATIONS.map((cfg) => (
          <IntegrationCard
            key={cfg.id}
            config={cfg}
            connected={
              cfg.id === 'jira' ? jiraConnected : trelloConnected
            }
            busy={busyKey === cfg.id}
            onConnect={() => handleConnect(cfg.id)}
            onDisconnect={() => handleDisconnect(cfg.id)}
          />
        ))}
      </div>
    </section>
  )
}

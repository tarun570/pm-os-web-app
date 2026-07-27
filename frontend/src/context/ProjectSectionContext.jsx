import { createContext, useContext } from 'react'

/**
 * ProjectSectionContext — exposes the currently-open project + active
 * section to any descendant that needs to know "which project is open
 * and which subsection is the user looking at".
 *
 * Set by `ProjectPage` (the route view for `/projects/:uploadId/...`).
 * Read by `ChatPanel` so the chat's greeting + follow-up chips are
 * scoped to the active section.
 *
 * Shape: { uploadId: number | null, section: 'overview' | 'meetings' | 'sprint' | null }
 *
 *   - uploadId is null when no project is open (user is on /projects
 *     or another top-level route) — the chat then runs in global FAQ mode.
 *   - section is null when no project is open, or while the route is
 *     still resolving. Inside a project route it's always one of the
 *     three section ids.
 */
export const ProjectSectionContext = createContext({
  uploadId: null,
  section: null,
})

export const useProjectSection = () => useContext(ProjectSectionContext)

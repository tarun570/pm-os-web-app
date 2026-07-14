import { useState, useRef, useEffect, useCallback } from 'react'
import { fileAPI } from '../api/auth'

/**
 * Shared logic for the Jira / Trello export buttons.
 *
 * Replaces the polling-based async flow (export -> wait for csv_callback ->
 * download) with a one-shot sync flow: backend returns the CSV's
 * download_url inline, we open it in the browser, the file downloads.
 *
 * Cache behavior:
 *   - If the upload row already has a `csv_<type>_url` (from a prior
 *     successful export), opening it on the next click is instant — no
 *     n8n call, no API call, no waiting.
 *   - Otherwise we POST to /export_<type>/, which the backend answers
 *     synchronously with { download_url, status: 'ready' }. We open
 *     that URL.
 *
 * The hook also tracks `exportingType` (string | null) for button
 * spinners, and exposes a `handleCancel` that's still wired to
 * fileAPI.cancelExport — kept for parity with the previous UX even
 * though there's nothing meaningful to cancel in the sync flow.
 *
 * Params:
 *   - uploadId: number
 *   - upload: the FileUpload object (must have csv_<type>_url /
 *     csv_<type>_status fields)
 *   - onUpdated: async fn to refresh the upload row after a successful
 *     export. Called once after the API call returns. The caller passes
 *     the parent's refresh fn (onRefresh in FileHistory, refreshUpload
 *     in ProjectDetailPage, loadOnce in ProjectsPage).
 */
export default function useCsvExport(uploadId, upload, onUpdated) {
  const [exportingType, setExportingType] = useState(null)
  // Tracks whether a request is currently in flight. The exportJira /
  // exportTrello endpoints are synchronous from the user's POV but the
  // n8n round-trip can take 1-3s, so we show a spinner during that
  // window to prevent double-clicks re-running n8n.
  const inFlightRef = useRef(false)

  // Reset exportingType if the upload disappears (component remounts
  // on a different row, etc.).
  useEffect(() => {
    return () => {
      inFlightRef.current = false
    }
  }, [uploadId])

  // Open a URL in the browser. Hidden <a download> is preferred so the
  // file just lands in the user's Downloads folder with no new tab. If
  // that path is blocked (some pop-up blockers), fall back to
  // window.open. We don't actually need the fallback for `download`
  // attribute triggers, but having both options covers edge cases where
  // the server serves a Content-Disposition the browser won't honor
  // automatically.
  const openUrl = (url) => {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener noreferrer'
    // `download` is left unset so the server's Content-Disposition
    // (or the URL's filename) is used. For Drive download URLs the
    // filename is taken from the id parameter.
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleExport = useCallback(async (csvType) => {
    if (!upload) return

    const statusKey = `csv_${csvType}_status`
    const urlKey = `csv_${csvType}_url`

    // Step 1: cache hit. The row already has a URL — open it directly.
    // No API call, no n8n call. This is the path most repeat clicks
    // will take.
    const cachedUrl = upload[urlKey]
    if (cachedUrl && upload[statusKey] === 'ready') {
      openUrl(cachedUrl)
      return
    }

    // Step 2: prevent double-clicks. n8n round-trip is 1-3s, so a
    // second click during that window would re-trigger an export.
    if (inFlightRef.current) return
    inFlightRef.current = true
    setExportingType(csvType)

    try {
      const res = csvType === 'jira'
        ? await fileAPI.exportJira(uploadId)
        : await fileAPI.exportTrello(uploadId)

      // Backend returns 200 with { download_url, status: 'ready' }.
      // Open the URL and refresh the parent list so the new url is
      // cached for next time.
      const data = res?.data ?? {}
      if (data.download_url) {
        openUrl(data.download_url)
        try { await onUpdated?.() } catch { /* ignore */ }
      } else {
        // Server said OK but no URL — shouldn't happen (the backend
        // returns 502 in this case), but guard against it.
        alert('Export failed: server did not return a download link. Check backend log.')
      }
    } catch (err) {
      console.error(`Failed to start ${csvType} export:`, err)
      const detail = err?.response?.data?.error || err.message
      alert(`Failed to start ${csvType} export: ${detail}`)
      try { await onUpdated?.() } catch { /* ignore */ }
    } finally {
      inFlightRef.current = false
      setExportingType(null)
    }
  }, [uploadId, upload, onUpdated])

  // handleCancel is preserved for the cancel button in the UI. In the
  // new sync flow there's nothing to cancel once the request is in
  // flight, but if a user clicks Cancel before the request returns we
  // mark the in-flight as cancelled. The next handleExport call will
  // be allowed through. (The actual n8n work — if it's already started
  // — can't be stopped, but the user-visible spinner goes away.)
  const handleCancel = useCallback(async (csvType) => {
    inFlightRef.current = false
    setExportingType(null)
    try {
      await fileAPI.cancelExport(uploadId, csvType)
    } catch (err) {
      console.error(`Failed to cancel ${csvType} export:`, err)
      const detail = err?.response?.data?.error || err.message
      alert(`Failed to cancel ${csvType} export: ${detail}`)
    }
    try { await onUpdated?.() } catch { /* ignore */ }
  }, [uploadId, onUpdated])

  return { handleExport, handleCancel, exportingType }
}

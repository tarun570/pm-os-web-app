import React from 'react'
import { Download, Loader2, AlertCircle, XCircle } from 'lucide-react'
import './ExportButtons.css'

/**
 * Renders the Jira + Trello export buttons, each in one of three visual
 * states (ready / processing / failed), with an inline Cancel button
 * while a request is in flight.
 *
 * Props:
 *   - upload: the FileUpload object (must have csv_<type>_url /
 *     csv_<type>_status / csv_<type>_error fields)
 *   - onExport(csvType): called when the user clicks an export button
 *   - onCancel(csvType): called when the user clicks the inline Cancel
 *   - exportingType: 'jira' | 'trello' | null — which button should
 *     show a spinner. Driven by useCsvExport's exportingType state.
 *   - className: optional extra class for the outer row container, so
 *     the parent page can place the row in its own layout (e.g. with
 *     margin-top matching the surrounding section).
 *
 * Visual states:
 *   - ready:    green-ish download icon, label "Download Jira/Trello CSV"
 *   - processing: spinner icon, label "Exporting…"
 *   - failed:   red alert icon, label "Retry Jira/Trello export"
 *   - default:  no icon, label "Export to Jira/Trello"
 *
 * The styles here are inline so the component is self-contained and
 * doesn't depend on the parent page's CSS module. The colors match
 * what FileHistory.module.css was using (.exportBtn, .exportBtnError,
 * .exportBtnCancel) so the look is consistent across all three call
 * sites.
 */
export default function ExportButtons({ upload, onExport, onCancel, exportingType, className = '' }) {
  const renderOne = (csvType) => {
    const status = upload[`csv_${csvType}_status`]
    const error = upload[`csv_${csvType}_error`]
    const isReady = status === 'ready'
    const isProcessing = status === 'processing' || exportingType === csvType
    const isFailed = status === 'failed'

    // Visual variant. Default uses the primary pink (#e8365d); failed
    // uses red (#ef4444). Background is white, border matches the
    // text. Hover lightens the background slightly. The styles mirror
    // .exportBtn / .exportBtnError in FileHistory.module.css so the
    // existing look is preserved across the dashboard.
    const variant = isFailed
      ? { border: '1px solid #ef4444', color: '#ef4444' }
      : { border: '1px solid #e8365d', color: '#e8365d' }
    const baseStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      borderRadius: '6px',
      background: 'white',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
      ...variant,
    }
    // Apply hover background via onMouseEnter/Leave so we don't need
    // a stylesheet. Cheaper than carrying a CSS module around.
    const hoverBg = isFailed ? '#fef2f2' : '#fff0f3'
    const [hover, setHover] = React.useState(false)
    const finalStyle = {
      ...baseStyle,
      ...(hover && !isProcessing ? { background: hoverBg } : {}),
      ...(isProcessing ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
    }

    const label = isReady
      ? `Download ${csvType === 'jira' ? 'Jira' : 'Trello'} CSV`
      : isProcessing
      ? 'Exporting…'
      : isFailed
      ? `Retry ${csvType === 'jira' ? 'Jira' : 'Trello'} export`
      : `Export to ${csvType === 'jira' ? 'Jira' : 'Trello'}`

    let Icon = null
    if (isProcessing) Icon = Loader2
    else if (isReady) Icon = Download
    else if (isFailed) Icon = AlertCircle

    return (
      <button
        key={csvType}
        type="button"
        style={finalStyle}
        onClick={() => onExport?.(csvType)}
        disabled={isProcessing}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={isFailed ? (error || 'Export failed') : undefined}
      >
        {Icon ? (
          <Icon
            size={14}
            style={
              isProcessing
                ? { animation: 'exportBtnSpin 0.9s linear infinite' }
                : undefined
            }
          />
        ) : null}
        {label}
      </button>
    )
  }

  const renderCancel = (csvType) => {
    const status = upload[`csv_${csvType}_status`]
    if (status !== 'processing') return null
    // Cancel uses the neutral grey (#6b7280) variant, matching the
    // previous .exportBtnCancel style in FileHistory.module.css.
    const style = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 14px',
      borderRadius: '6px',
      border: '1px solid #6b7280',
      color: '#6b7280',
      background: 'white',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
    }
    return (
      <button
        key={`${csvType}-cancel`}
        type="button"
        style={style}
        onClick={() => onCancel?.(csvType)}
        title="Stop the export"
      >
        <XCircle size={14} />
        Cancel
      </button>
    )
  }

  return (
    <div
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap' }}
    >
      {renderOne('jira')}
      {renderCancel('jira')}
      {renderOne('trello')}
      {renderCancel('trello')}
    </div>
  )
}



import React, { useState,useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fileAPI } from '../api/auth'
import { UploadCloud, AlertTriangle, Loader2 } from 'lucide-react'
import styles from './FileUpload.module.css'

export default function FileUpload({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      validateAndSetFile(file)
    }
  }

  const handleFileSelect = (e) => {
    const files = e.target.files
    if (files.length > 0) {
      const file = files[0]
      validateAndSetFile(file)
    }
  }

  const validateAndSetFile = (file) => {
    setError('')

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      setError('File size exceeds 100MB limit')
      return
    }

    // Check file type — n8n backend only accepts PDF SOWs.
    const allowedTypes = ['application/pdf']
    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF files are allowed')
      return
    }

    // Belt-and-suspenders: some browsers report an empty `type` for drags.
    // Fall back to the extension check so a .docx/.txt dropped in still
    // gets rejected even if file.type slips through.
    const fileName = (file.name || '').toLowerCase()
    if (!fileName.endsWith('.pdf')) {
      setError('Only PDF files are allowed')
      return
    }

    setSelectedFile(file)
    // Auto-start the upload as soon as a valid file is chosen
    handleUpload(file)
  }

  const handleUpload = async (fileToUpload) => {
    const file = fileToUpload || selectedFile
    if (!file) {
      setError('Please select a file')
      return
    }

    setIsUploading(true)
    setError('')

    try {
      const response = await fileAPI.uploadFile(file)

      if (response.status === 201 || response.status === 202) {
        const initialUpload = response.data.upload
        setError('')

        // Notify parent with the freshly-uploaded row so it can prepend
        // the card immediately (no waiting for the next list fetch).
        if (onUploadSuccess) {
          onUploadSuccess(initialUpload)
        }

        // Reset the file input now that the upload is accepted.
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        const fileInput = document.getElementById('file-input')
        if (fileInput) {
          fileInput.value = ''
        }

        // Redirect to the Projects page so the user sees their new
        // upload as a card with a live status badge (Processing →
        // Completed). The Projects page already polls any 'processing'
        // rows it sees, so the badge will update without any extra
        // work on this side. We pass `state.fromUpload` so the
        // Projects page can optionally scroll the new card into view.
        navigate('/projects', { state: { fromUpload: true, uploadId: initialUpload.id } })
        return
      }
    } catch (err) {
      const backendError = err.response?.data?.error
      const backendCode = err.response?.data?.code
      const backendDetails = err.response?.data?.details
      let errorMessage = backendError || 'Upload failed. Please try again.'

      // Friendly message when the user hasn't connected their Google Drive.
      if (backendCode === 'gdrive_not_connected') {
        setError(
          (backendError || 'Please connect your Google Drive to save outputs.') +
          ' Click "Connect Google Drive" above to grant access.'
        )
        console.error('Upload error (gdrive_not_connected):', err)
        return
      }

      if (backendCode === 'gdrive_error') {
        setError(
          (backendError || 'Google Drive connection error.') +
          ' Try reconnecting your Google Drive.'
        )
        console.error('Upload error (gdrive_error):', err)
        return
      }

      if (backendDetails) {
        if (typeof backendDetails === 'string') {
          try {
            const parsed = JSON.parse(backendDetails)
            if (parsed?.message) {
              errorMessage = parsed.message
            } else {
              errorMessage = backendDetails
            }
          } catch {
            errorMessage = backendDetails
          }
        } else if (typeof backendDetails === 'object' && backendDetails.message) {
          errorMessage = backendDetails.message
        } else {
          errorMessage = typeof backendDetails === 'string'
            ? backendDetails
            : JSON.stringify(backendDetails)
        }
      }

      setError(errorMessage)
      console.error('Upload error:', err)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={styles.container}>
      <div 
        className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={styles.content}>
          <div className={styles.icon}>
            <UploadCloud size={30} strokeWidth={1} />
          </div>
          <h3>Upload Your SOW</h3>
          <p>Drag and drop your file here or click to browse</p>
          <p className={styles.fileTypes}>Supported: PDF only (Max 100MB)</p>
        </div>

        <input
        ref={fileInputRef}
          id="file-input"
          type="file"
          onChange={handleFileSelect}
          accept="application/pdf,.pdf"
          className={styles.fileInput}
        />
      </div>

      {selectedFile && (
        <div className={styles.selectedFile}>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{selectedFile.name}</span>
            <span className={styles.fileSize}>
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.clearBtn}
              onClick={() => {
                setSelectedFile(null)
                setError('')
                const fileInput = document.getElementById('file-input')
                if (fileInput) fileInput.value = ''
              }}
              disabled={isUploading}
            >
              Clear
            </button>

            {isUploading && (
              <div className={styles.uploadingStatus}>
                <Loader2 size={36} className={styles.spin} /> Uploading...
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <div className={styles.errorHeader}>
            <AlertTriangle size={16} className={styles.errorIcon} />
            <strong>Upload failed</strong>
          </div>
          <div className={styles.errorBody}>{error}</div>
        </div>
      )}
    </div>
  )
}

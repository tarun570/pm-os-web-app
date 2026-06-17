import React, { useState,useRef } from 'react'
import { fileAPI } from '../api/auth'
import styles from './FileUpload.module.css'

export default function FileUpload({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const fileInputRef = useRef(null)

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

    // Check file type
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!allowedTypes.includes(file.type)) {
      setError('Only PDF, DOCX, and TXT files are allowed')
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file')
      return
    }

    setIsUploading(true)
    setError('')

    try {
      const response = await fileAPI.uploadFile(selectedFile)
      
      if (response.status === 201) {
        const initialUpload = response.data.upload
        setError('')

        // Poll the upload until it is no longer processing (or times out)
        const pollUploadStatus = async (uploadId, attempts = 0) => {
          try {
            const res = await fileAPI.getUpload(uploadId)
            const latest = res.data

            // If status changed, notify parent with latest object
            if (latest.status && latest.status !== 'processing') {
              onUploadSuccess(latest)
              return latest
            }

            // stop after ~40s (20 attempts * 2s)
            if (attempts >= 20) {
              onUploadSuccess(latest) // give the latest we have
              return latest
            }

            await new Promise((r) => setTimeout(r, 2000))
            return pollUploadStatus(uploadId, attempts + 1)
          } catch (e) {
            // On error, still call parent with initial upload so it appears in the list
            onUploadSuccess(initialUpload)
            return initialUpload
          }
        }

        // start polling in background
        pollUploadStatus(initialUpload.id)

        // clear selection and reset input immediately
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        const fileInput = document.getElementById('file-input')
        if (fileInput) {
          fileInput.value = ''
        }
      }
    } catch (err) {
      const backendError = err.response?.data?.error
      const backendDetails = err.response?.data?.details
      let errorMessage = backendError || 'Upload failed. Please try again.'

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
          <div className={styles.icon}>📄</div>
          <h3>Upload Your SOW</h3>
          <p>Drag and drop your file here or click to browse</p>
          <p className={styles.fileTypes}>Supported: PDF, DOCX, TXT (Max 100MB)</p>
        </div>

        <input
        ref={fileInputRef} 
          id="file-input"
          type="file"
          onChange={handleFileSelect}
          accept=".pdf,.docx,.txt"
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
                const fileInput = document.getElementById('file-input')
                if (fileInput) fileInput.value = ''
              }}
              disabled={isUploading}
            >
              Clear
            </button>
            
            <button
              className={`${styles.uploadBtn} gradient-button`}
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? '⏳ Uploading...' : '→ Upload & Process'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <div className={styles.errorHeader}>
            <span className={styles.errorIcon}>⚠️</span>
            <strong>Upload failed</strong>
          </div>
          <div className={styles.errorBody}>{error}</div>
        </div>
      )}
    </div>
  )
}

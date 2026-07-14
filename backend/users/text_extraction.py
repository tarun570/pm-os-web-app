"""
SOW text extraction helpers.

`extract_text(file_path, file_type)` returns the plain-text content of an
uploaded Statement of Work (SOW) for indexing / search / preview purposes.

Supported types:
- pdf   — via pypdf
- docx  — via python-docx (paragraphs only; tables and images are skipped)
- txt   — read as UTF-8, ignore errors on bad encoding

Returns '' for unsupported / empty / unreadable files. Callers should treat
an empty string as "no text available" rather than an error.
"""
from __future__ import annotations


def extract_text(file_path: str, file_type: str) -> str:
    """Pull plain text out of a SOW file. Best-effort: never raises."""
    if not file_path:
        return ''

    file_type = (file_type or '').lower().strip().lstrip('.')

    try:
        if file_type == 'pdf':
            return _extract_pdf(file_path)
        if file_type == 'docx':
            return _extract_docx(file_path)
        if file_type == 'txt':
            return _extract_txt(file_path)
    except Exception as exc:
        # Swallow extraction errors — the file is still on disk and the
        # n8n pipeline is unaffected. We log via the caller.
        print(f"[text_extraction] failed for {file_path} ({file_type}): {exc}")
        return ''

    return ''


def _extract_pdf(file_path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    chunks = []
    for page in reader.pages:
        try:
            chunks.append(page.extract_text() or '')
        except Exception:
            # One bad page shouldn't kill the whole extraction
            chunks.append('')
    return '\n\n'.join(chunks).strip()


def _extract_docx(file_path: str) -> str:
    from docx import Document
    doc = Document(file_path)
    return '\n'.join(p.text for p in doc.paragraphs).strip()


def _extract_txt(file_path: str) -> str:
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read().strip()

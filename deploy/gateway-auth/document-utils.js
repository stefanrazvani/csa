import path from 'node:path';

export const MAX_DOCUMENT_BYTES = 250 * 1024 * 1024;
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_MIME = 'application/pdf';

export function safeOriginalName(value) {
  return path.basename(String(value || 'document'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._() -]/gu, '_')
    .slice(0, 180) || 'document';
}

export function detectDocumentType(header, mimeType, originalName) {
  const bytes = Buffer.from(header || []);
  const mime = String(mimeType || '').toLowerCase();
  const extension = path.extname(String(originalName || '')).toLowerCase();
  const pdfMagic = bytes.length >= 5 && bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
  const zipMagic = bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (mime === PDF_MIME && extension === '.pdf' && pdfMagic) return { type: 'pdf', extension: '.pdf', mimeType: PDF_MIME };
  if (mime === DOCX_MIME && extension === '.docx' && zipMagic) return { type: 'docx', extension: '.docx', mimeType: DOCX_MIME };
  throw new Error('Sunt acceptate numai fișiere DOCX sau PDF cu MIME, extensie și semnătură valide.');
}

export function cleanIdentifier(value, max = 120) {
  const result = String(value || '').trim();
  return /^[A-Za-z0-9_-]+$/.test(result) && result.length <= max ? result : '';
}

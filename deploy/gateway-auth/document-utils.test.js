import assert from 'node:assert/strict';
import test from 'node:test';
import { DOCX_MIME, PDF_MIME, cleanIdentifier, detectDocumentType, safeOriginalName } from './document-utils.js';

test('acceptă numai PDF cu MIME, extensie și magic corelate', () => {
  assert.equal(detectDocumentType(Buffer.from('%PDF-1.7'), PDF_MIME, 'carte.pdf').type, 'pdf');
  assert.throws(() => detectDocumentType(Buffer.from('%PDF-1.7'), PDF_MIME, 'carte.docx'));
  assert.throws(() => detectDocumentType(Buffer.from('not-pdf'), PDF_MIME, 'carte.pdf'));
});

test('acceptă DOCX ca arhivă ZIP și respinge MIME fals', () => {
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
  assert.equal(detectDocumentType(zip, DOCX_MIME, 'carte.docx').type, 'docx');
  assert.throws(() => detectDocumentType(zip, PDF_MIME, 'carte.pdf'));
});

test('curăță numele și identificatorii', () => {
  assert.equal(safeOriginalName('../../Capitol: 1.pdf'), 'Capitol_ 1.pdf');
  assert.equal(cleanIdentifier('abc_123-X'), 'abc_123-X');
  assert.equal(cleanIdentifier('../abc'), '');
});

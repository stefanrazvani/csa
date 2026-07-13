import crypto from 'node:crypto';
import { Random } from 'meteor/random';

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sentenceParts(text, language) {
  if (typeof Intl?.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(language || 'ro', { granularity: 'sentence' });
    return [...segmenter.segment(text)].map((entry) => entry.segment.trim()).filter(Boolean);
  }
  return text.split(/(?<=[.!?…])\s+(?=[A-ZĂÂÎȘȚ0-9])/u).map((entry) => entry.trim()).filter(Boolean);
}

export function segmentDirectText({ eId, workId, versionId, content, language = 'ro', minGrade = 1, actor }) {
  const clean = String(content || '').replace(/\r\n?/g, '\n').trim();
  const blocks = clean.split(/\n{2,}/).map((entry) => entry.trim()).filter(Boolean);
  const nodes = [];
  let parentId = null;
  let chapterOrder = 0;
  let paragraphOrder = 0;

  for (const block of blocks) {
    const heading = block.match(/^(#{1,3})\s+(.+)$/s);
    if (heading) {
      chapterOrder += 1;
      paragraphOrder = 0;
      parentId = Random.id();
      const text = heading[2].trim();
      nodes.push({
        _id: parentId, eId, workId, versionId, parentId: null, type: heading[1].length === 1 ? 'chapter' : 'section',
        order: chapterOrder, text, contentHash: hash(text), minGrade, status: 'draft', createdAt: new Date(), createdBy: actor,
      });
      continue;
    }

    paragraphOrder += 1;
    const paragraphId = Random.id();
    const paragraphText = block.replace(/\n+/g, ' ').trim();
    nodes.push({
      _id: paragraphId, eId, workId, versionId, parentId, type: 'paragraph', order: paragraphOrder,
      text: paragraphText, contentHash: hash(paragraphText), minGrade, status: 'draft', createdAt: new Date(), createdBy: actor,
    });
    sentenceParts(paragraphText, language).forEach((sentence, index) => {
      nodes.push({
        _id: Random.id(), eId, workId, versionId, parentId: paragraphId, type: 'sentence', order: index + 1,
        text: sentence, contentHash: hash(sentence), minGrade, status: 'draft', createdAt: new Date(), createdBy: actor,
      });
    });
  }
  return { nodes, sourceHash: hash(clean), characterCount: clean.length };
}

import { createHash } from 'node:crypto';

export function projectionKey(eId, sourceId) {
  return createHash('sha256').update(`${eId}:${sourceId}`).digest('hex').slice(0, 40);
}

export function tenantIndexName(eId) {
  const tenant = String(eId || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!tenant) throw new Error('Invalid tenant for OpenSearch index');
  return `csa-text-${tenant}`.slice(0, 255);
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

export function openSearchDocument(work, node) {
  return {
    eId: node.eId,
    workId: node.workId,
    versionId: node.versionId,
    nodeId: node._id,
    type: node.type,
    minGrade: Number(node.minGrade || work.minGrade || 1),
    title: String(work.title || ''),
    text: String(node.text || ''),
    page: node.page ?? null,
    updatedAt: isoDate(node.updatedAt || node.publishedAt),
  };
}

export function bulkPayload(indexName, work, nodes) {
  const lines = [];
  for (const node of nodes) {
    lines.push(JSON.stringify({ index: { _index: indexName, _id: String(node._id) } }));
    lines.push(JSON.stringify(openSearchDocument(work, node)));
  }
  return `${lines.join('\n')}\n`;
}

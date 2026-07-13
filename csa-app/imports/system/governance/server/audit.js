import { AuditEvents } from '/imports/api/collections.js';
import { Random } from 'meteor/random';

const SENSITIVE_KEYS = /password|secret|token|authorization|cookie|privatepath/i;

function auditMetadata(value, depth = 0) {
  if (depth > 4 || value === undefined) return undefined;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => auditMetadata(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 1000);
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    result[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : auditMetadata(item, depth + 1);
  }
  return result;
}

/**
 * Scrie un eveniment append-only. `context` poate fi contextul unei metode sau
 * publicații Meteor și este folosit numai pentru metadate de transport sigure.
 */
export async function writeAuditEvent({
  actorId = 'system',
  eId = '',
  action,
  entityType = '',
  entityId = '',
  outcome = 'success',
  crossTenant = false,
  activeEId = '',
  metadata = {},
  context = null,
  requestId = '',
  at = new Date(),
}) {
  const safeAction = String(action || '').trim().slice(0, 160);
  if (!safeAction) throw new Error('Audit action is required.');
  const headers = context?.connection?.httpHeaders || {};
  return AuditEvents.insertAsync({
    actorId: String(actorId || 'system').slice(0, 120),
    eId: String(eId || '').slice(0, 120),
    activeEId: String(activeEId || '').slice(0, 120),
    action: safeAction,
    entityType: String(entityType || '').slice(0, 120),
    entityId: String(entityId || '').slice(0, 160),
    outcome: ['success', 'denied', 'failed'].includes(outcome) ? outcome : 'success',
    crossTenant: Boolean(crossTenant),
    requestId: String(requestId || Random.id(24)).slice(0, 160),
    metadata: auditMetadata(metadata) || {},
    source: {
      connectionId: String(context?.connection?.id || '').slice(0, 160),
      ip: String(context?.connection?.clientAddress || '').slice(0, 80),
      userAgent: String(headers['user-agent'] || '').slice(0, 500),
    },
    at: at instanceof Date ? at : new Date(at),
  });
}

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { AuditEvents } from '/imports/api/collections.js';
import { requireCompositeAccess } from '/imports/lib/access/server.js';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

Meteor.methods({
  async 'audit.history'(filters = {}) {
    check(filters, Object);
    const access = await requireCompositeAccess(this, { alias: 'audit', action: 'read', officeCodes: ['secretary', 'venerable'], allowTenantAdmin: true });
    const selector = { eId: access.eId, $or: [{ minGrade: { $exists: false } }, { minGrade: { $lte: access.superAdmin ? 3 : access.grade } }] };
    if (filters.includeAccess !== true) { selector.entityType = { $ne: 'module' }; selector.action = { $not: /\.read$/ }; }
    if (filters.actor) {
      check(filters.actor, String);
      const value = filters.actor.trim().slice(0, 100);
      const expression = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await Meteor.users.find({ [`entitati.${access.eId}`]: { $exists: true }, $or: [{ 'profile.name': expression }, { 'profile.nume': expression }, { 'emails.address': expression }] }, { fields: { _id: 1 }, limit: 100 }).fetchAsync();
      selector.$and = [{ $or: [{ actorLabel: expression }, { actorId: expression }, { actorId: { $in: users.map(user => user._id) } }] }];
    }
    for (const field of ['actorId', 'entityType', 'entityId', 'action']) {
      if (filters[field]) { check(filters[field], String); selector[field] = filters[field].slice(0, 160); }
    }
    const aliases = { convocatoare: ['convocatoare', 'convocator'], prezenta_confirmari: ['prezenta_confirmari', 'confirmation', 'presence'], brother_dossiers: ['brother_dossiers', 'brother_dossier'], office_terms: ['office_terms', 'office_term'], library_works: ['library_works', 'library_work'] };
    if (aliases[filters.entityType]) selector.entityType = { $in: aliases[filters.entityType] };
    if (filters.from || filters.to) {
      selector.at = {};
      for (const [field, operator] of [['from', '$gte'], ['to', '$lte']]) {
        if (filters[field]) { const date = new Date(filters[field]); if (Number.isNaN(+date)) throw new Meteor.Error('invalid-date', 'Dată invalidă.'); selector.at[operator] = date; }
      }
    }
    const page = Math.max(0, Math.min(10000, Number(filters.page) || 0));
    const rows = await AuditEvents.find(selector, { sort: { at: -1, _id: -1 }, skip: Math.floor(page) * 50, limit: 51, fields: { source: 0 } }).fetchAsync();
    const actors = await Meteor.users.find({ _id: { $in: [...new Set(rows.map(row => row.actorId))] } }, { fields: { profile: 1, emails: 1 } }).fetchAsync();
    const names = new Map(actors.map(user => [user._id, user.profile?.name || user.profile?.nume || user.emails?.[0]?.address || user._id]));
    return { rows: rows.slice(0, 50).map(row => ({ ...row, actorLabel: row.actorLabel || names.get(row.actorId) || row.actorId })), hasMore: rows.length > 50 };
  },
});
DDPRateLimiter.addRule({ name: 'audit.history', userId: () => true }, 30, 60000);

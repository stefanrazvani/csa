import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import { Entitati, Module } from '/imports/api/collections.js';
import './indexes.js';
import './methods.js';
import './publications.js';

Meteor.startup(async () => {
  for (const alias of ['treasury', 'hospitality', 'secretariat']) {
    for (const action of ['read', 'write', 'delete', 'admin']) await Roles.createRoleAsync(`${alias}_${action}`, { unlessExists: true });
  }
  const tenants = await Entitati.find({ status: { $ne: 'inactive' } }, { fields: { _id: 1 } }).fetchAsync();
  for (const tenant of tenants) {
    for (const [alias, name] of [['treasury', 'Metale'], ['hospitality', 'Ospitalier'], ['secretariat', 'Secretariat']]) {
      await Module.upsertAsync({ eId: tenant._id, alias }, { $setOnInsert: { eId: tenant._id, alias, nume: name, status: 'active', createdAt: new Date(), createdBy: 'system' } });
    }
  }
});

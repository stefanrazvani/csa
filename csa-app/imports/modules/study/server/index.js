import { Meteor } from 'meteor/meteor';
import { Roles } from 'meteor/roles';
import { Entitati, Module } from '/imports/api/collections.js';
import './indexes.js';
import './methods.js';
import './publications.js';

Meteor.startup(async () => {
  for (const alias of ['library', 'study']) {
    for (const action of ['read', 'write', 'delete', 'admin', ...(alias === 'study' ? ['moderate'] : [])]) await Roles.createRoleAsync(`${alias}_${action}`, { unlessExists: true });
  }
  const tenantIds = await Entitati.find({ status: { $ne: 'inactive' } }, { fields: { _id: 1 } }).fetchAsync();
  for (const tenant of tenantIds) {
    for (const [alias, nume] of [['library', 'Bibliotecă'], ['study', 'Studiu și concepte']]) {
      await Module.upsertAsync({ eId: tenant._id, alias }, { $setOnInsert: { eId: tenant._id, alias, nume, status: 'active', createdAt: new Date(), createdBy: 'system' } });
    }
  }
});

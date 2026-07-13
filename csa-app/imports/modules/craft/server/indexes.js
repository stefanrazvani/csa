import { Meteor } from 'meteor/meteor';
import {
  CraftMemberships,
  Convocatoare,
  Documente,
  DocumenteText,
  Prezenta,
  PrezentaConfirmari,
} from '/imports/api/collections.js';

Meteor.startup(async () => {
  const specs = [
    [CraftMemberships, { eId: 1, userId: 1 }, { unique: true }],
    [CraftMemberships, { eId: 1, status: 1, grade: 1 }],
    [Convocatoare, { eId: 1, sys_status: 1, dataTinuta: -1 }],
    [DocumenteText, { eId: 1, documentId: 1, level: 1, sys_status: 1, order: 1 }],
    [Prezenta, { eId: 1, convocatorId: 1 }, { unique: true, sparse: true }],
    [PrezentaConfirmari, { eId: 1, convocatorId: 1, userId: 1 }, { unique: true, sparse: true }],
    [PrezentaConfirmari, { publicTokenHash: 1 }, { unique: true, sparse: true }],
    [Documente, { eId: 1, moduleAlias: 1, objectId: 1, sys_status: 1 }],
    [Documente, { sourceDocumentId: 1 }, { unique: true, sparse: true }],
  ];
  for (const [collection, keys, options = {}] of specs) {
    try {
      await collection.rawCollection().createIndex(keys, options);
    } catch (error) {
      console.error(`[indexes] ${collection._name}:`, error?.message || error);
    }
  }
});


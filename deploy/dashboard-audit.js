const target = db.getSiblingDB('csa');
const collections = ['convocatoare', 'documente_text', 'prezenta', 'prezenta_confirmari', 'documente', 'craft_memberships', 'module'];

for (const name of collections) {
  const collection = target.getCollection(name);
  const sample = collection.findOne({}, { projection: { services: 0 } });
  print(JSON.stringify({ collection: name, count: collection.countDocuments({}), fields: sample ? Object.keys(sample).sort() : [] }));
}

print(JSON.stringify({
  convocatoareByStatus: target.convocatoare.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
  articlesByLevel: target.documente_text.aggregate([{ $group: { _id: '$level', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
  datedConvocatoare: target.convocatoare.countDocuments({ dataTinuta: { $type: 'date' } }),
  confirmationsWithUser: target.prezenta_confirmari.countDocuments({ userId: { $type: 'string' } }),
  activeMemberships: target.craft_memberships.countDocuments({ status: 'active' }),
  confirmationStatuses: target.prezenta_confirmari.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray(),
}));
print(JSON.stringify({ modules: target.module.find({}, { _id: 0, alias: 1, nume: 1, status: 1 }).sort({ alias: 1 }).toArray() }));

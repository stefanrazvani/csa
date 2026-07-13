const email = process.env.CSA_TEST_EMAIL;
const user = db.getSiblingDB('csa').users.findOne(
  { 'emails.address': email },
  { setari: 1, registration: 1, entitati: 1 },
);

print(JSON.stringify({
  found: Boolean(user),
  id: user?._id,
  status: user?.setari?.status,
  registration: user?.registration?.status,
  tenantActive: Object.entries(user?.entitati || {})
    .filter(([key]) => key !== 'all')
    .map(([key, value]) => ({ tenant: key, active: value?.activ })),
}));

if (process.env.CSA_TEST_CONVOCATOR_NAME) {
  const pattern = new RegExp(`^${process.env.CSA_TEST_CONVOCATOR_NAME}`);
  const rows = db.getSiblingDB('csa').convocatoare.find({ nume: pattern }, { _id: 1 }).toArray();
  for (const row of rows) {
    db.getSiblingDB('csa').prezenta_confirmari.deleteMany({ convocatorId: row._id });
    db.getSiblingDB('csa').prezenta.deleteMany({ convocatorId: row._id });
    db.getSiblingDB('csa').documente_text.deleteMany({ documentId: row._id });
    db.getSiblingDB('csa').convocatoare.deleteOne({ _id: row._id });
  }
  print(JSON.stringify({ cleanedConvocatoare: rows.length }));
}

if (process.env.CSA_TEST_ACTIVATE === '1' && user) {
  const tenantId = Object.keys(user.entitati || {}).find((key) => key !== 'all');
  db.getSiblingDB('csa').users.updateOne(
    { _id: user._id, 'emails.address': email },
    { $set: { 'setari.status': '1', 'registration.status': 'active', [`entitati.${tenantId}.activ`]: 1 } },
  );
  print(JSON.stringify({ activated: true, email }));
}

if (process.env.CSA_TEST_GRADE && user) {
  const tenantId = Object.keys(user.entitati || {}).find((key) => key !== 'all');
  const grade = Number(process.env.CSA_TEST_GRADE);
  db.getSiblingDB('csa').craft_memberships.updateOne(
    { eId: tenantId, userId: user._id },
    { $set: { grade, status: 'active', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  print(JSON.stringify({ gradeConfigured: grade, email }));
}

if (process.env.CSA_TEST_CLEANUP === '1' && user) {
  db.getSiblingDB('csa').users.deleteOne({ _id: user._id, 'emails.address': email });
  db.getSiblingDB('csa').getCollection('role-assignment').deleteMany({ 'user._id': user._id });
  db.getSiblingDB('csa').gateway_sessions.deleteMany({ userId: user._id });
  db.getSiblingDB('csa').gateway_assertions.deleteMany({ userId: user._id });
  db.getSiblingDB('csa').craft_memberships.deleteMany({ userId: user._id });
  print(JSON.stringify({ cleanup: true, email }));
}

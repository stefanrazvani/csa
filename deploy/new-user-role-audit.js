const target = db.getSiblingDB('csa');
const email = 'razvan.stefan.i@gmail.com';
const user = target.users.findOne(
  { 'emails.address': email },
  { _id: 1, emails: 1, setari: 1, entitati: 1 },
);
print(JSON.stringify({
  user: user ? {
    _id: user._id,
    email: user.emails?.[0]?.address,
    status: user.setari?.status,
    name: [user.setari?.prenume, user.setari?.nume].filter(Boolean).join(' '),
    tenants: user.entitati,
  } : null,
  roleAssignments: user ? target.getCollection('role-assignment').find({ 'user._id': user._id }).toArray().map((row) => ({ id: row._id, role: row.role?._id, scope: row.scope, inheritedRoles: row.inheritedRoles })) : [],
}));

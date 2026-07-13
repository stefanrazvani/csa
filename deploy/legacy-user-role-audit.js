var target = db.getSiblingDB('meteor');
var email = 'razvan.stefan.i@gmail.com';
var user = target.users.findOne(
  { 'emails.address': email },
  { _id: 1, emails: 1, setari: 1, roles: 1, entitati: 1 }
);
var assignments = [];
if (user) {
  target.getCollection('role-assignment').find({ 'user._id': user._id }).forEach(function (row) {
    assignments.push({ role: row.role && row.role._id, scope: row.scope, inheritedRoles: row.inheritedRoles });
  });
}
print(JSON.stringify({
  user: user ? {
    _id: user._id,
    email: user.emails && user.emails[0] && user.emails[0].address,
    status: user.setari && user.setari.status,
    name: [user.setari && user.setari.prenume, user.setari && user.setari.nume].filter(Boolean).join(' '),
    roles: user.roles,
    tenantIds: Object.keys(user.entitati || {})
  } : null,
  roleAssignments: assignments
}));

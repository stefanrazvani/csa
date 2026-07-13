import { requireCompositeAccess } from '/imports/lib/access/server.js';

export async function requireAdministrationAccess(context, alias, action = 'read') {
  const offices = alias === 'treasury' ? ['treasurer'] : alias === 'hospitality' ? ['hospitalier'] : ['secretary', 'venerable'];
  return requireCompositeAccess(context, {
    alias,
    action,
    minGrade: 3,
    officeCodes: offices,
    auditAction: `${alias}.${action}`,
    auditEntityType: alias,
  });
}

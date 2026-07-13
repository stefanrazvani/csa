import { requireCompositeAccess } from '/imports/lib/access/server.js';

export async function studyContext(context, action = 'read', minGrade = 1, alias = 'library') {
  const manage = action !== 'read';
  return requireCompositeAccess(context, {
    alias: manage ? alias : '',
    action,
    minGrade,
    officeCodes: manage ? ['librarian', 'mentor'] : [],
    auditAction: manage ? `${alias}.${action}` : '',
    auditEntityType: manage ? alias : '',
  });
}

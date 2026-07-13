import { Roles } from 'meteor/roles';
import { Module, OfficeDefinitions } from '/imports/api/collections.js';

export const GOVERNANCE_MODULES = ['membership', 'degreeEvents', 'officeTerms', 'visitorInvitations', 'audit'];
const ACTIONS = ['read', 'write', 'delete', 'admin'];

export const DEFAULT_OFFICES = [
  { code: 'venerable', name: 'Venerabil', minGrade: 3, order: 10, permissions: ['membership.admin', 'degreeEvents.admin', 'officeTerms.admin', 'audit.read'] },
  { code: 'secretary', name: 'Secretar', minGrade: 3, order: 20, permissions: ['membership.admin', 'degreeEvents.write', 'officeTerms.read', 'visitorInvitations.admin', 'convocatoare.admin', 'prezenta.admin', 'documents.admin'] },
  { code: 'treasurer', name: 'Trezorier', minGrade: 3, order: 30, permissions: ['treasury.admin', 'documents.write'] },
  { code: 'hospitalier', name: 'Ospitalier', minGrade: 3, order: 40, permissions: ['hospitality.admin', 'visitorInvitations.read', 'documents.write'] },
  { code: 'librarian', name: 'Bibliotecar', minGrade: 3, order: 50, permissions: ['library.admin', 'study.admin', 'documents.write'] },
  { code: 'mentor', name: 'Mentor', minGrade: 3, order: 60, permissions: ['study.write', 'study.moderate'] },
];

export async function ensureGovernanceRoles() {
  for (const alias of GOVERNANCE_MODULES) {
    for (const action of ACTIONS) {
      await Roles.createRoleAsync(`${alias}_${action}`, { unlessExists: true });
    }
  }
}

export async function seedGovernanceTenant(eId, actorId = 'system') {
  const now = new Date();
  await ensureGovernanceRoles();
  for (const alias of GOVERNANCE_MODULES) {
    await Module.upsertAsync(
      { eId, alias },
      {
        $setOnInsert: {
          eId,
          alias,
          nume: alias,
          status: 'active',
          createdAt: now,
          createdBy: actorId,
        },
      },
    );
  }
  for (const office of DEFAULT_OFFICES) {
    const { minGrade, ...definition } = office;
    await OfficeDefinitions.upsertAsync(
      { eId, code: office.code },
      {
        $set: { minGrade },
        $setOnInsert: {
          eId,
          ...definition,
          status: 'active',
          systemDefault: true,
          createdAt: now,
          createdBy: actorId,
        },
      },
    );
  }
}

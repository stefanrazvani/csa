import { Meteor } from 'meteor/meteor';
import { LodgeMemberships } from '/imports/api/collections.js';
import { requireCompositeAccess } from '/imports/lib/access/server.js';

export async function confirmationAccess(context) {
  const access = await requireCompositeAccess(context, {});
  if (access.superAdmin) return access;
  const [user, membership] = await Promise.all([
    Meteor.users.findOneAsync(access.userId, { fields: { 'setari.status': 1 } }),
    LodgeMemberships.findOneAsync({ eId: access.eId, userId: access.userId }, { fields: { status: 1 } }),
  ]);
  if (!user || (user.setari?.status != null && String(user.setari.status) !== '1') || (membership && membership.status !== 'active')) {
    throw new Meteor.Error('forbidden', 'Contul sau apartenența nu mai este activă.');
  }
  return access;
}

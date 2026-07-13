export function platformAdminAssignmentSelector(userId) {
  return {
    $and: [
      { 'user._id': userId },
      { $or: [{ 'role._id': 'super_admin' }, { role: 'super_admin' }] },
      {
        $or: [
          { scope: 'default-grup' },
          { scope: { $type: 10 } },
        ],
      },
    ],
  };
}

export function selfDocumentVisibilityAllowed(visibility) {
  return visibility === 'member';
}

import { createHash } from 'node:crypto';

export function confirmationFields(payload = {}) {
  const result = {};
  for (const name of ['confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuStandard', 'confirmareMeniuVegetarian']) {
    if (typeof payload[name] !== 'boolean') throw new Error('Selectați participarea și meniul.');
    result[name] = payload[name];
  }
  if (!result.confirmareAgapa) result.confirmareMeniuStandard = result.confirmareMeniuVegetarian = false;
  else if (result.confirmareMeniuStandard === result.confirmareMeniuVegetarian) throw new Error('Selectați un singur meniu.');
  for (const name of ['motivAbsenta', 'motivAbsentaAgapa']) result[name] = String(payload[name] || '').trim().slice(0, 1000);
  return { ...result, confirmareFinala: 1, status: result.confirmareTinuta ? 'confirmed' : 'declined' };
}

// The bearer link grants access to exactly one response, never to the private portal.
export function registerConfirmationRoutes({ app, database, tenantId, sameOrigin, rateLimit, mailer, from }) {
  const confirmations = database.collection('prezenta_confirmari');
  async function invitation(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token) || !tenantId) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const row = await confirmations.findOne({ eId: tenantId, publicTokenHash: hash, sys_status: 1 });
    if (!row) return null;
    const [parent, user, membership, tenant] = await Promise.all([
      database.collection('convocatoare').findOne({ _id: row.convocatorId, eId: tenantId, sys_status: 1 }),
      database.collection('users').findOne({ _id: row.userId, [`entitati.${tenantId}`]: { $exists: true } }, { projection: { emails: 1, 'setari.status': 1 } }),
      database.collection('lodge_memberships').findOne({ eId: tenantId, userId: row.userId }, { projection: { status: 1 } }),
      database.collection('entitati').findOne({ _id: tenantId, status: { $ne: 'inactive' } }, { projection: { craftSettings: 1 } }),
    ]);
    if (!parent || !tenant || !user || (user.setari?.status != null && String(user.setari.status) !== '1') || (membership && membership.status !== 'active')) return null;
    const deadline = new Date(parent.dataConfirmare || parent.dataTinuta || 0);
    const closed = !Number.isFinite(deadline.getTime()) || deadline <= new Date() || ['Anulat', 'Arhivat', 'Finalizat'].includes(parent.status);
    return { row, parent, user, tenant, closed, hash, deadline };
  }
  const limit = (req, res, next) => rateLimit(req) ? next() : res.status(429).json({ error: 'Prea multe încercări. Reveniți mai târziu.' });
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store, private'); next(); };
  app.post('/auth/confirmation/view', noStore, sameOrigin, limit, async (req, res) => {
    const state = await invitation(req.body?.token);
    if (!state) return res.status(404).json({ error: 'Invitația nu este disponibilă sau linkul a fost înlocuit.' });
    const response = Object.fromEntries(['confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuStandard', 'confirmareMeniuVegetarian', 'motivAbsenta', 'motivAbsentaAgapa'].map((field) => [field, state.row[field]]));
    return res.json({ name: state.parent.nume || 'Invitație', date: state.parent.dataTinuta, deadline: state.deadline, closed: state.closed, response });
  });
  app.post('/auth/confirmation/respond', noStore, sameOrigin, limit, async (req, res) => {
    const state = await invitation(req.body?.token);
    if (!state) return res.status(404).json({ error: 'Invitația nu este disponibilă sau linkul a fost înlocuit.' });
    if (state.closed) return res.status(409).json({ error: 'Termenul de confirmare a expirat sau ținuta este închisă. Contactați Secretarul.' });
    let data;
    try { data = confirmationFields(req.body?.response); } catch (error) { return res.status(400).json({ error: error.message }); }
    const at = new Date();
    const updated = await confirmations.updateOne({ _id: state.row._id, eId: tenantId, publicTokenHash: state.hash, sys_status: 1 }, { $set: { ...data, updatedAt: at, updatedBy: state.row.userId }, $push: { log: { type: 'invitation-response', at, by: state.row.userId } } });
    if (!updated.matchedCount) return res.status(409).json({ error: 'Linkul a fost înlocuit. Folosiți invitația recentă.' });
    await database.collection('audit_events').insertOne({ eId: tenantId, actorId: state.row.userId, action: 'prezenta.response', entityType: 'confirmation', entityId: state.row._id, at, metadata: { via: 'invitation', status: data.status } });
    let notification = { state: 'unavailable' };
    if (mailer) {
      const recipients = [...new Set([state.user.emails?.[0]?.address, state.tenant.craftSettings?.secretariatEmail].filter(Boolean))];
      try {
        for (const to of recipients) await mailer.sendMail({ to, from, subject: 'Confirmarea răspunsului la invitație', text: `Răspuns înregistrat pentru ${state.parent.nume || 'ținută'}.\nȚinută: ${data.confirmareTinuta ? 'Da' : 'Nu'}\nAgapă: ${data.confirmareAgapa ? 'Da' : 'Nu'}\nMeniu: ${data.confirmareAgapa ? data.confirmareMeniuVegetarian ? 'Vegetarian' : 'Standard' : '—'}\nMotiv absență: ${data.motivAbsenta || '—'}\nMotiv absență agapă: ${data.motivAbsentaAgapa || '—'}` });
        notification = { state: recipients.length ? 'sent' : 'unavailable', at: new Date() };
      } catch { notification = { state: 'failed' }; }
    }
    await confirmations.updateOne({ _id: state.row._id, eId: tenantId }, { $set: { responseNotification: notification } });
    return res.json({ ok: true, notification: notification.state });
  });
}

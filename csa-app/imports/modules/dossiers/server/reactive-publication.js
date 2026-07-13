import { Meteor } from 'meteor/meteor';
import {
  CraftMemberships,
  DegreeEvents,
  Entitati,
  LodgeMemberships,
  OfficeDefinitions,
  OfficeDelegations,
  OfficeTerms,
} from '/imports/api/collections.js';

const MAX_EXPIRY_TIMER_MS = 24 * 60 * 60 * 1000;

function futureEnd(row, now) {
  const value = row?.endAt || row?.endsAt;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) || date <= now ? null : date;
}

async function observeCursor(cursor, callbacks) {
  return Promise.resolve(cursor.observeChanges(callbacks));
}

/**
 * Publicație manuală cu ACL reactiv. La orice mutație care poate schimba
 * autorizația, fluxurile de date sunt oprite și documentele sunt retrase
 * înaintea reevaluării drepturilor. Astfel, o revocare nu așteaptă reconnect.
 */
export async function publishWithReactiveDossierAccess(context, {
  initialAccess,
  reauthorize,
  buildStreams,
}) {
  let stopped = false;
  let generation = 0;
  let checking = false;
  let checkAgain = false;
  let initialized = false;
  let accessEpoch = 0;
  let expiryTimer = null;
  let roleFallbackTimer = null;
  const dataHandles = [];
  const authHandles = [];
  const published = new Map();

  function publishedIds(name) {
    if (!published.has(name)) published.set(name, new Set());
    return published.get(name);
  }

  function stopData({ retract = true } = {}) {
    generation += 1;
    for (const handle of dataHandles.splice(0)) handle?.stop?.();
    if (!retract || stopped) {
      published.clear();
      return;
    }
    for (const [name, ids] of published.entries()) {
      for (const id of ids) context.removed(name, id);
    }
    published.clear();
  }

  async function startData(access) {
    const localGeneration = ++generation;
    for (const stream of buildStreams(access)) {
      if (stopped || localGeneration !== generation) return;
      const name = String(stream?.name || stream?.collection?._name || '');
      if (!name || !stream?.cursor) throw new Error('Flux de publicație invalid.');
      const ids = publishedIds(name);
      const handle = await observeCursor(stream.cursor, {
        added(id, fields) {
          if (stopped || localGeneration !== generation) return;
          ids.add(id);
          context.added(name, id, fields);
        },
        changed(id, fields) {
          if (stopped || localGeneration !== generation || !ids.has(id)) return;
          context.changed(name, id, fields);
        },
        removed(id) {
          if (stopped || localGeneration !== generation || !ids.delete(id)) return;
          context.removed(name, id);
        },
      });
      if (stopped || localGeneration !== generation) handle?.stop?.();
      else dataHandles.push(handle);
    }
  }

  async function scheduleExpiry(access) {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (stopped || access.superAdmin) return;
    const [terms, delegations] = await Promise.all([
      OfficeTerms.find(
        { eId: access.eId, status: 'active' },
        { fields: { endAt: 1, endsAt: 1 } },
      ).fetchAsync(),
      OfficeDelegations.find(
        { eId: access.eId, delegateUserId: access.userId, status: 'active' },
        { fields: { endAt: 1, endsAt: 1 } },
      ).fetchAsync(),
    ]);
    if (stopped) return;
    const now = new Date();
    const ends = [...terms, ...delegations].map((row) => futureEnd(row, now)).filter(Boolean);
    if (!ends.length) return;
    const delay = Math.min(...ends.map((date) => date.getTime() - now.getTime()));
    if (delay > MAX_EXPIRY_TIMER_MS) {
      expiryTimer = setTimeout(() => scheduleExpiry(access), MAX_EXPIRY_TIMER_MS);
      return;
    }
    expiryTimer = setTimeout(() => signalAccessChange(), Math.max(delay + 25, 25));
  }

  async function runRecheck() {
    if (stopped) return;
    if (checking) {
      checkAgain = true;
      return;
    }
    checking = true;
    try {
      do {
        checkAgain = false;
        const epoch = accessEpoch;
        let access;
        try {
          access = await reauthorize();
        } catch (error) {
          if (!stopped) context.stop();
          return;
        }
        if (stopped) return;
        if (epoch !== accessEpoch) {
          checkAgain = true;
          continue;
        }
        await startData(access);
        if (epoch !== accessEpoch) {
          stopData({ retract: true });
          checkAgain = true;
          continue;
        }
        await scheduleExpiry(access);
      } while (!stopped && checkAgain);
    } finally {
      checking = false;
    }
  }

  function signalAccessChange() {
    if (stopped) return;
    accessEpoch += 1;
    // Retragerea precedă orice I/O asincron necesar reevaluării ACL.
    stopData({ retract: true });
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!initialized) return;
    void runRecheck();
  }

  async function watch(cursor) {
    let priming = true;
    const changed = () => {
      if (!priming) signalAccessChange();
    };
    const handle = await observeCursor(cursor, {
      added: changed,
      changed,
      removed: changed,
    });
    priming = false;
    if (stopped) handle?.stop?.();
    else authHandles.push(handle);
  }

  async function startAuthorizationObservers(access) {
    const actorId = access.userId;
    const eId = access.eId;
    const watchers = [
      LodgeMemberships.find({ eId, userId: actorId }),
      CraftMemberships.find({ eId, userId: actorId }),
      DegreeEvents.find({ eId, userId: actorId }),
      // Sunt urmărite toate mandatele tenantului deoarece o delegare depinde
      // de mandatul titularului, nu doar de rândul delegatului.
      OfficeTerms.find({ eId }),
      OfficeDelegations.find({ eId, delegateUserId: actorId }),
      OfficeDefinitions.find({ eId }),
      Entitati.find({ _id: eId }),
      Meteor.users.find({ _id: actorId }),
    ];
    const roleAssignments = Meteor.roleAssignment;
    if (roleAssignments?.find) {
      watchers.push(roleAssignments.find({
        $or: [{ 'user._id': actorId }, { userId: actorId }],
      }));
    } else {
      // Apărare pentru versiuni vechi ale pachetului roles care nu expun
      // colecția: reevaluarea periodică nu necesită reconnect.
      roleFallbackTimer = setInterval(signalAccessChange, 1000);
    }
    for (const cursor of watchers) await watch(cursor);
  }

  context.onStop(() => {
    stopped = true;
    if (expiryTimer) clearTimeout(expiryTimer);
    if (roleFallbackTimer) clearInterval(roleFallbackTimer);
    for (const handle of authHandles.splice(0)) handle?.stop?.();
    stopData({ retract: false });
  });

  try {
    // Observatorii sunt instalați înainte de primul document PII. O ultimă
    // autorizare după instalare închide fereastra dintre verificare și observe.
    await startAuthorizationObservers(initialAccess);
    let access = initialAccess;
    let epoch;
    do {
      epoch = accessEpoch;
      access = await reauthorize();
    } while (!stopped && epoch !== accessEpoch);
    if (stopped) return;
    initialized = true;
    await startData(access);
    await scheduleExpiry(access);
    if (!stopped) context.ready();
  } catch (error) {
    if (!stopped) context.stop();
    throw error;
  }
}

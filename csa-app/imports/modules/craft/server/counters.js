import { CraftCounters, Convocatoare, Prezenta, PrezentaConfirmari } from '/imports/api/collections.js';

const sources = { convocatoare: Convocatoare, prezenta: Prezenta, prezenta_confirmari: PrezentaConfirmari };

export async function nextNumber(eId, key) {
  const collection = sources[key];
  if (!collection) throw new Error('Contor necunoscut.');
  const [maximum] = await collection.rawCollection().aggregate([
    { $match: { eId } },
    { $group: { _id: null, value: { $max: { $convert: { input: '$nr', to: 'long', onError: 0, onNull: 0 } } } } },
  ]).toArray();
  // A single atomic counter update reconciles imported numbers and concurrent reservations.
  const result = await CraftCounters.rawCollection().findOneAndUpdate(
    { _id: `${eId}:${key}` },
    [{ $set: { eId: { $literal: eId }, key: { $literal: key }, value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, Number(maximum?.value || 0)] }, 1] } } }],
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );
  return result.value;
}

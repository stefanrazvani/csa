const target = db.getSiblingDB('csa');
const source = target.documente_text;

const fieldShapes = source.aggregate([
  { $project: { fields: { $map: { input: { $objectToArray: '$$ROOT' }, as: 'item', in: '$$item.k' } } } },
  { $unwind: '$fields' },
  { $group: { _id: '$fields', documents: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]).toArray();

const byLevel = source.aggregate([
  { $group: { _id: { level: '$level', type: { $type: '$level' } }, documents: { $sum: 1 } } },
  { $sort: { '_id.level': 1 } },
]).toArray();

const links = source.aggregate([
  { $group: { _id: '$documentId', articles: { $sum: 1 }, levels: { $addToSet: '$level' } } },
  { $lookup: { from: 'convocatoare', localField: '_id', foreignField: '_id', as: 'convocator' } },
  { $project: { _id: 1, articles: 1, levels: 1, convocatorFound: { $gt: [{ $size: '$convocator' }, 0] } } },
]).toArray();

print(JSON.stringify({
  total: source.countDocuments({}),
  active: source.countDocuments({ sys_status: 1 }),
  fieldShapes,
  byLevel,
  convocatoareWithArticles: links.filter((entry) => entry.convocatorFound).length,
  orphanDocumentGroups: links.filter((entry) => !entry.convocatorFound).length,
  articleGroups: links.length,
  largestGroups: links.filter((entry) => entry.convocatorFound).sort((a, b) => b.articles - a.articles).slice(0, 10),
}));

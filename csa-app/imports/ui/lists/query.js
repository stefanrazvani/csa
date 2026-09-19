export function valueAt(row, path) { return String(path || '').split('.').reduce((value, key) => value?.[key], row); }
export function normalizeText(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro'); }
export function normalizeQuery(input = {}, columns = []) {
  const fields = columns.map(column => column.field);
  return { search: String(input.search || '').trim().slice(0, 120), filterField: fields.includes(input.filterField) ? input.filterField : '', filter: String(input.filter || '').trim().slice(0, 120), sort: fields.includes(input.sort) ? input.sort : fields[0], direction: input.direction === -1 ? -1 : 1, page: Math.min(10000, Math.max(0, Math.floor(Number(input.page) || 0))), size: [10, 20, 50, 100].includes(Number(input.size)) ? Number(input.size) : 20 };
}
export function compareRows(a, b, query) {
  const left = valueAt(a, query.sort); const right = valueAt(b, query.sort);
  const compare = typeof left === 'number' && typeof right === 'number' ? left - right : left instanceof Date && right instanceof Date ? +left - +right : String(left ?? '').localeCompare(String(right ?? ''), 'ro', { numeric: true, sensitivity: 'base' });
  return (compare || String(a._id || a.userId || '').localeCompare(String(b._id || b.userId || ''))) * query.direction;
}
export function dateRange(text) {
 const value=String(text); const match=value.match(/^(\d{2})[.\/](\d{2})[.\/](\d{4})$/); const iso=match?`${match[3]}-${match[2]}-${match[1]}`:value; if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null; const start=new Date(`${iso}T00:00:00`); if(Number.isNaN(+start))return null; const end=new Date(start);end.setDate(end.getDate()+1);return {start,end};
}
function textValue(row,column) { const value=valueAt(row,column.field); if (/grade$/i.test(column.field)) return `${value ?? ''} ${{1:'Ucenic',2:'Calfă',3:'Maestru'}[value] || ''}`; return column.type==='date'&&value ? new Intl.DateTimeFormat('ro-RO').format(new Date(value)) : value; }
export function filterRows(rows, input, columns) {
  const query = normalizeQuery(input, columns);
  const search = normalizeText(query.search); const filter = normalizeText(query.filter);
  return rows.filter(row => (!search || columns.some(column => normalizeText(textValue(row, column)).includes(search))) && (!filter || !query.filterField || normalizeText(textValue(row, columns.find(column=>column.field===query.filterField))).includes(filter))).sort((a, b) => compareRows(a, b, query));
}
export function mongoListQuery(base, input, columns) {
  const query = normalizeQuery(input, columns);
  // A client supplies values only. Field names and operators come from this schema.
  const expression = value => new RegExp([...normalizeText(value)].map(char => ({a:'[aăâ]',i:'[iî]',s:'[sșş]',t:'[tțţ]'}[char] || char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join(''), 'i');
  const condition = (column, text) => column.type === 'number' ? { [column.field]: Number.isFinite(Number(text)) ? Number(text) : /grade$/i.test(column.field) && ({ucenic:1,calfa:2,maestru:3})[normalizeText(text)] ? ({ucenic:1,calfa:2,maestru:3})[normalizeText(text)] : { $in: [] } } : column.type === 'date' ? (dateRange(text) ? { [column.field]: { $gte: dateRange(text).start, $lt: dateRange(text).end } } : { [column.field]: { $in: [] } }) : { [column.field]: expression(text) };
  const clauses = [base];
  if (query.search) clauses.push({ $or: columns.map(column => condition(column, query.search)).filter(Boolean) });
  if (query.filter && query.filterField) { const clause = condition(columns.find(column => column.field === query.filterField), query.filter); if (clause) clauses.push(clause); }
  return { query, selector: { $and: clauses }, options: { sort: { [query.sort]: query.direction, _id: query.direction }, skip: query.page * query.size, limit: query.size + 1 } };
}
export function gradeSelector(grade, field = 'minGrade', allowUnclassified = false) {
  const maximum = [1, 2, 3].includes(Number(grade)) ? Number(grade) : 0;
  const clauses = [{ [field]: { $in: [1, 2, 3].filter(value => value <= maximum) } }];
  if (allowUnclassified) clauses.push({ [field]: { $exists: false } }, { [field]: null }, { [field]: 0 });
  return { $or: clauses };
}

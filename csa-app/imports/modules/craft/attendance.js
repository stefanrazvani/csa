// Legacy stores some flags as 0/1 or strings. Never coerce the string "0" with Boolean().
export function isYes(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function attendanceStatus(row = {}) {
  if (!isYes(row.confirmareFinala) && !['confirmed', 'declined'].includes(row.status)) return 'pending';
  if (row.confirmareTinuta !== undefined && row.confirmareTinuta !== null) {
    return isYes(row.confirmareTinuta) ? 'confirmed' : 'declined';
  }
  // A final legacy response without its attendance flag is unknown, not an acceptance.
  return ['confirmed', 'declined'].includes(row.status) ? row.status : 'answered';
}

export function responseFields(payload = {}) {
  const fields = {};
  for (const name of ['confirmareTinuta', 'confirmareAgapa', 'confirmareMeniuVegetarian', 'confirmareMeniuStandard']) {
    if (![true, false, 0, 1, '0', '1', 'true', 'false'].includes(payload[name])) {
      throw new Error('Selectați participarea la ținută, agapă și meniul.');
    }
    fields[name] = isYes(payload[name]);
  }
  if (!fields.confirmareAgapa) {
    fields.confirmareMeniuVegetarian = false;
    fields.confirmareMeniuStandard = false;
  } else if (fields.confirmareMeniuVegetarian === fields.confirmareMeniuStandard) {
    throw new Error('Selectați un singur meniu pentru agapă.');
  }
  for (const name of ['motivAbsenta', 'motivAbsentaAgapa']) fields[name] = String(payload[name] || '').trim().slice(0, 1000);
  fields.confirmareFinala = 1;
  fields.status = fields.confirmareTinuta ? 'confirmed' : 'declined';
  return fields;
}

export function responseDeadline(row) {
  const raw = row.dataConfirmare || row.dataTinuta;
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

export function attendanceTotals(rows) {
  const totals = { invited: rows.length, confirmed: 0, declined: 0, pending: 0, answered: 0, agapa: 0, standard: 0, vegetarian: 0, present: 0 };
  for (const row of rows) {
    const status = attendanceStatus(row);
    totals[status] += 1;
    if (status !== 'pending') {
      if (isYes(row.confirmareAgapa)) {
        totals.agapa += 1;
        if (isYes(row.confirmareMeniuStandard)) totals.standard += 1;
        if (isYes(row.confirmareMeniuVegetarian)) totals.vegetarian += 1;
      }
    }
    if (row.attended === true) totals.present += 1;
  }
  return totals;
}

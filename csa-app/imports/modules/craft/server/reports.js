import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Email } from 'meteor/email';
import PdfPrinter from 'pdfmake';
import ExcelJS from 'exceljs';
import { Convocatoare, DocumenteText, PrezentaConfirmari, Entitati } from '/imports/api/collections.js';
import { requireRole, getReadableCraftGrade } from '/imports/lib/access/server.js';
import { attendanceStatus, attendanceTotals, isYes } from '../attendance.js';

const date = (value) => value ? new Date(value).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) : '—';
const clean = (value, max = 300) => String(value || '').trim().slice(0, max);

export async function craftSettings(eId) {
  return (await Entitati.findOneAsync(eId, { fields: { craftSettings: 1 } }))?.craftSettings || {};
}

export async function generateConvocatorPdf(convocatorId, eId, grade) {
  const convocator = await Convocatoare.findOneAsync({ _id: convocatorId, eId, sys_status: 1 });
  if (!convocator) throw new Meteor.Error('not-found', 'Convocator inexistent.');
  const articles = await DocumenteText.find({ eId, documentId: convocatorId, sys_status: 1, level: { $lte: Math.max(0, Math.min(Number(grade) || 0, 3)) } }, { sort: { level: 1, order: 1 } }).fetchAsync();
  const settings = await craftSettings(eId);
  const fonts = { Dejavu: { normal: Assets.absoluteFilePath('fonts/Dejavu/DejaVuSans.ttf'), bold: Assets.absoluteFilePath('fonts/Dejavu/DejaVuSans-Bold.ttf'), italics: Assets.absoluteFilePath('fonts/Dejavu/DejaVuSans.ttf'), bolditalics: Assets.absoluteFilePath('fonts/Dejavu/DejaVuSans-Bold.ttf') } };
  const content = [
    { columns: [{ stack: [{ text: 'I∴G∴M∴A∴U∴', bold: true }, 'Masoneria Universală', 'Marea Lojă Națională din România', { text: `R∴L∴ ${convocator.numeLoja || ''} nr. ${convocator.nrLoja || ''} · Or∴ ${convocator.orientul || ''}`, bold: true }] }, { image: Assets.absoluteFilePath('img/MLNR.png'), width: 65 }], margin: [0, 0, 0, 24] },
    { text: 'CONVOCATOR', fontSize: 18, alignment: 'center', bold: true, margin: [0, 0, 0, 18] },
    { text: convocator.nume || '', fontSize: 13, alignment: 'center', margin: [0, 0, 0, 16] },
    { text: `Iubite Frate, ești convocat să participi la Ținuta Rituală nr. ${convocator.numarTinuta || convocator.nr || ''}.`, margin: [0, 0, 0, 12] },
    { text: `Data și ora: ${date(convocator.dataTinuta)}\nAcces în Templu: ${convocator.data_access || '—'}\nTemplul: ${convocator.templu || '—'}\nAdresa: ${convocator.adresaTemplu || '—'}\nTermen confirmare: ${date(convocator.dataConfirmare)}`, margin: [0, 0, 0, 16] },
    { text: convocator.observatii || '', margin: [0, 0, 0, 16] },
    { text: ['Cu Triplă Acoladă Fraternă,', settings.signerTitle || 'Maestru Venerabil', settings.signerName, settings.contactPhone, settings.secretariatEmail].filter(Boolean).join('\n'), alignment: 'center' },
  ];
  for (const level of [1, 2, 3]) {
    const rows = articles.filter((row) => Number(row.level) === level);
    if (!rows.length) continue;
    content.push({ text: `ORDINEA DE ZI — GRAD ${level}`, pageBreak: 'before', fontSize: 14, bold: true, margin: [0, 0, 0, 18] });
    for (const row of rows) content.push({ text: [{ text: row.nrArticol ? `${row.nrArticol} ` : '', bold: true }, { text: row.continut || '' }], alignment: row.continut === '∴' ? 'center' : 'left', margin: [0, 0, 0, 10] });
  }
  const definition = { pageSize: 'A4', pageMargins: [45, 45, 45, 45], defaultStyle: { font: 'Dejavu', fontSize: 10, lineHeight: 1.25 }, content, footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 8 }) };
  const document = new PdfPrinter(fonts).createPdfKitDocument(definition);
  const buffer = await new Promise((resolve, reject) => { const chunks = []; document.on('data', (chunk) => chunks.push(chunk)); document.on('error', reject); document.on('end', () => resolve(Buffer.concat(chunks))); document.end(); });
  return { filename: `Convocator-${convocator.nr || convocator._id}-grad-${grade}.pdf`, mimeType: 'application/pdf', content: buffer.toString('base64') };
}

export async function sendResponseReceipt(row, data) {
  if (!process.env.MAIL_URL) return { state: 'unavailable' };
  const settings = await craftSettings(row.eId);
  const user = await Meteor.users.findOneAsync(row.userId, { fields: { emails: 1 } });
  const recipients = [...new Set([user?.emails?.[0]?.address, settings.secretariatEmail].filter(Boolean))];
  if (!recipients.length) return { state: 'unavailable' };
  const body = `Răspuns înregistrat pentru ${row.nume || 'ținută'}.\nȚinută: ${data.confirmareTinuta ? 'Da' : 'Nu'}\nAgapă: ${data.confirmareAgapa ? 'Da' : 'Nu'}\nMeniu: ${data.confirmareAgapa ? data.confirmareMeniuVegetarian ? 'Vegetarian' : 'Standard' : '—'}\nMotiv absență: ${data.motivAbsenta || '—'}\nMotiv absență agapă: ${data.motivAbsentaAgapa || '—'}`;
  try {
    // Separate messages avoid disclosing a member's email to other recipients.
    for (const to of recipients) await Email.sendAsync({ to, from: process.env.CSA_MAIL_FROM || 'Nova Reperta <no-reply@via-nova.ro>', subject: 'Confirmarea răspunsului la invitație', text: body });
    return { state: 'sent', at: new Date() };
  } catch { return { state: 'failed' }; }
}

Meteor.methods({
  async 'craft.convocatoare.pdf'(id) {
    check(id, String);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'read');
    return generateConvocatorPdf(id, eId, await getReadableCraftGrade(userId, eId));
  },
  async 'craft.settings.get'() {
    const { eId } = await requireRole(this, 'convocatoare', 'admin');
    return craftSettings(eId);
  },
  async 'craft.settings.save'(payload) {
    check(payload, Object);
    const { eId } = await requireRole(this, 'convocatoare', 'admin');
    const settings = Object.fromEntries(['signerName', 'signerTitle', 'contactPhone', 'secretariatEmail'].map((field) => [field, clean(payload[field])]));
    if (settings.secretariatEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.secretariatEmail)) throw new Meteor.Error('validation-error', 'Email secretariat invalid.');
    await Entitati.updateAsync(eId, { $set: { craftSettings: settings } });
    return { ok: true };
  },
  async 'craft.convocatoare.sendTest'(id) {
    check(id, String);
    const { userId, eId } = await requireRole(this, 'convocatoare', 'write');
    if (!process.env.MAIL_URL) throw new Meteor.Error('mail-unavailable', 'SMTP nu este configurat.');
    const user = await Meteor.users.findOneAsync(userId, { fields: { emails: 1 } });
    const to = user?.emails?.[0]?.address;
    if (!to) throw new Meteor.Error('email-required', 'Contul curent nu are email.');
    const pdf = await generateConvocatorPdf(id, eId, await getReadableCraftGrade(userId, eId));
    await Email.sendAsync({ to, from: process.env.CSA_MAIL_FROM || 'Nova Reperta <no-reply@via-nova.ro>', subject: '[TEST] Convocator', text: 'Previzualizare convocator. Acest mesaj nu creează invitații și nu modifică statusul convocatorului.', attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.content, 'base64'), contentType: pdf.mimeType }] });
    return { sent: 1 };
  },
  async 'craft.prezenta.xlsx'(id) {
    check(id, String);
    const { eId } = await requireRole(this, 'prezenta', 'admin');
    const parent = await Convocatoare.findOneAsync({ _id: id, eId, sys_status: 1 });
    if (!parent) throw new Meteor.Error('not-found', 'Convocator inexistent.');
    const rows = await PrezentaConfirmari.find({ eId, convocatorId: id, sys_status: 1 }, { sort: { 'userSnapshot.nume': 1 } }).fetchAsync();
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Confirmări ținută');
    const headers = ['Nume', 'Prenume', 'User', 'Ținuta', 'Răspuns transmis', 'Confirmare ținută', 'Motiv absență ținută', 'Confirmare agapă', 'Motiv absență agapă', 'Meniu standard', 'Meniu vegetarian', 'Prezent efectiv'];
    sheet.addRow(headers); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      const final = attendanceStatus(row) !== 'pending';
      sheet.addRow([row.userSnapshot?.nume || row.user?.nume || '', row.userSnapshot?.prenume || row.user?.prenume || '', row.userSnapshot?.email || row.user?.email || '', parent.numarTinuta || parent.nr, final ? 'Da' : 'Nu', attendanceStatus(row) === 'confirmed' ? 'Da' : attendanceStatus(row) === 'declined' ? 'Nu' : 'Neconfirmat', row.motivAbsenta || '', final && isYes(row.confirmareAgapa) ? 'Da' : 'Nu', row.motivAbsentaAgapa || '', final && isYes(row.confirmareAgapa) && isYes(row.confirmareMeniuStandard) ? 'Da' : 'Nu', final && isYes(row.confirmareAgapa) && isYes(row.confirmareMeniuVegetarian) ? 'Da' : 'Nu', row.attended === true ? 'Da' : row.attended === false ? 'Nu' : 'Neînregistrat']);
    }
    const totals = attendanceTotals(rows);
    const total = sheet.addRow(['TOTAL', '', '', totals.invited, totals.invited - totals.pending, totals.confirmed, '', totals.agapa, '', totals.standard, totals.vegetarian, totals.present]); total.font = { bold: true };
    sheet.columns.forEach((column, index) => { column.width = [6, 8].includes(index) ? 35 : index === 2 ? 32 : 20; });
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    return { filename: `Raport-tinuta-${parent.numarTinuta || parent.nr || id}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: Buffer.from(await book.xlsx.writeBuffer()).toString('base64'), rows: rows.length };
  },
});

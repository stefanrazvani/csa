// Ritualul Ucenicului 2012, pp. 119–120: șase semne pe fiecare latură.
// Ordinea longitudinală este convenția vizuală a aplicației: circuit continuu
// Orient → Occident la Miazănoapte, apoi Occident → Orient la Miazăzi.
export const ZODIAC_SIGNS = Object.freeze([
  ['aries', 'Berbec', '♈'], ['taurus', 'Taur', '♉'], ['gemini', 'Gemeni', '♊'],
  ['cancer', 'Rac', '♋'], ['leo', 'Leu', '♌'], ['virgo', 'Fecioară', '♍'],
  ['libra', 'Balanță', '♎'], ['scorpio', 'Scorpion', '♏'], ['sagittarius', 'Săgetător', '♐'],
  ['capricorn', 'Capricorn', '♑'], ['aquarius', 'Vărsător', '♒'], ['pisces', 'Pești', '♓'],
].map(([id, label, glyph], index) => Object.freeze({ id, label, glyph, side: index < 6 ? 'north' : 'south', index: index % 6 })));
export const ZODIAC_MAPS = new Set(ZODIAC_SIGNS.map(sign => `zodiac-${sign.id}`));

export function drawZodiac(context, width, height, id) {
  const sign = ZODIAC_SIGNS.find(item => item.id === id);
  if (!sign) return;
  context.fillStyle = '#122434';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#c9a45c';
  context.lineWidth = width * 0.008;
  context.beginPath(); context.arc(width / 2, height * 0.44, width * 0.34, 0, Math.PI * 2); context.stroke();
  context.fillStyle = '#e6c887';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = `${Math.round(height * 0.44)}px "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", serif`;
  context.fillText(sign.glyph + '\uFE0E', width / 2, height * 0.43);
  context.font = `600 ${Math.round(height * 0.075)}px sans-serif`;
  context.fillText(sign.label, width / 2, height * 0.88);
}

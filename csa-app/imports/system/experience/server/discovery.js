// Server-only: only the selected, authorized degree is serialized to the client.
import { ZODIAC_SIGNS } from '../zodiac.js';
import { OFFICER_CATALOG } from '../../temple/catalog/officers.js';
import { studyForElement } from './study-notes.js';

const NAMES = { 1: 'Ucenic', 2: 'Calfă', 3: 'Maestru' };
const SOURCE = 'Ritualul Ucenicului 2012';
const GRADE_SOURCE = { 1: `${SOURCE}, pp. 120–122`, 2: 'Ritualul Calfei 2012, p. 61', 3: 'Ritualul Maestrului 2012, p. 69' };
const LIGHTS = {
  1: 'În descrierea gradului de Ucenic, Echerul este așezat deasupra ambelor brațe ale Compasului.',
  2: 'În descrierea gradului de Calfă, un braț al Compasului este deasupra Echerului, iar celălalt dedesubt.',
  3: 'În descrierea gradului de Maestru, ambele brațe ale Compasului sunt deasupra Echerului.',
};

// These questions are educational proposals, explicitly distinguished from the ritual description.
export function addTempleDiscovery(scene, grade) {
  if (![1, 2, 3].includes(grade)) return scene;
  const definitions = [];
  const add = (key, label, description, selector, prompt, pages = '120–122', extra = '') => {
    definitions.push({ key, label, description, selector, prompt, source: `${SOURCE}, pp. ${pages}`, extra });
  };
  const prefix = value => id => id.startsWith(value);
  add('wisdom', 'Coloneta ionică · Înțelepciunea', 'Stâlpul ionic, cu volute la capitel, se află la colțul sud-est al pavajului. Semnifică Înțelepciunea și corespunde Maestrului Venerabil; poartă o lumânare.', prefix('pillar-wisdom-se'), 'Cum pregătești o lucrare înainte de a începe să o execuți?', '121');
  add('strength', 'Coloneta dorică · Forța', 'Stâlpul doric se află la colțul nord-vest al pavajului. Semnifică Forța și corespunde Primului Supraveghetor; poartă o lumânare.', prefix('pillar-strength-nw'), 'Ce susține o lucrare atunci când entuziasmul de început scade?', '121');
  add('beauty', 'Coloneta corintică · Frumusețea', 'Stâlpul corintic, cu frunze de acant la capitel, se află la colțul sud-vest al pavajului. Semnifică Frumusețea și corespunde celui de-al Doilea Supraveghetor; poartă o lumânare.', prefix('pillar-beauty-sw'), 'Cum unești utilitatea unei lucrări cu grija pentru forma ei?', '122');
  add('sun', 'Soarele', 'Soarele se află la Orient, deasupra locului Oratorului, spre Miazăzi. Împreună cu Luna și Delta, face parte din reperele vizuale ale Orientului.', prefix('sun-'), 'Ce diferență observi între lumina solară și lumina Lunii din această reprezentare?', '120');
  add('moon', 'Luna', 'Luna în creștere se află la Orient, deasupra locului Secretarului, spre Miazănoapte. Forma de semilună o deosebește de discul solar.', prefix('moon-'), 'Cum te ajută observarea unei schimbări treptate să înțelegi un proces?', '120');
  add('delta', 'Delta luminoasă și ochiul', 'Delta luminoasă este așezată deasupra scaunului Maestrului Venerabil. Triunghiul cuprinde un ochi deschis, orizontal și simetric.', prefix('delta-'), 'Cum deosebești atenția față de propriile fapte de judecarea pripită a celorlalți?', '120');
  add('mosaic', 'Pavajul mozaicat', 'Pavajul ocupă centrul templului și alternează pătrate deschise și închise. Ritualul indică proporții legate de Secțiunea de Aur și precizează că nu se calcă pe el în timpul lucrărilor deschise.', () => false, 'Ce relații de contrast și echilibru observi fără a reduce totul la două extreme?', '121');
  add('border', 'Bordura pavajului', 'În această reprezentare, bordura conturează pavajul central și îl separă vizual de spațiul de circulație.', () => false, 'Ce rol are o limită clară în protejarea unui spațiu de lucru?', '121', 'Conturul este o convenție grafică a aplicației; pagina citată descrie pavajul și respectarea spațiului său.');
  add('plumb', 'Firul cu plumb', 'Firul cu plumb coboară din boltă deasupra centrului pavajului. Descrierea ritualului îl asociază cu Axis Mundi, axa lumii.', prefix('plumb-'), 'Cum verifici alinierea dintre intenție, cuvânt și faptă?', '121');
  add('vault', 'Bolta înstelată', 'Tavanul albastru, presărat cu stele, este susținut simbolic de douăsprezece coloane laterale, șase pe fiecare latură. Semnele zodiacale sunt așezate în dreptul lor.', prefix('vault-'), 'Ce observi când treci de la un reper izolat la imaginea de ansamblu?', '119–120', 'Stelele din aplicație sunt decorative; nu alcătuiesc o hartă astronomică exactă.');
  add('rope', 'Funia cu noduri', 'Funia înconjoară partea superioară a templului și se termină cu ciucuri lângă coloanele intrării. Ritualul descrie noduri în forma unui opt culcat.', prefix('rope-'), 'Ce transformă o simplă alăturare de persoane într-o legătură durabilă?', '120');
  add('orient', 'Orientul și treptele', 'Orientul se află opus intrării, ridicat pe trei trepte. În centrul său este locul Maestrului Venerabil, iar reperele luminoase sunt dispuse pe peretele din spate.', prefix('orient-'), 'Cum te orientezi înainte de a începe explorarea unui spațiu nou?', '120');
  add('altar', 'Altarul și Marile Lumini', 'Altarul se află la baza Orientului. Pe el sunt Cartea Legii Sacre, Echerul și Compasul, cele Trei Mari Lumini.', prefix('altar-'), 'Cum se susțin reciproc un reper de sens, o regulă și o măsură?', '120–121', LIGHTS[grade]);
  add('book', 'Cartea Legii Sacre', 'Cartea deschisă pe Altar face parte din cele Trei Mari Lumini. Ritualul precizează că volumele corespunzătoare religiilor Fraților prezenți se așază alături, nu unul peste altul.', prefix('vsl-page-'), 'Cum păstrezi respectul pentru convingerile altuia într-o lucrare comună?', '120–121');
  add('square', 'Echerul', 'Echerul este una dintre uneltele simbolice așezate pe Cartea Legii Sacre. Relația sa cu brațele Compasului este specifică gradului.', prefix('vsl-square'), 'Cum verifici corectitudinea unei decizii folosind un reper stabil?', '121', LIGHTS[grade]);
  add('compass', 'Compasul', 'Compasul este așezat pe Cartea Legii Sacre, împreună cu Echerul. Descrierea ritualului stabilește poziția brațelor sale în raport cu Echerul.', prefix('vsl-compass'), 'Cum alegi măsura potrivită pentru o acțiune sau o judecată?', '121', LIGHTS[grade]);
  add('board', `Planșa gradului · ${NAMES[grade]}`, 'Planșa se află pe pavajul mozaicat, între cei trei stâlpi. Ea reunește reperele gradului într-un suport pentru observare și studiu.', id => id === 'tracing-board', 'Ce legătură poți explica între două repere ale planșei?', '122', `Este afișată planșa pentru ${NAMES[grade]}. Desenul din aplicație este stilizat.`);
  for (const [key, label, side] of [['b', 'Boaz', 'Miazănoapte'], ['j', 'Jachin', 'Miazăzi']]) {
    add(`column-${key}`, `Coloana ${label}`, `Coloana ${label} se află la Occident, spre ${side}, lângă intrare. Cele două coloane sunt dispuse simetric față de axa longitudinală a templului.`, prefix(`column-${key}-`), 'Cum contribuie perechea de coloane la recunoașterea pragului?', '122', grade === 1 ? 'În gradul de Ucenic, capitelul poartă trei rodii întredeschise.' : 'În această scenă sunt folosite sferele descrise în ritualul Calfei; acestea au și o variantă de reprezentare pe planșă.');
    if (grade >= 2) add(`globe-${key}`, key === 'b' ? 'Sfera terestră' : 'Sfera celestă', key === 'b' ? 'Sfera terestră este reprezentată pe capitelul coloanei Boaz. Ea oferă un reper pentru observarea lumii pământești.' : 'Sfera celestă este reprezentată pe capitelul coloanei Jachin. Ea oferă un reper pentru orientarea privirii către cer.', id => id === `column-${key}-globe` || id === `column-${key}-globe-stand`, 'Cum pui în relație observarea lumii apropiate și a unui ansamblu mai cuprinzător?', '122', 'Ritualul Calfei 2012, p. 61: folosirea sferelor depinde de recuzita disponibilă; alternativa este reprezentarea lor pe planșă.');
  }
  if (grade === 2) add('star', 'Steaua înflăcărată', 'În scena Calfei, Steaua Înflăcărată este așezată pe un suport jos, în fața bazei altarului, sub nivelul Cărții Legii Sacre. Are cinci vârfuri și un centru luminos.', prefix('flaming-star'), 'Ce relație observi între simetrie, proporție și ordinea unei construcții?', '120', 'Ritualul Calfei 2012, p. 61, o situează la Orient, în fața mesei Maestrului Venerabil. Poziția din fața altarului este adaptarea cerută pentru acest templu.');
  for (const [key, label, count, page] of [['vm', 'Maestrului Venerabil', 3, '120'], ['warden1', 'Primului Supraveghetor', 2, '122'], ['warden2', 'celui de-al Doilea Supraveghetor', 1, '122']]) {
    add(`candles-${key}`, `Sfeșnicul ${label}`, `Pe masa ${label} se află un sfeșnic cu ${count === 1 ? 'o lumânare' : `${count} lumânări`}. Acest ansamblu este distinct de lumânările celor trei colonete.`, prefix(`${key}-candelabrum-`), 'Cum te ajută numărul și poziția luminilor să recunoști locurile din templu?', page);
    add(`gavel-${key}`, `Ciocanul ${label}`, `Ciocanul de lemn se află pe masa ${label}. Este un obiect al funcției și al conducerii lucrărilor.`, prefix(`${key}-gavel`), 'Cum poți exercita o responsabilitate cu măsură și claritate?', page);
  }
  add('sword', 'Spada de la Orient', 'Spada Înflăcărată este enumerată în ritual între obiectele de pe masa Maestrului Venerabil. În scenă este reprezentată schematic.', id => id === 'vm-sword', 'Cum deosebești simbolul unei responsabilități de persoana care o exercită?', '120');
  for (const sign of ZODIAC_SIGNS) {
    const side = sign.side === 'north' ? 'Miazănoapte' : 'Miazăzi';
    add(`zodiac-${sign.id}`, `Zodiac · ${sign.label}`, `${sign.label} face parte din grupa celor șase semne de la ${side}. Medalionul este așezat deasupra coloanei laterale corespunzătoare, în apropierea bolții.`, id => [`zodiac-${sign.id}`, `zodiac-support-${sign.id}`, `zodiac-base-${sign.id}`, `zodiac-capital-${sign.id}`].includes(id), 'Unde se află acest semn față de Orient și față de celelalte semne de pe aceeași latură?', '119–120', 'Ritualul indică grupele pe laturi. Sensul longitudinal din aplicație este o convenție vizuală; nu se atribuie semnului o interpretare astrologică individuală.');
  }
  // Physical office cards explain functions to all authorized participants.
  // They never grant operational permissions or disclose the current officeholder.
  const officeTargets = {
    venerable: ['vm-table-', 'vm-throne'], first_warden: ['warden1-desk', 'warden1-top', 'warden1-chair'],
    second_warden: ['warden2-desk', 'warden2-top', 'warden2-chair'],
    secretary: ['secretary-desk', 'secretary-chair'], orator: ['orator-desk', 'orator-chair'],
    treasurer: ['treasurer-table', 'treasurer-desk-top', 'treasurer-chair'],
    hospitalier: ['hospitalier-table', 'hospitalier-desk-top', 'hospitalier-chair'],
    master_of_ceremonies: ['mc-seat'], tyler: ['tyler-seat'], expert: ['seat-north-front-1'],
  };
  const targetMatches = (id, token) => token.endsWith('-') ? id.startsWith(token) : id === token || id.startsWith(`${token}-`);
  for (const [code, tokens] of Object.entries(officeTargets)) {
    const office = OFFICER_CATALOG.find(entry => entry.code === code);
    add(`office-${code}`, `Funcția · ${office.label}`, `${office.label}: ${office.responsibility}. Însemnul funcției: ${office.jewel}.`, id => tokens.some(token => targetMatches(id, token)), `Cum contribuie ${office.label} la lucrarea comună în gradul afișat?`, '123–125');
  }
  add('tyler-sword', 'Spada Acoperitorului', 'Spada verticală este lângă locul Acoperitorului, în interiorul templului, la dreapta intrării. Ea este distinctă de spada Expertului și de cea de la Orient.', prefix('tyler-sword-'), 'Ce presupune păstrarea atentă a unui prag?', '123–125');
  add('expert-sword', 'Spada Expertului', 'Spada este reprezentată lângă locul Expertului, în vecinătatea Ospitalierului. Însemnul funcției asociază spada, rigla și ochiul.', prefix('expert-sword-'), 'Cum se completează atenția, verificarea și pregătirea unei lucrări?', '123–125');
  add('mc-staff', 'Bastonul Maestrului de Ceremonii', 'Bastonul se află lângă scaunul Maestrului de Ceremonii, la Occident, în apropierea Primului Supraveghetor. El este legat de coordonarea ordonată a ceremonialului.', prefix('mc-sceptre-'), 'Cum susține orientarea clară participarea întregului grup?', '123–125');
  const seatLabels = {
    1: ['Coloana Ucenicilor · Miazănoapte', 'Coloana Calfelor · Miazăzi'],
    2: ['Miazănoapte · Loja Calfelor', 'Coloana Calfelor · Miazăzi'],
    3: ['Coloana de Miazănoapte · Maeștri', 'Coloana de Miazăzi · Maeștri'],
  };
  for (const [index, side] of ['north', 'south'].entries()) {
    add(`seating-${side}`, seatLabels[grade][index], `Scaunele și băncile acestei laturi formează o coloană de participanți, diferită de coloanele arhitecturale de la intrare. Așezarea se citește în contextul gradului deschis.`,
      id => (id.startsWith(`seat-${side}-`) || id.startsWith(`bench-${side}-`)) && !targetMatches(id, 'seat-north-front-1'),
      'Cum se schimbă participanții acestei coloane atunci când se schimbă gradul lucrărilor?', '125');
  }
  add('grand-master-seat', 'Scaunul Marelui Maestru', 'Primul scaun din dreapta Maestrului Venerabil, privind de la Orient către Occident, este rezervat Marelui Maestru. Este un loc distinct de scaunul Venerabilului și de băncile pentru ceilalți oficiali.', prefix('grand-master-seat'), 'Cum deosebești locul rezervat unui oaspete de funcția care conduce lucrarea Lojei?', '124');
  add('rough-stone', 'Piatra brută', 'Piatra brută este așezată la Miazănoapte, la capătul primei trepte a Orientului dinspre altar. Modelul mic, cu fețe neregulate, este separat de pupitrul Ospitalierului.', prefix('study-rough-stone'), 'Ce parte a unei lucrări cere mai întâi observare și pregătire?', '121');
  add('cubic-stone', grade === 2 ? 'Piatra cubică cu vârf' : 'Piatra cubică', 'Piatra cubică se află la Miazăzi, la capătul celei de-a doua trepte a Orientului dinspre altar. Dimensiunea redusă păstrează libere pupitrele și zona centrală.', prefix('study-cubic-stone'), 'Cum verifici forma și măsura unei lucrări finisate?', '121', grade === 2 ? 'Vârful piramidal este menționat în descrierea Tabloului Calfei, p. 15. Reprezentarea sa în volum este o transpunere pentru explorarea digitală.' : '');
  add('mallet', 'Ciocanul de lucru', 'Ciocanul de lucru se află lângă Altar, pe latura de Miazănoapte, alături de Daltă. Este distinct de ciocanele funcțiilor de conducere.', prefix('study-mallet'), 'Cum adaptezi forța la materialul și scopul lucrării?', '121');
  add('chisel', 'Dalta', 'Dalta este așezată lângă ciocanul de lucru, la Miazănoapte de Altar. Modelul are o tijă și o muchie de lucru distincte.', prefix('study-chisel'), 'Cum transformi un efort general într-o intervenție precisă?', '121');
  if (grade >= 2) {
    const explanation = grade === 2 ? 'Ritualul Calfei, p. 30, enumeră uneltele lângă platforma Primului Supraveghetor. Platoul redus este o convenție de prezentare pentru studiu; nu simulează ceremonia.' : 'Ritualul Maestrului, p. 14, reprezintă aceste unelte în Tabloul Camerei de Mijloc. Exemplarele de studiu sunt prezentate separat, lângă Primul Supraveghetor; dispunerea ceremonială nu este activată.';
    for (const [key, label, description] of [
      ['ruler', 'Rigla', 'Rigla gradată permite observarea măsurii și compararea lungimilor.'],
      ['lever', 'Levierul', 'Levierul are o tijă și un capăt de sprijin; se studiază împreună cu Rigla.'],
      ['working-square', 'Echerul de lucru', 'Echerul cu două brațe perpendiculare este separat de Echerul de pe Cartea Legii Sacre.'],
      ['working-compass', 'Compasul de lucru', 'Compasul de lucru are două brațe și o articulație; este separat de Compasul Marilor Lumini.'],
    ]) add(key, label, description, prefix(`study-${key.replace('working-', '')}`), 'Cum folosești observația și măsura pentru a verifica lucrarea?', '121', explanation);
  }
  if (grade === 2) add('wheat', 'Spicul de grâu', 'Spicul este reprezentat lângă Coloana Jachin, conform descrierii Tabloului Calfei. Micul model tridimensional este o transpunere pentru explorare.', prefix('study-wheat'), 'Ce relație observi între germinare, timp și maturizarea unei lucrări?', '121');
  if (grade === 3) {
    add('acacia', 'Ramura de Acacia · planșă', 'O ramură stilizată de Acacia este reprezentată în relief pe planșa Maestrului. Ea completează desenul Tabloului Camerei de Mijloc.', prefix('study-acacia'), 'Ce alegi să păstrezi și să transmiți dintr-o lucrare comună?', '121');
    add('trowel', 'Mistria · studiu suplimentar', 'Mistrie cu lamă triunghiulară și mâner ridicat, adăugată la cererea Lojei ca reper suplimentar de studiu.', prefix('study-trowel'), 'Cum poate finisarea unei lucrări să unească părțile într-un ansamblu coerent?', '121', 'Mistria nu a fost identificată în listele de unelte din ritualurile 2012 furnizate. Prezența sa aici este o convenție pedagogică a aplicației, nu o cerință atribuită acelor ritualuri.');
  }
  const extraSources = {
    'grand-master-seat': `${SOURCE}, p. 124`,
    ...(grade >= 2 ? Object.fromEntries(['ruler','lever','working-square','working-compass'].map(key => [key, grade === 2 ? 'Ritualul Calfei 2012, p. 30' : 'Ritualul Maestrului 2012, p. 14'])) : {}),
    ...(grade === 2 ? {wheat:'Ritualul Calfei 2012, p. 15', 'cubic-stone':`${SOURCE}, p. 121; Ritualul Calfei 2012, p. 15`} : {}),
    ...(grade === 3 ? {acacia:'Ritualul Maestrului 2012, p. 14', trowel:'Reper suplimentar solicitat de Lojă; fără atestare în ritualurile furnizate'} : {}),
  };
  const architecture = scene.architecture.map(part => {
    // Last match wins: a globe has its own card, distinct from its column.
    const match = definitions.filter(item => item.selector(part.id)).at(-1);
    return match ? { ...part, interactionId: `discover-${match.key}` } : { ...part };
  });
  const items = definitions.filter(item => ['mosaic', 'border'].includes(item.key) || architecture.some(part => part.interactionId === `discover-${item.key}`)).map(item => ({
    id: `discover-${item.key}`, kind: 'symbol', label: item.label, description: item.description,
    presentation: 'architecture', route: '/biblioteca', actionLabel: 'Deschide biblioteca',
    sourceRef: extraSources[item.key] || (['globe-b', 'globe-j', 'star'].includes(item.key) ? 'Ritualul Calfei 2012, p. 61' : item.source),
    education: {
      objective: `Descoperă templul · ${NAMES[grade]}`,
      prompt: item.prompt,
      steps: [],
      sections: [
        ...(item.extra ? [{ title: 'Reper pentru această scenă', body: item.extra }] : []),
        studyForElement(item.key, grade, item.label),
        ...(grade > 1 ? [{ title: 'Referința gradului', body: GRADE_SOURCE[grade] }] : []),
      ],
    },
  }));
  const replaced = new Set(['g1-rough-stone', 'g2-cubic-stone', 'g3-acacia', 'g1-plumb-axis', 'g1-mosaic-floor', 'g1-three-pillars', 'g1-threshold-columns', 'g1-great-lights', 'g1-star-vault', 'g2-blazing-star', 'g2-paired-spheres', 'g2-great-lights', 'g2-tracing-board', 'g3-great-lights', 'g3-master-board']);
  return {
    ...scene, architecture,
    environment: { ...scene.environment, floor: { ...scene.environment.floor, interactionId: 'discover-mosaic', borderInteractionId: 'discover-border' } },
    interactives: [...items, ...scene.interactives.filter(item => !replaced.has(item.id.replace(/^catalog-/, ''))).map(item => item.kind === 'symbol' ? { ...item, presentation: 'list' } : item)],
  };
}

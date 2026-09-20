// Server-only: only the selected, authorized degree is serialized to the client.
import { ZODIAC_SIGNS } from '../zodiac.js';

const NAMES = { 1: 'Ucenic', 2: 'Calfă', 3: 'Maestru' };
const SOURCE = 'Ritualul Ucenicului 2012';
const GRADE_SOURCE = { 1: `${SOURCE}, pp. 120–122`, 2: 'Ritualul Calfei 2012, p. 61', 3: 'Ritualul Maestrului 2012, p. 69' };
const APPROACH = {
  1: 'Observă forma, numește elementul și găsește-i locul în ansamblu. Formulează o întrebare pornind de la ceea ce vezi.',
  2: 'Compară forma și poziția cu reperele deja cunoscute. Urmărește proporțiile și relațiile dintre elemente.',
  3: 'Privește elementul în ansamblul Camerei de Mijloc. Pregătește o explicație clară și verificabilă, potrivită gradului celui căruia o transmiți.',
};
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
  add('square', 'Echerul', 'Echerul este una dintre uneltele simbolice așezate pe Cartea Legii Sacre. Relația sa cu brațele Compasului este specifică gradului.', id => id === 'vsl-square', 'Cum verifici corectitudinea unei decizii folosind un reper stabil?', '121', LIGHTS[grade]);
  add('compass', 'Compasul', 'Compasul este așezat pe Cartea Legii Sacre, împreună cu Echerul. Descrierea ritualului stabilește poziția brațelor sale în raport cu Echerul.', id => id === 'vsl-compass', 'Cum alegi măsura potrivită pentru o acțiune sau o judecată?', '121', LIGHTS[grade]);
  add('board', `Planșa gradului · ${NAMES[grade]}`, 'Planșa se află pe pavajul mozaicat, între cei trei stâlpi. Ea reunește reperele gradului într-un suport pentru observare și studiu.', id => id === 'tracing-board', 'Ce legătură poți explica între două repere ale planșei?', '122', `Este afișată planșa pentru ${NAMES[grade]}. Desenul din aplicație este stilizat.`);
  for (const [key, label, side] of [['b', 'Boaz', 'Miazănoapte'], ['j', 'Jachin', 'Miazăzi']]) {
    add(`column-${key}`, `Coloana ${label}`, `Coloana ${label} se află la Occident, spre ${side}, lângă intrare. Cele două coloane sunt dispuse simetric față de axa longitudinală a templului.`, prefix(`column-${key}-`), 'Cum contribuie perechea de coloane la recunoașterea pragului?', '122', grade === 1 ? 'În gradul de Ucenic, capitelul poartă trei rodii întredeschise.' : 'În această scenă sunt folosite sferele descrise în ritualul Calfei; acestea au și o variantă de reprezentare pe planșă.');
    if (grade >= 2) add(`globe-${key}`, key === 'b' ? 'Sfera terestră' : 'Sfera celestă', key === 'b' ? 'Sfera terestră este reprezentată pe capitelul coloanei Boaz. Ea oferă un reper pentru observarea lumii pământești.' : 'Sfera celestă este reprezentată pe capitelul coloanei Jachin. Ea oferă un reper pentru orientarea privirii către cer.', id => id === `column-${key}-globe` || id === `column-${key}-globe-stand`, 'Cum pui în relație observarea lumii apropiate și a unui ansamblu mai cuprinzător?', '122', 'Ritualul Calfei 2012, p. 61: folosirea sferelor depinde de recuzita disponibilă; alternativa este reprezentarea lor pe planșă.');
  }
  if (grade === 2) add('star', 'Steaua înflăcărată', 'În Loja Calfelor, Steaua Înflăcărată se află la Orient, în fața mesei Maestrului Venerabil. Este un reper propriu acestei configurații a scenei.', prefix('flaming-star'), 'Ce relație observi între simetrie, proporție și ordinea unei construcții?', '120', 'Amplasare: Ritualul Calfei 2012, p. 61.');
  for (const [key, label, count, page] of [['vm', 'Maestrului Venerabil', 3, '120'], ['warden1', 'Primului Supraveghetor', 2, '122'], ['warden2', 'celui de-al Doilea Supraveghetor', 1, '122']]) {
    add(`candles-${key}`, `Sfeșnicul ${label}`, `Pe masa ${label} se află un sfeșnic cu ${count === 1 ? 'o lumânare' : `${count} lumânări`}. Acest ansamblu este distinct de lumânările celor trei colonete.`, prefix(`${key}-candelabrum-`), 'Cum te ajută numărul și poziția luminilor să recunoști locurile din templu?', page);
    add(`gavel-${key}`, `Ciocanul ${label}`, `Ciocanul de lemn se află pe masa ${label}. Este un obiect al funcției și al conducerii lucrărilor.`, prefix(`${key}-gavel`), 'Cum poți exercita o responsabilitate cu măsură și claritate?', page);
  }
  add('sword', 'Spada de la Orient', 'Spada Înflăcărată este enumerată în ritual între obiectele de pe masa Maestrului Venerabil. În scenă este reprezentată schematic.', id => id === 'vm-sword', 'Cum deosebești simbolul unei responsabilități de persoana care o exercită?', '120');
  for (const sign of ZODIAC_SIGNS) {
    const side = sign.side === 'north' ? 'Miazănoapte' : 'Miazăzi';
    add(`zodiac-${sign.id}`, `Zodiac · ${sign.label}`, `${sign.label} face parte din grupa celor șase semne de la ${side}. Medalionul este așezat deasupra coloanei laterale corespunzătoare, în apropierea bolții.`, id => [`zodiac-${sign.id}`, `zodiac-support-${sign.id}`, `zodiac-base-${sign.id}`, `zodiac-capital-${sign.id}`].includes(id), 'Unde se află acest semn față de Orient și față de celelalte semne de pe aceeași latură?', '119–120', 'Ritualul indică grupele pe laturi. Sensul longitudinal din aplicație este o convenție vizuală; nu se atribuie semnului o interpretare astrologică individuală.');
  }
  const architecture = scene.architecture.map(part => {
    // Last match wins: a globe has its own card, distinct from its column.
    const match = definitions.filter(item => item.selector(part.id)).at(-1);
    return match ? { ...part, interactionId: `discover-${match.key}` } : { ...part };
  });
  const items = definitions.filter(item => ['mosaic', 'border'].includes(item.key) || architecture.some(part => part.interactionId === `discover-${item.key}`)).map(item => ({
    id: `discover-${item.key}`, kind: 'symbol', label: item.label, description: item.description,
    presentation: 'architecture', route: '/biblioteca', actionLabel: 'Deschide biblioteca',
    sourceRef: ['globe-b', 'globe-j', 'star'].includes(item.key) ? 'Ritualul Calfei 2012, p. 61' : item.source,
    education: {
      objective: `Descoperă templul · ${NAMES[grade]}`,
      prompt: item.prompt,
      steps: [],
      sections: [
        ...(item.extra ? [{ title: 'Reper pentru această scenă', body: item.extra }] : []),
        { title: `Studiu · ${NAMES[grade]}`, body: APPROACH[grade] },
        ...(grade > 1 ? [{ title: 'Referința gradului', body: GRADE_SOURCE[grade] }] : []),
      ],
    },
  }));
  const replaced = new Set(['g1-plumb-axis', 'g1-mosaic-floor', 'g1-three-pillars', 'g1-threshold-columns', 'g1-great-lights', 'g1-star-vault', 'g2-blazing-star', 'g2-paired-spheres', 'g2-great-lights', 'g2-tracing-board', 'g3-great-lights', 'g3-master-board']);
  return {
    ...scene, architecture,
    environment: { ...scene.environment, floor: { ...scene.environment.floor, interactionId: 'discover-mosaic', borderInteractionId: 'discover-border' } },
    interactives: [...items, ...scene.interactives.filter(item => !replaced.has(item.id.replace(/^catalog-/, ''))).map(item => item.kind === 'symbol' ? { ...item, presentation: 'list' } : item)],
  };
}

# Edificiul Viu — experiență Three.js

Modul autonom pentru scena privată `porți → atrium`, construit cu Blaze, Meteor 3 și Three.js încărcat dinamic.

Documentația completă a elementelor 3D, scenelor pe grade, fallback-ului, securității și limitărilor se află în [TEMPLU_3D.md](./TEMPLU_3D.md).

## Integrare

În intrarea client se înlocuiește:

```js
import '/imports/system/temple/client';
```

cu:

```js
import '/imports/system/experience/client';
```

Modulul nou înregistrează singur rutele duale `/templu` și `/portal/templu`. Din layout trebuie eliminat `{{> csaPortalGate}}`; poarta nouă face parte din același canvas persistent ca atriumul.

În intrarea server se adaugă:

```js
import '/imports/system/experience/server';
```

Importul server al vechiului templu poate rămâne temporar pentru consumatorii metodelor `temple.context` și `temple.scene`. Metoda nouă este `temple.experienceManifest`.

## Contract client

Template-ul `csaTempleExperience` poate primi opțional:

- `manifest`: obiect sau funcție async; în lipsă este apelată metoda Meteor;
- `onSelect(item)`;
- `onEntered(manifest)`;
- `onNavigate(item)`.

Manifestul este normalizat defensiv în client. Three.js și motorul 3D sunt descărcate numai când template-ul este randat.

## Securitate

- ACL-ul compus validează autentificarea, tenantul, apartenența și gradul.
- Serverul apelează catalogul cu gradul efectiv și numai codurile funcțiilor active.
- Clientul primește exclusiv scena gradului efectiv; scenele celorlalte grade rămân în module server-only.
- Geometria este procedurală; nu există asseturi sensibile în `public/`.
- Manifestul nu conține texte ritualice lungi, date de recunoaștere sau sursele integrale.
- Accesul la manifest este auditat și limitat la 60 de apeluri/minut/utilizator autentificat, plus 90 de apeluri/minut/conexiune.

## Performanță și accesibilitate

- tier-uri `low`, `balanced`, `high` cu alegere automată;
- maximum 30 FPS și DPR 1.25 pe mobil;
- `prefers-reduced-motion` elimină tranziția și mișcarea ambientală;
- fallback funcțional complet când WebGL nu este disponibil; decorul vizual este o siluetă CSS/2.5D;
- toate reperele interactive 3D există și într-o listă semantică navigabilă cu tastatura;
- bottom-sheet pe mobil;
- la distrugerea template-ului sunt oprite frame-urile, observatorii și evenimentele și sunt eliberate geometriile, materialele și contextul WebGL.

## Compoziția scenei

Presetul din `server/scenes.js` furnizează mediul, camera, pardoseala și arhitectura procedurală. Catalogul editorial înlocuiește titlul, subtitlul, motivul și reperele simbolice/funcționale. Din preset se păstrează reperele de navigare (`assembly`, `concept`, `dashboard`, `library`, `mentor`, `project`); simbolurile și funcțiile efective sunt regenerate din catalogul filtrat pe server.

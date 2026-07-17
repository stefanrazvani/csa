# Platformă CSA – stare implementare

Data publicării: 13 iulie 2026.

## Adrese active

- dezvoltare Meteor/Passenger: `http://192.168.177.68:18600`;
- site public: `http://192.168.177.68:18610`;
- portal privat protejat: `http://192.168.177.68:18610/portal/`;
- producție planificată: `https://reperta.via-nova.ro/portal/` după configurarea TLS.

## Servicii și persistență

Sunt active și `healthy`: MongoDB 8, cele două instanțe Meteor 3.4/Passenger,
Nginx gateway, gateway-auth, MinIO, ClamAV, ArangoDB 3.12, OpenSearch 3.7 și
content-worker. MinIO, ArangoDB și OpenSearch nu publică porturi pe LAN.

Volumele externe persistente sunt `csa_mongo_data`, `csa_mongo_config`,
`csa_meteor_data`, `csa_meteor_home`, `csa_minio_data`, `csa_arangodb_data`,
`csa_opensearch_data`, `csa_search_snapshots` și `csa_clamav_signatures`.

## Funcționalitate publicată

- site public fără referințe masonice, login cu particule, înregistrare și recuperare parolă;
- bundle privat blocat înainte de autentificarea gateway;
- porți 3D cu trei bătăi/tap-uri, alternativă accesibilă, focus trap, tastatură și `prefers-reduced-motion`;
- templu procedural Three.js/WebGL, cu scene distincte pe grade, raycasting și manifest filtrat server-side după grad și funcție;
- fallback vizual fără WebGL cu boltă, arhitectură, lumină și pavaj în perspectivă, utilizabil integral din lista semantică;
- catalog editorial server-only pentru simboluri, ofițeri și parcursuri educative; conținutul opțional nu este publicat fără release explicit;
- Dosare Frați cu identitate, contact, profesie, asociere, cronologie, sponsori, note, documente și participare;
- registru matricol generat și exportabil CSV din apartenențe, grade, funcții și istoricul auditat;
- upload/download PDF și DOCX pentru dosare prin gateway, cu ClamAV, MinIO versionat, ticket unic și revalidare ACL înainte de download;
- registru matricol, grade, funcții anuale, delegări și audit;
- convocatoare, articole pe grade, prezențe și confirmări migrate;
- bibliotecă text-first, DOCX/PDF text, MinIO, ClamAV, editor de verificare și reader;
- dezbateri, mesaje, adnotări stabile și concepte/legături manuale;
- proiecție full-text în OpenSearch și graf în ArangoDB;
- Metale cu flux draft/aprobat/înregistrat/reversat;
- Ospitalier și invitații pentru vizitatori;
- layout responsive, fără overflow orizontal și cu ținte tactile de minimum 44 px în autentificare.

MongoDB rămâne sursa canonică. Publicarea bibliotecii și reversarea financiară
folosesc tranzacții MongoDB. Workerul rulează maximum două joburi simultan și
nu include OCR; documentele fără text suficient devin `unsupported_scan`.

## Verificări

- 10/10 containere `healthy` după recreare;
- build Meteor 3 și bundle server fără vulnerabilități npm de producție;
- gateway-auth și content-worker: audit npm cu zero vulnerabilități;
- teste unitare MIME/DOCX/PDF și proiecții: 6/6;
- smoke real: gateway session, bundle anonim blocat, login DDP, dashboard;
- smoke platformă: registru, templu, bibliotecă, Metale, Ospitalier și vizitatori;
- QA browser: site public, modal login, recuperare, înregistrare, particule și bundle direct;
- QA browser responsive: poartă și triplu tap la 390×844, navigator mobil, dialog modal/Escape/focus, templu desktop 1440×900 și Dosare Frați fără overflow;
- fallback-ul a fost verificat în browserul intern fără WebGL; bundle-ul include Three.js 0.185.1 (MIT) pentru browsere cu WebGL;
- ACL reactiv: revocarea/expirarea apartenenței, gradului, funcției, delegării, rolului sau tenantului retrage imediat publicațiile PII și reîncarcă manifestul templului;
- teste locale: 70 fișiere JavaScript validate sintactic, 14/14 teste gateway, schema import 9/9, contractul de securitate dossiers și catalogul editorial;
- datele migrate au rămas la 25 convocatoare, 559 articole, 24 prezențe și 462 confirmări;
- backup logic complet valid: `post-platform-20260713`.
- validare release curent: 20/20 teste unitare și 106/106 fișiere sursă identice cu commitul publicat;
- backup logic înainte de release: `pre-release-20260718-022123-8445e883cfe9`;
- backup cod/gateway cu SHA-256: `pre-3d-dossiers-20260713T162926Z`;
- release activ: `csa-app-release-20260718-022123-8445e883cfe9`, SHA-256 `1bbb115e380fe487564f72fd43f142b1eb068bad070f922a9388214eaee9fb0a`;
- sursă release: commit GitHub `8445e883cfe97e36b68bdf517875136e36234ccc`, tag `release-20260718-022123`;
- conținut release: Secretarul și Oratorul pe estradă orientați spre pupitrele de jos, Ospitalierul și Trezorierul sub estradă față în față peste sală, balustrada retrasă din dreptul scărilor laterale, spada Expertului la primul scaun al Coloanei de Miazănoapte; anterior: Altarul Jurămintelor lipit de estrada Maestrului Venerabil cu axul central liber (trepte laterale), blaturi înclinate care arată orientarea pupitrelor, Maestrul de Ceremonii și Acoperitorul aduși în interiorul Templului, funia cu mai multe noduri-opt; anterior: Secretarul și Oratorul cu fața spre Occident, Ospitalierul și Trezorierul față în față cu blaturi înclinate, Primul Supraveghetor spre colțul de Miazănoapte al intrării, Maestrul de Ceremonii în stânga Coloanei Boaz și Acoperitorul cu spada verticală în dreapta Coloanei Jachin, pavajul cu colonetele, firul cu plumb și Tabloul Lojii mutate în mijlocul Templului, camera adusă în față cu rotire aproape completă spre coloane și markerele-piramidă fără reprezentare eliminate din scenă;
- incident anterior (16 iulie): backend-ul `urgentit-apps` de pe portul `3008` (alt stack, pe același host) nu a răspuns câteva ore și a blocat canalul de comenzi Sentinel; fără impact asupra aplicației CSA;
- după release: 10/10 containere `healthy`, `200` pentru `/templu` pe `18600` și pentru gateway pe `18610`, redirect la login pentru `/portal/` anonim, fără erori runtime în ultimele loguri.

Documentele din `C:\Proiecte\CSA` au fost folosite exclusiv drept surse de proiectare și structurare. Nu au fost modificate și nu au fost importate în bibliotecă.

## Configurare necesară înainte de domeniul public

- alocarea manuală a gradelor utilizatorilor migrați;
- atribuirea mandatelor anuale Secretar/Trezorier/Ospitalier/Bibliotecar/Mentor;
- configurarea TLS pentru `reperta.via-nova.ro`;
- `CSA_GATEWAY_COOKIE_SECURE=1` și HSTS după validarea TLS;
- backup off-host criptat și test periodic de restore.

# Release CSA — unelte și reperele Orientului, 20 septembrie 2026

Cod: `b2d73ca`; tag: `release-20260920-temple-tools`.
Manifest: `2026.09.20-8`.
Artefact: `csa-app-release-b2d73ca.tar.gz`.
SHA-256: `0293b85889e943f6f9d15fd6e2343327d52de451e2962d5888d00bd953cdb2d4`.

## Rezultat

- Scaunul Marelui Maestru separat de tronul Venerabilului și de băncile de la Orient, cu fișă individuală. Amplasare conform Ucenicul p. 124.
- Plumb ridicat la y=3.06; fir subțire scurtat la 4 unități, păstrând prinderea de boltă.
- Steaua Calfei coborâtă la y=0.53, rază 0.4, pe suport jos în fața bazei altarului. Test de proiecție prin camera inițială confirmă separarea de carte a Stelei și a plumbului.
- Pietre mici pe treptele Orientului, ciocan și daltă lângă altar; riglă, levier, echer și compas de lucru de la gradul II; spic de grâu la Calfă, acacia în relief și mistrie suplimentară la Maestru. Modelele decorative mari eliminate anterior nu reapar.
- Mistria este marcată explicit ca reper suplimentar fără atestare în ritualurile furnizate. Distincția dintre recuzită ceremonială, tablouri și prezentare educativă este consemnată în fișe și `REFERINTE_TEMPLU.md`.
- Brațe reale pentru Echer și Compas pe carte, cu suprapunere pe grad. Planșele Calfei și Maestrului completate cu reperele grafice identificate în surse.
- Spadele Expertului și Acoperitorului au lame teșite, vârf, canelură, gardă, mâner și pomel. Toate piesele selectează aceeași fișă a spadei respective.
- 56/64/64 fișe arhitecturale și 687/711/711 piese la gradele I/II/III; deduplicare a fișelor vechi pentru pietre și acacia.

## Verificări

- 15 teste locale trecute: geometrie reală, limitele manifestului, selecții, occludere, ACL editorial, adaptarea pe grad, suprapunerea uneltelor și proiecția față de carte.
- Inspecție SVG a geometriilor: stea/altar, spadă, unelte, scaun, pietre pe trepte, Marile Lumini. Planșele canvas au fost revizuite pentru suprapuneri grafice.
- Build finalizat, audit bundle final: zero vulnerabilități. `RELEASE_OK_b2d73ca`.
- Testele live pentru autentificare, liste/profil, grade, obiecte noi și limitarea cererilor la gradul autorizat au trecut.
- 153/153 fișiere identice cu arhiva; 10/10 containere CSA healthy.
- UI live: scaunul Marelui Maestru și fișa individuală, căutarea și fișa mistriei suplimentare, trecerea la Ucenic cu pietrele și fișa pietrei brute, apoi Calfă cu descrierea Stelei coborâte. Verificare în fallback; WebGL indisponibil în VM. Geometria și proiecția au fost verificate separat prin Three.js și SVG.
- Contul, loja și sesiunile temporare de test au fost eliminate după verificare.

## Operațiuni

Host Docker `192.168.177.68`; containere CSA Meteor `csa-meteor-1`, `csa-meteor-portal-1`.
Backup: `pre-release-temple-tools-20260920` (finalizat).
Versiunea anterioară este păstrată în `csa.previous.b2d73ca` și `csa-build.previous.b2d73ca`.
Loguri în `/home/urgentit/csa-setup/releases`: `build-b2d73ca.log`, `promote-b2d73ca.log`.
Promovare cu rollback automat și termen de inițializare de 900 secunde.
Verificări reproductibile: `deploy/temple-discovery-smoke.mjs`.
Testare: http://192.168.177.68:18610/portal/templu (Ctrl+F5).

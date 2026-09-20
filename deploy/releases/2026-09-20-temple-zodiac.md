# Release CSA — colonete, lumânări și zodiac, 20 septembrie 2026

Cod: `a10590c`; tag: `release-20260920-temple-zodiac`.
Artefact: `csa-app-release-a10590c.tar.gz`.
SHA-256: `f7d1cbe699bb031bab9a06e480e3d3043180f78351f992beba1cf0d0d8df4fb8`.

## Rezultat

- Colonetă ionică cu muluri și coliere; corintică cu fus canelat, două coroane de câte opt frunze de acant, nervuri și rozetă.
- Nouă lumânări cu ceară profilată, picătură, fitil și flacără netedă cu miez luminos. Numărul 3/2/1 pe mese și rotația Primului Supraveghetor sunt păstrate.
- 12 medalioane zodiacale cu simbol și denumire, câte șase în dreptul coloanelor laterale, sub boltă. Grupele pe laturi respectă Ritualul Ucenicului 2012 pp. 119–120. Ritualurile Calfei p. 61 și Maestrului p. 69 păstrează arhitectura comună.
- Sensul longitudinal ales formează un circuit continuu; acesta este o convenție vizuală, deoarece textul nu îl fixează explicit. Stelele existente sunt decorative, fără hartă astronomică exactă.
- Referințele furnizate în `documente/` sunt inventariate în `REFERINTE_TEMPLU.md`, păstrate local și excluse din Git/bundle.
- Manifest: `2026.09.20-5`; 656/650/648 piese la gradele 1/2/3, sub limita 768.

## Verificări

- Cinci teste de scenă și testul catalogului editorial/ACL au trecut: geometrie, lipsa trunchierii, orientare, acces pe grade, lumânări, laturile zodiacului și texturi permise.
- Geometriile reale au fost inspectate prin SVGRenderer; cele 12 texturi procedurale au fost inspectate în browser. Flăcările finale sunt netede și simbolurile lizibile. VM-ul nu are WebGL disponibil.
- Verificările live au trecut pentru toate cele trei grade: zodiac, colonete, lumânări, detaliile Orientului, mobilier și eliminările decorative precedente. Autentificarea, profilul și accesul la date au trecut verificările de regresie.
- 149/149 fișiere sursă publicate identice cu arhiva; 10/10 containere CSA `healthy`.

## Publicare și revenire

Host Docker: `192.168.177.68`; servicii recreate: `meteor`, `meteor-portal`.
Backup: `pre-release-temple-zodiac-20260920`.
Sursa și bundle-ul anterior: `/var/meteor/csa.previous.a10590c`, `/var/meteor/csa-build.previous.a10590c`.
Arhiva, scripturile și logurile: `/home/urgentit/csa-setup/releases`.
Promovarea include rollback automat dacă verificările obligatorii eșuează.
Prima încercare a revenit automat la versiunea anterioară: inițializarea permisiunilor
containerelor a depășit termenul de 200 secunde. Reîncercarea cu același build și
termen de 900 secunde s-a încheiat cu `RELEASE_OK_a10590c`.
Log final: `/home/urgentit/csa-setup/releases/promote-a10590c-retry.log`.

Testare: http://192.168.177.68:18610/portal/templu — reîncărcare completă.

# Release CSA — funcții, coloane și pupitre, 20 septembrie 2026

Cod: `f752c06`; tag: `release-20260920-temple-stations`.
Manifest: `2026.09.20-7`.
Artefact: `csa-app-release-f752c06.tar.gz`.
SHA-256: `d583ee308813c41de060c9faa28475e9ea2436ad5c30842a1a8f6fbb3747c19a`.

## Rezultat

- 51/54/53 fișe la gradele 1/2/3: cele 10 funcții prin pupitre/scaune, spadele Expertului și Acoperitorului, bastonul MC, rândurile și băncile laterale.
- Scaunul de lângă spada Expertului este asociat funcției sale; celelalte scaune și băncile deschid informația coloanei de participanți.
- Așezarea este contextuală: Ucenici la Miazănoapte și Calfe la Miazăzi în scena gradului I; fără Ucenici prezenți în gradul II; numai Maeștri în Camera de Mijloc.
- Fiecare element are text pedagogic distinct pe grad în `server/study-notes.js`. Descrierile factuale comune sunt păstrate; studiul propus nu este prezentat ca citat ritual.
- Steaua Calfei stă pe suport independent în fața altarului, conform cerinței utilizatorului; această adaptare este identificată în fișă. Decorul fallback reflectă mutarea.
- Blaturile Secretarului, Oratorului, Ospitalierului și Trezorierului sunt simple, orizontale și în contact cu corpul pupitrelor, conform confirmării utilizatorului.
- Explicarea unei funcții nu acordă drepturi de operare și nu publică identitatea titularului. ACL pe grad și toate modificările vizuale anterioare sunt păstrate.

## Verificări

- 13 teste locale: geometrie, raycasting, legături obiect–fișă, grade, texte distincte, blaturi în contact, poziția și suportul stelei, regresii anterioare.
- Previzualizare SVG a geometriilor reale: stea/altar, Secretar, Ospitalier, scaun/spadă Expert. WebGL nu este disponibil în VM.
- Build finalizat; auditul dependențelor bundle-ului final raportează zero vulnerabilități. Activare confirmată prin `RELEASE_OK_f752c06`.
- Testele live au trecut pentru autentificare, publicații, profil, ACL și toate cele trei grade: 51/54/53 fișe. Cererile unui grad superior accesului utilizatorului sunt limitate server-side; administratorul poate vizualiza corect și gradele inferioare.
- 152/152 fișiere sursă identice cu arhiva; 10/10 containere CSA healthy.
- UI live verificată: căutare Expert și fișa funcției, coloana de Miazănoapte la Maestru, schimbare la Ucenic cu actualizarea fișei, apoi Steaua Calfei și explicația amplasării. Captura interfeței confirmă afișarea fișei în modul simplificat; randarea WebGL interactivă nu a putut fi verificată în această VM.
- Contul și loja temporară folosite pentru testarea UI au fost eliminate; testele automate își elimină propriile fixture-uri.

## Operațiuni

Host Docker `192.168.177.68`, containere `csa-meteor-1` și `csa-meteor-portal-1`.
Backup: `pre-release-temple-stations-20260920`.
Versiunea anterioară: `/var/meteor/csa.previous.f752c06`, `/var/meteor/csa-build.previous.f752c06`.
Loguri: `/home/urgentit/csa-setup/releases/build-f752c06.log`, `promote-f752c06.log`.
Promovare cu rollback automat și termen de inițializare de 900 secunde.
Test live reproductibil: `deploy/temple-discovery-smoke.mjs`.
Testare: http://192.168.177.68:18610/portal/templu (Ctrl+F5).

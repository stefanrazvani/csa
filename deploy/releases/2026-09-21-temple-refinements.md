# Release CSA — pietre, funie și contrast, 21 septembrie 2026

Cod: `d831eb7`; tag: `release-20260921-temple-refinements`.
Manifest: `2026.09.21-1`.
Artefact: `csa-app-release-d831eb7.tar.gz`.
SHA-256: `f5b53cc381c2c3ce697e0cea286e3778093ff5e00e6839acd7b12dfe33da72da`.

## Modificare

Piatra brută de pe prima treaptă nordică și piatra cubică de pe a doua
treaptă sudică sunt mutate spre altar: x=−2.85 / +2.85 în loc de −3.6 / +3.6.
Vârful Calfei se mută împreună cu baza. Înălțimile, adâncimea pe trepte,
dimensiunile, gradele și selecțiile individuale sunt păstrate. Fișele explică
amplasarea la capetele interioare ale treptelor. Meniul corectat rămâne inclus.

Funia are acum un singur tub continuu, cu patru colțuri rotunjite, între
ciucurii de la intrare. Vechile laturi cilindrice depășeau limita de 20 m
aplicată la normalizare, provocând întreruperile observate. Noua geometrie
`tubePath` normalizează cel mult 16 puncte și păstrează selecția funiei.
Plumbul are material argintiu mat, iar scaunul VM are lemn mai deschis și
tapițerie bordo; emisivitatea discretă păstrează contrastul în lumina slabă.
Sunt 684/708/708 piese și 56/64/64 fișe pe grade.

## Verificări locale

16 teste trecute. Testul geometriei verifică amprenta completă a pietrelor
pe treptele aferente, distanța față de mijlocul treptelor și alinierea
vârfului cu baza cubică. Previzualizare SVG din geometriile reale verificată
dinspre intrare și de sus. WebGL nu este disponibil în VM; iluminarea WebGL
nu a fost evaluată vizual.

Testul funiei verifică lungimea completă după normalizare, apropierea de
fiecare colț și continuitatea inelelor tubului. Previzualizările geometriei
și noilor materiale au fost inspectate în SVG, inclusiv un colț mărit.

## Operațiuni

Build finalizat, auditul bundle-ului final fără vulnerabilități.
`RELEASE_OK_d831eb7`: autentificare, grade/ACL și manifest actual trecute;
smoke-ul verifică explicit noile poziții ale pietrelor, traseul continuu și
materialele plumbului/scaunului VM. 153/153 fișiere active identice cu arhiva;
10/10 servicii CSA healthy.

Host Docker `192.168.177.68`, containere `csa-meteor-1` / `csa-meteor-portal-1`.
Backup: `pre-release-stones-20260921`.
Versiunea anterioară: `csa.previous.d831eb7` / `csa-build.previous.d831eb7`.
Loguri în `/home/urgentit/csa-setup/releases`: `build-d831eb7.log`, `promote-d831eb7.log`.
Promovare cu rollback automat. Testare: http://192.168.177.68:18610/portal/templu.

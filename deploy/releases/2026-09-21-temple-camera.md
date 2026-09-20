# Release CSA — perspectivă inițială, 21 septembrie 2026

Cod: `4aaf68f`; tag: `release-20260921-temple-camera`.
Manifest: `2026.09.21-2`.
Artefact: `csa-app-release-4aaf68f.tar.gz`.
SHA-256: `5b5e60a78b4364aa9992841e1fc63a36d19e6a1fbd2563c5cfdcde50bd97ee64`.

## Modificare

Camera este retrasă în interiorul porții, la [-0.6, 3.8, 11.05], ușor spre
stânga. Ținta este [0, 2.15, -5.2]. Încadrarea inițială cuprinde simultan
ambele sfere ale coloanelor de la intrare și altarul; nu există comutator
separat de perspectivă. Gradul I păstrează rodiile, iar gradele II/III sferele.
Unghiul vertical de bază este 84°, minimum orizontal 116°, recalculat la
redimensionare, cu plafon vertical 155° pentru ferestre înguste.
Rotirea liberă prin tragere rămâne disponibilă. Geometria nu este mutată.

## Verificări locale

17 teste trecute. Proiecția vertexurilor verifică sferele și cele două
pagini ale cărții la 1600×900, 1100×900, 600×900 și 390×844. Raycasting prin
geometria completă confirmă că nu sunt blocate de pereți sau de poartă.
Steaua rămâne sub carte, iar plumbul deasupra, cu cel puțin 9 px separare
în proiecția de 900 px înălțime. Verificare suplimentară la deplasările
paralaxei ±0.22 lateral/±0.1 vertical: sferele rămân în cadru.
WebGL este indisponibil în VM; validarea proiecției și ocluziei este geometrică.

## Operațiuni

Build finalizat și auditul bundle-ului final fără vulnerabilități.
`RELEASE_OK_4aaf68f`: autentificare, grade/ACL și manifest actual trecute;
smoke-ul confirmă poziția camerei și unghiurile noi pentru fiecare grad.
153/153 fișiere active identice cu arhiva; 10/10 servicii CSA healthy.

Host Docker `192.168.177.68`, containere `csa-meteor-1` / `csa-meteor-portal-1`.
Backup: `pre-release-camera-20260921`.
Versiunea anterioară: `csa.previous.4aaf68f` / `csa-build.previous.4aaf68f`.
Loguri în `/home/urgentit/csa-setup/releases`: `build-4aaf68f.log`, `promote-4aaf68f.log`.
Promovare cu rollback automat. Testare: http://192.168.177.68:18610/portal/templu.

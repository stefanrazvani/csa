# Release CSA — altar înclinat, 20 septembrie 2026

Cod: `9f31f7d`; tag: `release-20260920-temple-altar`.
Manifest: `2026.09.20-9`.
Artefact: `csa-app-release-9f31f7d.tar.gz`.
SHA-256: `0b3ca16da3beee35db22d243bda2413a8c9b8a4bb54bfe7158dcb9da1e3427a1`.

## Modificare

Blatul altarului este înclinat cu 25° spre intrare (+Z). Cartea, Echerul și
Compasul se rotesc rigid împreună cu blatul; pozițiile relative și suprapunerile
pe grad rămân păstrate. Centrul blatului este ridicat la y=1.27 pentru a
elibera coloana de susținere; un suport scurt asigură legătura mecanică.
Număr piese I/II/III: 688/712/712; fișe: 56/64/64.

## Verificări

Cele 15 teste existente au trecut: inclusiv suprapunerea pe grade, selecții,
geometriile finite și proiecția care separă Steaua/plumbul de carte.
Inspecție SVG cu geometriile reale: vedere dinspre intrare și din profil.
WebGL nu este disponibil în VM; iluminarea WebGL nu este verificată vizual.
Build finalizat, auditul bundle-ului final: zero vulnerabilități.
`RELEASE_OK_9f31f7d`: autentificare, grade, selecții și ACL live trecute.
153/153 fișiere identice cu arhiva; 10/10 servicii CSA healthy.

## Operațiuni

Host Docker `192.168.177.68`, containere `csa-meteor-1` / `csa-meteor-portal-1`.
Backup: `pre-release-temple-altar-20260920`.
Versiunea anterioară: `csa.previous.9f31f7d` / `csa-build.previous.9f31f7d`.
Loguri în `/home/urgentit/csa-setup/releases`: `build-9f31f7d.log`, `promote-9f31f7d.log`.
Promovare cu rollback automat. Testare: http://192.168.177.68:18610/portal/templu.

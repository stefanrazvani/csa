# Release CSA — inelul din Calfă, 20 septembrie 2026

Cod: `dc360f1`; tag: `release-20260920-temple-ring`.
Artefact: `csa-app-release-dc360f1.tar.gz`.
SHA-256: `aa6b4027f92ec3ca2ecfe33c51540cfeb5431a95264f41234d717d7aee051d30`.

„Cercul participării” (`convocations-two`) din gradul 2 este publicat cu
`presentation: list`. Rendererul nu mai creează inelul auriu sau haloul său.
Acțiunea `/convocatoare` rămâne disponibilă în navigatorul templului.
Versiunea manifestului: `2026.09.20-2`.

## Verificări

Verificarea locală confirmă cele trei repere funcționale din Calfă numai în listă,
cu rutele păstrate, și absența pietrelor eliminate anterior la toate gradele.
Build și promovare finalizate: `RELEASE_OK_dc360f1`. Zero vulnerabilități în
bundle-ul final. Manifestele live pentru gradele 1/2/3 confirmă versiunea nouă;
cele trei repere funcționale din Calfă sunt numai în listă, fără geometrie/halo.
Autentificarea prin gateway, listele și accesul la profil au trecut testele live.
147/147 fișiere sursă coincid cu arhiva și 10/10 containere CSA sunt healthy.
Verificarea vizuală 3D pe clientul utilizatorului rămâne necesară; VM-ul de lucru
nu are WebGL disponibil, conform verificării din release-ul anterior.

## Publicare și revenire

Host Docker: `192.168.177.68`; servicii recreate: `meteor`, `meteor-portal`.
Backup: `pre-release-temple-ring-20260920`.
Sursa și bundle-ul anterior: `/var/meteor/csa.previous.dc360f1`,
`/var/meteor/csa-build.previous.dc360f1`.
Scripturile și logurile se află în `/home/urgentit/csa-setup/releases`;
promovarea include rollback automat dacă verificările obligatorii eșuează.

Testare: http://192.168.177.68:18610/portal/templu — reîncărcare completă, gradul Calfă.

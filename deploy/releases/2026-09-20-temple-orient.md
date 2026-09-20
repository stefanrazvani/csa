# Release CSA — detalii Orient, 20 septembrie 2026

Cod: `57ce577`; tag: `release-20260920-temple-orient`.
Artefact: `csa-app-release-57ce577.tar.gz`.
SHA-256: `ab219521eb96321697a6a61c21238b94933950c689de6db1ec9f1bb9a555c19f`.

## Rezultat

- Fir cu plumb de cinci ori mai subțire: rază efectivă 0,004; lungimea și prinderile păstrate.
- Soare în relief cu disc, borduri concentrice și 24 de raze drepte/ondulate alternante, emisivitate redusă.
- Coloana Înțelepciunii în stil ionic: bază profilată, 16 caneluri geometrice, echin, ove și volute spiralate în oglindă pe ambele fețe.
- Sfeșnicul Primului Supraveghetor rotit +45° în jurul bazei, inclusiv brațul, lumânările și flăcările. Galeria rămâne orizontală; celelalte sfeșnice păstrate.
- Manifest: `2026.09.20-4`, toate gradele.

## Verificări

- Patru teste de scenă și testul catalogului editorial/ACL au trecut. Verifică geometria normalizată, limitele scenei, mobilierul, ochiul, diametrul firului, canelurile și alinierea brațului cu lumânările după rotație.
- Previzualizare vectorială SVGRenderer a geometriilor reale inspectată: soare, coloană, capitel și sfeșnic din poziția camerei curente. Lumânările se văd separat. Iluminarea WebGL nu este simulată; VM-ul nu are WebGL disponibil.
- Build și promovare finalizate: `RELEASE_OK_57ce577`; zero vulnerabilități în dependențele bundle-ului final.
- Manifestele live pentru gradele 1/2/3 confirmă raza efectivă a firului, cele 24 de raze solare, fusul canelat, cele patru volute și rotația de 45° a brațului și lumânărilor.
- Verificările pentru mobilier, sfeșnice, ochi și eliminările decorative anterioare au trecut, împreună cu autentificarea Meteor prin gateway, CSP/bootstrap, listele și accesul la profil. Contul temporar a fost eliminat la final.
- 148/148 fișiere sursă coincid cu arhiva; 10/10 containere CSA healthy. Randarea WebGL pe clientul utilizatorului rămâne de confirmat.

## Publicare și revenire

Host Docker: `192.168.177.68`; servicii recreate: `meteor`, `meteor-portal`.
Backup: `pre-release-temple-orient-20260920`.
Sursa și bundle-ul anterior: `/var/meteor/csa.previous.57ce577`, `/var/meteor/csa-build.previous.57ce577`.
Arhiva, scripturile și logurile: `/home/urgentit/csa-setup/releases`.
Promovarea include rollback automat dacă verificările obligatorii eșuează.

Testare: http://192.168.177.68:18610/portal/templu — reîncărcare completă.

# Release CSA — mobilier și ochiul atotvăzător, 20 septembrie 2026

Cod: `04d349e`; tag: `release-20260920-temple-furniture`.
Artefact: `csa-app-release-04d349e.tar.gz`.
SHA-256: `9e8b8ccdffd7f8d42a182675fe57a2160c84ae45a94494747a8f4ad46f6b4ed4`.

## Rezultat

- Eliminați cilindrii suplimentari de pe mesele Venerabilului și celor doi Supraveghetori. Sfeșnicele cu 3/2/1 lumânări sunt păstrate în toate gradele.
- Helper comun pentru scaune, jilțuri și bănci: șezut tapițat, picioare, spătar, traverse și cotiere la demnitari. Scaunele laterale privesc spre centrul sălii.
- Bănci la pereții de Miazănoapte și Miazăzi; la Miazăzi sunt două segmente cu acces liber la postul celui de-al Doilea Supraveghetor.
- Delta are chenar triunghiular auriu, fond întunecat, raze fine și ochi migdalat cu iris, pupilă și reflexie separate în relief.
- Manifestul este limitat la 768 de piese în loc de 256, pentru a transmite mobilierul complet. Versiune: `2026.09.20-3`.

## Verificări

- Trei teste de regresie pentru normalizarea/geometria tuturor gradelor, păstrarea lumânărilor, orientarea mobilierului, spațiul de acces și relieful ochiului; testul catalogului editorial/ACL a trecut.
- Previzualizare vectorială SVGRenderer cu geometriile reale Three.js: scaun, rând lateral cu bancă, Delta și masa Venerabilului inspectate vizual. Aceasta nu simulează iluminarea WebGL; VM-ul nu are WebGL disponibil.
- Build și promovare finalizate: `RELEASE_OK_04d349e`; zero vulnerabilități în dependențele bundle-ului final.
- Manifestele live pentru gradele 1/2/3 confirmă eliminarea cilindrilor, lumânările 3/2/1, scaunele, băncile și ochiul migdalat. Eliminările decorative anterioare sunt păstrate.
- Autentificarea Meteor prin gateway, CSP/bootstrap, listele și accesul la profil au trecut testele live. Contul temporar a fost eliminat după verificare.
- 148/148 fișiere sursă coincid cu arhiva; 10/10 containere CSA healthy.
- Randarea și performanța WebGL pe clientul utilizatorului rămân de confirmat; verificarea vizuală locală a folosit SVGRenderer.

## Publicare și revenire

Host Docker: `192.168.177.68`; servicii recreate: `meteor`, `meteor-portal`.
Backup: `pre-release-temple-furniture-20260920`.
Sursa și bundle-ul anterior: `/var/meteor/csa.previous.04d349e`, `/var/meteor/csa-build.previous.04d349e`.
Arhiva, scripturile și logurile: `/home/urgentit/csa-setup/releases`.
Promovarea include rollback automat dacă verificările obligatorii eșuează.

Testare: http://192.168.177.68:18610/portal/templu — reîncărcare completă.

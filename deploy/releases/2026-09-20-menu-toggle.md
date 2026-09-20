# Release CSA — meniu lateral, 20 septembrie 2026

Cod: `6c7cf7c`; tag: `release-20260920-menu-toggle`.
Artefact: `csa-app-release-6c7cf7c.tar.gz`.
SHA-256: `237e9ee3e11240dac862d80d0911e007e8c7e9434eba4f749b3e771d9a0ebd1c`.
Manifestul templului rămâne `2026.09.20-9`.

## Modificare

Butonul din colțul stânga sus controla anterior doar clasa folosită de
meniul mobil. Pe desktop, meniul și ferestrele păstrau marginea de 240 px.

Starea meniului controlează acum vizibilitatea, aria-expanded și eticheta
butonului. La ascundere, ferestrele maximizate ocupă lățimea disponibilă;
la redeschidere revin lângă meniu. Ferestrele normale sunt încadrate în
spațiul disponibil, iar cele minimizate folosesc limitele noi la restaurare.
Pe mobil, meniul se suprapune peste conținut și se închide după selectarea
unui modul sau a unei ferestre. Escape îl închide și readuce focusul pe buton.
La trecerea pragului de 800 px se aplică starea implicită a noului format:
închis pe mobil, deschis pe desktop.

## Verificări

Verificare de sintaxă și build Meteor finalizate; auditul bundle-ului final:
zero vulnerabilități. `RELEASE_OK_6c7cf7c`: smoke autentificare și verificările
live pentru templu/grade/ACL trecute. 153/153 fișiere identice cu arhiva;
10/10 servicii CSA healthy.

În browser, la 1280 px: meniul ascuns extinde ferestrele maximizate de la
1040 px la 1280 px, cu originea mutată de la x=240 la x=0; redeschiderea
restabilește dimensiunile. Două module rămân montate cu aceleași ID-uri, iar
textul introdus în căutarea bibliotecii se păstrează. O fereastră restaurată
este încadrată corect când meniul reapare.

La 390 px: meniul este implicit ascuns, se deschide peste conținut și se
închide după selectarea modulului. Escape îl închide și readuce focusul pe
buton. Revenirea la desktop redeschide meniul și reîncadrează ferestrele.
Contul temporar de verificare a fost eliminat după testare.

## Operațiuni

Host Docker `192.168.177.68`, containere `csa-meteor-1` / `csa-meteor-portal-1`.
Backup: `pre-release-menu-toggle-20260920`.
Versiunea anterioară: `csa.previous.6c7cf7c` / `csa-build.previous.6c7cf7c`.
Loguri în `/home/urgentit/csa-setup/releases`: `build-6c7cf7c.log`, `promote-6c7cf7c.log`.
Promovare cu rollback automat. Testare: http://192.168.177.68:18610/portal/.

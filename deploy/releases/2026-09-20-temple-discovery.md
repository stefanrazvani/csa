# Release CSA — descoperirea templului pe grade, 20 septembrie 2026

Cod: `a4cd4a5`; tag: `release-20260920-temple-discovery`.
Manifest: `2026.09.20-6`.
Artefact: `csa-app-release-a4cd4a5.tar.gz`.
SHA-256: `325035509f3b7539499a86366546ab4b162617184cd43c1b0b95dcbb7fce706c`.

## Rezultat

- 36/39/38 fișe pentru elementele reale la Ucenic/Calfă/Maestru: colonete separate, Soare, Lună, Delta, pavaj și bordură, boltă, fir cu plumb, funie, Orient, altar, Carte, Echer, Compas, planșă, coloane, sfere, sfeșnice și toate cele 12 zodii.
- Click/tap pe geometria existentă sau alegere din navigatorul accesibil cu căutare fără diacritice. Evidențiere fără deplasare/scalare ori corpuri suplimentare.
- Descriere, surse cu pagini și întrebări de reflecție distincte de textul ritualului. Conținutul complet rămâne pe server; se livrează numai gradul vizualizat autorizat.
- Corectat catalogul administratorului atunci când inspectează un grad inferior; titlul, simbolurile și decorul fallback folosesc gradul vizualizat.
- Piesele opace blochează raycasting-ul spre obiectele ascunse. Reperele editoriale fără corespondent fizic rămân în listă.
- Documentele originale rămân locale. Surse: `REFERINTE_TEMPLU.md`.

## Validare

- 10 teste locale: geometrii, selecție reală cu raycaster Three.js, obstacole, resetarea evidențierii/materiale partajate, legături autorizate, limite de payload, grade și catalog editorial.
- Test live reproductibil: `deploy/temple-discovery-smoke.mjs` (cont temporar eliminat în `finally`, inclusiv rolul de administrator folosit la verificare).
- Build Meteor finalizat; auditul dependențelor runtime: 0 vulnerabilități.
- Verificările live au trecut pentru toate gradele, plus solicitări de grad superior cu utilizator real de test Ucenic/Calfă și vizualizare de grad inferior cu administrator temporar. Autentificarea, profilul, listele și toate regresiile vizuale anterioare au trecut.
- UI live în browser: căutare fără diacritice, fișă colonetă, schimbare Maestru → Ucenic cu retragerea detaliilor vechi, fișa Soarelui pentru Ucenic, Escape și revenirea focusului. Contul și tenantul UI temporare au fost eliminate.
- VM fără WebGL: interfața a fost inspectată în modul simplificat; raycasting-ul 3D este verificat automat cu geometriile Three.js reale, fără verificare vizuală WebGL pe acest dispozitiv.
- `RELEASE_OK_a4cd4a5`; 151/151 fișiere sursă identice cu arhiva; 10/10 containere CSA healthy.

## Operațiuni

Host Docker: `192.168.177.68`; containere: `csa-meteor-1`, `csa-meteor-portal-1`.
Backup: `pre-release-temple-discovery-20260920`.
Versiunea anterioară păstrată în `/var/meteor/csa.previous.a4cd4a5` și `/var/meteor/csa-build.previous.a4cd4a5`.
Promovarea permite 900 de secunde pentru inițializarea containerelor și revine automat dacă verificările eșuează.
Loguri: `/home/urgentit/csa-setup/releases/build-a4cd4a5.log`, `promote-a4cd4a5.log`.

Testare: http://192.168.177.68:18610/portal/templu (Ctrl+F5).

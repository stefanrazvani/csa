# Release liste și design unitar, 20 septembrie 2026

Activ pe hostul Docker `192.168.177.68`, în containerele `csa-meteor-1` și `csa-meteor-portal-1`.

- Commit aplicație: `a2b09ef` (include `675f86a`).
- Fundal închis comun până la marginile ferestrei, Dosare pe lățimea disponibilă, aceeași paletă pentru formulare, panouri și tabele.
- Liste comune cu căutare, filtrare, sortare și paginare; autorizare reactivă după tenant, grad și funcții. Contractul și limitele sunt descrise în `MODULE_LISTS.md`.
- Ferestrele maximizate urmăresc redimensionarea browserului, iar restaurarea păstrează conținutul în afara meniului lateral.
- PDF/DOCX, dashboardul implicit și deschiderea separată a Templului sunt păstrate.

## Artefacte

Director server: `/home/urgentit/csa-setup/releases`.

- Arhivă: `csa-app-release-a2b09ef.tar.gz`.
- SHA256: `a95d1cb37e2a8dc14d954071ad5e34148523bce65186764d35325bb04eb76c17`.
- Backup: `pre-release-lists-20260920`, manifest în `/home/urgentit/csa-setup/backups/manifests`.
- Compilare: `build-lists-a2b09ef.sh`, log `build-a2b09ef.log`, `BUILD_READY_a2b09ef`.
- Promovare cu rollback automat: `promote-lists-a2b09ef.sh`, log `promote-a2b09ef.log`, `RELEASE_OK_a2b09ef`.
- Surse/bundle precedente: `/var/meteor/csa.previous.a2b09ef`, `/var/meteor/csa-build.previous.a2b09ef` în volumul `csa_meteor_data`.
- Gateway-auth nu a fost schimbat; rămâne imaginea release-ului `cc469a3`.

Pentru recuperarea versiunii anterioare se opresc cele două containere Meteor, se păstrează separat sursele/bundle-ul curent și se restaurează cele două directoare `previous.a2b09ef`; apoi se recreează serviciile `meteor` și `meteor-portal` și se reîncarcă nginx. Implementarea exactă a acestei secvențe se află în funcția `rollback` din scriptul de promovare.

## Verificări efectuate

- 41 teste automate și 21 verificări locale de regresie craft; 11 verificări DDP/Mongo ale listelor și autorizării, reluate după integrare.
- Previzualizare Dosare/Bibliotecă la dimensiune desktop și Dosare la 390 px; restaurarea ferestrei nu mai intră sub meniul lateral.
- Autentificare live: parolă incorectă refuzată, hash Meteor acceptat, assertion și CSP valide. Contul de test este eliminat de script.
- DDP live: publicații de liste limitate la pagina solicitată și tenantul autorizat; geometria Templului de grad 1/2 păstrată.
- 139 fișiere din sursa activă corespund arhivei; toate cele 10 containere CSA sunt healthy. Auditul dependențelor bundle-ului: zero vulnerabilități.
- Chrome live: Dosare cu fundal închis, 29 de frați afișați în pagini de 20 și 9; căutarea reduce lista și resetează pagina. Convocatoare: pagini de 20 și 5, fără înregistrări comune între pagini.
- Fixture-urile vizuale locale au fost eliminate; nu s-au trimis emailuri reale.

URL: `http://192.168.177.68:18610/portal/dosare-frati`.

# Release CSA — profil și editoare pe obiect, 20 septembrie 2026

Cod publicat: `39e1b2e`, tag `release-20260920-profile-editors`.
Artefact: `csa-app-release-39e1b2e.tar.gz`.
SHA-256: `b6707f582df6b2a40d8f228c56170e8acdfc03a24957545ccd5ba28b25d148f7`.

## Rezultat

- Meniu utilizator cu „Profilul meu” și „Ieșire din cont”; datele personale sunt readonly, cu solicitare de resetare prin email.
- Ferestre separate pentru adăugare/editare, componente comune, istoric pe obiect cu actor și diferențe de câmpuri. Domeniile și excepțiile sunt descrise în `MODULE_OBJECTS.md`.
- Importurile, versiunile, publicarea PDF/DOCX, rapoartele și verificările de acces existente rămân funcționale.
- Serverul `192.168.177.68` este hostul Docker. Au fost recreate numai `csa-meteor-1` și `csa-meteor-portal-1`, folosind volumele persistente și imaginea existentă. Gateway-ul auth rămâne pe `csa/gateway-auth:release-cc469a3`.

## Verificări

- 44 teste unitare (41 existente + 3 pentru contractul editorului).
- `objects-local-smoke`: 13 verificări, inclusiv autor/istoric, conflicte, obiecte din alt tenant, retragere la reclasificare, articole, confirmări, contribuții proprii și păstrarea versiunilor.
- `craft-local-smoke`: 21 verificări, inclusiv login/ACL, PDF, Excel, prezențe și audit tranzacțional.
- `list-local-smoke`: 11 verificări, inclusiv grade 1/2/3, paginare, filtrare, suspendare și retragere reactivă.
- Browser local: creare/editare concept, istoric, profil fără câmpuri editabile, formular dosar și membri/permisiuni în ferestre separate. Fixture-urile UI au fost eliminate, preview-ul local oprit.
- Build de producție valid; auditul dependențelor bundle-ului: zero vulnerabilități raportate. Cele trei constatări moderate ale arborelui sursă sunt cele existente.
- 147/147 fișiere sursă corespund arhivei; 10/10 containere CSA healthy.
- Smoke live prin gateway: parola incorectă respinsă, parola Meteor acceptată, bootstrap/CSP, publicații paginate, profil propriu și refuzul creării neautorizate; geometria templului de grad 1/2 verificată.
- Browser live: sesiunea existentă s-a reconectat; meniul include profil și ieșire; profilul afișează 17 rânduri, zero câmpuri editabile și opțiunea de resetare. „Adaugă concept” deschide formularul separat fără eroare. Nu s-au salvat date de test în modulele producției și nu s-au trimis resetări reale.

## Acces

- Portal: http://192.168.177.68:18610/portal/dashboard
- Profil: http://192.168.177.68:18610/portal/profilul-meu
- Acces Meteor direct: http://192.168.177.68:18600/

## Backup și revenire

Backup înainte de promovare: `pre-release-editors-20260920` (MongoDB, MinIO, ArangoDB, OpenSearch).
Arhiva și logurile sunt în `/home/urgentit/csa-setup/releases`:
`build-39e1b2e.log`, `promote-39e1b2e.log`; ultimul conține `RELEASE_OK_39e1b2e`.

Versiunea anterioară este păstrată în volumul Meteor:
`/var/meteor/csa.previous.39e1b2e` și `/var/meteor/csa-build.previous.39e1b2e`.
Pentru revenire se opresc cele două containere Meteor, se păstrează directoarele active
sub un nume nou, se readuc directoarele previous la `csa`/`csa-build`, apoi se recreează
serviciile `meteor` și `meteor-portal` din compose și se reîncarcă Nginx. Nu se șterg volumele.
Promovarea executată include revenire automată în caz de eșec al verificărilor obligatorii.

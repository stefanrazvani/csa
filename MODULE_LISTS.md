# Liste și aspect comun al modulelor

Implementarea folosește același model de stare pe fereastră și funcții comune ca în AppsV3 (`imports/api/interfata.js`, `imports/modules/communityAdmin/client/listCommon.js`, `imports/modules/estate/financiar/client/listCommon.js`), adaptat colecțiilor și autorizării CSA.

## Contract de reutilizare

- `csa-app/imports/ui/lists/schema.js`: coloane permise, etichete și tipuri.
- `query.js`: normalizarea căutării, filtrelor, sortării și paginii; selectorul Mongo se construiește numai din coloanele definite pe server. Clientul nu trimite operatori Mongo sau tenantul efectiv.
- `client.js` / `client.html`: `registerList`, `csaListTools`, `csaListColumn`, `csaListPager`, `csaSimpleTable`. Paginile au 10/20/50/100 rânduri, căutarea are debounce de 250 ms, iar fiecare instanță de fereastră își păstrează starea.
- `bindings.js`: leagă modulele de contractul comun. Listele derivate sunt calculate într-un cache reactiv, o singură dată per modificare.
- `server.js`: registru explicit de seturi publicabile, proiecții, autorizare, limitare de rată și indexuri. Rezultatele sunt izolate pe cerere; o fereastră nu preia rândurile alteia.
- `authorized-publication.js`: reautorizare și retragerea datelor la schimbarea gradului, apartenenței, rolurilor ori stării contului; reutilizează ciclul de viață al publicațiilor Dosare.
- `layout/client/module-theme.css`: paleta ecranului, formulare, tabele, panouri și spațiere comună. Ferestrele și fundalul folosesc aceeași culoare închisă; Dosarele nu mai au limita de 1600 px. Stilurile de document/tipărire rămân separate.

Pentru o listă nouă: definiți schema, registrul de server cu autorizare/proiecție, un binding și controalele comune în template. Pentru listele mici derivate, păstrați helperul existent și înregistrați-l fără `remote`; selectorii formularelor folosesc helperul `...Options`, nu pagina vizibilă. Exporturile și totalurile trebuie calculate pe întregul set autorizat, nu pe pagina curentă.

## Acoperire și limite

Paginare pe server: convocatoare, confirmările utilizatorului, bibliotecă, metale, evenimente și cazuri Ospitalier, vizitatori, istoric. Se transmite pagina plus un rând pentru determinarea paginii următoare. Nu se execută un count integral la fiecare căutare.

Paginare locală pe setul deja autorizat: prezențele convocatorului selectat, matricol și funcții, utilizatori, grade, directorul Dosare, listele dosarului, concepte/relații, articolele documentului deschis și lotul de comparație al migrării. Graful de concepte și selectorii au nevoie de setul autorizat complet. Mesajele dezbaterii păstrează limita existentă de 500 de mesaje; navigarea se face în acest set. Cititorul și cronologia păstrează prezentarea specifică, cu aceleași controale de listă.

Gradul rezultă din accesul utilizatorului pe server: Ucenic 1, Calfă 2, Maestru 3. Un filtru nu poate ridica gradul. Gradele neclasificate sunt excluse din conținutul de studiu; metadatele legacy ale convocatoarelor rămân accesibile potrivit regulii existente. Excepția existentă pentru superadministratorul platformei este păstrată. În modulele administrative se aplică suplimentar permisiunile și funcțiile necesare; gradul singur nu acordă acces financiar sau la dosare.

## Verificare

- 41 teste automate, inclusiv whitelist-ul câmpurilor, căutarea fără diacritice, limitele paginii și gradele.
- `deploy/list-local-smoke.mjs`: 11 verificări DDP/Mongo pentru gradele 1/2/3, izolarea tenantului, filtrare/paginare, revocare fără reconectare și refuzul accesului financiar.
- `deploy/craft-local-smoke.mjs`: 21 verificări de regresie pentru operațiuni, PDF/XLSX, prezențe și audit.
- Scripturile locale rulează numai pe preview-ul `127.0.0.1:18700`, Mongo `18701`, și elimină fixture-urile proprii. Nu sunt scripturi de import în producție.

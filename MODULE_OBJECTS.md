# Standardul CSA pentru profil, editoare și istoric

Implementare: `csa-app/imports/ui/objects`, ferestrele WinBox din layout și componentele de listă descrise în `MODULE_LISTS.md`. Modelul vizual și comportamentul ferestrelor urmează Apps New V3; politicile de acces rămân cele CSA.

## Reguli pentru module noi

- Lista principală păstrează căutarea, filtrarea, sortarea și paginarea comune. Adăugarea și editarea deschid ferestre separate, identificabile și independente.
- Pentru obiecte simple: schema explicită în `objects/schema.js`, înregistrare explicită a colecției și autorizării în `objects/server.js`, butoane `csaObjectAdd` și `csaObjectActions`. Nu se acceptă nume de colecții sau selectori Mongo din client.
- Crearea folosește metodele domeniului. Câmpurile editabile sunt selectate explicit; câmpurile de securitate, tenantul, rolurile, proprietarul și datele de stocare nu se copiază din formular. Versiunile documentelor folosesc importul și publicarea existente.
- Editorul păstrează revizia citită și refuză salvarea unei copii învechite. La operațiile simple actualizarea verifică și `updatedAt`/starea; operațiile specializate păstrează propriile tranzacții și validări.
- Drepturile se verifică pe server la deschidere, abonare, salvare și citirea istoricului. Publicațiile retrag obiectele când se schimbă gradul, apartenența sau accesul. Istoricul este limitat la obiect și lojă, paginat câte 20 de evenimente, cu actor, moment, acțiune și diferențe unde acestea există. Valorile sensibile rămân mascate.
- Formularele complexe (dosar, permisiuni de grup, convocator, răspuns la invitație) reutilizează logica domeniului în ferestre dedicate. Închiderea unei ferestre modificate cere confirmare; simpla navigare la alt modul păstrează formularul.

## Acoperire

| Modul | Adăugare / editare | Istoric |
|---|---|---|
| Bibliotecă | Metadate, text sau PDF/DOCX, versiuni și publicare păstrate | Lucrare și versiunile sale |
| Concepte | Concepte și relații | Pe concept/relație |
| Dezbateri | Dezbateri și mesaje; membrii editează contribuțiile proprii | Pe dezbatere/mesaj |
| Metale | Perioade, conturi și mișcări draft | Pe obiect; aprobarea/înregistrarea rămân acțiuni de domeniu |
| Ospitalier / Vizitatori | Evenimente, cazuri restricționate, invitații | Pe obiect |
| Matricol / funcții / grade | Apartenențe, evenimente de grad, mandate, alocări de acces | Pe obiect; evenimentele istorice nu se rescriu |
| Dosare | Date personale, note, evenimente, documente și nași/mentori | Secretariatul vede istoricul pe dosar și obiectele asociate |
| Administrare | Loji, utilizatori, grupuri, membri și permisiuni în fereastră separată | Pe lojă/utilizator/grup |
| Convocatoare | Editorul existent, articole în ferestre separate | Pe convocator/articol |
| Confirmări / prezențe | Răspuns separat; sincronizare și operații administrative păstrate | Proprietarul sau Secretariatul, după drepturi |

Gradul documentelor existente și soldul inițial sunt câmpuri protejate în editorul comun. Tranzacțiile aprobate/înregistrate și evenimentele de grad sunt doar consultabile. Istoricul operațiunilor, tabloul de bord și templul nu au butoane de creare a evenimentelor de audit sau de modificare a obiectelor derivate. Migrările păstrează reconcilierea dedicată.

## Profilul personal

Meniul de cont conține „Profilul meu” și „Ieșire”. Profilul afișează numai datele utilizatorului autentificat; nu oferă editare. Resetarea este solicitată prin email: endpointul existent al gateway-ului în portal, Accounts în accesul direct. Testele automate nu trimit emailuri reale și nu modifică parole reale.

## Verificare

- `node --test` pentru testele `*.test.mjs/js` din imports/deploy.
- `node deploy/objects-local-smoke.mjs`: fixture-uri exclusiv în baza locală de preview, cu curățare; verifică revizii, audit, autor, domenii, limite între loji și grade, retragerea publicațiilor, documente, articole și răspunsuri.
- Regresie: `deploy/list-local-smoke.mjs` și `deploy/craft-local-smoke.mjs tmp/csa-preview-access.json`.
- Verificare browser: profil fără câmpuri editabile, concept creat/editat/istoric, formularul de dosar separat.

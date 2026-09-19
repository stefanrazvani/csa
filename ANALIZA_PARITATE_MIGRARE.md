# CSA — analiza funcțională a migrării

> Audit inițial, păstrat ca bază de comparație. Ulterior a devenit accesibilă sursa Meteor 2.16 din `\\192.168.177.99\meteor\csa`. Implementarea, verificările și starea activării sunt documentate în `MIGRATION_IMPLEMENTATION.md`. Afirmațiile de mai jos despre lipsa sursei descriu numai etapa inițială.

Data: 19 septembrie 2026. Cod analizat: `0bd4d74543c5fd5a66c66ac61c8d409db58088f1`, Meteor 3.4.

## Concluzie și limite

Migrarea păstrează structura principală a datelor și implementează editarea convocatoarelor/articolelor, dar fluxul operațional al prezențelor nu este complet conectat la interfață. Există și probleme de coerență între permisiuni, starea confirmărilor și mecanismul de import.

**Acesta este un audit al codului migrat și al contractelor legacy vizibile în importator, nu o comparație completă cu sursa Meteor 2.x.** Sursa veche nu a fost disponibilă în această sesiune. Funcțiile absente din versiunea nouă nu sunt declarate automat regresii față de cea veche.

Surse verificate:

- codul client/server din `csa-app`, gateway-ul și scripturile de verificare din `deploy`;
- `MIGRATION_STATUS.md`, `DASHBOARD_STATUS.md`, `PLATFORM_STATUS.md`, `GATEWAY_STATUS.md` și documentația modulelor;
- inventarul local: `C:\Proiecte\CSA` conține documente de referință, nu aplicația veche;
- acces SSH la hostul de deploy `192.168.177.68` disponibil; accesul la Docker/sudo cu cheia CSA este refuzat;
- acces SSH la `192.168.177.99` refuzat pentru cheia CSA; conexiunea HTTP la portul legacy documentat `3008` a eșuat.

Nu au fost executate importuri, modificări de date, trimiteri de email sau publicări. Starea curentă a bazei și a aplicației instalate nu a fost verificată. Numerele din documentația migrării sunt istorice, din iulie 2026.

## Matricea implementării actuale

| Domeniu | Ce există în codul nou | Ce lipsește / limită |
|---|---|---|
| Conturi | Login, înregistrare cu activare administrativă, resetare parolă, import ID/email/hash parolă | Import parțial al profilului; rolurile vechi nu sunt transpuse |
| Convocatoare | Listare, creare, editare metadate, articole pe grade | Nu există flux dedicat de comunicare, export PDF, duplicare sau ștergere a convocatorului; existența acestora în legacy trebuie verificată |
| Articole | Adăugare, editare, ștergere logică, ordonare | Paritatea editorului și formatării cu legacy nu poate fi stabilită fără sursă |
| Prezențe | Creare automată la convocator, sincronizare metadate, publicații backend | Lipsește ecranul de administrare/centralizare pe ținută |
| Confirmări | Generare înregistrări și tokenuri, metode de citire/trimitere răspuns | Lipsesc formularul/ruta de confirmare, distribuția și reemiterea tokenurilor |
| Istoric participare | Dashboard și dosar individual | Starea răspunsului este confundată cu acceptarea participării |
| Documente legacy | Import metadate, metodă de înregistrare și publicație | Nu există flux generic de atașamente conectat la convocator |
| Documente dosar/bibliotecă | Upload/download și stocare dedicate | Nu substituie automat registrul și atașamentele legacy |
| Grade și funcții | Registru canonic, grade, mandate și delegări | Necesită configurare; interfața craft nu folosește aceeași decizie de acces ca backend-ul |
| Migrare | Audit, dry-run, inserare fără duplicare după `_id` | Nu sincronizează modificările ulterioare din legacy; nu reconciliază contoarele |

## Probleme confirmate în cod

### P1 — Confirmarea prezenței nu poate fi parcursă din interfață

Backend-ul definește `craft.confirmare.get` și `craft.confirmare.submit`, dar nu există apeluri client către aceste metode și nici o rută/formular de confirmare în aplicație sau în site-ul gateway. Dashboardul afișează numai istoricul, fără acțiune de răspuns.

Impact: membrul nu are un flux disponibil în interfața livrată pentru a confirma ținuta/agapa, a alege meniul sau a declara absența, deși câmpurile și metodele există.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:323`, `:333`; rutele din `csa-app/imports/modules/craft/client/index.js:10`; istoricul din `csa-app/imports/layout/client/index.html:175`. Căutarea globală a metodelor returnează numai definițiile server.

De completat: formular conectat la backend, acces din invitație/dashboard și alegerea explicită a modului de acces prin gateway.

### P1 — Invitațiile și tokenurile nu au un flux de livrare/reemitere

`preparePresenceForConvocator` generează tokenuri și le returnează în `deliveryTokens`. Crearea și salvarea convocatorului întorc clientului doar ID-ul prezenței și numărul de confirmări, fără tokenuri. Nu există trimitere de invitații prin email și nici consumator pentru `deliveryTokens`. Emailul identificat în gateway este pentru resetarea parolei.

Pentru confirmările importate, importatorul nu creează `publicTokenHash` valid și setează `publicTokenPending: true`. La o nouă pregătire, înregistrările existente primesc doar metadate actualizate, fără token nou. Nici tokenurile noi pierdute nu pot fi reemise printr-o metodă dedicată.

Impact: existența confirmărilor în MongoDB nu înseamnă că destinatarii au primit un link utilizabil.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:155`, `:164`, `:190`, `:231`, `:257`, `:317`; `csa-app/imports/system/migrations/server/index.js:138`.

De completat: livrare urmărită, reemitere/rotire token, tratarea confirmărilor migrate și prevenirea trimiterilor duplicate. Nu este necesară păstrarea mecanismului nesecurizat al unui eventual link legacy; trebuie păstrată funcția pentru utilizator.

### P1 — Lipsește administrarea prezențelor pe ținută

Există publicațiile `craft.prezente` și `craft.confirmari`, dar niciun client nu se abonează la ele. Nu există ecran pentru lista invitaților pe convocator, totaluri ținută/agapă/meniuri, motive de absență sau intervenții administrative asupra răspunsurilor. Dosarul individual oferă doar istoric și statistici sumare.

Dovezi: `csa-app/imports/modules/craft/server/publications.js:71`, `:76`; `csa-app/imports/modules/craft/client/index.js`; `csa-app/imports/modules/dossiers/client/index.html:153`.

De completat: pagină de prezențe legată din convocator, cu centralizare și operații autorizate. Detaliile exacte de paritate trebuie extrase din ecranul legacy.

### P1 — Interfața și serverul calculează diferit drepturile pentru convocatoare

`craft.permissions` acordă `write/delete/admin` pe baza rolurilor și a statutului `tenant_admin`. Operațiile server trec însă prin autorizarea compusă, care cere și funcție activă; drepturile pot proveni și din mandatul de Secretar.

Două cazuri concrete:

1. Administrator de tenant fără mandat: interfața afișează creare/editare, dar serverul refuză salvarea.
2. Secretar cu grad și mandat valid, fără rol explicit `convocatoare_write/admin` și fără `tenant_admin`: serverul poate permite operația prin `convocatoare.admin` din definiția funcției, dar interfața ascunde acțiunea.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:199`; `csa-app/imports/lib/access/server.js:84`, `:312`; `csa-app/imports/system/governance/server/seed.js:9`.

De completat: aceeași evaluare a permisiunilor efective în răspunsul pentru UI și în metodele de mutație; feedback vizibil pentru refuzuri.

### P1 — Răspunsul „nu particip” poate apărea ca prezență confirmată

`craft.confirmare.submit` setează `confirmareFinala: 1` pentru orice răspuns final, inclusiv `confirmareTinuta: false`, și nu actualizează `status`. Dosarul și registrul numără ca participare confirmată orice rând cu `confirmareFinala: 1`. Dashboardul afișează separat `status`, care pentru înregistrările noi poate rămâne `pending`.

Exemplu derivat direct din cod: răspunsul `{ confirmareTinuta: false, motivAbsenta: '...' }` produce un rând finalizat care este numărat în dosar la „Prezențe confirmate”, în timp ce dashboardul poate arăta `pending`.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:333`; `csa-app/imports/modules/dossiers/client/index.js:281`, `:314`; `csa-app/imports/modules/dossiers/server/methods.js:698`; `csa-app/imports/system/dashboard/server/index.js:96`.

De completat: separarea răspunsului finalizat, acceptării participării și prezenței efective; normalizarea datelor vechi după verificarea semanticii legacy.

### P1 — Reluarea migrării nu preia modificările efectuate în legacy

Funcția numită `upsertById` verifică existența `_id` și inserează numai dacă documentul lipsește. Nu compară și nu actualizează documentele deja importate. Același lucru este valabil pentru utilizatori. Documentația spune că aplicația veche a rămas online după import.

Impact: dacă un convocator, articol sau răspuns a fost modificat ulterior în legacy, rerularea importului îl raportează `existing` fără sincronizare. Acesta este un risc confirmat al procedurii, nu o constatare că bazele sunt deja divergente.

Dovezi: `csa-app/imports/system/migrations/server/index.js:84`, `:104`; `MIGRATION_STATUS.md` și `GATEWAY_STATUS.md`.

De completat înainte de transferul definitiv: comparație pe ID și conținut, raport de diferențe, politică de conflicte și sincronizare finală controlată. Nu trebuie suprascrise automat modificările făcute în noua aplicație.

### P2 — Numerotarea nouă nu este reconciliată de importator

Numerele vechi sunt copiate ca atare, dar `craft_counters` nu este importat și nu este inițializat la maximul numerelor existente. `nextNumber` pornește prin `$inc` cu `upsert`.

Impact: într-o bază nouă, după import, primul convocator/prezență/confirmare creat poate reutiliza un număr existent. Nu am verificat dacă instanța instalată are o corecție manuală a contoarelor.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:55`; lista colecțiilor din `csa-app/imports/system/migrations/server/index.js:15`; căutarea utilizărilor `CraftCounters` în repository.

De completat: inițializare idempotentă și atomică a contoarelor la cel puțin maximul existent, fără resetarea unor contoare deja avansate.

### P2 — Datele utilizatorului și drepturile sunt migrate selectiv

Importatorul păstrează doar șase câmpuri din `setari`: tip, status, nume, prenume, oraș, județ. Marchează explicit ca nehotărâte `caleBuletin`, `gdpr`, `termenisiConditii`, `recomandatDe`. Rolurile ERP nu sunt transpuse în ACL-ul nou, conform documentației.

Impact: conturile de login sunt păstrate, dar echivalența dosarului personal, a recomandărilor și a drepturilor de lucru nu este demonstrată. Excluderea tokenurilor de sesiune este intenționată și nu reprezintă o funcționalitate lipsă.

Dovezi: `csa-app/imports/system/migrations/server/index.js:61`; `MIGRATION_STATUS.md`.

De completat: inventar de câmpuri legacy cu decizie explicită păstrat/mapat/exclus și matrice de roluri aprobate. Datele sensibile nu trebuie importate automat doar pentru a obține paritate numerică.

### P2 — Registrul generic de documente este doar backend

`craft.documents.register` înregistrează metadate, iar `craft.documents` le publică, dar niciuna nu este utilizată de interfață. Fluxurile funcționale de upload/download sunt dedicate bibliotecii și dosarelor; editorul convocatorului nu are atașamente.

Dovezi: `csa-app/imports/modules/craft/server/methods.js:351`; `csa-app/imports/modules/craft/server/publications.js:85`; `csa-app/imports/modules/craft/client/index.html`.

Documentația importului raportează zero documente legacy. Nu se poate deduce o pierdere de fișiere din această lipsă; trebuie verificat dacă versiunea veche avea stocare separată sau atașamente în alte colecții.

## Restanțe documentate care cer verificare în baza curentă

Raportul din iulie consemnează 28 de utilizatori importați, 25 de convocatoare, 559 de articole, 24 de prezențe și 462 de confirmări. Aceste valori nu au fost măsurate din nou în această sesiune.

- Gradele celor 28 de utilizatori nu au fost deduse din legacy. `DASHBOARD_STATUS.md` raporta zero grade active la acea dată. Fără grad, articolele nu sunt accesibile membrilor obișnuiți.
- Mandatele anuale trebuie atribuite; nu sunt acordate automat de seed.
- O prezență importată nu avea asociere unică la convocator. Există diagnostic în import și contor în dashboard, dar nu am identificat un flux dedicat de rezolvare/reasociere în UI.
- Documentele din `C:\Proiecte\CSA` nu au fost importate în bibliotecă. Acestea sunt surse de referință separate, nu dovadă a unei omisiuni din migrarea Meteor 2.x.

## Absențe care trebuie confruntate cu versiunea veche

În codul nou nu am identificat următoarele operații pentru convocatoare; fără sursa/ecranele vechi nu le clasific drept regresii confirmate:

- generare PDF și tipărire în formatul convocatorului;
- duplicare convocator și preluarea unei ordini de zi dintr-un șablon;
- ștergere/anulare/arhivare convocator cu gestionarea înregistrărilor dependente;
- căutare, filtre și export pentru lista convocatoarelor/prezențelor;
- mesaje de comunicare, remindere și urmărirea livrării;
- compatibilitatea rutelor și linkurilor din invitațiile istorice;
- regulile exacte pentru termenul de confirmare, modificarea răspunsului și meniuri. Backend-ul nou nu verifică termenul la submit și blochează orice al doilea răspuns final, dar politica legacy nu este cunoscută.

Nu am inclus modulele ERP ca funcții CSA lipsă: README-ul declară explicit separarea aplicației CSA de modulele ERP.

## Verificări executate și ce nu demonstrează

Comanda locală din procedura proiectului, cu excluderea `test-flow.mjs`, a trecut: **20 rezultate de test, 20 trecute, zero eșecuri**. Sunt acoperite utilitare gateway/stocare, proiecții, schema importului de dosare, contractul de acces al dosarelor și catalogul editorial.

Aceste teste nu demonstrează paritatea Meteor 2.x → Meteor 3.4. Nu există în suita rulată un scenariu complet convocator → invitație → răspuns → centralizare și nici unul pentru reluarea importului după modificări în legacy. Nu am rulat teste end-to-end cu conturi reale sau operații de scriere.

## Ordinea propusă pentru completare

1. Obținerea sursei/snapshotului Meteor 2.x și inventarierea rutelor, metodelor, rapoartelor și colecțiilor specifice tenantului CSA.
2. Închiderea fluxului convocator → invitații → confirmare → centralizare; clarificarea stărilor și corectarea statisticilor.
3. Unificarea permisiunilor UI/backend și verificarea gradelor, rolurilor și mandatelor în baza curentă.
4. Reconcilierea datelor, numerotării, tokenurilor și prezenței neasociate; pregătirea sincronizării finale din legacy.
5. Implementarea diferențelor de PDF, șabloane, atașamente, rapoarte și navigare numai după confirmarea inventarului legacy.
6. Acceptanță pe aceleași exemple în ambele versiuni: convocator cu articole pe trei grade; participare/absență și meniuri; Secretar și membru obișnuit; import reluat după editări; primul document creat după import.

Pentru închiderea comparației este necesar directorul/repository-ul sursei vechi sau accesul configurat la VM-ul legacy. Până atunci, nu este justificat un procent de paritate sau concluzia că migrarea este completă.

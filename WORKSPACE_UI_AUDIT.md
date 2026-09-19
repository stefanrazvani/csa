# CSA: desktop 2D și istoric operațiuni

Implementare: 20 septembrie 2026.

Modelul de navigație a fost comparat cu `client/ui/meniu/navleft.html` din sursa CSA Meteor 2.16 și cu `imports/layout/windowManager.js`, `windowManager.html`, `layout.html` din `C:/Proiecte/UrgentITAppsV3`. Proiectul AppsV3 nu a fost modificat.

## Interfață

- Dashboard 2D implicit după autentificare, fără redirecționare automată la templu.
- Meniu lateral grupat: lucrări, studiu/documente, administrarea Lojei, platformă.
- Buton separat „Templu 3D”; templul folosește propria fereastră, cu meniul permanent disponibil.
- WinBox 0.2.82, aceeași bibliotecă folosită de AppsV3: minimizare, restaurare, maximizare, mutare și redimensionare; liste de ferestre în meniul lateral.
- Instanțe Blaze persistente: filtrele și formularele rămân la schimbarea ferestrei. O instanță pentru fiecare ecran evită ID-uri duplicate ale formularelor legacy. Schimbarea documentului în același editor cere confirmare dacă formularul a fost modificat.
- Ferestrele se închid la logout sau schimbarea utilizatorului/Lojei, pentru a nu păstra date din contextul precedent.
- Pe ecrane mici meniul este retractabil, iar ferestrele folosesc lățimea disponibilă.

## Istoric

Ruta `/istoric`, accesibilă din Administrarea Lojei, folosește autorizarea `audit.read` existentă, limitată la Loja activă și gradul permis. Filtre: utilizator (nume/email/ID), modul și perioadă; paginare de 50 evenimente. Accesările sunt ascunse implicit și pot fi incluse explicit.

Operațiile autentificate `insertAsync`, `updateAsync`, `upsertAsync`, `removeAsync` pe colecțiile de business sunt înregistrate atomic cu modificarea într-o tranzacție MongoDB. Jurnalul include actorul și eticheta lui la momentul operației, data, înregistrarea, câmpurile modificate și valorile înainte/după pentru câmpurile permise. Scrierile concurente folosesc retry-ul tranzacțional și păstrează lanțul valorilor. Loturile sunt limitate la 1000 documente pentru o singură operație urmărită.

Nu sunt copiate parole, tokenuri sau secrete. Conținutul documentelor, notele, datele personale detaliate și alte câmpuri din afara listei permise apar ca valori protejate. Vizualizarea lor rămâne în modulul de origine și sub autorizarea acestuia.

Operațiile existente care folosesc tranzacții `rawCollection()` (duplicare/ștergere în cascadă, publicare bibliotecă, stornare etc.) păstrează evenimentele de business explicite. Acestea nu primesc automat diferențe pentru fiecare document derivat. Lucrările de fundal folosesc auditul explicit propriu. Istoricul anterior activării nu este inventat/reconstituit. Nu există API pentru editarea sau ștergerea jurnalului din interfață.

## Validare

37 teste automate și 21 verificări locale DDP/Mongo: paritate craft, PDF/XLSX, autorizare, revocare documente, istoric cu actor și diferențe, refuz pentru membru obișnuit, separarea Lojei și două scrieri concurente. În browser au fost verificate dashboardul, ferestrele multiple, păstrarea filtrului în Convocatoare și pagina de istoric. Nu au fost trimise emailuri reale.

Funcțiile PDF/DOCX existente rămân păstrate. Detaliile publicării efective se consemnează separat în `deploy/releases/` după verificarea pe server.

# CSA: paritate Meteor 2.16 și remedierea autentificării

Data: 19 septembrie 2026. Bază: `0bd4d74543c5fd5a66c66ac61c8d409db58088f1`. Modificările migrării sunt în directorul de lucru și nu sunt încă publicate ca release complet.

## Sursa comparată

Sursa legacy este disponibilă, numai pentru citire, la `\\192.168.177.99\meteor\csa`; `.meteor/release` indică Meteor 2.16. Au fost comparate rutele și interfețele craft, `server/module/craft/convocatoare.js`, `docs/craft-convocatoare.md`, generatorul PDF și raportul Excel. Codul vechi și baza veche nu au fost modificate.

## Implementări în versiunea nouă

| Funcționalitate | Implementare |
|---|---|
| Parole legacy | Gateway verifică bcrypt(SHA256(parola)), formatul Meteor. Compatibilitate cu conturile create anterior de gateway și actualizarea lor la login. Înregistrarea/resetarea produc același format. |
| Confirmări membru | Rute `/confirmari`, `/confirmari/:id`, `/confirmare/:token`; ținută, agapă, meniu, motive absență și corectarea propriului răspuns înainte de termen. |
| Confirmare fără cont în browser | Pagină gateway minimală `/confirmare.html#token=...`, token aleator stocat numai ca hash, fără acces la portal sau lista membrilor. Linkurile legacy bazate pe ID-uri nu sunt acceptate ca tokenuri. Invitațiile importate necesită retrimitere. |
| Centralizare prezențe | `/prezente`: totaluri, căutare, răspunsuri administrative, prezență efectivă distinctă, asocierea prezențelor legacy necorelate. |
| Email convocator | Trimitere individuală, PDF atașat filtrat după grad, revendicare atomică pentru evitarea trimiterilor simultane, evidență trimis/eșuat, retrimitere și înlocuirea tokenului. |
| Email de test și recipisă | Testul merge doar la adresa operatorului; răspunsul membrului produce notificare separată către membru și secretariatul configurat. |
| PDF | Generator pdfmake cu fonturi și sigla din legacy, date convocator, ordine de zi pe grade și semnătură configurabilă; descărcare și tipărire din browser. Funcțiile PDF/DOCX existente din bibliotecă și dosare rămân păstrate. |
| Raport Excel | XLSX cu rubricile legacy, meniu, motive absență, rând TOTAL și prezență efectivă; CSV disponibil separat. |
| Operații convocatoare | Duplicare metadate/agendă fără răspunsuri și date, ștergere logică tranzacțională, arhivare, operații pe selecție, căutare, sortare și paginare. |
| Documente asociate | Asociere convocator–lucrare publicată din biblioteca existentă, filtrare după grad și retragerea metadatelor când lucrarea devine inaccesibilă. Importul fișierelor binare legacy nu este efectuat automat. |
| Permisiuni | Interfața folosește aceeași verificare rol/mandat ca serverul; tenant_admin singur nu primește în mod eronat butoane de editare. |
| Statistici | Răspuns final negativ nu mai este numărat drept participare; totalurile separă confirmarea, lipsa răspunsului, agapa și prezența efectivă. |
| Contoare | Numerotarea continuă peste maximul importat și rezervă atomic numere concurente. |
| Reconciliere | Comparare pe loturi și preluare numai a câmpurilor selectate, control de concurență și jurnal cu valori precedente. Nu suprascrie parole, roluri sau datele modulelor noi. |
| Navigație | Restabilirea fundalului meniului privat și adaptarea meniului la ecrane înguste. |

Ecranele legacy `/planse` conțin schelet CRM cu câmpuri și trimiteri la leads, fără un flux independent complet verificat. Nu sunt prezentate ca funcționalitate literară livrată de legacy; biblioteca nouă rămâne fluxul funcțional pentru lucrări. Modulele ERP din sursa comună nu intră în domeniul CSA descris de README.

## Autentificare: activată pe server

`192.168.177.68` este hostul Docker. Gateway-ul public și serviciul Express `gateway-auth` protejează aplicația Meteor v3 din containerul `csa-meteor-portal-1`.

La verificare, ambele containere Meteor erau oprite. Portalul a fost repornit; instanța directă a necesitat recrearea containerului din aceeași configurație și imagine, cu volumele existente păstrate. Ambele au devenit healthy.

Corecția parolelor a fost instalată separat de funcțiile de migrare aflate în lucru:

- imagine auth: `sha256:935605403b99a09dcd6104ece5692f887e72a2cb0ed0fd446c1892b907e2972c`;
- pachet: `/home/urgentit/csa-setup/releases/auth-password-hotfix`;
- backup reușit: `/home/urgentit/csa-setup/backups/auth-password-20260919T195232Z`;
- test real prin gateway: parolă greșită → 401; hash Meteor + parola corectă → 200; assertion pentru Meteor → 200; `/portal/templu` autentificat → HTML Meteor 200;
- contul temporar și sesiunile testului au fost șterse; parolele conturilor existente nu au fost reimportate/resetate.

Accesul sudo funcționează prin Pageant și agent forwarding cu PuTTY `plink -A -t`, folosind cheia locală Docker. `sudo -n` nu declanșează autentificarea PAM necesară aici. Host key verificată din known_hosts: `SHA256:w5xc/uqjA+j1of4qmFxPJ0DxO8yv6EicBy7HiPHYBVo`. Nu este necesară comunicarea parolei sudo.

## Pagina albă după login: corecție activată

Browserul a confirmat eroarea `__meteor_runtime_config__ is not defined`: politica CSP a gateway-ului bloca scriptul inline de inițializare Meteor. Testul inițial HTTP 200 verifica doar HTML-ul și nu detecta acest defect. Gateway-ul introduce acum un nonce per răspuns pe acel script. Numai portalul permite stilurile injectate și evaluarea modulelor dinamice necesare bundle-ului Meteor existent; site-ul public păstrează politica strictă. Configurația a trecut `nginx -t`, a fost reîncărcată și verificată în browser. Backup inițial: `/home/urgentit/csa-setup/backups/gateway-csp-20260919T201333Z.conf`.

Testul live de autentificare verifică acum și concordanța nonce-ului HTML cu CSP, compatibilitatea stilurilor/modulelor și menținerea politicii stricte pe pagina publică. Contul temporar este eliminat la final.

Templul și reperele se afișează în Chrome în modul simplificat. Raportul furnizat de utilizator `about-gpu-2026-09-19T20-21-01-646Z.txt` indică Microsoft Basic Render Driver, ANGLE D3D11 WARP, lipsa accelerării hardware și WebGL dezactivat. Utilizatorul confirmă că browserul rulează într-un VM Windows Hyper-V. Acest raport explică indisponibilitatea randării 3D în mediul testat; nu stabilește când s-a schimbat configurația grafică. Nu au fost modificate setările de securitate ale browserului sau ale hypervizorului. Codul local distinge acum mesajul pentru lipsa WebGL de o eroare de încărcare și înregistrează cauza în consola browserului.

## Adrese pentru verificare

- Gateway instalat: `http://192.168.177.68:18610/`.
- Templu privat instalat: `http://192.168.177.68:18610/portal/templu`.
- Instanță directă instalată: `http://192.168.177.68:18600/templu`.
- Previzualizare locală a modificărilor migrării: `http://192.168.177.53:18700/`; bază locală separată, fără datele reale ale membrilor. Credencialele temporare sunt în fișierul ignorat `tmp/csa-preview-access.json`.

Templul folosește Three.js/WebGL și oferă listă accesibilă dacă WebGL lipsește. În browserul integrat de test a fost verificat acest mod alternativ; randarea WebGL efectivă nu a fost validată pe această stație.

## Verificare și limite

Au trecut 35 de teste automate și 17 verificări de integrare DDP/Mongo. Testele automate acoperă formatul parolelor, validarea răspunsurilor, tokenurile publice, izolarea tenantului, conturi inactive, termene, câmpurile reconcilierii și testele existente ale dosarelor/documentelor. Integrarea locală verifică permisiuni, răspunsuri, termene, duplicare tranzacțională, contoare concurente, exporturi PDF/XLSX, retragerea reactivă a documentelor devenite inaccesibile și prezență efectivă. PDF-urile de probă au fost extrase și randate: gradul 1 nu include text de gradul 3.

Nu au fost trimise emailuri reale. Livrarea SMTP către destinatarii reali, reconcilierea cu baza legacy și importul fișierelor binare nu au fost executate. Publicarea completă a modificărilor migrării trebuie să urmeze procedura de release; serverul .68 conține deocamdată corecțiile autentificării/CSP și versiunea Meteor repornită.

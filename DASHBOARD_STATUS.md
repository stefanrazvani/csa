# Conținut portal privat CSA

Data implementării: 12 iulie 2026.

## Pagina afișată după autentificare

Dashboardul este calculat pe server pentru utilizatorul și tenantul activ și afișează:

- identitatea utilizatorului, tenantul și gradul de acces;
- maximum cinci convocatoare viitoare sau, dacă nu există, cele mai recente;
- numărul articolelor accesibile gradului utilizatorului pentru fiecare convocator;
- ultimele cinci confirmări proprii și totalul confirmărilor proprii;
- numărul documentelor din registrul tenantului;
- legături rapide adaptate rolului;
- pentru administratori: utilizatori activi, conturi în verificare, utilizatori fără grad, convocatoare, articole pe nivel, prezențe, confirmări și excepții de migrare.

## Reguli de acces

- un utilizator activ poate vedea metadatele generale ale convocatoarelor;
- conținutul articolelor nu este trimis fără grad activ;
- gradul 1 primește nivelul 1;
- gradul 2 primește nivelurile 1 și 2;
- gradul 3 primește nivelurile 1, 2 și 3;
- formularele de editare și creare sunt afișate numai utilizatorilor cu drept de scriere sau administrare;
- administrarea gradelor este vizibilă numai administratorilor tenantului/globali.

## Situația datelor curente

- convocatoare: 25;
- articole nivel 1: 322;
- articole nivel 2: 138;
- articole nivel 3: 99;
- prezențe: 24;
- confirmări: 462;
- documente în registru: 0;
- grade active configurate pentru utilizatorii migrați: 0;
- o prezență importată necesită asociere manuală.

Până la alocarea gradelor, utilizatorii văd informațiile generale și istoricul propriu, împreună cu mesajul că accesul la articole este în curs de configurare.

## Administrare convocatoare și prezențe

- `razvan.stefan.i@gmail.com` este configurat ca `tenant_admin` pentru tenantul CSA;
- are explicit rolurile `convocatoare_read`, `convocatoare_write`, `convocatoare_delete` și `convocatoare_admin`;
- la crearea unui convocator se creează automat și idempotent o singură prezență;
- se creează câte o confirmare pentru fiecare utilizator activ (`setari.status = 1`) asociat tenantului;
- la salvarea convocatorului se sincronizează metadatele prezenței și confirmărilor;
- utilizatorii activați ulterior primesc confirmare la următoarea salvare;
- indexurile unice împiedică dublarea prezenței și a confirmărilor.

Testul de integrare a creat un convocator temporar, o prezență și 23 de confirmări, egal cu numărul utilizatorilor activi din acel moment. A doua salvare a creat zero duplicate. Toate datele temporare au fost eliminate, iar colecțiile au revenit la 25 convocatoare, 24 prezențe și 462 confirmări.

# Stare migrare CSA

Data execuției: 11 iulie 2026.

## Sursă

- VM legacy: `192.168.177.99`;
- MongoDB: `3.6.14`, replica set `rs0`, baza `meteor`;
- tenant: `6fTnDkY4pn8M5afp4`;
- aplicația legacy a rămas online pe portul `3008`.

## Backupuri

- dump complet legacy cu oplog: `/home/urgentit/csa-migration-backups/mongo36-full-20260711-231134.archive.gz`;
- backup MongoDB 8 înainte de import: `/home/urgentit/csa-setup/backups/csa-before-legacy-import-20260711-231831.archive.gz`;
- ambele arhive au checksum SHA-256 valid și mod `600`.

## Bridge temporar

- serviciu instalat: `mongo36-bridge.service`;
- port folosit: `192.168.177.99:27036`;
- acces permis exclusiv pentru `192.168.177.68`;
- după import serviciul a fost oprit și dezactivat, iar portul este închis.

## Rezultat import

- utilizatori: 28;
- utilizatori activi conform statusului legacy: 22;
- convocatoare: 25;
- articole/documente text: 559;
- prezențe: 24;
- confirmări prezență: 462;
- documente în registrul legacy: 0;
- total documente inserate: 1.098;
- documente existente/idempotente: 1.

Toate cele 28 de ID-uri, emailuri și hash-uri bcrypt ale utilizatorilor coincid între sursă și destinație. Tokenurile `services.resume` nu au fost migrate. Conturile legacy cu status diferit de `1` sunt refuzate la login.

## Excepții rămase

- utilizatorii nu au un grad masonic explicit în baza legacy; cele 28 de mapări 1/2/3 trebuie stabilite înainte de accesarea conținutului pe grade;
- prezența legacy `ncuS9SBRMfGZ3eY4d` nu are o asociere unică la convocator și este marcată pentru rezolvare manuală;
- rolurile ERP legacy nu au fost transpuse în ACL-ul CSA; permisiunile CSA se configurează din Administrare Tenant.

# CSA Meteor 3

Aplicație CSA independentă, construită pe convențiile arhitecturale UappsV3, fără modulele ERP ale proiectului de referință.

Documentație dedicată: [Templul 3D — implementare, scene și limitări](./imports/system/experience/TEMPLU_3D.md).

## Nucleu funcțional

- login Nova Reperta cu sigla istorică și fundal animat cu particule;
- înregistrare publică în stare de verificare, activată ulterior din Administrare Tenant;
- recuperare parolă prin email, fără divulgarea existenței unui cont;
- Administrare Globală pentru tenanturi și utilizatori;
- Administrare Tenant pentru datele tenantului, utilizatori, grupuri, module și permisiuni;
- rol global `super_admin`, rol tenant-scoped `tenant_admin` și roluri `alias_read/write/delete/admin`;
- nivel masonic per utilizator și tenant;
- convocatoare și articole pe gradele 1/2/3;
- prezențe, confirmări și registru de documente;
- migrare controlată din MongoDB legacy, cu `dry-run` implicit.

## Registru și autorizare compusă

Sursa canonică pentru modulele noi este `lodge_memberships` împreună cu
`degree_events`. `craft_memberships` este sincronizat temporar pentru
compatibilitate. Nucleul adaugă mandate și delegări (`office_terms`,
`office_delegations`), vizitatori externi și jurnalul append-only
`audit_events`.

Autorizarea compusă verifică tenantul activ, apartenența activă, gradul minim,
rolul de modul și mandatul/delegarea unei funcții. `super_admin` are acces
complet, iar accesările sale administrative sunt auditate.

Contracte backend reutilizabile:

- `getEffectiveGrade(userId, eId)`;
- `hasActiveOffice(userId, eId, officeCodes, at?)`;
- `requireCompositeAccess(context, options)`;
- `writeAuditEvent(payload)` din `/imports/system/governance/server/audit.js`.

Funcțiile implicite per tenant sunt `venerable`, `secretary`, `treasurer`,
`hospitalier`, `librarian` și `mentor`. Seed-ul nu acordă automat mandate.

Namespace-urile server sunt `membership.*`, `degreeEvents.*`, `officeTerms.*`,
`visitorInvitations.*` și `audit.recent`.

## Regula de acces pe grad

Un utilizator poate citi informații cu `level <= grade`. Gradul canonic este stocat în registrul Loji și este sincronizat temporar în `craft_memberships` pentru modulele vechi. Administratorii tenantului și modulelor nu ocolesc filtrul de grad decât dacă `CSA_CRAFT_ADMIN_GRADE_BYPASS=1` este activat explicit; `super_admin` are acces complet și auditat.

## Configurație

- `CSA_PLATFORM_ADMIN_EMAILS` — conturi existente promovate explicit la rolul `super_admin`; ACL-ul verifică numai rolul, nu emailul;
- `MONGO_URL` — baza CSA;
- `ROOT_URL` — URL-ul public folosit inclusiv în linkurile de resetare;
- `MAIL_URL` — conexiunea SMTP pentru recuperarea parolei;
- `CSA_MAIL_FROM` — expeditorul mesajelor de sistem;
- `CSA_LEGACY_MONGO_URL` — sursa legacy pentru audit și migrare;
- `CSA_LEGACY_EID` — identificatorul tenantului CSA;
- `CSA_CRAFT_ADMIN_GRADE_BYPASS` — bypass explicit pentru grad;
- `CSA_BOOTSTRAP_ADMIN_EMAIL` și `CSA_BOOTSTRAP_ADMIN_PASSWORD` — bootstrap temporar pentru primul `super_admin`.

Migrarea reală nu pornește automat. Metodele cer `super_admin`, iar execuția cere confirmarea `MIGRATE_CSA`.

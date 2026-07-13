# Dosare Frați

Modulul păstrează datele suplimentare ale dosarului fără să dubleze adevărul canonic din `lodge_memberships`, `degree_events` și `office_terms`. Registrul este o proiecție generată la cerere prin metoda `dossiers.registry.generate`.

## Integrare

Bootstrapurile centrale trebuie să importe:

```js
// imports/modules/index-server.js
import './dossiers/server';

// imports/modules/index-client.js
import './dossiers/client';
```

Rutele înregistrate de client sunt `/dosare-frati` și `/dosare-frati/:userId`; `registerDualRoute` creează automat și variantele `/portal/...`.

Accesul administrativ cere grad 3, permisiunea `membership.admin` și mandat activ de Secretar sau Venerabil. Administratorul platformei are acces cross-tenant auditat. Membrul poate vedea numai propriul dosar, documentele/notele marcate `member` și proiecțiile canonice proprii.

Formularul matricol salvează apartenența canonică și informațiile personale printr-un singur apel `dossiers.profile.save`, cu `eId` explicit și coerent. Cele două scrieri sunt executate în aceeași tranzacție MongoDB, apoi sunt auditate. Publicațiile dosarelor observă reactiv apartenența, mandatele, delegările și rolurile; la o posibilă revocare retrag mai întâi datele publicate și abia apoi reevaluează ACL-ul.

## Import staging

`dossiers.import.stage({ sourceName, sourceHash?, rows }, requestedEId?)` primește maximum 1.000 de obiecte deja extrase din XLSX de un proces administrativ. Clientul nu parsează fișierul. Câmpurile acceptate sunt exportate de `api/import-schema.js`. Rândurile sunt normalizate și validate, dar nu modifică dosarele canonice. `dossiers.import.preview(batchId, limit, requestedEId?)` permite revizuirea auditată.

## Documente și MinIO

`dossiers.documents.register` acceptă metadate fără fișier sau o referință opacă:

```js
objectRef: {
  provider: 'minio',
  bucket: 'csa-documents',
  key: `${eId}/dossiers/${userId}/<uuid>.<ext>`,
  versionId: '<optional>',
  size: 1234,
  mimeType: 'application/pdf'
}
```

Referința necesită și `sha256`. Cheia nu este publicată în client. `dossiers.documents.authorizeDownload` emite un ticket de două minute, stocat numai ca hash. Gateway-ul trebuie să implementeze `GET /portal-api/dossiers/documents/:id?ticket=...`, să consume atomic ticketul, să reverifice sesiunea și să transmită obiectul din MinIO. Pentru upload este necesar un endpoint gateway similar, care scanează prin ClamAV și scrie sub prefixul impus înainte de a apela metoda de înregistrare.

Documentele ritualice/regulamentare folosite ca surse de proiectare nu intră automat în acest modul.

Testul validării importului se rulează cu:

```powershell
node imports/modules/dossiers/tests/import-schema.test.mjs
node imports/modules/dossiers/tests/security-contract.test.mjs
```

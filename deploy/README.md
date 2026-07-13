# Stack CSA

Stack independent pentru CSA. Nu reutilizează volume AppsV3 sau volume din aplicația veche și nu publică pe LAN bazele de date ori serviciile de conținut.

## Servicii și rețele

- `meteor`: acces direct de dezvoltare la `http://192.168.177.68:18600`;
- `meteor-portal`: bundle privat servit prin Passenger;
- `gateway` și `gateway-auth`: site public și protecția `/portal`;
- `mongo`: sursa canonică, replica set `csa-rs`;
- `minio`: fișiere originale și atașamente, cu versioning;
- `content-worker`: text direct, DOCX prin Mammoth și PDF text prin Poppler;
- `clamav`: scanarea fișierelor înainte de extragere;
- `arangodb`: proiecția persistentă a grafului de concepte;
- `opensearch`: căutare full-text și snapshoturi.

`csa_internal` păstrează serviciile aplicației existente. `csa_content_internal` are `internal: true`; Mongo, cele două instanțe Meteor și serviciile de conținut comunică pe această rețea. MinIO, ClamAV, ArangoDB și OpenSearch nu au `ports`, deci nu sunt accesibile direct din LAN. Numai ClamAV este conectat suplimentar la `csa_internal`, pentru actualizarea semnăturilor prin egress; portul 3310 rămâne nepublicat.

## Inițializare

1. Copiați `.env.example` ca `.env` și înlocuiți toate valorile `replace_me`.
2. Copiați `secrets/mail.env.example` ca `secrets/mail.env` și completați SMTP.
3. Rulați `./init-infrastructure.sh`. Scriptul creează numai volumele și secretele lipsă; nu șterge și nu rotește resurse existente.
4. Dacă scriptul raportează o valoare mică pentru `vm.max_map_count`, rulați `sudo ./init-infrastructure.sh --apply-sysctl`.
5. Inițializați replica set-ul Mongo și utilizatorul aplicației, conform procedurii existente.
6. Rulați `./initialize-content-services.sh`. Acesta creează bucketul versionat `csa-documents`, baza ArangoDB `csa`, repository-ul de snapshot OpenSearch și template-ul `csa-text-*`, apoi pornește workerul.

Volumele externe persistente sunt:

```text
csa_mongo_data
csa_mongo_config
csa_meteor_data
csa_meteor_home
csa_minio_data
csa_arangodb_data
csa_opensearch_data
csa_search_snapshots
csa_clamav_signatures
```

Fișierele secrete reale au mod `600`, sunt ignorate de Git și nu trebuie copiate în imagini. Valorile din `secrets/*.example` sunt exclusiv exemple.

## Contractul cozii de conținut

MongoDB este coada și sursa canonică. Pentru extragere se inserează în `processing_jobs`:

```javascript
{
  type: 'library_extract',
  status: 'queued',
  attempts: 0,
  priority: 0,
  eId: '<tenant>',
  workId: '<library_works._id>',
  versionId: '<library_versions._id>',
  minGrade: 1,
  source: {
    bucket: 'csa-documents',
    key: '<cheie generată pe server>',
    originalName: 'carte.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  createdAt: new Date(),
  updatedAt: new Date()
}
```

Pentru fluxul principal text-first, `source` poate fi `{ directText: '...' }`. Workerul revendică atomic maximum două joburi, scanează fișierele cu ClamAV, extrage textul într-un director `tmpfs`, scrie noduri `draft` în `text_nodes` și mută jobul în `review`. O extragere cu mai puțin de 40 de caractere devine `unsupported_scan`; OCR nu este instalat și nu este pornit.

Uploadul web folosește `POST /portal-api/documents`, `multipart/form-data`, câmpurile `file` și `workId`, plus antetul obligatoriu `X-CSA-Tenant`. Gateway-ul verifică sesiunea, `Origin`, apartenența și rolul `library_write`, `library_admin` ori `tenant_admin`, acceptă maximum 250 MB, corelează MIME/extensie/magic bytes, scanează prin ClamAV, generează cheia MinIO și creează tranzacțional versiunea și jobul. Starea se citește la `GET /portal-api/imports/:jobId/status`. Nginx aplică limita de 250 MB numai pe `/portal-api/`; restul gateway-ului rămâne la 64 KB.

Nodurile generate au `eId`, `workId`, `versionId`, `parentId`, `type`, `order`, `text`, `page`, `hash`, `minGrade`, `generationId` și `importJobId`. La retry se elimină numai generațiile `draft` create de worker; conținutul editat/publicat nu este șters.

Același worker consumă și joburile de proiecție create după publicare:

- `project_library_version` indexează idempotent nodurile publicate în indexul OpenSearch `csa-text-<eId>`, în loturi de 500;
- `project_concepts` creează/actualizează graful ArangoDB `csa_concepts`, cu vertecși `study_concepts` și muchii `concept_relations`;
- ambele tipuri pornesc din `pending`, folosesc lock/heartbeat/retry în Mongo și ajung în `completed` numai după răspunsul serviciului țintă;
- MongoDB rămâne sursa canonică; cheile Arango sunt deterministe pe `eId + sourceId`, iar documentele OpenSearch păstrează `eId` și `minGrade` pentru filtrarea obligatorie din server.

Workerul citește parolele OpenSearch și ArangoDB din Docker secrets. OpenSearch folosește TLS-ul intern al imaginii și certificatul self-signed este acceptat numai pe rețeaua Docker izolată; niciunul dintre servicii nu publică port pe host.

## Backup și restore

Rulați:

```bash
./ops/backup.sh
./ops/backup.sh nume-controlat
```

Operația produce:

- arhivă logică `mongodump`, cu SHA-256;
- oglindă a versiunii curente a obiectelor MinIO;
- dump logic al bazei ArangoDB `csa`;
- snapshot OpenSearch `csa-*` în volumul `csa_search_snapshots`;
- manifest în `${CSA_BACKUP_ROOT}/manifests`.

Restore-ul este deliberat protejat prin confirmare explicită:

```bash
./ops/restore.sh 20260713T120000Z mongo --confirm RESTORE_CSA
./ops/restore.sh 20260713T120000Z all --confirm RESTORE_CSA
```

Restore Mongo folosește `--drop`. Restore Arango poate suprascrie colecțiile. Restore OpenSearch este refuzat dacă există deja indexuri `csa-*`. Restore MinIO suprascrie obiectele cu aceleași chei, dar nu șterge obiectele suplimentare.

Limitări operaționale importante:

- oglinda MinIO păstrează versiunea curentă, nu întreg istoricul de versiuni; pentru recuperarea tuturor versiunilor se configurează replicare MinIO către o destinație separată;
- snapshotul OpenSearch rămâne în volumul persistent; volumul trebuie copiat și off-host;
- backupul volumului nu înlocuiește dumpul logic;
- backupurile și secretele trebuie incluse într-o politică off-host criptată și într-un test periodic de restore.

## Publicarea Meteor

Sursa rămâne în `/var/meteor/csa`, în `csa_meteor_data`, iar bundle-ul activ în `/var/meteor/csa-build/bundle`. Construiți cu `build-bundle.sh`, promovați atomic `csa-build.next`, păstrați bundle-ul anterior pentru rollback și recreați cele două servicii Meteor.

Procedura completă de release de pe stația Windows `UITWin11Dev`, inclusiv
cheia SSH dedicată, validarea, backupul, promovarea atomică și verificările
post-deploy, este documentată în [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

În producție sunt obligatorii `CSA_GATEWAY_ORIGIN=https://reperta.via-nova.ro`, cookie `Secure`, TLS și limitarea portului direct `18600` la LAN/VPN.

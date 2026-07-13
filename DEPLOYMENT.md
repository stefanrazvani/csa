# Deploy CSA de pe stația UITWin11Dev

Acest document descrie procedura verificată de publicare a aplicației CSA din
repository-ul GitHub către stackul Docker intern. Nu conține parole, chei
private sau valorile Docker secrets.

## Inventar

- denumire operațională stație: `UITWin11Dev`;
- hostname Windows detectat: `UITWIN11DEV01`;
- utilizator Windows: `UrgentIT`;
- proiect local: `C:\Proiecte\MigrareCSA`;
- repository: `https://github.com/stefanrazvani/csa.git`;
- server Docker: `urgentit@192.168.177.68`;
- checkout Git pe server: `/home/urgentit/csa-setup/repository`;
- configurație Compose: `/home/urgentit/csa-setup/deploy`;
- arhive release: `/home/urgentit/csa-setup/releases`;
- backupuri logice: `/home/urgentit/csa-setup/backups`.

Adresele active sunt:

- dezvoltare directă: `http://192.168.177.68:18600`;
- gateway public: `http://192.168.177.68:18610`;
- portal privat: `http://192.168.177.68:18610/portal/`.

## Acces SSH de pe UITWin11Dev

Stația folosește cheia ED25519 dedicată:

```text
C:\Users\UrgentIT\.ssh\csa_deploy_ed25519
```

Cheia privată rămâne numai pe UITWin11Dev și nu se adaugă în Git. Pe server
este instalată exclusiv cheia publică. Amprenta cheii este:

```text
SHA256:ou42cBdp/PsBmnMq41HVojFicarFJM0zNgV77YCp7tw
```

Testarea conexiunii fără parolă:

```powershell
ssh -F NUL `
  -i "$HOME\.ssh\csa_deploy_ed25519" `
  -o IdentitiesOnly=yes `
  -o BatchMode=yes `
  urgentit@192.168.177.68
```

Se folosește `-F NUL` pentru a evita dependența de configurația SSH globală a
stației. Cheia SSH nu acordă automat drepturi `sudo`; operațiile privilegiate
rămân protejate separat.

## Fluxul standard de release

Deploy-ul pornește numai dintr-un commit GitHub identificat exact, nu direct
din fișiere locale necomise.

### 1. Verificarea modificărilor locale

Din PowerShell pe UITWin11Dev:

```powershell
cd C:\Proiecte\MigrareCSA
git status --short --branch
git diff --check
git diff --stat
```

Se verifică faptul că sunt incluse numai fișierele intenționate și că diff-ul
nu conține parole, tokenuri, chei private ori fișiere din `deploy/secrets`.

### 2. Sintaxă și teste

```powershell
$files = @(git ls-files 'csa-app/**/*.js')
foreach ($file in $files) { node --check $file }

$tests = @(git ls-files '*test*.mjs' '*test*.js' |
  Where-Object { $_ -notmatch 'test-flow\.mjs$' })
node --test $tests
```

`deploy/gateway-auth/test-flow.mjs` este un test end-to-end și se rulează
separat, numai cu variabilele de test și credentialele furnizate prin mediul
local, niciodată din repository.

### 3. Commit și push

```powershell
git add -- <fisierele-verificate>
git commit -m "descrierea modificarii"
git push origin main

$commit = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/main) -split "`t" | Select-Object -First 1
if ($commit -ne $remote) { throw "Commitul local nu coincide cu origin/main." }
```

### 4. Pregătirea release-ului pe server

Serverul trebuie să execute următoarele operații în această ordine:

1. `git fetch --prune origin main` în checkout-ul serverului;
2. verificarea că `origin/main` este commitul transmis de UITWin11Dev;
3. arhivarea exactă a arborelui `csa-app` din acel commit;
4. calcularea SHA-256 pentru arhivă și pentru `deploy/build-bundle.sh`;
5. crearea unui backup logic nou pentru MongoDB, MinIO, ArangoDB și
   OpenSearch;
6. verificarea manifestului backupului înainte de build.

Exemplu de verificare a commitului prin cheia dedicată:

```powershell
$key = "$HOME\.ssh\csa_deploy_ed25519"
ssh -F NUL -i $key -o IdentitiesOnly=yes `
  urgentit@192.168.177.68 `
  "cd /home/urgentit/csa-setup/repository && git fetch --prune origin main && git rev-parse origin/main"
```

### 5. Build și promovare atomică

Buildul se face în `csa-build.next`, în timp ce release-ul activ continuă să
ruleze. Promovarea este permisă numai dacă:

- arhiva și scriptul de build au SHA-256 corect;
- există `package.json`, `.meteor/release` și bundle-ul server;
- `npm audit --omit=dev --audit-level=high` trece după aplicarea override-urilor
  versionate;
- backupul pre-release este complet.

După build se opresc numai serviciile `meteor` și `meteor-portal`, se schimbă
atomic bundle-ul, apoi containerele sunt recreate. Sursa și bundle-ul anterior
sunt păstrate pentru rollback. Dacă unul dintre cele două servicii nu devine
`healthy`, procedura restaurează automat versiunea precedentă.

Nu se execută manual `rm`, `mv` sau `docker volume rm` în volumul
`csa_meteor_data`. Promovarea trebuie făcută numai de procedura controlată de
release.

### 6. Verificarea după deploy

Release-ul este acceptat numai după:

- 10/10 containere `healthy`;
- sursa activă identică fișier cu fișier cu `COMMIT:csa-app`;
- `200` pentru `/` și `/templu` pe portul direct `18600`;
- `200` pentru gateway-ul public pe `18610`;
- redirect la login pentru acces anonim la `/portal/`;
- absența erorilor `fatal`, `uncaught`, `unhandled`, `exception` sau `panic` în
  logurile recente.

Comenzi rapide de verificare de pe UITWin11Dev:

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" http://192.168.177.68:18600/templu
curl.exe -sS -o NUL -w "%{http_code} %{redirect_url}`n" http://192.168.177.68:18610/portal/
```

### 7. Tag și documentarea rezultatului

După verificarea release-ului:

```powershell
git tag -a "release-AAAALLZZ-HHMMSS" $commit -m "Release AAAALLZZ-HHMMSS"
git push origin "release-AAAALLZZ-HHMMSS"
```

Se actualizează `PLATFORM_STATUS.md` cu release-ul activ, commitul, tagul,
SHA-256 și ID-ul backupului. Modificarea de documentație se comite separat;
tagul release rămâne pe commitul aplicației efectiv construit.

## Persistență la redeploy

Recrearea containerelor păstrează datele. MongoDB, Meteor, MinIO, ArangoDB,
OpenSearch, snapshoturile și semnăturile ClamAV folosesc volume externe
`csa_*`. Configurațiile, arhivele release și backupurile sunt persistente în
directoarele `/home/urgentit/csa-setup` de pe host.

Nu se șterg volumele `csa_*`. Persistența pe același server nu înlocuiește un
backup off-host.

## Automatizarea cu o singură comandă

Comanda propusă este:

```powershell
.\ops\release.ps1 -Message "ajustare templu 3D"
```

La data redactării acestui document, `ops/release.ps1` și wrapperul privilegiat
de pe server nu sunt încă implementate. Comanda nu trebuie prezentată ca
funcțională până când ambele scripturi, blocarea cu `flock`, regula `sudo`
limitată și testul de rollback nu sunt versionate și verificate.


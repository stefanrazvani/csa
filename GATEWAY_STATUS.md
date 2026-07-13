# Stare gateway CSA

Data ultimei validări: 13 iulie 2026.

## Adrese de test

- aplicație Meteor directă: `http://192.168.177.68:18600`;
- aplicație publică: `http://192.168.177.68:18610`;
- portal protejat: `http://192.168.177.68:18610/portal/`.

## Servicii

- `csa-gateway-1`: Nginx public și control de acces;
- `csa-gateway-auth-1`: autentificare, sesiuni, înregistrare și recuperare parolă;
- `csa-meteor-portal-1`: Meteor 3 prin Passenger, fără port public;
- `csa-meteor-1`: acces direct de dezvoltare, limitat la IP-ul LAN;
- `csa-mongo-1`: MongoDB intern.
- `csa-minio-1`, `csa-clamav-1`, `csa-arangodb-1`, `csa-opensearch-1` și `csa-content-worker-1`: conținut privat, scanare, graf și căutare, fără porturi LAN.

## Verificări executate

- acces anonim la `/portal/`: redirecționat către autentificarea publică;
- bundle privat fără cookie: blocat;
- autentificare gateway: reușită;
- emitere și validare sesiune: reușită;
- login DDP în Meteor prin aserțiune unică: reușit;
- înregistrare publică: cont `pending`, tenant inactiv;
- activarea contului și loginul de test: reușite;
- recuperare pentru adresă inexistentă: răspuns generic;
- resetare cu token invalid: refuzată;
- conturile și sesiunile temporare de test: eliminate;
- audit npm gateway: zero vulnerabilități;
- bundle Meteor: zero vulnerabilități;
- toate containerele: healthy.
- smoke platformă: templu, bibliotecă, registru, Metale, Ospitalier și vizitatori;
- backup logic complet `post-platform-20260713`: reușit.

## Înainte de producție

- domeniul nu a fost mutat și aplicația legacy nu a fost oprită;
- se configurează HTTPS pe `reperta.via-nova.ro`;
- `CSA_GATEWAY_COOKIE_SECURE` devine `1`;
- se aplică HSTS după validarea certificatului și a rutării;
- portul direct `18600` rămâne exclusiv LAN/VPN.

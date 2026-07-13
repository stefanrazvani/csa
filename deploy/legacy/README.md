# Acces temporar MongoDB 3.6

Serviciul `mongo36-bridge` rulează pe VM-ul legacy și publică `192.168.177.99:27036` către MongoDB-ul local `127.0.0.1:27017`.

Accesul este filtrat în proxy la `192.168.177.68/32`, astfel încât numai serverul Docker poate deschide conexiuni. MongoDB 3.6 nu are autentificare activă, deci bridge-ul trebuie oprit și dezactivat imediat după validarea migrării.

Comenzi de închidere după migrare:

```bash
sudo systemctl disable --now mongo36-bridge
sudo ss -lntp '( sport = :27036 )'
```

Backupul consistent cu oplog se păstrează separat în `/home/urgentit/csa-migration-backups/`.

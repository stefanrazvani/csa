# Release CSA — profil și perspectiva apropiată, 21 septembrie 2026

Cod: `e4d0752` (include profilul din `f9544d1`).
Tag: `release-20260921-profile-camera`. Manifest: `2026.09.21-3`.
Artefact: `csa-app-release-e4d0752.tar.gz`.
SHA-256: `ebbf4e2172f02a9606b9947cfb640245366ee8b9f1612d6d453235459ceae42d`.

## Modificări

La cererea utilizatorului, perspectiva panoramică din `4aaf68f` este înlocuită
cu perspectiva apropiată inițială, deplasată doar 0.6 spre stânga:
camera `[-0.6, 3.1, 6.6]`, ținta `[0, 1.5, -5.2]`, FOV 42° desktop / 50° mobil.
Sferele sunt vizibile prin întoarcerea camerei spre intrare. Privirea verticală
permite -0.75…0.95 radiani, suficient pentru sfere și locurile S1, MC și Acoperitor.
Geometria templului, materialele și conținutul pe grade sunt păstrate.

Meniul de profil afișează Prenume Nume din dosarul propriu al lojei active,
cu revenire la câmpurile migrate, numele afișat și apoi email.
Spațiile sunt normalizate; avatarul folosește inițialele prenumelui și numelui.
Publicarea reactivă transmite exclusiv numele din dosarele utilizatorului
autentificat. Emailul rămâne în meniul deschis, lângă accesul la profil și ieșire.

## Verificări

17 teste locale trecute. Proiecția și raycasting-ul cu geometria completă
verifică rotirea către sfere, S1, MC și Acoperitor la gradele II/III.
Testul folosește partea superioară a sferei: capitelul apropiat maschează
parțial baza ei din poziția interioară. Cartea, steaua și plumbul rămân separate.
WebGL este indisponibil în VM; verificarea 3D este geometrică, fără validare vizuală live.

`RELEASE_OK_e4d0752`: autentificare, profil/ACL, liste și templu la toate gradele
trecute. Camera servită este verificată explicit pentru fiecare grad.
153/153 fișiere active identice cu arhiva; 10/10 servicii CSA healthy.
Auditul bundle-ului final: zero vulnerabilități raportate.
UI profil verificat cu un cont temporar: nume migrat, nume din dosar reactiv,
inițiale, revenire la email când numele lipsesc și acces la pagina proprie
cu date doar pentru consultare. Datele și contul temporar au fost eliminate.

## Operațiuni

Host Docker `192.168.177.68`; containere `csa-meteor-1` / `csa-meteor-portal-1`.
Backup: `pre-release-profile-name-20260921`.
Versiunea anterioară: `csa.previous.e4d0752` / `csa-build.previous.e4d0752`.
Loguri: `/home/urgentit/csa-setup/releases/build-e4d0752.log` și
`promote-e4d0752.log`. Promovare cu rollback automat.
Buildul intermediar `f9544d1` nu a fost promovat; închiderea publicației
`profile.identity` a fost corectată înainte de buildul și activarea finală.
Testare: http://192.168.177.68:18610/portal/templu.

# Release CSA — lista de explorare opțională

Cod: `9a5264d`; tag: `release-20260921-discovery-toggle`.
Artefact: `csa-app-release-9a5264d.tar.gz`.
SHA-256: `d5b5001eb1c411ffc4b2914ba42ba5fa662c253cf838ab8ca44b3560a273dce4`.
Manifestul scenei rămâne `2026.09.21-3`; camera și geometriile sunt neschimbate.

„Descoperă templul” este ascuns implicit la deschiderea ferestrei, pe desktop
și mobil. Anterior, CSS-ul desktop ignora starea reactivă inițială închisă.
Butonul permanent afișează lista și devine „Ascunde lista” cât timp este deschisă.
Lista se închide și cu × sau Escape. Căutarea este păstrată la ascundere.
Selectarea unui reper închide lista și deschide fișa; la închiderea fișei,
focusul revine la butonul vizibil, nu la un element din lista ascunsă.
Selecția directă din 3D folosește același flux existent și rămâne disponibilă.
În fallback-ul fără WebGL, mesajul indică butonul pentru deschiderea listei.

Verificare UI live: starea inițială ascunsă, deschidere/ascundere cu același
buton, căutare păstrată, fișa Soarelui, închidere și focus; mobil 390×844:
buton vizibil sub listă, × și Escape funcționale. Viewport-ul a fost resetat,
iar contul și datele temporare au fost eliminate.
WebGL indisponibil în VM: selecția fizică este acoperită de testele geometrice
existente, nu de o verificare vizuală 3D live. 17 teste locale trecute.

Build finalizat, audit bundle zero vulnerabilități raportate.
`RELEASE_OK_9a5264d`: autentificare, liste, profil/ACL și templu pe toate gradele.
153/153 fișiere active identice cu arhiva; servicii CSA healthy.
Host Docker: `192.168.177.68`, containere Meteor principal și portal.
Backup: `pre-release-discovery-toggle-20260921`.
Versiune anterioară: `csa.previous.9a5264d` / `csa-build.previous.9a5264d`.
Loguri: `/home/urgentit/csa-setup/releases/build-9a5264d.log` și
`promote-9a5264d.log`. Promovare cu rollback automat.
Testare: http://192.168.177.68:18610/portal/templu.

# Camere administrative

Modulele `treasury`, `hospitality` și `secretariat` folosesc roluri scoped pe `eId`. Funcția anuală este convertită server-side în drepturi operaționale; gradul singur nu acordă acces administrativ.

- Metale: perioade, conturi, bugete și tranzacții cu aprobare/postare/reversare.
- Ospitalier: evenimente și cazuri confidențiale.
- Secretariat: invitații limitate pentru Frați vizitatori.

Sumele sunt stocate în unități monetare minore (bani), nu în numere floating-point.

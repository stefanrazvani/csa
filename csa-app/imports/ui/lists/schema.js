export const col = (field, label, type = 'text') => ({ field, label, type });
export const schemas = {
  history: [col('at','Data','date'),col('actorLabel','Utilizator'),col('action','Operațiune'),col('entityType','Modul'),col('entityId','Înregistrare'),col('outcome','Rezultat')],
  convocatoare: [col('nr','Nr.','number'),col('nume','Denumire'),col('numeLoja','Loja'),col('dataTinuta','Data','date'),col('status','Stare')],
  confirmations: [col('nume','Ținută'),col('dataTinuta','Data','date'),col('status','Stare')],
  attendance: [col('userSnapshot.nume','Nume'),col('userSnapshot.prenume','Prenume'),col('userSnapshot.email','Email'),col('status','Răspuns'),col('delivery.state','Livrare')],
  library: [col('title','Titlu'),col('author','Autor'),col('minGrade','Grad','number'),col('status','Stare')],
  concepts: [col('name','Concept'),col('description','Descriere'),col('minGrade','Grad','number'),col('status','Stare')],
  treasury: [col('occurredAt','Data','date'),col('direction','Tip'),col('category','Categorie'),col('description','Explicație'),col('amountMinor','Sumă (bani)','number'),col('status','Stare')],
  events: [col('title','Eveniment'),col('startsAt','Data','date'),col('location','Loc'),col('minGrade','Grad','number'),col('status','Stare')],
  cases: [col('subject','Subiect'),col('notes','Note'),col('status','Stare'),col('updatedAt','Actualizat','date')],
  visitors: [col('name','Nume'),col('email','Email'),col('originLodge','Loja'),col('attestedGrade','Grad','number'),col('status','Stare'),col('accessExpiresAt','Expiră','date')],
  tenants: [col('nume','Loja'),col('cui','CUI'),col('status','Stare')],
  users: [col('name','Nume'),col('email','Email'),col('statusLabel','Stare')],
  members: [col('displayName','Nume'),col('email','Email'),col('matriculationNo','Matricol'),col('currentGrade','Grad','number'),col('status','Stare')],
  offices: [col('userId','Membru'),col('officeCode','Funcție'),col('masonicYear','An'),col('startAt','Început','date'),col('endAt','Sfârșit','date'),col('status','Stare')],
  grades: [col('name','Nume'),col('email','Email'),col('grade','Grad','number'),col('status','Stare')],
  dossiers: [col('displayName','Nume'),col('matriculationNo','Matricol'),col('grade','Grad','number'),col('status','Stare')],
};

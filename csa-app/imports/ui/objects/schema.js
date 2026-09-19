const field=(name,label,type='text',options={})=>({name,label,type,...options});
const required=(name,label,type='text',options={})=>field(name,label,type,{required:true,...options});
const select=(name,label,values,options={})=>required(name,label,'select',{options:values.map(([value,label])=>({value:String(value),label})),...options});
const grade=()=>select('minGrade','Grad minim',[[1,'Ucenic'],[2,'Calfă'],[3,'Maestru']],{numeric:true,default:1,immutable:true});
const user=()=>required('userId','Utilizator','select',{lookup:'users',immutable:true});
export const objectSchemas={
  work:{label:'Lucrare',fields:[required('title','Titlu'),field('author','Autor'),field('edition','Ediție'),field('language','Limbă','text',{default:'ro'}),grade(),required('rightsHolder','Titularul drepturilor','text',{createOnly:true}),required('license','Licență / permisiune','text',{createOnly:true}),field('source','Sursă','text',{createOnly:true}),field('storageAllowed','Stocarea este permisă','checkbox',{createOnly:true,required:true}),field('processingAllowed','Procesarea este permisă','checkbox',{createOnly:true,required:true}),field('content','Text nou / versiune nouă','textarea',{transient:true,max:2000000}),field('sourceFile','Fișier DOCX/PDF','file',{transient:true})]},
  concept:{label:'Concept',fields:[required('name','Denumire'),field('description','Descriere','textarea'),grade(),select('status','Stare',[['published','Publicat'],['proposed','Propus']])]},
  relation:{label:'Relație între concepte',fields:[required('fromConceptId','Concept sursă','select',{lookup:'concepts'}),required('toConceptId','Concept destinație','select',{lookup:'concepts'}),select('type','Tip',[['asociat','Asociat'],['dezvolta','Dezvoltă'],['contrasteaza','Contrastează'],['exemplifica','Exemplifică'],['referinta','Referință']]),field('justification','Justificare','textarea')]},
  period:{label:'Perioadă financiară',fields:[required('year','An masonic'),required('startsAt','Început','date'),required('endsAt','Sfârșit','date')]},
  account:{label:'Cont financiar',fields:[required('code','Cod'),required('name','Denumire'),select('type','Tip',[['cash','Numerar'],['bank','Bancă'],['reserve','Rezervă']]),field('openingBalanceMinor','Sold inițial (bani)','number',{default:0,min:0,immutable:true})]},
  transaction:{label:'Mișcare financiară',fields:[required('periodId','Perioadă','select',{lookup:'periods'}),required('accountId','Cont','select',{lookup:'accounts'}),select('direction','Tip',[['income','Încasare'],['expense','Plată']]),required('amountMinor','Sumă (bani; 100 bani = 1 RON)','number',{min:1}),required('occurredAt','Data','date'),field('category','Categorie'),field('description','Explicație','textarea')]},
  event:{label:'Eveniment',fields:[required('title','Titlu'),required('startsAt','Început','datetime-local'),field('endsAt','Sfârșit','datetime-local'),field('location','Loc'),grade(),field('description','Descriere','textarea')]},
  case:{label:'Caz Ospitalier',fields:[required('subject','Subiect'),field('notes','Note confidențiale','textarea',{max:10000}),select('status','Stare',[['open','Deschis'],['closed','Închis']],{editOnly:true})]},
  visitor:{label:'Invitație vizitator',fields:[required('name','Nume'),required('email','Email','email'),required('originLodge','Loja de proveniență'),select('attestedGrade','Grad atestat',[[1,'Ucenic'],[2,'Calfă'],[3,'Maestru']],{numeric:true}),field('eventId','ID convocator / eveniment'),required('accessExpiresAt','Expiră la','datetime-local')]},
  membership:{label:'Apartenență / matricol',fields:[user(),required('matriculationNo','Număr matricol'),select('status','Stare',[['active','Activ'],['suspended','Suspendat'],['inactive','Inactiv'],['left','Plecat']]),field('joinedAt','Data intrării','date')]},
  degree:{label:'Eveniment de grad',fields:[user(),select('grade','Grad',[[1,'Ucenic'],[2,'Calfă'],[3,'Maestru']],{numeric:true}),required('effectiveAt','Data efectivă','date'),field('note','Notă','textarea')]},
  office:{label:'Mandat',fields:[user(),required('officeCode','Funcție','select',{lookup:'offices',immutable:true}),required('masonicYear','An masonic'),required('startAt','Început','date'),required('endAt','Sfârșit','date')]},
  tenant:{label:'Lojă',fields:[required('name','Denumire'),field('cui','CUI')]},
  user:{label:'Utilizator',fields:[required('email','Email','email',{immutable:true}),required('name','Nume'),required('password','Parolă inițială','password',{createOnly:true,minLength:12,max:256}),field('tenantAdmin','Administrator tenant','checkbox',{createOnly:true})]},
  debate:{label:'Dezbatere',fields:[required('title','Titlu'),required('workId','Lucrare','select',{lookup:'works',immutable:true}),select('targetType','Tip sursă',[['work','Lucrare'],['paragraph','Paragraf'],['sentence','Frază'],['chapter','Capitol'],['section','Secțiune']],{immutable:true,default:'work'}),required('targetId','ID sursă','text',{immutable:true}),field('quoteSnapshot','Citat','textarea',{immutable:true}),grade()]},
  message:{label:'Mesaj dezbatere',fields:[required('debateId','Dezbatere','select',{lookup:'debates',immutable:true}),required('text','Mesaj','textarea',{max:20000})]},
  globalUser:{label:'Utilizator în platformă',fields:[required('eId','Lojă','select',{lookup:'tenants',createOnly:true}),required('email','Email','email',{immutable:true}),required('name','Nume'),required('password','Parolă inițială','password',{createOnly:true,minLength:12,max:256}),field('tenantAdmin','Administrator tenant','checkbox',{createOnly:true})]},
  gradeAssignment:{label:'Grad de acces',fields:[user(),select('grade','Grad',[[1,'Ucenic'],[2,'Calfă'],[3,'Maestru']],{numeric:true})]},
  article:{label:'Articol convocator',fields:[required('documentId','Convocator','select',{lookup:'convocators',immutable:true}),select('level','Grad',[[1,'Ucenic'],[2,'Calfă'],[3,'Maestru']],{numeric:true,immutable:true}),field('nrArticol','Număr articol'),required('order','Ordine','number',{min:1}),required('continut','Conținut','textarea',{max:20000})]},
  convocator:{label:'Convocator',fields:[]},
  presence:{label:'Prezență',fields:[]},
  confirmation:{label:'Confirmare',fields:[]},
  dossier:{label:'Dosar frate',fields:[]},
  dossierNote:{label:'Notă dosar',fields:[field('title','Titlu'),required('body','Conținut','textarea',{max:10000}),select('visibility','Vizibilitate',[['member','Vizibilă Fratelui'],['secretariat','Secretariat']])]},
  dossierDocument:{label:'Document dosar',fields:[required('title','Titlu'),field('documentNumber','Număr document'),field('issuer','Emitent'),field('issuedAt','Data emiterii','date'),field('expiresAt','Expiră','date'),field('note','Notă','textarea'),select('visibility','Vizibilitate',[['member','Vizibil Fratelui'],['secretariat','Secretariat']])]},
  dossierEvent:{label:'Eveniment dosar',fields:[]},
  sponsor:{label:'Naș / mentor',fields:[required('externalName','Nume istoric'),select('kind','Tip',[['primary','Naș principal'],['secondary','Al doilea naș'],['historical','Mentor / consemnare']]),field('fromAt','Data','date'),field('note','Notă','textarea'),select('visibility','Vizibilitate',[['member','Vizibil Fratelui'],['secretariat','Secretariat']])]},
  group:{label:'Grup de acces',fields:[required('name','Denumire')]},
};
export function editorFields(kind,id=''){return (objectSchemas[kind]?.fields || []).filter(f=>!(id&&f.createOnly)&&!(!id&&f.editOnly));}
export function cleanPayload(kind,id,input){
  if(!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Date invalide.');
  const result={};
  for(const f of editorFields(kind,id).filter(f=>!f.transient)){
    let value=input[f.name]??f.default;
    if(f.type==='checkbox'){value=value===true; if(f.required&&!value)throw new Error(`${f.label}: confirmarea este obligatorie.`);}
    else if(f.type==='number'||f.numeric){value=Number(value);if(!Number.isSafeInteger(value)||value<(f.min ?? 0))throw new Error(`${f.label}: număr invalid.`);}
    else { if(value!=null&&typeof value!=='string'&&!(value instanceof Date))throw new Error(`${f.label}: valoare invalidă.`); value=value instanceof Date?value.toISOString():String(value??f.default??'').trim();if(value.length>(f.max||4000))throw new Error(`${f.label}: text prea lung.`);if(f.required&&!value)throw new Error(`${f.label}: câmp obligatoriu.`);if(f.minLength&&value.length<f.minLength)throw new Error(`${f.label}: minimum ${f.minLength} caractere.`);if(f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error('Email invalid.');if(['date','datetime-local'].includes(f.type)&&value){value=new Date(value);if(Number.isNaN(+value))throw new Error(`${f.label}: dată invalidă.`);} }
    if(f.options&&!f.options.some(option=>option.value===String(value)))throw new Error(`${f.label}: opțiune invalidă.`);
    result[f.name]=value;
  }
  return result;
}

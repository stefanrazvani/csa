import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
if (process.env.CSA_TEMPLE_SMOKE !== '1') throw new Error('Explicit opt-in required');
const client = await new MongoClient(process.env.MONGO_URL).connect();
const db = client.db();
const id = `temple-release-check-${randomBytes(12).toString('hex')}`;
const eId = process.env.CSA_LEGACY_EID;
const email = `${id}@example.invalid`;
const password = randomBytes(32).toString('base64url');
const origin = process.env.CSA_GATEWAY_ORIGIN;
let socket;
const pending = new Map();
let seq = 0;
const subscriptions = new Map(); const listRows = new Map();
try {
  assert.ok(eId && origin);
  await db.collection('users').insertOne({ _id: id, emails: [{ address: email, verified: false }], setari: { status: '1' }, entitati: { [eId]: { activ: 1 } }, services: { password: { bcrypt: await bcrypt.hash(createHash('sha256').update(password).digest('hex'), 10) } }, createdAt: new Date() });
  await db.collection('lodge_memberships').insertOne({ _id: id, userId: id, eId, status: 'active', currentGrade: 3, createdAt: new Date() });
  const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const bootstrap = await fetch(`${origin}/auth/bootstrap`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  assert.equal(bootstrap.status, 200);
  const { assertion } = await bootstrap.json();
  socket = new WebSocket('ws://meteor-portal/portal/websocket');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('DDP connection timeout')), 30000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('DDP connection error')); });
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.msg === 'connected') { clearTimeout(timeout); resolve(); }
      if (data.collection === 'csa_list_rows') { if (data.msg === 'removed') listRows.delete(data.id); else listRows.set(data.id, { ...listRows.get(data.id), ...data.fields }); }
      if (data.msg === 'ready') for (const key of data.subs || []) { subscriptions.get(key)?.resolve(); subscriptions.delete(key); }
      if (data.msg === 'nosub') { subscriptions.get(data.id)?.reject(new Error(data.error?.reason || 'Subscription stopped')); subscriptions.delete(data.id); }
      if (data.msg === 'ping') socket.send(JSON.stringify({ msg: 'pong', id: data.id }));
      if (data.msg === 'result') {
        const item = pending.get(data.id);
        if (item) { clearTimeout(item.timeout); pending.delete(data.id); data.error ? item.reject(new Error(data.error.reason || 'DDP error')) : item.resolve(data.result); }
      }
    });
  });
  const call = (method, ...params) => new Promise((resolve, reject) => {
    const key = String(++seq);
    const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`Timeout ${method}`)); }, 30000);
    pending.set(key, { resolve, reject, timeout });
    socket.send(JSON.stringify({ msg: 'method', method, params, id: key }));
  });
  await call('login', { gatewayAssertion: assertion });
  const subscribe = (name, ...params) => new Promise((resolve, reject) => { const key = String(++seq); const timeout = setTimeout(() => { subscriptions.delete(key); reject(new Error('Subscription timeout')); }, 20000); subscriptions.set(key, { resolve: () => { clearTimeout(timeout); resolve(); }, reject: err => { clearTimeout(timeout); reject(err); } }); socket.send(JSON.stringify({ msg:'sub', id:key, name, params })); });
  await subscribe('csa.list', 'convocatoare', 'LiveConvocators', { size:10, sort:'nume' }, {});
  const convocators = [...listRows.values()].filter(r => r.scope === 'LiveConvocators');
  assert.ok(convocators.length <= 11); assert.ok(convocators.every(r => r.record.eId === eId));
  await subscribe('csa.list', 'library', 'LiveLibrary', { size:10, sort:'title' }, {});
  const books = [...listRows.values()].filter(r => r.scope === 'LiveLibrary');
  assert.ok(books.length <= 11); assert.ok(books.every(r => r.record.eId === eId && [1,2,3].includes(r.record.minGrade)));
  console.log('PASS LIVE LISTS: authorized scoped publications, bounded page sizes and projections.');
  const profile=await call('profile.mine');assert.equal(profile.email,email);assert.ok(profile.rows.length>10);await assert.rejects(call('objects.context','concept',''));console.log('PASS LIVE PROFILE/OBJECT ACL: own profile available, unauthorized creation denied.');
  for (const grade of [1, 2, 3]) {
    const scene = await call('temple.experienceManifest', { viewGrade: grade });
    assert.equal(scene.access.viewGrade, grade);
    const discoveries = scene.interactives.filter(item => item.presentation === 'architecture');
    assert.equal(discoveries.length, {1:56,2:64,3:64}[grade]);
    assert.ok(scene.interactives.length <= 96);
    assert.equal(new Set(scene.interactives.map(item => item.id)).size, scene.interactives.length);
    assert.ok(scene.architecture.filter(part => part.interactionId).every(part => discoveries.some(item => item.id === part.interactionId)));
    for (const key of ['wisdom','strength','beauty','sun','moon','delta','mosaic','plumb','vault','book','square','compass']) assert.ok(discoveries.some(item => item.id === `discover-${key}`));
    assert.equal(discoveries.filter(item => item.id.startsWith('discover-zodiac-')).length,12);
    assert.equal(discoveries.filter(item => item.id.startsWith('discover-office-')).length,10);
    for(const [mesh,target] of [['tyler-sword-blade','tyler-sword'],['expert-sword-guard','expert-sword'],['mc-sceptre-shaft','mc-staff'],['mc-seat','office-master_of_ceremonies'],['seat-north-front-1','office-expert'],['tyler-seat','office-tyler'],['bench-north-wall','seating-north'],['bench-south-wall-east','seating-south']]) assert.equal(scene.architecture.find(part=>part.id===mesh).interactionId,`discover-${target}`);
    assert.ok(discoveries.every(item=>item.education.sections.some(section=>section.title.startsWith('Studiu propus') && section.body.length>50)));
    for(const [bodyId,topId] of [['secretary-desk','secretary-desk-top'],['orator-desk','orator-desk-top'],['hospitalier-table','hospitalier-desk-top'],['treasurer-table','treasurer-desk-top']]) {
      const body=scene.architecture.find(part=>part.id===bodyId),top=scene.architecture.find(part=>part.id===topId);
      assert.deepEqual(top.rotation,[0,0,0]); assert.ok(Math.abs(top.position[1]-top.scale[1]/2-body.position[1]-body.scale[1]/2)<1e-9);
    }
    if(grade===2) { const star=scene.architecture.find(part=>part.id==='flaming-star'),altar=scene.architecture.find(part=>part.id==='altar-top');assert.ok(star.position[2]>altar.position[2]+1);assert.ok(star.position[1]+star.geometry.radius<altar.position[1]); }
    for(const [mesh,target] of [['grand-master-seat-back','grand-master-seat'],['study-rough-stone','rough-stone'],['study-cubic-stone','cubic-stone'],['study-mallet-head','mallet'],['study-chisel-edge','chisel']]) assert.equal(scene.architecture.find(part=>part.id===mesh).interactionId,`discover-${target}`);
    for(const key of ['ruler','lever','working-square','working-compass']) assert.equal(discoveries.some(item=>item.id===`discover-${key}`),grade>=2);
    assert.equal(discoveries.some(item=>item.id==='discover-trowel'),grade===3);
    assert.equal(discoveries.some(item=>item.id==='discover-wheat'),grade===2);
    const mesh=id=>scene.architecture.find(part=>part.id===id);
    assert.ok(mesh('plumb-bob').position[1]>3);
    assert.equal(['vsl-compass','vsl-compass-arm'].filter(id=>mesh(id).position[1]>mesh('vsl-square').position[1]).length,grade-1);
    for(const id of ['tyler','expert']) {assert.equal(mesh(`${id}-sword-blade`).geometry.type,'blade');assert.equal(mesh(`${id}-sword-pommel`).interactionId,`discover-${id}-sword`);}
    if(grade===3) for(const side of ['north','south']) assert.match(discoveries.find(item=>item.id===`discover-seating-${side}`).label,/Maeștri/);

    assert.equal(discoveries.some(item => item.id === 'discover-star'),grade === 2);
    assert.ok(discoveries.every(item => item.education.sections.length && item.sourceRef));
    if(grade === 1) assert.doesNotMatch(JSON.stringify(scene.interactives),/Ritualul Calfei|Ritualul Maestrului|g2-|g3-/);
    console.log(`PASS LIVE DISCOVERY grade ${grade}: ${discoveries.length} physical targets, sourced descriptions, degree isolation.`);

    assert.ok(scene.version.startsWith('2026.09.20-9:'));
    assert.equal(scene.architecture.filter(item => /ashlar/.test(item.id)).length, 0);
    for (const id of ['hospitalier-table', 'hospitalier-chair', 'treasurer-table', 'treasurer-chair']) assert.ok(scene.architecture.some(item => item.id === id), id);
    if (grade === 2) for (const id of ['concept-vault', 'study-workshop', 'convocations-two']) {
      const item = scene.interactives.find(item => item.id === id);
      assert.equal(item.presentation, 'list');
      assert.ok(item.route);
    }
    assert.ok(scene.architecture.length > 450 && scene.architecture.length <= 768);
    assert.ok(scene.architecture.every(item => !/^(vm-column-small-|warden[12]-column$)/.test(item.id)));
    for (const [prefix, count] of [['vm', 3], ['warden1', 2], ['warden2', 1]]) assert.equal(scene.architecture.filter(item => item.id.startsWith(`${prefix}-candelabrum-candle-`)).length, count);
    for (const id of ['seat-north-front-1-leg-front-0', 'seat-south-front-1-back', 'bench-north-wall', 'bench-south-wall-east', 'bench-south-wall-west']) assert.ok(scene.architecture.some(item => item.id === id), id);
    assert.equal(scene.architecture.find(item => item.id === 'delta-eye').geometry.type, 'almond');
    assert.ok(scene.architecture.some(item => item.id === 'delta-iris'));
    const find = id => scene.architecture.find(item => item.id === id);
    const cord = find('plumb-cord');
    assert.ok(cord.geometry.radiusTop * cord.scale[0] <= 0.0041);
    assert.equal(find('pillar-wisdom-se-shaft').geometry.type, 'flutedColumn');
    assert.equal(scene.architecture.filter(item => item.id.startsWith('sun-ray-')).length, 24);
    assert.equal(scene.architecture.filter(item => item.id.startsWith('pillar-wisdom-se-volute-') && item.geometry.type === 'spiral').length, 4);
    const a = find('warden1-candelabrum-candle-0');
    const b = find('warden1-candelabrum-candle-1');
    assert.ok(Math.abs(Math.atan2(-(b.position[2] - a.position[2]), b.position[0] - a.position[0]) - Math.PI / 4) < 1e-9);
    assert.equal(find('warden1-candelabrum-arm').rotation[1], Math.PI / 4);
    const zodiac = scene.architecture.filter(item => item.geometry.type === 'plane' && item.material.map.startsWith('zodiac-'));
    assert.equal(zodiac.length, 12);
    for (const [ids, side] of [[['aries','taurus','gemini','cancer','leo','virgo'],-1],[['libra','scorpio','sagittarius','capricorn','aquarius','pisces'],1]]) for (const id of ids) assert.ok(find(`zodiac-${id}`).position[0] * side > 8);
    const candles = scene.architecture.filter(item => /-candle(?:-\d+)?$/.test(item.id));
    const flames = scene.architecture.filter(item => /-flame(?:-\d+)?$/.test(item.id));
    assert.equal(candles.length, 9); assert.equal(flames.length, 9);
    assert.ok(candles.every(item => item.geometry.type === 'lathe'));
    assert.ok(flames.every(item => item.geometry.type === 'lathe' && item.geometry.profile.length >= 16));
    assert.equal(find('pillar-beauty-sw-shaft').geometry.type, 'flutedColumn');
    assert.equal(scene.architecture.filter(item => /pillar-beauty-sw-leaf-(low|up)-/.test(item.id)).length, 16);
    console.log(`PASS LIVE ZODIAC grade ${grade}: twelve signs on ritual sides, nine redesigned candles, refined capitals.`);
    console.log(`PASS LIVE ORIENT grade ${grade}: thin cord, detailed sun, ionic flutes/scrolls, warden candelabrum 45 degrees.`);
    console.log(`PASS LIVE FURNITURE grade ${grade}: no extra desk cylinders; candles 3/2/1 retained; chairs, benches and eye present.`);
    console.log(`PASS LIVE TEMPLE grade ${grade}: no obsolete large ashlars; small study stones present; desks/chairs preserved; scene version current.`);
  }
  for (const actualGrade of [1,2]) {
    await db.collection('lodge_memberships').updateOne({_id:id},{$set:{currentGrade:actualGrade}});
    const scene = await call('temple.experienceManifest',{viewGrade:3});
    assert.equal(scene.access.maxGrade,actualGrade);
    assert.equal(scene.access.viewGrade,actualGrade);
    assert.doesNotMatch(JSON.stringify(scene.interactives),/Ritualul Maestrului|g3-/);
    if(actualGrade===1) assert.doesNotMatch(JSON.stringify(scene.interactives),/Ritualul Calfei|g2-|discover-globe/);
  }
  await db.collection('role-assignment').insertOne({_id:id,user:{_id:id},role:{_id:'super_admin'},inheritedRoles:[{_id:'super_admin'}],scope:'default-grup'});
  for (const grade of [1,2,3]) {
    const scene = await call('temple.experienceManifest',{viewGrade:grade});
    assert.equal(scene.access.platformAdmin,true); assert.equal(scene.access.viewGrade,grade);
    assert.equal(scene.title,{1:'Pragul Pietrei Brute',2:'Atelierul Cunoașterii',3:'Camera Continuității'}[grade]);
    assert.ok(scene.interactives.filter(item=>item.id.startsWith('catalog-g')).every(item=>item.id.startsWith(`catalog-g${grade}-`)));
    if(grade<3) assert.doesNotMatch(JSON.stringify(scene.interactives),/Ritualul Maestrului|g3-/);
  }
  console.log('PASS LIVE DEGREE ACL: forged higher degree is clamped; administrator lower-degree catalog stays correct.');
  console.log('PASS LIVE TEMPLE grade 2: pictured knot, octahedron and participation ring list-only (no geometry or halo), navigation retained.');
} finally {
  for (const item of pending.values()) clearTimeout(item.timeout);
  socket?.close();
  await db.collection('role-assignment').deleteOne({_id:id,'user._id':id});
  await db.collection('gateway_assertions').deleteMany({ userId: id });
  await db.collection('gateway_sessions').deleteMany({ userId: id });
  await db.collection('lodge_memberships').deleteOne({ _id: id, userId: id });
  await db.collection('users').deleteOne({ _id: id, 'emails.address': email });
  await client.close();
}

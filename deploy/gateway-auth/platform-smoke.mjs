import WebSocket from 'ws';

const origin = process.env.CSA_TEST_ORIGIN;
const email = process.env.CSA_TEST_EMAIL;
const password = process.env.CSA_TEST_PASSWORD;
if (!origin || !email || !password) throw new Error('CSA_TEST_ORIGIN, CSA_TEST_EMAIL și CSA_TEST_PASSWORD sunt obligatorii.');

const login = await fetch(`${origin}/auth/login`, {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }), redirect: 'manual',
});
if (!login.ok) throw new Error(`Login gateway eșuat: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const assertionResponse = await fetch(`${origin}/auth/bootstrap`, {
  method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
});
const assertion = (await assertionResponse.json()).assertion;
if (!assertionResponse.ok || !assertion) throw new Error('Aserțiunea gateway nu a fost emisă.');

const methods = ['membership.context', 'temple.context', 'temple.scene', 'study.context', 'treasury.context', 'hospitality.context', 'visitorInvitations.context'];
const results = await new Promise((resolve, reject) => {
  const values = {};
  let next = 0;
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/portal/websocket', { headers: { Cookie: cookie, Origin: origin } });
  const timeout = setTimeout(() => { socket.close(); reject(new Error('Timeout DDP platform smoke.')); }, 20_000);
  const fail = (error) => { clearTimeout(timeout); socket.close(); reject(error); };
  const callNext = () => {
    if (next >= methods.length) { clearTimeout(timeout); socket.close(); resolve(values); return; }
    const method = methods[next++];
    socket.send(JSON.stringify({ msg: 'method', method, params: [], id: method }));
  };
  socket.on('open', () => socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
  socket.on('message', (buffer) => {
    let message;
    try { message = JSON.parse(buffer.toString()); } catch { return; }
    if (message.msg === 'connected') socket.send(JSON.stringify({ msg: 'method', method: 'login', params: [{ gatewayAssertion: assertion }], id: 'login' }));
    if (message.msg !== 'result') return;
    if (message.error) { fail(new Error(`${message.id}: ${message.error.reason || message.error.message}`)); return; }
    if (message.id === 'login') { callNext(); return; }
    values[message.id] = message.result;
    callNext();
  });
  socket.on('error', fail);
});

if (!results['temple.scene']?.rooms?.length) throw new Error('Scena templului nu conține camere accesibile.');
if (results['study.context']?.grade !== 3) throw new Error('Administratorul platformei nu primește gradul efectiv 3 în modulul de studiu.');
for (const method of ['treasury.context', 'hospitality.context', 'visitorInvitations.context']) {
  if (!results[method]?.canWrite) throw new Error(`${method} nu confirmă dreptul de administrare.`);
}
console.log(`platform-smoke:ok rooms=${results['temple.scene'].rooms.length} grade=${results['study.context'].grade}`);

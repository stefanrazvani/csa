import WebSocket from 'ws';

const origin = process.env.CSA_TEST_ORIGIN;
const email = process.env.CSA_TEST_EMAIL;
const password = process.env.CSA_TEST_PASSWORD;
const testConvocatorName = process.env.CSA_TEST_CONVOCATOR_NAME || '';
const testArticles = process.env.CSA_TEST_ARTICLES === '1';
const testConvocatorId = process.env.CSA_TEST_CONVOCATOR_ID || '';
if (!origin || !email || !password) throw new Error('Variabilele CSA_TEST_ORIGIN, CSA_TEST_EMAIL și CSA_TEST_PASSWORD sunt obligatorii.');

const loginResponse = await fetch(`${origin}/auth/login`, {
  method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  redirect: 'manual',
});
if (!loginResponse.ok) throw new Error(`Login gateway eșuat: ${loginResponse.status}`);
const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Cookie-ul gateway nu a fost emis.');

const anonymousPortal = await fetch(`${origin}/portal/`, { redirect: 'manual' });
if (anonymousPortal.status !== 302) throw new Error(`Portalul anonim nu este blocat: ${anonymousPortal.status}`);
const privatePortal = await fetch(`${origin}/portal/`, { headers: { Cookie: cookie }, redirect: 'manual' });
if (!privatePortal.ok) throw new Error(`Bundle-ul privat nu a fost livrat: ${privatePortal.status}`);

const bootstrapResponse = await fetch(`${origin}/auth/bootstrap`, {
  method: 'POST',
  headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
  body: '{}',
});
const bootstrap = await bootstrapResponse.json();
if (!bootstrapResponse.ok || !bootstrap.assertion) throw new Error('Aserțiunea gateway nu a fost emisă.');

const websocketUrl = origin.replace(/^http/, 'ws') + '/portal/websocket';
const ddpResult = await new Promise((resolve, reject) => {
  let dashboardSummary;
  let insertResult;
  const articles = [];
  const socket = new WebSocket(websocketUrl, { headers: { Cookie: cookie, Origin: origin } });
  const timeout = setTimeout(() => { socket.close(); reject(new Error('Timeout DDP.')); }, 15000);
  socket.on('open', () => socket.send(JSON.stringify({ msg: 'connect', version: '1', support: ['1'] })));
  socket.on('message', (buffer) => {
    let message;
    try { message = JSON.parse(buffer.toString()); } catch (error) { return; }
    if (message.msg === 'connected') {
      socket.send(JSON.stringify({ msg: 'method', method: 'login', params: [{ gatewayAssertion: bootstrap.assertion }], id: 'gateway-login' }));
    }
    if (message.msg === 'result' && message.id === 'gateway-login') {
      if (message.error) reject(new Error(`Login DDP refuzat: ${message.error.reason || message.error.message}`));
      else socket.send(JSON.stringify({ msg: 'method', method: 'dashboard.summary', params: [], id: 'dashboard-summary' }));
    }
    if (message.msg === 'result' && message.id === 'dashboard-summary') {
      if (message.error) reject(new Error(`Dashboard refuzat: ${message.error.reason || message.error.message}`));
      else if (testConvocatorName) {
        dashboardSummary = message.result;
        const dataTinuta = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const dataConfirmare = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
        socket.send(JSON.stringify({
          msg: 'method', method: 'craft.convocatoare.insert', id: 'convocator-insert',
          params: [{ nume: testConvocatorName, status: 'Creat', numeLoja: 'Test', nrLoja: '0', orientul: 'Test', numarTinuta: 9999, dataTinuta, dataConfirmare }],
        }));
      } else if (testArticles) {
        dashboardSummary = message.result;
        const eventId = testConvocatorId || dashboardSummary?.content?.events?.[0]?._id;
        if (!eventId) reject(new Error('Dashboardul nu conține un convocator pentru testul articolelor.'));
        else socket.send(JSON.stringify({ msg: 'sub', id: 'articles-sub', name: 'craft.documenteText', params: [eventId] }));
      } else {
        clearTimeout(timeout); socket.close(); resolve({ dashboard: message.result });
      }
    }
    if (message.msg === 'added' && message.collection === 'documente_text') articles.push(message.fields || {});
    if (message.msg === 'nosub' && message.id === 'articles-sub') {
      clearTimeout(timeout); socket.close(); reject(new Error(`Publicația articolelor a fost refuzată: ${message.error?.reason || 'eroare necunoscută'}`));
    }
    if (message.msg === 'ready' && message.subs?.includes('articles-sub')) {
      clearTimeout(timeout); socket.close(); resolve({ dashboard: dashboardSummary, articles });
    }
    if (message.msg === 'result' && message.id === 'convocator-insert') {
      if (message.error) reject(new Error(`Crearea convocatorului a eșuat: ${message.error.reason || message.error.message}`));
      else {
        insertResult = message.result;
        socket.send(JSON.stringify({
          msg: 'method', method: 'craft.convocatoare.update', id: 'convocator-update',
          params: [insertResult.id, { nume: `${testConvocatorName} actualizat`, status: 'Comunicat', numeLoja: 'Test actualizat', nrLoja: '0', orientul: 'Test', numarTinuta: 9999 }],
        }));
      }
    }
    if (message.msg === 'result' && message.id === 'convocator-update') {
      clearTimeout(timeout);
      socket.close();
      if (message.error) reject(new Error(`Actualizarea convocatorului a eșuat: ${message.error.reason || message.error.message}`));
      else resolve({ dashboard: dashboardSummary, inserted: insertResult, updated: message.result });
    }
  });
  socket.on('error', (error) => { clearTimeout(timeout); reject(error); });
});

const dashboard = ddpResult.dashboard;
if (!dashboard?.identity || !dashboard?.content || !Array.isArray(dashboard.content.events)) throw new Error('Dashboardul nu a returnat structura așteptată.');
console.log('anonymous-portal:blocked');
console.log('private-bundle:protected');
console.log('gateway-session:ok');
console.log('meteor-ddp-login:ok');
console.log(`dashboard:ok grade=${dashboard.identity.grade} events=${dashboard.content.events.length} confirmations=${dashboard.content.totalConfirmations}`);
if (testConvocatorName) {
  if (!ddpResult.inserted?.presenceId || ddpResult.inserted.createdConfirmations !== dashboard.administration?.activeUsers) {
    throw new Error(`Prezența/confirmările nu corespund utilizatorilor activi: ${ddpResult.inserted?.createdConfirmations}/${dashboard.administration?.activeUsers}`);
  }
  if (ddpResult.updated?.createdConfirmations !== 0) throw new Error('Actualizarea a creat confirmări duplicate.');
  console.log(`convocator-presence:ok confirmations=${ddpResult.inserted.createdConfirmations}`);
  console.log('convocator-update:idempotent');
}
if (testArticles) {
  if (!ddpResult.articles?.length) throw new Error('Publicația nu a livrat niciun articol activ.');
  const levels = [...new Set(ddpResult.articles.map((article) => article.level))].sort();
  if (!levels.includes(3)) throw new Error(`Administratorul nu a primit articolele de grad 3: ${levels.join(',')}`);
  console.log(`convocator-articles:ok count=${ddpResult.articles.length} levels=${levels.join(',')}`);
}

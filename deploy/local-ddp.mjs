import { createHash } from 'node:crypto';
const origin='http://127.0.0.1:18700';
export class DDP {
  constructor() { this.pending = new Map(); this.rows = new Map(); this.seq = 0; }
  async connect() {
    this.socket = new WebSocket(`${origin.replace('http', 'ws')}/websocket`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DDP connect timeout')), 30_000);
      this.socket.addEventListener('open', () => this.send({ msg: 'connect', version: '1', support: ['1'] }));
      this.socket.addEventListener('error', reject);
      this.socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.msg === 'connected') { clearTimeout(timer); resolve(); }
        if (data.msg === 'ping') this.send({ msg: 'pong', id: data.id });
        if (data.msg === 'added') this.rows.set(`${data.collection}:${data.id}`, { _id: data.id, ...data.fields });
        if (data.msg === 'changed') { const key = `${data.collection}:${data.id}`; const row = { ...this.rows.get(key), ...data.fields }; for (const field of data.cleared || []) delete row[field]; this.rows.set(key, row); }
        if (data.msg === 'removed') this.rows.delete(`${data.collection}:${data.id}`);
        if (data.msg === 'result' || data.msg === 'nosub') {
          const task = this.pending.get(data.id);
          if (task) { clearTimeout(task.timer); this.pending.delete(data.id); data.error ? task.reject(Object.assign(new Error(data.error.reason || data.error.message), { code: data.error.error })) : task.resolve(data.result); }
        }
        if (data.msg === 'ready') for (const id of data.subs) { const task = this.pending.get(id); if (task) { clearTimeout(task.timer); this.pending.delete(id); task.resolve(); } }
      });
    });
    return this;
  }
  send(message) { this.socket.send(JSON.stringify(message)); }
  request(message) {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Timeout ${message.method || message.name}`)); }, 30_000);
      this.pending.set(id, { resolve, reject, timer }); this.send({ ...message, id });
    });
  }
  call(method, ...params) { return this.request({ msg: 'method', method, params }); }
  subscribe(name, ...params) { return this.request({ msg: 'sub', name, params }); }
  login(email, password) { return this.call('login', { user: { email }, password: { digest: createHash('sha256').update(password).digest('hex'), algorithm: 'sha-256' } }); }
  close() { for (const task of this.pending.values()) clearTimeout(task.timer); this.socket?.close(); }
}

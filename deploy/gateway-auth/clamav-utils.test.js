import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { scanFileWithClamAv } from './clamav-utils.js';

class FakeSocket extends EventEmitter {
  constructor({ backpressure = false, connect = true, failWrite = false } = {}) {
    super();
    this.destroyed = false;
    this.backpressure = backpressure;
    this.connect = connect;
    this.failWrite = failWrite;
    this.waitingForDrain = false;
    this.writes = [];
  }

  start() {
    if (this.connect) queueMicrotask(() => this.emit('connect'));
  }

  setTimeout(milliseconds) {
    clearTimeout(this.timeoutHandle);
    if (milliseconds > 0 && !this.connect) {
      this.timeoutHandle = setTimeout(() => this.emit('timeout'), 5);
    }
  }

  write(chunk) {
    if (this.failWrite) throw new Error('socket write failed');
    if (this.waitingForDrain) throw new Error('backpressure ignored');
    this.writes.push(Buffer.from(chunk));
    if (this.backpressure) {
      this.backpressure = false;
      this.waitingForDrain = true;
      setTimeout(() => {
        this.waitingForDrain = false;
        this.emit('drain');
      }, 5);
      return false;
    }
    return true;
  }

  end() {
    queueMicrotask(() => {
      this.emit('data', Buffer.from('stream: OK\0'));
      this.destroyed = true;
      this.emit('close', false);
    });
  }

  destroy() {
    if (this.destroyed) return;
    clearTimeout(this.timeoutHandle);
    this.destroyed = true;
    queueMicrotask(() => this.emit('close', false));
  }
}

function inputFactory() {
  return {
    destroyed: false,
    destroy() { this.destroyed = true; },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('first');
      yield Buffer.from('second');
    },
  };
}

test('scanarea așteaptă drain înainte să continue transferul', async () => {
  const socket = new FakeSocket({ backpressure: true });
  socket.start();
  const response = await scanFileWithClamAv('ignored', {
    host: 'clamav',
    port: 3310,
    connectionFactory: () => socket,
    inputFactory,
  });
  assert.equal(response, 'stream: OK');
  assert.equal(socket.destroyed, true);
  assert.equal(socket.writes.length, 6);
});

test('timeoutul distruge socketul ClamAV', async () => {
  const socket = new FakeSocket({ connect: false });
  await assert.rejects(() => scanFileWithClamAv('ignored', {
    host: 'clamav',
    port: 3310,
    timeoutMs: 5,
    connectionFactory: () => socket,
    inputFactory,
  }), /timeout/i);
  assert.equal(socket.destroyed, true);
});

test('eroarea de scriere distruge socketul ClamAV', async () => {
  const socket = new FakeSocket({ failWrite: true });
  socket.start();
  await assert.rejects(() => scanFileWithClamAv('ignored', {
    host: 'clamav',
    port: 3310,
    connectionFactory: () => socket,
    inputFactory,
  }), /socket write failed/);
  assert.equal(socket.destroyed, true);
});

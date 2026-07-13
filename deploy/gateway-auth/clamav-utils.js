import { createReadStream } from 'node:fs';
import net from 'node:net';

function waitForConnection(socket) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };
    const settle = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onConnect = () => settle();
    const onError = (error) => settle(error);
    const onTimeout = () => settle(new Error('ClamAV timeout.'));
    const onClose = () => settle(new Error('Conexiunea ClamAV s-a închis înainte de inițializare.'));
    socket.once('connect', onConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.once('close', onClose);
  });
}

export function writeWithBackpressure(socket, chunk) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('drain', onDrain);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const settle = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onDrain = () => settle();
    const onError = (error) => settle(error);
    const onClose = () => settle(new Error('Conexiunea ClamAV s-a închis în timpul transferului.'));
    socket.once('error', onError);
    socket.once('close', onClose);
    let accepted;
    try {
      accepted = socket.write(chunk);
    } catch (error) {
      settle(error);
      return;
    }
    if (accepted) {
      settle();
      return;
    }
    socket.once('drain', onDrain);
  });
}

function collectResponse(socket, response) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
      socket.off('close', onClose);
    };
    const settle = (error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk) => response.push(Buffer.from(chunk));
    const onError = (error) => settle(error);
    const onTimeout = () => settle(new Error('ClamAV timeout.'));
    const onClose = (hadError) => settle(hadError ? new Error('Conexiunea ClamAV a eșuat.') : null);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
    socket.once('close', onClose);
  });
}

export async function scanFileWithClamAv(filePath, {
  host,
  port,
  timeoutMs = 120000,
  connectionFactory = (options) => net.createConnection(options),
  inputFactory = (source, options) => createReadStream(source, options),
} = {}) {
  const socket = connectionFactory({ host, port });
  let input;
  let responsePromise;
  try {
    socket.setTimeout(timeoutMs);
    await waitForConnection(socket);

    const response = [];
    responsePromise = collectResponse(socket, response);
    await writeWithBackpressure(socket, Buffer.from('zINSTREAM\0'));
    input = inputFactory(filePath, { highWaterMark: 64 * 1024 });
    for await (const chunk of input) {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      await writeWithBackpressure(socket, size);
      await writeWithBackpressure(socket, chunk);
    }
    await writeWithBackpressure(socket, Buffer.alloc(4));
    socket.end();
    await responsePromise;

    const message = Buffer.concat(response).toString('utf8').replace(/\0/g, '').trim();
    if (!message.endsWith('OK')) {
      throw new Error(`Fișier respins de antivirus: ${message || 'răspuns necunoscut'}`);
    }
    return message;
  } catch (error) {
    input?.destroy?.();
    if (!socket.destroyed) socket.destroy();
    if (responsePromise) await responsePromise.catch(() => {});
    throw error;
  } finally {
    socket.setTimeout?.(0);
    if (!socket.destroyed) socket.destroy();
  }
}

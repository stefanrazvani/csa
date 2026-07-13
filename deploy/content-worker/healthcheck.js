import { stat } from 'node:fs/promises';

const marker = process.env.WORKER_HEALTH_FILE || '/tmp/csa-content-worker.health';
const maxAgeMs = Number(process.env.WORKER_HEALTH_MAX_AGE_MS || 120000);

try {
  const info = await stat(marker);
  if (Date.now() - info.mtimeMs > maxAgeMs) process.exit(1);
} catch {
  process.exit(1);
}

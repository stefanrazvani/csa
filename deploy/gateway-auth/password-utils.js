import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

// Accounts-password hashes a SHA-256 digest, including when its API receives a plain string.
export function meteorPasswordDigest(password) {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

export function hashMeteorPassword(password) {
  return bcrypt.hash(meteorPasswordDigest(password), 10);
}

export async function verifyGatewayPassword(password, storedHash) {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return { valid: false, needsUpgrade: false };
  const digest = meteorPasswordDigest(password);
  // Evaluate both formats so migrated Meteor accounts and earlier gateway registrations work.
  const [meteorMatch, gatewayMatch] = await Promise.all([
    bcrypt.compare(digest, storedHash).catch(() => false),
    bcrypt.compare(password, storedHash).catch(() => false),
  ]);
  return { valid: meteorMatch || gatewayMatch, needsUpgrade: !meteorMatch && gatewayMatch };
}

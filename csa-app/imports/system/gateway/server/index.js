import crypto from 'node:crypto';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const GatewaySessions = new Mongo.Collection('gateway_sessions');
const GatewayAssertions = new Mongo.Collection('gateway_assertions');
const SECRET = String(process.env.CSA_GATEWAY_SECRET || '');

function decodeAssertion(assertion) {
  if (typeof assertion !== 'string' || assertion.length > 2048) throw new Meteor.Error('gateway-invalid', 'Sesiune invalidă.');
  const parts = assertion.split('.');
  if (parts.length !== 2) throw new Meteor.Error('gateway-invalid', 'Sesiune invalidă.');
  const [encoded, receivedSignature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SECRET).update(encoded).digest('base64url');
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Meteor.Error('gateway-invalid', 'Sesiune invalidă.');
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch (error) {
    throw new Meteor.Error('gateway-invalid', 'Sesiune invalidă.');
  }
}

if (SECRET.length >= 32) {
  Accounts.registerLoginHandler('csa-gateway', async (options) => {
    if (!options?.gatewayAssertion) return undefined;
    const payload = decodeAssertion(options.gatewayAssertion);
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || typeof payload.userId !== 'string' || typeof payload.sid !== 'string'
      || typeof payload.jti !== 'string' || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)
      || payload.iat > now + 5 || payload.exp < now || payload.exp - payload.iat > 60) {
      throw new Meteor.Error('gateway-invalid', 'Sesiune invalidă sau expirată.');
    }

    const session = await GatewaySessions.findOneAsync({
      _id: payload.sid,
      userId: payload.userId,
      expiresAt: { $gt: new Date() },
    }, { fields: { _id: 1 } });
    if (!session) throw new Meteor.Error('gateway-invalid', 'Sesiunea a expirat.');

    const user = await Meteor.users.findOneAsync(payload.userId, { fields: { setari: 1 } });
    if (!user || (user.setari?.status != null && String(user.setari.status) !== '1')) {
      throw new Meteor.Error('gateway-invalid', 'Contul nu este activ.');
    }

    try {
      await GatewayAssertions.insertAsync({
        _id: payload.jti,
        userId: payload.userId,
        sessionId: payload.sid,
        createdAt: new Date(),
        expiresAt: new Date(payload.exp * 1000),
      });
    } catch (error) {
      throw new Meteor.Error('gateway-replayed', 'Solicitarea de autentificare a fost deja utilizată.');
    }
    return { userId: payload.userId };
  });

  Meteor.startup(async () => {
    await GatewaySessions.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await GatewayAssertions.rawCollection().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  });
}

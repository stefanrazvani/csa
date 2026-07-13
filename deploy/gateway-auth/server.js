import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import bcrypt from 'bcryptjs';
import Busboy from 'busboy';
import express from 'express';
import { MongoClient } from 'mongodb';
import nodemailer from 'nodemailer';
import { platformAdminAssignmentSelector, selfDocumentVisibilityAllowed } from './access-utils.js';
import { scanFileWithClamAv } from './clamav-utils.js';
import {
  DOCX_MIME,
  MAX_DOCUMENT_BYTES,
  PDF_MIME,
  cleanIdentifier,
  detectDocumentType,
  safeOriginalName,
} from './document-utils.js';
import {
  DOSSIER_DOCUMENT_FIELDS,
  attachmentContentDisposition,
  dossierObjectPrefix,
  isActiveWindow,
  normalizeDossierDocumentFields,
  validDossierObjectReference,
} from './dossier-utils.js';
import { exactVersionDeleteInput } from './object-store-utils.js';

const PORT = Number(process.env.PORT || 3000);
const MONGO_URL = String(process.env.MONGO_URL || '');
const GATEWAY_SECRET = String(process.env.CSA_GATEWAY_SECRET || '');
const PUBLIC_ORIGIN = String(process.env.CSA_GATEWAY_ORIGIN || '');
const TENANT_EID = String(process.env.CSA_LEGACY_EID || '');
const MAIL_URL = String(process.env.MAIL_URL || '');
const MAIL_FROM = String(process.env.CSA_MAIL_FROM || 'Asociatia Nova Reperta <no-reply@via-nova.ro>');
const COOKIE_SECURE = process.env.CSA_GATEWAY_COOKIE_SECURE === '1';
const SESSION_HOURS = Math.min(Math.max(Number(process.env.CSA_GATEWAY_SESSION_HOURS || 8), 1), 24);
const COOKIE_NAME = 'csa_gateway_session';
const DUMMY_HASH = '$2b$10$zR7YQqVq4uzY4ZJB2zNn4OhyYGt5r6fGkFD5XfLaSKWHVJFDIrr7u';
const MINIO_ENDPOINT = String(process.env.MINIO_ENDPOINT || 'http://minio:9000');
const MINIO_BUCKET = String(process.env.MINIO_BUCKET || 'csa-documents');
const CLAMAV_HOST = String(process.env.CLAMAV_HOST || 'clamav');
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT || 3310);

if (!MONGO_URL || GATEWAY_SECRET.length < 32 || !PUBLIC_ORIGIN) {
  throw new Error('MONGO_URL, CSA_GATEWAY_SECRET (minimum 32 caractere) și CSA_GATEWAY_ORIGIN sunt obligatorii.');
}

const mongo = new MongoClient(MONGO_URL, { maxPoolSize: 10 });
await mongo.connect();
const database = mongo.db();
const users = database.collection('users');
const sessions = database.collection('gateway_sessions');
const tenants = database.collection('entitati');
const roleAssignments = database.collection('role-assignment');
const libraryWorks = database.collection('library_works');
const libraryVersions = database.collection('library_versions');
const documentRights = database.collection('document_rights');
const processingJobs = database.collection('processing_jobs');
const auditEvents = database.collection('audit_events');
const lodgeMemberships = database.collection('lodge_memberships');
const craftMemberships = database.collection('craft_memberships');
const degreeEvents = database.collection('degree_events');
const officeDefinitions = database.collection('office_definitions');
const officeTerms = database.collection('office_terms');
const officeDelegations = database.collection('office_delegations');
const brotherDossiers = database.collection('brother_dossiers');
const brotherDocuments = database.collection('brother_documents');
const dossierDocumentGrants = database.collection('dossier_document_grants');
const dossierAccessEvents = database.collection('dossier_access_events');
const mailer = MAIL_URL ? nodemailer.createTransport(MAIL_URL) : null;
const minioAccessKey = await readSecret('MINIO_ACCESS_KEY', 'MINIO_ACCESS_KEY_FILE');
const minioSecretKey = await readSecret('MINIO_SECRET_KEY', 'MINIO_SECRET_KEY_FILE');
if (!minioAccessKey || !minioSecretKey) throw new Error('Credențialele MinIO sunt obligatorii.');
const objectStore = new S3Client({
  endpoint: MINIO_ENDPOINT,
  region: process.env.MINIO_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey },
});
await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
await sessions.createIndex({ userId: 1, expiresAt: 1 });
await processingJobs.createIndex({ type: 1, status: 1, priority: -1, createdAt: 1 });
await dossierDocumentGrants.createIndex({ tokenHash: 1 }, { name: 'dossier_document_grant_token_uq', unique: true });
await dossierDocumentGrants.createIndex({ expiresAt: 1 }, { name: 'dossier_document_grant_ttl', expireAfterSeconds: 0 });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb', strict: true }));

const attempts = new Map();

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function readSecret(envName, fileEnvName) {
  if (process.env[fileEnvName]) return (await readFile(process.env[fileEnvName], 'utf8')).trim();
  return String(process.env[envName] || '').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionCookie(value, maxAgeSeconds = SESSION_HOURS * 3600) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function noStore(res) {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
}

function requireSameOrigin(req, res, next) {
  if (req.get('origin') !== PUBLIC_ORIGIN) return res.status(403).json({ error: 'Cerere refuzată.' });
  return next();
}

function rateKey(req, email) {
  const address = String(req.get('x-real-ip') || req.socket.remoteAddress || '').slice(0, 80);
  return `${address}:${email}`;
}

function consumeAttempt(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= 8;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomMeteorId(length = 17) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTWXYZabcdefghijkmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function readSession(req) {
  const raw = parseCookies(req.get('cookie'))[COOKIE_NAME];
  if (!raw || raw.length > 256) return null;
  const tokenHash = sha256(raw);
  const session = await sessions.findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId }, { projection: { setari: 1, entitati: 1 } });
  if (!user || (user.setari?.status != null && String(user.setari.status) !== '1')) return null;
  return { raw, tokenHash, session, user };
}

async function requirePortalSession(req, res, next) {
  const state = await readSession(req);
  if (!state) return res.status(401).json({ error: 'Sesiunea a expirat.' });
  req.portalSession = state;
  return next();
}

function activeWindow(row, now = new Date()) {
  if (!row || row.status !== 'active') return false;
  return (!row.startAt || new Date(row.startAt) <= now) && (!row.endAt || new Date(row.endAt) >= now);
}

function activeTenantFromUser(user) {
  const active = Object.entries(user?.entitati || {}).find(([key, value]) => (
    key !== 'all' && Number(value?.activ) === 1
  ));
  return active?.[0] || '';
}

async function hasPlatformAdminRole(userId) {
  return Boolean(await roleAssignments.findOne(
    platformAdminAssignmentSelector(userId),
    { projection: { _id: 1 } },
  ));
}

async function activeGatewayMembership(userId, eId, user) {
  const canonical = await lodgeMemberships.findOne(
    { eId, userId, status: 'active' },
    { projection: { _id: 1, currentGrade: 1, grade: 1, status: 1 } },
  );
  if (canonical) return { ...canonical, source: 'canonical' };
  const legacy = await craftMemberships.findOne(
    { eId, userId, status: 'active' },
    { projection: { _id: 1, grade: 1, status: 1 } },
  );
  if (legacy) return { ...legacy, currentGrade: legacy.grade, source: 'legacy' };
  return user?.entitati?.[eId]
    ? { _id: `legacy-user:${userId}`, currentGrade: 0, status: 'active', source: 'user' }
    : null;
}

async function gatewayEffectiveGrade(userId, eId, membership = null) {
  const membershipGrade = Number(membership?.currentGrade || membership?.grade || 0);
  if ([1, 2, 3].includes(membershipGrade)) return membershipGrade;
  const historical = await degreeEvents.findOne(
    { eId, userId, status: { $ne: 'revoked' }, effectiveAt: { $lte: new Date() } },
    { projection: { grade: 1 }, sort: { effectiveAt: -1, createdAt: -1 } },
  );
  const historicalGrade = Number(historical?.grade || 0);
  return [1, 2, 3].includes(historicalGrade) ? historicalGrade : 0;
}

async function hasDossierOfficePermission(userId, eId, grade, now = new Date(), requirePermission = true) {
  const definitionSelector = {
    eId,
    code: { $in: ['secretary', 'venerable'] },
    status: 'active',
    minGrade: { $lte: grade },
  };
  if (requirePermission) definitionSelector.permissions = 'membership.admin';
  const officeCodes = (await officeDefinitions.find(
    definitionSelector,
    { projection: { code: 1 } },
  ).toArray()).map((row) => row.code);
  if (!officeCodes.length) return false;

  const directTerms = await officeTerms.find({
    eId,
    userId,
    officeCode: { $in: officeCodes },
    status: 'active',
  }, { projection: { status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 } }).toArray();
  if (directTerms.some((row) => isActiveWindow(row, now))) return true;

  const delegations = await officeDelegations.find({
    eId,
    delegateUserId: userId,
    officeCode: { $in: officeCodes },
    status: 'active',
  }, { projection: { officeCode: 1, officeTermId: 1, actions: 1, status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 } }).toArray();
  for (const delegation of delegations) {
    if (!isActiveWindow(delegation, now)) continue;
    const actions = Array.isArray(delegation.actions) ? delegation.actions : [];
    if (actions.length && !actions.includes('membership.admin')) continue;
    const parent = await officeTerms.findOne({
      _id: delegation.officeTermId,
      eId,
      officeCode: delegation.officeCode,
      status: 'active',
    }, { projection: { status: 1, startAt: 1, endAt: 1, startsAt: 1, endsAt: 1 } });
    if (isActiveWindow(parent, now)) return true;
  }
  return false;
}

async function dossierUploadAccess(userId, eId, user) {
  const [tenant, superAdmin] = await Promise.all([
    tenants.findOne({ _id: eId, status: { $ne: 'inactive' } }, { projection: { _id: 1 } }),
    hasPlatformAdminRole(userId),
  ]);
  if (!tenant) return { allowed: false, status: 404, error: 'Tenantul nu este activ.', reason: 'tenant' };
  const activeEId = activeTenantFromUser(user);
  if (superAdmin) {
    return { allowed: true, superAdmin: true, grade: 3, activeEId, crossTenant: Boolean(activeEId && activeEId !== eId) };
  }
  if (!activeEId || activeEId !== eId) {
    return { allowed: false, status: 403, error: 'Tenantul solicitat nu este tenantul activ.', reason: 'active_tenant', activeEId };
  }
  const membership = await activeGatewayMembership(userId, eId, user);
  const grade = await gatewayEffectiveGrade(userId, eId, membership);
  if (!membership || grade !== 3) {
    return { allowed: false, status: 403, error: 'Este necesară o apartenență activă de gradul 3.', reason: 'membership_grade', activeEId };
  }
  const [roleGranted, officeGranted, officeActive] = await Promise.all([
    roleAssignments.findOne({
      'user._id': userId,
      scope: eId,
      $or: [{ 'role._id': 'membership_admin' }, { role: 'membership_admin' }],
    }, { projection: { _id: 1 } }),
    hasDossierOfficePermission(userId, eId, grade),
    hasDossierOfficePermission(userId, eId, grade, new Date(), false),
  ]);
  if (!officeActive || (!roleGranted && !officeGranted)) {
    return { allowed: false, status: 403, error: 'Este necesar un mandat activ de Secretar/Venerabil și permisiunea de registru.', reason: 'role_and_office', activeEId };
  }
  return { allowed: true, superAdmin: false, grade, activeEId, crossTenant: false };
}

async function dossierDownloadAccess(userId, eId, targetUserId, visibility, user) {
  const [tenant, superAdmin] = await Promise.all([
    tenants.findOne({ _id: eId, status: { $ne: 'inactive' } }, { projection: { _id: 1 } }),
    hasPlatformAdminRole(userId),
  ]);
  const activeEId = activeTenantFromUser(user);
  if (!tenant) return { allowed: false, reason: 'tenant', activeEId, superAdmin };
  if (superAdmin) {
    return {
      allowed: true,
      superAdmin: true,
      activeEId,
      crossTenant: Boolean(activeEId && activeEId !== eId),
    };
  }
  if (!activeEId || activeEId !== eId) {
    return { allowed: false, reason: 'active_tenant', activeEId, superAdmin: false };
  }
  if (userId === targetUserId) {
    const membership = await activeGatewayMembership(userId, eId, user);
    if (!membership) return { allowed: false, reason: 'membership', activeEId, superAdmin: false };
    if (!selfDocumentVisibilityAllowed(visibility)) {
      return { allowed: false, reason: 'visibility', activeEId, superAdmin: false };
    }
    return { allowed: true, self: true, activeEId, superAdmin: false, crossTenant: false };
  }

  const manager = await dossierUploadAccess(userId, eId, user);
  if (!manager.allowed) return manager;
  const target = await findDossierTarget(eId, targetUserId);
  if (!target) return { ...manager, allowed: false, reason: 'target_tenant' };
  return { ...manager, allowed: true, self: false };
}

async function findDossierTarget(eId, userId) {
  const [membership, targetUser] = await Promise.all([
    lodgeMemberships.findOne({ eId, userId }, { projection: { _id: 1, status: 1 } }),
    users.findOne({ _id: userId }, { projection: { [`entitati.${eId}`]: 1 } }),
  ]);
  if (!targetUser || (!membership && !targetUser.entitati?.[eId])) return null;
  return { membershipId: membership?._id || null };
}

function requestSource(req) {
  return {
    ip: String(req.get('x-real-ip') || req.socket.remoteAddress || '').slice(0, 80),
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
  };
}

function auditMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    String(key).slice(0, 80),
    ['string', 'number', 'boolean'].includes(typeof value) ? value : '[structured]',
  ]));
}

async function writeDossierAudit(req, {
  eId,
  actorId,
  targetUserId,
  documentId,
  action,
  outcome = 'success',
  platformAdmin = false,
  activeEId = '',
  crossTenant = false,
  metadata = {},
}, dbSession = undefined) {
  const at = new Date();
  const source = requestSource(req);
  const safeMetadata = auditMetadata(metadata);
  const options = dbSession ? { session: dbSession } : {};
  await auditEvents.insertOne({
    eId,
    activeEId: activeEId || eId,
    actorId,
    action,
    entityType: 'brother_document',
    entityId: documentId,
    outcome,
    crossTenant: Boolean(crossTenant),
    metadata: { ...safeMetadata, platformAdmin: Boolean(platformAdmin) },
    source,
    at,
  }, options);
  await dossierAccessEvents.insertOne({
    eId,
    actorId,
    targetUserId,
    action,
    resourceType: 'brother_document',
    resourceId: documentId,
    outcome,
    crossTenant: Boolean(crossTenant),
    platformAdmin: Boolean(platformAdmin),
    metadata: safeMetadata,
    source,
    at,
  }, options);
}

async function libraryAccess(userId, eId, user) {
  const superAdmin = await hasPlatformAdminRole(userId);
  if (superAdmin) return { allowed: true, grade: 3, superAdmin: true };
  const membership = user?.entitati?.[eId];
  if (!membership || ['0', 'false'].includes(String(membership.activ).toLowerCase())) return { allowed: false, grade: 0 };
  const canonicalMembership = await lodgeMemberships.findOne(
    { eId, userId, status: 'active' },
    { projection: { _id: 1, currentGrade: 1, grade: 1 } },
  );
  const grade = Number(canonicalMembership?.currentGrade || canonicalMembership?.grade || 0);
  if (!canonicalMembership || ![1, 2, 3].includes(grade)) return { allowed: false, grade: 0 };
  const assignment = await roleAssignments.findOne({
    'user._id': userId,
    scope: eId,
    $or: [
      { 'role._id': { $in: ['library_write', 'library_admin'] } },
      { role: { $in: ['library_write', 'library_admin'] } },
    ],
  }, { projection: { _id: 1 } });
  const now = new Date();
  const directTerms = (await officeTerms.find({ eId, userId, status: 'active' }, { projection: { _id: 1, officeCode: 1, status: 1, startAt: 1, endAt: 1 } }).toArray())
    .filter((row) => activeWindow(row, now));
  const rawDelegations = (await officeDelegations.find({ eId, delegateUserId: userId, status: 'active' }, { projection: { officeTermId: 1, officeCode: 1, actions: 1, status: 1, startAt: 1, endAt: 1 } }).toArray())
    .filter((row) => activeWindow(row, now));
  const delegations = [];
  for (const delegation of rawDelegations) {
    const parent = await officeTerms.findOne({ _id: delegation.officeTermId, eId, status: 'active' }, { projection: { status: 1, startAt: 1, endAt: 1 } });
    if (activeWindow(parent, now)) delegations.push(delegation);
  }
  const codes = [...new Set([
    ...directTerms.map((row) => row.officeCode),
    ...delegations.filter((row) => !Array.isArray(row.actions) || !row.actions.length || row.actions.some((action) => ['library.write', 'library.admin'].includes(action))).map((row) => row.officeCode),
  ].filter(Boolean))];
  if (!codes.length) return { allowed: false, grade };
  const office = await officeDefinitions.findOne(
    { eId, code: { $in: codes }, status: 'active', minGrade: { $lte: grade }, permissions: { $in: ['library.write', 'library.admin'] } },
    { projection: { _id: 1 } },
  );
  return { allowed: Boolean(assignment || office), grade };
}

async function receiveMultipartDocument(req, {
  allowedFields = new Set(['eId', 'workId']),
  strictFields = false,
} = {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'csa-upload-'));
  const filePath = path.join(temporaryDirectory, 'upload.bin');
  try {
    return await new Promise((resolve, reject) => {
      const fields = {};
      let fileResult = null;
      let filePromise = null;
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        reject(error);
      };
      let busboy;
      try {
        busboy = Busboy({
          headers: req.headers,
          limits: { files: 1, fileSize: MAX_DOCUMENT_BYTES, fields: 12, fieldSize: 4096, parts: 16 },
        });
      } catch (error) {
        fail(error);
        return;
      }
      busboy.on('field', (name, value, info) => {
        if (info?.nameTruncated || info?.valueTruncated) {
          fail(new Error('Un câmp multipart depășește limita permisă.'));
          return;
        }
        if (!allowedFields.has(name)) {
          if (strictFields) fail(new Error(`Câmp multipart nepermis: ${String(name).slice(0, 80)}.`));
          return;
        }
        if (strictFields && Object.hasOwn(fields, name)) {
          fail(new Error(`Câmp multipart duplicat: ${String(name).slice(0, 80)}.`));
          return;
        }
        fields[name] = String(value || '').trim();
      });
      busboy.on('file', (fieldName, file, info) => {
        if (fieldName !== 'file' || filePromise) {
          file.resume();
          fail(new Error('Este permis un singur câmp file.'));
          return;
        }
        let size = 0;
        let header = Buffer.alloc(0);
        const hash = crypto.createHash('sha256');
        const meter = new Transform({
          transform(chunk, encoding, callback) {
            size += chunk.length;
            if (header.length < 8) header = Buffer.concat([header, chunk.subarray(0, 8 - header.length)]);
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        file.once('limit', () => fail(new Error('Fișierul depășește limita de 250 MB.')));
        filePromise = pipeline(file, meter, createWriteStream(filePath, { mode: 0o600 }))
          .then(() => {
            if (file.truncated) throw new Error('Fișierul depășește limita de 250 MB.');
            fileResult = {
              filePath,
              size,
              sha256: hash.digest('hex'),
              header,
              originalName: safeOriginalName(info.filename),
              mimeType: info.mimeType,
            };
          });
        filePromise.catch(fail);
      });
      busboy.once('filesLimit', () => fail(new Error('Este permis un singur fișier.')));
      busboy.once('fieldsLimit', () => fail(new Error('Prea multe câmpuri multipart.')));
      busboy.once('partsLimit', () => fail(new Error('Prea multe părți multipart.')));
      busboy.once('error', fail);
      req.once('aborted', () => fail(new Error('Upload întrerupt.')));
      busboy.once('close', async () => {
        try {
          if (filePromise) await filePromise;
          if (!fileResult) throw new Error('Fișierul este obligatoriu.');
          if (!failed) resolve({ temporaryDirectory, fields, ...fileResult });
        } catch (error) {
          fail(error);
        }
      });
      req.pipe(busboy);
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function scanWithClamAv(filePath) {
  return scanFileWithClamAv(filePath, { host: CLAMAV_HOST, port: CLAMAV_PORT });
}

app.get('/healthz', async (req, res) => {
  await database.command({ ping: 1 });
  res.type('text/plain').send('ok');
});

app.get('/portal-api/dossiers/documents/:id', requirePortalSession, async (req, res) => {
  noStore(res);
  const documentId = cleanIdentifier(req.params.id);
  const ticket = String(req.query?.ticket || '');
  if (!documentId || ticket.length < 20 || ticket.length > 256 || !/^[A-Za-z0-9_-]+$/.test(ticket)) {
    return res.status(400).json({ error: 'Identificator sau ticket invalid.' });
  }

  const { session, user } = req.portalSession;
  const now = new Date();
  const consumedResult = await dossierDocumentGrants.findOneAndUpdate(
    {
      documentId,
      actorId: session.userId,
      tokenHash: sha256(ticket),
      expiresAt: { $gt: now },
      usedAt: null,
    },
    { $set: { usedAt: now, usedByGateway: true } },
    {
      returnDocument: 'after',
      projection: { eId: 1, documentId: 1, actorId: 1, targetUserId: 1, expiresAt: 1, usedAt: 1 },
    },
  );
  const grant = consumedResult?.value || consumedResult;
  if (!grant) return res.status(404).json({ error: 'Ticketul nu există, a expirat sau a fost folosit.' });

  const document = await brotherDocuments.findOne({
    _id: documentId,
    eId: grant.eId,
    userId: grant.targetUserId,
    status: 'active',
    storageState: 'available',
  }, {
    projection: {
      eId: 1,
      userId: 1,
      title: 1,
      category: 1,
      originalName: 1,
      objectRef: 1,
      sha256: 1,
      visibility: 1,
    },
  });
  const access = await dossierDownloadAccess(
    session.userId,
    grant.eId,
    grant.targetUserId,
    document?.visibility,
    user,
  );
  const auditContext = {
    eId: grant.eId,
    actorId: session.userId,
    targetUserId: grant.targetUserId,
    documentId,
    platformAdmin: Boolean(access.superAdmin),
    activeEId: access.activeEId,
    crossTenant: Boolean(access.crossTenant),
  };
  if (!access.allowed) {
    await writeDossierAudit(req, {
      ...auditContext,
      action: 'dossiers.documents.download',
      outcome: 'denied',
      metadata: { reason: access.reason || 'access' },
    });
    return res.status(403).json({ error: 'Accesul la document nu mai este permis.' });
  }
  const validMime = [PDF_MIME, DOCX_MIME].includes(String(document?.objectRef?.mimeType || '').toLowerCase());
  if (!document || !validMime || !validDossierObjectReference(document.objectRef, {
    eId: grant.eId,
    userId: grant.targetUserId,
    bucket: MINIO_BUCKET,
  })) {
    await writeDossierAudit(req, {
      ...auditContext,
      action: 'dossiers.documents.download',
      outcome: 'failed',
      metadata: { reason: 'invalid_document_reference' },
    });
    return res.status(404).json({ error: 'Documentul nu este disponibil.' });
  }

  let storedObject;
  try {
    const command = {
      Bucket: MINIO_BUCKET,
      Key: document.objectRef.key,
    };
    if (document.objectRef.versionId) command.VersionId = document.objectRef.versionId;
    storedObject = await objectStore.send(new GetObjectCommand(command));
    if (!storedObject?.Body) throw new Error('Obiectul nu are conținut.');
  } catch (error) {
    await writeDossierAudit(req, {
      ...auditContext,
      action: 'dossiers.documents.download',
      outcome: 'failed',
      metadata: { reason: 'object_unavailable' },
    });
    return res.status(404).json({ error: 'Documentul nu este disponibil.' });
  }

  await writeDossierAudit(req, {
    ...auditContext,
    action: 'dossiers.documents.download',
    metadata: {
      category: document.category || 'other',
      mimeType: document.objectRef.mimeType,
      size: Number(storedObject.ContentLength || document.objectRef.size),
    },
  });
  res.set('Content-Type', document.objectRef.mimeType);
  res.set('Content-Disposition', attachmentContentDisposition(document.originalName || document.title));
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "sandbox; default-src 'none'");
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  const contentLength = Number(storedObject.ContentLength || 0);
  if (Number.isSafeInteger(contentLength) && contentLength > 0) res.set('Content-Length', String(contentLength));
  try {
    await pipeline(storedObject.Body, res);
  } catch (error) {
    console.error('[gateway] Fluxul documentului de dosar a eșuat:', error?.message || error);
    await writeDossierAudit(req, {
      ...auditContext,
      action: 'dossiers.documents.download.stream',
      outcome: 'failed',
      metadata: { reason: 'stream_interrupted' },
    }).catch(() => {});
    if (!res.headersSent) return res.status(502).json({ error: 'Transferul documentului a eșuat.' });
    res.destroy();
  }
  return undefined;
});

app.post('/portal-api/dossiers/:userId/documents', requireSameOrigin, requirePortalSession, async (req, res) => {
  noStore(res);
  const eId = cleanIdentifier(req.get('x-csa-tenant'));
  const targetUserId = cleanIdentifier(req.params.userId);
  if (!eId) return res.status(400).json({ error: 'Antetul X-CSA-Tenant este obligatoriu.' });
  if (!targetUserId) return res.status(400).json({ error: 'Identificatorul Fratelui este invalid.' });
  const { session, user } = req.portalSession;
  if (!consumeAttempt(rateKey(req, `dossier-upload:${session.userId}`))) {
    return res.status(429).json({ error: 'Prea multe încărcări. Reîncercați mai târziu.' });
  }
  const access = await dossierUploadAccess(session.userId, eId, user);
  if (!access.allowed) {
    if (access.reason !== 'tenant') {
      await writeDossierAudit(req, {
        eId,
        actorId: session.userId,
        targetUserId,
        documentId: '',
        action: 'dossiers.documents.upload',
        outcome: 'denied',
        activeEId: access.activeEId,
        metadata: { reason: access.reason || 'access' },
      });
    }
    return res.status(access.status || 403).json({ error: access.error || 'Acces refuzat.' });
  }
  const target = await findDossierTarget(eId, targetUserId);
  if (!target) {
    await writeDossierAudit(req, {
      eId,
      actorId: session.userId,
      targetUserId,
      documentId: '',
      action: 'dossiers.documents.upload',
      outcome: 'denied',
      platformAdmin: access.superAdmin,
      activeEId: access.activeEId,
      crossTenant: access.crossTenant,
      metadata: { reason: 'target_tenant' },
    });
    return res.status(404).json({ error: 'Fratele nu aparține tenantului selectat.' });
  }

  let upload;
  let objectKey = '';
  let objectStored = false;
  let objectVersionId = '';
  let documentId = '';
  try {
    upload = await receiveMultipartDocument(req, {
      allowedFields: DOSSIER_DOCUMENT_FIELDS,
      strictFields: true,
    });
    const metadata = normalizeDossierDocumentFields(upload.fields);
    const documentType = detectDocumentType(upload.header, upload.mimeType, upload.originalName);
    await scanWithClamAv(upload.filePath);

    documentId = randomMeteorId();
    objectKey = `${dossierObjectPrefix(eId, targetUserId)}${documentId}/${crypto.randomUUID()}${documentType.extension}`;
    const stored = await objectStore.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: objectKey,
      Body: createReadStream(upload.filePath),
      ContentLength: upload.size,
      ContentType: documentType.mimeType,
      Metadata: {
        eid: eId,
        dossieruserid: targetUserId,
        documentid: documentId,
        sha256: upload.sha256,
      },
    }));
    objectStored = true;
    objectVersionId = String(stored?.VersionId || '');

    const dbSession = mongo.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const now = new Date();
        await brotherDossiers.updateOne(
          { eId, userId: targetUserId },
          {
            $set: { membershipId: target.membershipId, updatedAt: now, updatedBy: session.userId },
            $setOnInsert: {
              _id: randomMeteorId(),
              eId,
              userId: targetUserId,
              identity: {},
              contact: {},
              professional: {},
              association: { status: 'unknown' },
              dataQuality: { status: 'draft', reviewedAt: null, reviewedBy: null },
              sensitivity: 'restricted',
              createdAt: now,
              createdBy: session.userId,
            },
          },
          { upsert: true, session: dbSession },
        );
        await brotherDocuments.insertOne({
          _id: documentId,
          eId,
          userId: targetUserId,
          ...metadata,
          originalName: upload.originalName,
          objectRef: {
            provider: 'minio',
            bucket: MINIO_BUCKET,
            key: objectKey,
            versionId: objectVersionId,
            size: upload.size,
            mimeType: documentType.mimeType,
          },
          sha256: upload.sha256,
          storageState: 'available',
          status: 'active',
          createdAt: now,
          createdBy: session.userId,
          updatedAt: now,
          updatedBy: session.userId,
        }, { session: dbSession });
        await writeDossierAudit(req, {
          eId,
          actorId: session.userId,
          targetUserId,
          documentId,
          action: 'dossiers.documents.upload',
          platformAdmin: access.superAdmin,
          activeEId: access.activeEId,
          crossTenant: access.crossTenant,
          metadata: {
            category: metadata.category,
            visibility: metadata.visibility,
            mimeType: documentType.mimeType,
            size: upload.size,
            sha256: upload.sha256,
          },
        }, dbSession);
      });
    } finally {
      await dbSession.endSession();
    }
    return res.status(201).json({ ok: true, id: documentId, storageState: 'available' });
  } catch (error) {
    if (objectStored && objectKey) {
      await objectStore.send(new DeleteObjectCommand(
        exactVersionDeleteInput(MINIO_BUCKET, objectKey, objectVersionId),
      )).catch((deleteError) => {
        console.error('[gateway] Curățarea obiectului de dosar a eșuat:', deleteError?.message || deleteError);
      });
    }
    const message = String(error?.message || 'Upload invalid.');
    await writeDossierAudit(req, {
      eId,
      actorId: session.userId,
      targetUserId,
      documentId,
      action: 'dossiers.documents.upload',
      outcome: 'failed',
      platformAdmin: access.superAdmin,
      activeEId: access.activeEId,
      crossTenant: access.crossTenant,
      metadata: { reason: 'upload_failed' },
    }).catch(() => {});
    if (/MIME|extensie|250 MB|fișier|file|multipart|content-type|boundary|unexpected end of form|obligatoriu|antivirus|categor|vizibilitate|dat[ae]|identificator/i.test(message)) {
      return res.status(400).json({ error: message.slice(0, 500) });
    }
    throw error;
  } finally {
    if (upload?.temporaryDirectory) await rm(upload.temporaryDirectory, { recursive: true, force: true });
  }
});

app.post('/portal-api/documents', requireSameOrigin, requirePortalSession, async (req, res) => {
  noStore(res);
  const eId = cleanIdentifier(req.get('x-csa-tenant'));
  if (!eId) return res.status(400).json({ error: 'Antetul X-CSA-Tenant este obligatoriu.' });
  const { session, user } = req.portalSession;
  const access = await libraryAccess(session.userId, eId, user);
  if (!access.allowed) {
    return res.status(403).json({ error: 'Este necesară funcția activă de Bibliotecar sau rolul de administrator platformă.' });
  }
  if (!consumeAttempt(rateKey(req, `upload:${session.userId}`))) {
    return res.status(429).json({ error: 'Prea multe importuri. Reîncercați mai târziu.' });
  }

  let upload;
  let objectKey = '';
  let objectStored = false;
  let objectVersionId = '';
  try {
    upload = await receiveMultipartDocument(req);
    const workId = cleanIdentifier(upload.fields.workId);
    if (!workId) return res.status(400).json({ error: 'workId este obligatoriu.' });
    const documentType = detectDocumentType(upload.header, upload.mimeType, upload.originalName);
    const [work, rights] = await Promise.all([
      libraryWorks.findOne({ _id: workId, eId, status: { $ne: 'removed' } }),
      documentRights.findOne({ workId, eId }),
    ]);
    if (!work) return res.status(404).json({ error: 'Lucrarea nu există în tenantul selectat.' });
    if (!access.superAdmin && Number(work.minGrade || 1) > access.grade) {
      return res.status(403).json({ error: 'Gradul activ nu permite importul în această lucrare.' });
    }
    if (!rights?.storageAllowed || !rights?.processingAllowed) {
      return res.status(409).json({ error: 'Drepturile de stocare și procesare trebuie aprobate înainte de upload.' });
    }

    await scanWithClamAv(upload.filePath);
    const versionId = randomMeteorId();
    const jobId = randomMeteorId();
    objectKey = `${eId}/${workId}/${versionId}/${crypto.randomUUID()}${documentType.extension}`;
    const stored = await objectStore.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: objectKey,
      Body: createReadStream(upload.filePath),
      ContentLength: upload.size,
      ContentType: documentType.mimeType,
      Metadata: { eid: eId, workid: workId, versionid: versionId, sha256: upload.sha256 },
    }));
    objectStored = true;
    objectVersionId = String(stored?.VersionId || '');

    const dbSession = mongo.startSession();
    try {
      await dbSession.withTransaction(async () => {
        const latest = await libraryVersions.findOne(
          { eId, workId },
          { sort: { version: -1 }, projection: { version: 1 }, session: dbSession },
        );
        const version = Number(latest?.version || 0) + 1;
        const now = new Date();
        await libraryVersions.insertOne({
          _id: versionId,
          eId,
          workId,
          version,
          sourceType: documentType.type,
          originalName: upload.originalName,
          object: { bucket: MINIO_BUCKET, key: objectKey, size: upload.size, sha256: upload.sha256, mimeType: documentType.mimeType },
          status: 'processing',
          extractionStatus: 'queued',
          createdAt: now,
          createdBy: session.userId,
        }, { session: dbSession });
        await processingJobs.insertOne({
          _id: jobId,
          eId,
          type: 'library_extract',
          status: 'queued',
          attempts: 0,
          priority: 0,
          workId,
          versionId,
          minGrade: Number(work.minGrade || 1),
          source: {
            bucket: MINIO_BUCKET,
            key: objectKey,
            originalName: upload.originalName,
            mimeType: documentType.mimeType,
          },
          createdAt: now,
          createdBy: session.userId,
          updatedAt: now,
        }, { session: dbSession });
        await libraryWorks.updateOne(
          { _id: workId, eId },
          { $set: { importVersionId: versionId, updatedAt: now, updatedBy: session.userId } },
          { session: dbSession },
        );
        await auditEvents.insertOne({
          eId, activeEId: eId, actorId: session.userId, action: 'library.version.upload',
          entityType: 'library_version', entityId: versionId, outcome: 'success', crossTenant: false,
          metadata: { workId, jobId, sourceType: documentType.type, size: upload.size, sha256: upload.sha256 },
          source: { ip: String(req.get('x-real-ip') || req.socket.remoteAddress || '').slice(0, 80), userAgent: String(req.get('user-agent') || '').slice(0, 500) },
          at: now,
        }, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }
    return res.status(202).json({ ok: true, jobId, versionId, status: 'queued' });
  } catch (error) {
    if (objectStored && objectKey) {
      await objectStore.send(new DeleteObjectCommand(
        exactVersionDeleteInput(MINIO_BUCKET, objectKey, objectVersionId),
      )).catch((deleteError) => {
        console.error('[gateway] Curățarea obiectului de bibliotecă a eșuat:', deleteError?.message || deleteError);
      });
    }
    const message = String(error?.message || 'Upload invalid.');
    if (/MIME|extensie|250 MB|fișier|file|multipart|obligatoriu|antivirus/i.test(message)) {
      return res.status(400).json({ error: message.slice(0, 500) });
    }
    throw error;
  } finally {
    if (upload?.temporaryDirectory) await rm(upload.temporaryDirectory, { recursive: true, force: true });
  }
});

app.get('/portal-api/imports/:id/status', requirePortalSession, async (req, res) => {
  noStore(res);
  const jobId = cleanIdentifier(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Identificator invalid.' });
  const job = await processingJobs.findOne({ _id: jobId }, {
    projection: { eId: 1, workId: 1, versionId: 1, status: 1, reason: 1, error: 1, nodeCount: 1, attempts: 1, createdBy: 1, createdAt: 1, updatedAt: 1, finishedAt: 1 },
  });
  if (!job) return res.status(404).json({ error: 'Importul nu există.' });
  const { session, user } = req.portalSession;
  const manager = await libraryAccess(session.userId, job.eId, user);
  if (!manager.allowed && job.createdBy !== session.userId) return res.status(403).json({ error: 'Acces refuzat.' });
  return res.json({
    id: job._id,
    workId: job.workId,
    versionId: job.versionId,
    status: job.status,
    reason: job.reason || null,
    error: job.status === 'failed' ? job.error || null : null,
    nodeCount: job.nodeCount || 0,
    attempts: job.attempts || 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt || null,
  });
});

app.post('/auth/login', requireSameOrigin, async (req, res) => {
  noStore(res);
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(req.body?.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 1 || password.length > 256) {
    return res.status(401).json({ error: 'Email sau parolă incorectă.' });
  }
  if (!consumeAttempt(rateKey(req, email))) return res.status(429).json({ error: 'Prea multe încercări. Reîncercați mai târziu.' });

  const user = await users.findOne(
    { emails: { $elemMatch: { address: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } } } },
    { projection: { services: 1, setari: 1 } },
  );
  const hash = user?.services?.password?.bcrypt || DUMMY_HASH;
  const validPassword = await bcrypt.compare(password, hash).catch(() => false);
  const active = user && (user.setari?.status == null || String(user.setari.status) === '1');
  if (!validPassword || !active) return res.status(401).json({ error: 'Email sau parolă incorectă.' });

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 3600 * 1000);
  await sessions.insertOne({ _id: tokenHash, userId: user._id, createdAt: now, expiresAt });
  res.set('Set-Cookie', sessionCookie(rawToken));
  return res.json({ ok: true, redirect: '/portal/' });
});

app.post('/auth/register', requireSameOrigin, async (req, res) => {
  noStore(res);
  const email = validEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const prenume = String(req.body?.prenume || '').trim().slice(0, 80);
  const nume = String(req.body?.nume || '').trim().slice(0, 80);
  const website = String(req.body?.website || '').trim();
  if (website) return res.json({ ok: true });
  if (!consumeAttempt(rateKey(req, `register:${email}`))) return res.status(429).json({ error: 'Prea multe încercări. Reîncercați mai târziu.' });
  if (!email || !prenume || !nume || password.length < 12 || password.length > 256) {
    return res.status(400).json({ error: 'Datele introduse nu sunt valide.' });
  }
  if (!TENANT_EID) return res.status(503).json({ error: 'Înregistrarea nu este configurată.' });
  const tenant = await tenants.findOne({ _id: TENANT_EID }, { projection: { nume: 1 } });
  if (!tenant) return res.status(503).json({ error: 'Înregistrarea nu este configurată.' });
  const duplicate = await users.findOne(
    { emails: { $elemMatch: { address: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } } } },
    { projection: { _id: 1 } },
  );
  if (duplicate) return res.status(409).json({ error: 'Există deja un cont asociat acestei adrese.' });
  const now = new Date();
  const bcryptHash = await bcrypt.hash(password, 10);
  try {
    await users.insertOne({
      _id: randomMeteorId(),
      createdAt: now,
      emails: [{ address: email, verified: false }],
      profile: { name: `${prenume} ${nume}` },
      services: { password: { bcrypt: bcryptHash }, resume: { loginTokens: [] } },
      setari: { prenume, nume, status: '2', tip: 'membru' },
      registration: { status: 'pending', source: 'public-gateway', requestedAt: now },
      entitati: {
        [TENANT_EID]: { nume: tenant.nume || 'Asociația Nova Reperta', activ: 0 },
        all: { nume: 'All', activ: 0 },
      },
    });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'Există deja un cont asociat acestei adrese.' });
    throw error;
  }
  return res.json({ ok: true });
});

app.post('/auth/forgot-password', requireSameOrigin, async (req, res) => {
  noStore(res);
  const email = validEmail(req.body?.email);
  if (!email || !consumeAttempt(rateKey(req, `forgot:${email}`))) {
    return res.json({ ok: true });
  }
  const user = await users.findOne(
    { emails: { $elemMatch: { address: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } } } },
    { projection: { _id: 1, emails: 1 } },
  );
  if (user && mailer) {
    const actualEmail = user.emails.find((entry) => entry.address.toLowerCase() === email)?.address;
    if (actualEmail) {
      const token = crypto.randomBytes(32).toString('base64url');
      await users.updateOne({ _id: user._id }, { $set: { 'services.password.reset': { token, email: actualEmail, when: new Date(), reason: 'reset' } } });
      const url = `${PUBLIC_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await mailer.sendMail({
          from: MAIL_FROM,
          to: actualEmail,
          subject: 'Resetare parolă — Asociația Nova Reperta',
          text: `A fost solicitată resetarea parolei contului Nova Reperta.\n\nDeschideți linkul: ${url}\n\nDacă nu ați făcut solicitarea, ignorați acest mesaj.`,
          html: `<p>A fost solicitată resetarea parolei contului Nova Reperta.</p><p><a href="${url}">Resetați parola</a></p><p>Dacă nu ați făcut solicitarea, ignorați acest mesaj.</p>`,
        });
      } catch (error) {
        console.error('[gateway] Trimiterea resetării a eșuat:', error?.message || error);
      }
    }
  }
  return res.json({ ok: true });
});

app.post('/auth/reset-password', requireSameOrigin, async (req, res) => {
  noStore(res);
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (token.length < 32 || token.length > 256 || password.length < 12 || password.length > 256) {
    return res.status(400).json({ error: 'Linkul este invalid sau parola este prea scurtă.' });
  }
  if (!consumeAttempt(rateKey(req, `reset:${sha256(token)}`))) return res.status(429).json({ error: 'Prea multe încercări.' });
  const minimumWhen = new Date(Date.now() - 60 * 60 * 1000);
  const user = await users.findOne({
    'services.password.reset.token': token,
    'services.password.reset.when': { $gt: minimumWhen },
  }, { projection: { _id: 1, 'services.password.reset': 1 } });
  if (!user) return res.status(400).json({ error: 'Linkul este invalid sau a expirat.' });
  const email = user.services.password.reset.email;
  const bcryptHash = await bcrypt.hash(password, 10);
  const result = await users.updateOne(
    { _id: user._id, 'services.password.reset.token': token, 'emails.address': email },
    {
      $set: { 'services.password.bcrypt': bcryptHash, 'emails.$.verified': true },
      $unset: { 'services.password.reset': '', 'services.resume.loginTokens': '' },
    },
  );
  if (result.modifiedCount !== 1) return res.status(400).json({ error: 'Linkul este invalid sau a expirat.' });
  await sessions.deleteMany({ userId: user._id });
  return res.json({ ok: true });
});

app.get('/auth/check', async (req, res) => {
  noStore(res);
  const state = await readSession(req);
  if (!state) return res.sendStatus(401);
  res.set('X-CSA-User', String(state.session.userId));
  return res.sendStatus(204);
});

app.post('/auth/bootstrap', requireSameOrigin, async (req, res) => {
  noStore(res);
  const state = await readSession(req);
  if (!state) return res.status(401).json({ error: 'Sesiunea a expirat.' });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    userId: String(state.session.userId),
    sid: state.tokenHash,
    iat: now,
    exp: now + 45,
    jti: crypto.randomBytes(18).toString('base64url'),
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', GATEWAY_SECRET).update(encoded).digest('base64url');
  return res.json({ assertion: `${encoded}.${signature}` });
});

app.post('/auth/logout', requireSameOrigin, async (req, res) => {
  noStore(res);
  const raw = parseCookies(req.get('cookie'))[COOKIE_NAME];
  if (raw) await sessions.deleteOne({ _id: sha256(raw) });
  res.set('Set-Cookie', sessionCookie('', 0));
  return res.json({ ok: true });
});

app.use((error, req, res, next) => {
  console.error('[gateway] Eroare internă:', error?.message || error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Serviciul nu este disponibil.' });
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`[gateway] ascultă pe portul ${PORT}`));

async function shutdown() {
  server.close(async () => {
    await mongo.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

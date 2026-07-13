import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { MongoClient } from 'mongodb';
import sanitizeHtml from 'sanitize-html';
import { bulkPayload, projectionKey, tenantIndexName } from './projection-utils.js';

const WORKER_ID = `${os.hostname()}:${process.pid}:${randomUUID()}`;
const HEALTH_FILE = process.env.WORKER_HEALTH_FILE || '/tmp/csa-content-worker.health';
const POLL_MS = numberEnv('WORKER_POLL_MS', 3000, 250, 60000);
const LOCK_MS = numberEnv('WORKER_LOCK_MS', 15 * 60 * 1000, 60000, 60 * 60 * 1000);
const MAX_ATTEMPTS = numberEnv('WORKER_MAX_ATTEMPTS', 3, 1, 20);
const CONCURRENCY = numberEnv('WORKER_CONCURRENCY', 2, 1, 2);
const MIN_TEXT_CHARS = numberEnv('WORKER_MIN_TEXT_CHARS', 40, 1, 10000);
const MAX_SOURCE_BYTES = numberEnv('WORKER_MAX_SOURCE_BYTES', 250 * 1024 * 1024, 1024, 1024 * 1024 * 1024);
const PROJECT_JOB_TYPES = ['project_library_version', 'project_concepts'];

function numberEnv(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

async function readSecret(envName, fileEnvName) {
  if (process.env[fileEnvName]) {
    return (await readFile(process.env[fileEnvName], 'utf8')).trim();
  }
  return process.env[envName]?.trim() || '';
}

function requireValue(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function requestJson(baseUrl, requestPath, options = {}) {
  const url = new URL(requestPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const transport = url.protocol === 'https:' ? https : http;
  const body = options.body == null
    ? null
    : (typeof options.body === 'string' || Buffer.isBuffer(options.body) ? options.body : JSON.stringify(options.body));
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (body != null) headers['Content-Length'] = Buffer.byteLength(body);
  if (options.username) {
    headers.Authorization = `Basic ${Buffer.from(`${options.username}:${options.password || ''}`).toString('base64')}`;
  }
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: options.method || 'GET',
      headers,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      timeout: options.timeoutMs || 60000,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size <= 10 * 1024 * 1024) chunks.push(chunk);
      });
      response.once('end', () => {
        const responseText = Buffer.concat(chunks).toString('utf8');
        let parsed = responseText;
        try { parsed = responseText ? JSON.parse(responseText) : null; } catch {}
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({ statusCode: response.statusCode, body: parsed });
        } else if ((options.allowedStatuses || []).includes(response.statusCode)) {
          resolve({ statusCode: response.statusCode, body: parsed });
        } else {
          reject(new Error(`${options.service || url.hostname} HTTP ${response.statusCode}: ${responseText.slice(0, 2000)}`));
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error(`${options.service || url.hostname} timeout`)));
    request.once('error', reject);
    if (body != null) request.write(body);
    request.end();
  });
}

function serviceClient(baseUrl, username, password, rejectUnauthorized = true, service = 'service') {
  return (requestPath, options = {}) => requestJson(baseUrl, requestPath, {
    ...options,
    username,
    password,
    rejectUnauthorized,
    service,
  });
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function splitSentences(text) {
  const segmenter = new Intl.Segmenter('ro', { granularity: 'sentence' });
  return [...segmenter.segment(text)]
    .map(({ segment }) => cleanText(segment))
    .filter(Boolean);
}

function makeNode(job, generationId, type, text, order, parentId = null, page = null) {
  const nodeId = digest(`${job.versionId}:${generationId}:${type}:${order}:${text}`).slice(0, 24);
  return {
    _id: nodeId,
    eId: job.eId,
    workId: job.workId,
    versionId: job.versionId,
    parentId,
    type,
    order,
    text,
    page,
    hash: digest(text),
    minGrade: Math.min(3, Math.max(1, Number(job.minGrade || 1))),
    status: 'draft',
    generatedBy: 'content-worker',
    generationId,
    importJobId: job._id,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function blocksToNodes(job, generationId, blocks) {
  const nodes = [];
  let parentId = null;
  let order = 0;

  for (const block of blocks) {
    const text = cleanText(block.text);
    if (!text) continue;
    order += 1;
    const type = block.type === 'heading' ? (block.level === 1 ? 'chapter' : 'section') : 'paragraph';
    const node = makeNode(job, generationId, type, text, order, type === 'paragraph' ? parentId : null, block.page ?? null);
    nodes.push(node);
    if (type !== 'paragraph') parentId = node._id;

    if (type === 'paragraph') {
      let sentenceOrder = 0;
      for (const sentence of splitSentences(text)) {
        sentenceOrder += 1;
        nodes.push(makeNode(job, generationId, 'sentence', sentence, `${order}.${sentenceOrder}`, node._id, block.page ?? null));
      }
    }
  }
  return nodes;
}

function anchorsForNodes(nodes) {
  const occurrences = new Map();
  return nodes.map((node) => {
    const contentHash = node.hash || digest(node.text);
    const base = `${node.type}:${contentHash}`;
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    return { node, contentHash, anchorKey: `${base}:${occurrence}` };
  });
}

function directTextBlocks(text) {
  return cleanText(text)
    .split(/\n{2,}/)
    .map((paragraph) => ({ type: 'paragraph', text: paragraph }));
}

async function docxBlocks(filePath) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"] }
  );
  const safe = sanitizeHtml(result.value, {
    allowedTags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'br', 'strong', 'em'],
    allowedAttributes: {}
  });
  const $ = cheerio.load(safe);
  const blocks = [];
  $('h1,h2,h3,h4,h5,h6,p,li').each((_, element) => {
    const tag = element.tagName.toLowerCase();
    blocks.push({
      type: tag.startsWith('h') ? 'heading' : 'paragraph',
      level: tag.startsWith('h') ? Number(tag.slice(1)) : undefined,
      text: $(element).text()
    });
  });
  return { blocks, warnings: result.messages.map(({ type, message }) => ({ type, message })) };
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}

async function pdfBlocks(filePath, temporaryDirectory) {
  const outputPath = path.join(temporaryDirectory, 'document.txt');
  await run('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, outputPath]);
  const raw = await readFile(outputPath, 'utf8');
  const pages = raw.split('\f');
  const blocks = [];
  pages.forEach((pageText, pageIndex) => {
    cleanText(pageText).split(/\n{2,}/).forEach((paragraph) => {
      if (cleanText(paragraph)) blocks.push({ type: 'paragraph', text: paragraph, page: pageIndex + 1 });
    });
  });
  return blocks;
}

async function scanWithClamAv(filePath) {
  const host = process.env.CLAMAV_HOST || 'clamav';
  const port = numberEnv('CLAMAV_PORT', 3310, 1, 65535);
  const socket = net.createConnection({ host, port });
  const response = [];
  socket.setTimeout(numberEnv('CLAMAV_TIMEOUT_MS', 120000, 1000, 600000));

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('ClamAV timeout')));
  });

  socket.on('data', (chunk) => response.push(chunk));
  socket.write('zINSTREAM\0');
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(chunk.length);
    socket.write(size);
    socket.write(chunk);
  }
  socket.write(Buffer.alloc(4));
  socket.end();

  await new Promise((resolve, reject) => {
    socket.once('close', resolve);
    socket.once('error', reject);
  });
  const message = Buffer.concat(response).toString('utf8').replace(/\0/g, '').trim();
  if (!message.endsWith('OK')) throw new Error(`ClamAV rejected file: ${message || 'unknown response'}`);
}

async function downloadSource(s3, source, outputPath) {
  requireValue(source?.bucket, 'source.bucket');
  requireValue(source?.key, 'source.key');
  const response = await s3.send(new GetObjectCommand({ Bucket: source.bucket, Key: source.key }));
  if (!response.Body) throw new Error('MinIO returned an empty response body');
  if (Number(response.ContentLength || 0) > MAX_SOURCE_BYTES) throw new Error('source exceeds WORKER_MAX_SOURCE_BYTES');
  await pipeline(response.Body, createWriteStream(outputPath));
}

async function validateMagic(filePath, expectedType) {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const value = header.subarray(0, bytesRead);
    if (expectedType === 'pdf' && !value.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('MIME/extension indicates PDF, but magic bytes do not');
    }
    if (expectedType === 'docx' && !value.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error('MIME/extension indicates DOCX, but magic bytes do not');
    }
  } finally {
    await handle.close();
  }
}

function validateJob(job) {
  for (const key of ['eId', 'workId', 'versionId']) requireValue(job[key], key);
  if (!job.source?.directText && !(job.source?.bucket && job.source?.key)) {
    throw new Error('source.directText or source.bucket/source.key is required');
  }
}

async function extractJob(job, s3) {
  validateJob(job);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'csa-content-'));
  try {
    if (job.source.directText) {
      return { blocks: directTextBlocks(job.source.directText), warnings: [] };
    }

    const originalName = job.source.originalName || job.source.key;
    const extension = path.extname(originalName).toLowerCase();
    const filePath = path.join(temporaryDirectory, `source${extension || '.bin'}`);
    await downloadSource(s3, job.source, filePath);
    await scanWithClamAv(filePath);

    if (extension === '.docx' || job.source.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      await validateMagic(filePath, 'docx');
      return docxBlocks(filePath);
    }
    if (extension === '.pdf' || job.source.mimeType === 'application/pdf') {
      await validateMagic(filePath, 'pdf');
      return { blocks: await pdfBlocks(filePath, temporaryDirectory), warnings: [] };
    }
    throw new Error(`unsupported file type: ${extension || job.source.mimeType || 'unknown'}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function persistExtraction(db, job, extraction) {
  const joinedText = extraction.blocks.map(({ text }) => cleanText(text)).join('\n');
  if (joinedText.length < MIN_TEXT_CHARS) {
    await db.collection('library_versions').updateOne(
      { _id: job.versionId, eId: job.eId },
      { $set: { status: 'unsupported_scan', extractionStatus: 'unsupported_scan', updatedAt: new Date() } }
    );
    await db.collection('processing_jobs').updateOne(
      { _id: job._id, lockedBy: WORKER_ID },
      {
        $set: {
          status: 'unsupported_scan',
          reason: 'Documentul nu conține suficient text selectabil.',
          finishedAt: new Date(),
          updatedAt: new Date()
        },
        $unset: { lockedBy: '', lockedAt: '' }
      }
    );
    return;
  }

  const generationId = randomUUID();
  const nodes = blocksToNodes(job, generationId, extraction.blocks);
  if (!nodes.length) throw new Error('Extraction produced no text nodes');

  await db.collection('text_nodes').insertMany(nodes, { ordered: false });
  await db.collection('text_anchors').bulkWrite(anchorsForNodes(nodes).map(({ node, contentHash, anchorKey }) => ({
    updateOne: {
      filter: { eId: job.eId, workId: job.workId, anchorKey },
      update: {
        $set: { minGrade: node.minGrade, updatedAt: new Date() },
        $setOnInsert: { _id: randomUUID(), eId: job.eId, workId: job.workId, anchorKey, type: node.type, contentHash, createdAt: new Date() },
        $addToSet: { targets: { versionId: job.versionId, nodeId: node._id } },
      },
      upsert: true,
    },
  })), { ordered: false });
  await db.collection('library_versions').updateOne(
    { _id: job.versionId, eId: job.eId },
    {
      $set: {
        status: 'review',
        extractionStatus: 'review',
        extractionGenerationId: generationId,
        extractionWarnings: extraction.warnings,
        extractedAt: new Date(),
        updatedAt: new Date()
      }
    }
  );
  await db.collection('text_nodes').deleteMany({
    eId: job.eId,
    versionId: job.versionId,
    generatedBy: 'content-worker',
    generationId: { $ne: generationId },
    status: 'draft'
  });
  await db.collection('library_works').updateOne(
    { _id: job.workId, eId: job.eId },
    { $set: { reviewVersionId: job.versionId, updatedAt: new Date() } }
  );
  await db.collection('processing_jobs').updateOne(
    { _id: job._id, lockedBy: WORKER_ID },
    {
      $set: {
        status: 'review',
        generationId,
        nodeCount: nodes.length,
        finishedAt: new Date(),
        updatedAt: new Date()
      },
      $unset: { lockedBy: '', lockedAt: '', error: '' }
    }
  );
}

async function completeProjectionJob(db, job, result) {
  await db.collection('processing_jobs').updateOne(
    { _id: job._id, lockedBy: WORKER_ID, status: 'processing' },
    {
      $set: { status: 'completed', result, finishedAt: new Date(), updatedAt: new Date() },
      $unset: { lockedBy: '', lockedAt: '', error: '' }
    }
  );
}

async function projectLibraryVersion(db, job, openSearch) {
  const workId = String(job.payload?.workId || '');
  const versionId = String(job.payload?.versionId || '');
  if (!job.eId || !workId || !versionId) throw new Error('project_library_version payload is invalid');
  const [work, version] = await Promise.all([
    db.collection('library_works').findOne({ _id: workId, eId: job.eId, status: 'published' }),
    db.collection('library_versions').findOne({ _id: versionId, workId, eId: job.eId, status: 'published' }),
  ]);
  if (!work || !version) throw new Error('Published work/version not found for OpenSearch projection');

  const indexName = tenantIndexName(job.eId);
  await openSearch(`${indexName}/_delete_by_query?refresh=true&conflicts=proceed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { query: { bool: { filter: [{ term: { eId: job.eId } }, { term: { workId } }] } } },
    allowedStatuses: [404],
    timeoutMs: 120000,
  });
  let indexed = 0;
  const cursor = db.collection('text_nodes').find(
    { eId: job.eId, workId, versionId, status: 'published' },
    { projection: { eId: 1, workId: 1, versionId: 1, type: 1, minGrade: 1, text: 1, page: 1, updatedAt: 1, publishedAt: 1 }, sort: { order: 1 } }
  );
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const response = await openSearch('_bulk?refresh=wait_for', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-ndjson' },
      body: bulkPayload(indexName, work, batch),
      timeoutMs: 120000,
    });
    if (response.body?.errors) {
      const firstError = response.body.items?.find((item) => item.index?.error)?.index?.error;
      throw new Error(`OpenSearch bulk projection failed: ${JSON.stringify(firstError || 'unknown error')}`);
    }
    indexed += batch.length;
    batch = [];
  };
  for await (const node of cursor) {
    batch.push(node);
    if (batch.length >= 500) await flush();
  }
  await flush();
  await completeProjectionJob(db, job, { target: 'opensearch', index: indexName, indexed, workId, versionId });
}

async function ensureArangoGraph(arango) {
  await arango('_api/gharial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      name: 'csa_concepts',
      edgeDefinitions: [{ collection: 'concept_relations', from: ['study_concepts'], to: ['study_concepts'] }],
    },
    allowedStatuses: [409],
  });
}

function arangoConceptDocument(concept) {
  return {
    _key: projectionKey(concept.eId, concept._id),
    sourceId: concept._id,
    eId: concept.eId,
    name: String(concept.name || ''),
    normalizedName: String(concept.normalizedName || ''),
    description: String(concept.description || ''),
    minGrade: Number(concept.minGrade || 1),
    status: concept.status,
    updatedAt: isoDate(concept.updatedAt || concept.createdAt || new Date()),
  };
}

async function upsertArangoConcept(arango, concept) {
  const key = projectionKey(concept.eId, concept._id);
  if (concept.status !== 'published') {
    await arango(`_api/document/study_concepts/${key}`, { method: 'DELETE', allowedStatuses: [404] });
    return { key, projected: false };
  }
  await arango('_api/document/study_concepts?overwriteMode=replace&waitForSync=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: arangoConceptDocument(concept),
  });
  return { key, projected: true };
}

async function projectConcepts(db, job, arango) {
  const conceptId = String(job.payload?.conceptId || '');
  const relationId = String(job.payload?.relationId || '');
  if (!job.eId || (!conceptId && !relationId) || (conceptId && relationId)) {
    throw new Error('project_concepts payload is invalid');
  }
  await ensureArangoGraph(arango);

  if (conceptId) {
    const concept = await db.collection('study_concepts').findOne({ _id: conceptId, eId: job.eId });
    if (!concept) throw new Error('Concept not found for ArangoDB projection');
    const projected = await upsertArangoConcept(arango, concept);
    await completeProjectionJob(db, job, { target: 'arangodb', kind: 'concept', sourceId: conceptId, ...projected });
    return;
  }

  const relation = await db.collection('concept_relations').findOne({ _id: relationId, eId: job.eId });
  if (!relation) throw new Error('Relation not found for ArangoDB projection');
  const concepts = await db.collection('study_concepts').find({
    _id: { $in: [relation.fromConceptId, relation.toConceptId] },
    eId: job.eId,
  }).toArray();
  if (concepts.length !== 2) throw new Error('Relation endpoints are missing for ArangoDB projection');
  for (const concept of concepts) {
    const result = await upsertArangoConcept(arango, concept);
    if (!result.projected) throw new Error('Relation endpoint is not published');
  }
  const relationKey = projectionKey(job.eId, relation._id);
  if (relation.status !== 'published') {
    await arango(`_api/document/concept_relations/${relationKey}`, { method: 'DELETE', allowedStatuses: [404] });
    await completeProjectionJob(db, job, { target: 'arangodb', kind: 'relation', sourceId: relationId, key: relationKey, projected: false });
    return;
  }
  await arango('_api/document/concept_relations?overwriteMode=replace&waitForSync=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      _key: relationKey,
      _from: `study_concepts/${projectionKey(job.eId, relation.fromConceptId)}`,
      _to: `study_concepts/${projectionKey(job.eId, relation.toConceptId)}`,
      sourceId: relation._id,
      eId: job.eId,
      type: relation.type,
      justification: String(relation.justification || ''),
      anchorId: relation.anchorId || null,
      minGrade: Number(relation.minGrade || 1),
      status: relation.status,
      createdAt: isoDate(relation.createdAt || new Date()),
    },
  });
  await completeProjectionJob(db, job, { target: 'arangodb', kind: 'relation', sourceId: relationId, key: relationKey, projected: true });
}

async function claimJob(db) {
  const stale = new Date(Date.now() - LOCK_MS);
  return db.collection('processing_jobs').findOneAndUpdate(
    {
      type: { $in: ['library_extract', ...PROJECT_JOB_TYPES] },
      $and: [
        { $or: [{ attempts: { $lt: MAX_ATTEMPTS } }, { attempts: { $exists: false } }] },
        { $or: [
          { type: 'library_extract', status: 'queued' },
          { type: { $in: PROJECT_JOB_TYPES }, status: { $in: ['pending', 'queued'] } },
          { type: { $in: ['library_extract', ...PROJECT_JOB_TYPES] }, status: 'processing', lockedAt: { $lt: stale } }
        ] }
      ]
    },
    {
      $set: { status: 'processing', lockedBy: WORKER_ID, lockedAt: new Date(), updatedAt: new Date() },
      $inc: { attempts: 1 }
    },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: 'after' }
  );
}

async function failJob(db, job, error) {
  const terminal = Number(job.attempts || 1) >= MAX_ATTEMPTS;
  if (terminal && job.type === 'library_extract') {
    await db.collection('library_versions').updateOne(
      { _id: job.versionId, eId: job.eId },
      { $set: { status: 'failed', extractionStatus: 'failed', updatedAt: new Date() } }
    );
  }
  await db.collection('processing_jobs').updateOne(
    { _id: job._id, lockedBy: WORKER_ID },
    {
      $set: {
        status: terminal ? 'failed' : (PROJECT_JOB_TYPES.includes(job.type) ? 'pending' : 'queued'),
        error: String(error?.message || error).slice(0, 4000),
        updatedAt: new Date(),
        ...(terminal ? { finishedAt: new Date() } : {})
      },
      $unset: { lockedBy: '', lockedAt: '' }
    }
  );
}

async function recoverExhaustedJobs(db) {
  const stale = new Date(Date.now() - LOCK_MS);
  const exhausted = await db.collection('processing_jobs').find({
    type: { $in: ['library_extract', ...PROJECT_JOB_TYPES] },
    status: 'processing',
    attempts: { $gte: MAX_ATTEMPTS },
    lockedAt: { $lt: stale }
  }).limit(20).toArray();
  for (const job of exhausted) {
    const now = new Date();
    const result = await db.collection('processing_jobs').updateOne(
      { _id: job._id, status: 'processing', attempts: { $gte: MAX_ATTEMPTS }, lockedAt: job.lockedAt },
      {
        $set: { status: 'failed', error: 'Workerul s-a oprit în timpul ultimei încercări.', finishedAt: now, updatedAt: now },
        $unset: { lockedBy: '', lockedAt: '' }
      }
    );
    if (result.modifiedCount === 1 && job.type === 'library_extract') {
      await db.collection('library_versions').updateOne(
        { _id: job.versionId, eId: job.eId },
        { $set: { status: 'failed', extractionStatus: 'failed', updatedAt: now } }
      );
    }
  }
}

async function processOne(db, services) {
  const job = await claimJob(db);
  if (!job) return false;
  const heartbeat = setInterval(() => {
    db.collection('processing_jobs').updateOne(
      { _id: job._id, lockedBy: WORKER_ID, status: 'processing' },
      { $set: { lockedAt: new Date(), updatedAt: new Date() } }
    ).catch(() => {});
  }, Math.max(10000, Math.floor(LOCK_MS / 3)));
  try {
    if (job.type === 'library_extract') {
      const extraction = await extractJob(job, services.s3);
      await persistExtraction(db, job, extraction);
    } else if (job.type === 'project_library_version') {
      await projectLibraryVersion(db, job, services.openSearch);
    } else if (job.type === 'project_concepts') {
      await projectConcepts(db, job, services.arango);
    } else {
      throw new Error(`Unsupported job type: ${job.type}`);
    }
  } catch (error) {
    await failJob(db, job, error);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

async function main() {
  const mongoUrl = requireValue(await readSecret('MONGO_URL', 'MONGO_URL_FILE'), 'MONGO_URL');
  const minioAccessKey = requireValue(await readSecret('MINIO_ACCESS_KEY', 'MINIO_ACCESS_KEY_FILE'), 'MINIO access key');
  const minioSecretKey = requireValue(await readSecret('MINIO_SECRET_KEY', 'MINIO_SECRET_KEY_FILE'), 'MINIO secret key');
  const openSearchPassword = requireValue(await readSecret('OPENSEARCH_PASSWORD', 'OPENSEARCH_PASSWORD_FILE'), 'OpenSearch password');
  const arangoPassword = requireValue(await readSecret('ARANGO_PASSWORD', 'ARANGO_PASSWORD_FILE'), 'ArangoDB password');
  const mongo = new MongoClient(mongoUrl, { appName: 'csa-content-worker', maxPoolSize: CONCURRENCY + 2 });
  await mongo.connect();
  const db = mongo.db(process.env.MONGO_DB || 'csa');
  const s3 = new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
    region: process.env.MINIO_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey }
  });
  const openSearch = serviceClient(
    process.env.OPENSEARCH_URL || 'https://opensearch:9200/',
    process.env.OPENSEARCH_USERNAME || 'admin',
    openSearchPassword,
    process.env.OPENSEARCH_TLS_REJECT_UNAUTHORIZED !== '0',
    'OpenSearch'
  );
  const arango = serviceClient(
    process.env.ARANGO_URL || 'http://arangodb:8529/_db/csa/',
    process.env.ARANGO_USERNAME || 'root',
    arangoPassword,
    true,
    'ArangoDB'
  );
  const services = { s3, openSearch, arango };

  await db.collection('processing_jobs').createIndex({ type: 1, status: 1, priority: -1, createdAt: 1 });
  await db.collection('processing_jobs').createIndex({ lockedAt: 1 });
  await db.collection('text_nodes').createIndex({ eId: 1, versionId: 1, order: 1 });

  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  await writeFile(HEALTH_FILE, new Date().toISOString(), { mode: 0o600 });
  const healthTimer = setInterval(() => {
    writeFile(HEALTH_FILE, new Date().toISOString(), { mode: 0o600 }).catch(() => {});
  }, 30000);
  let lastRecovery = 0;
  while (!stopping) {
    if (Date.now() - lastRecovery > 60000) {
      await recoverExhaustedJobs(db);
      lastRecovery = Date.now();
    }
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => processOne(db, services)));
    if (!results.some(Boolean)) await delay(POLL_MS);
  }
  clearInterval(healthTimer);
  await mongo.close();
}

main().catch((error) => {
  process.stderr.write(`content-worker fatal: ${error?.stack || error}\n`);
  process.exit(1);
});

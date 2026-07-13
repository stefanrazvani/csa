import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(root, path), 'utf8');
const publications = source('server/publications.js');
const reactive = source('server/reactive-publication.js');
const methods = source('server/methods.js');
const client = source('client/index.js');

assert.match(publications, /degreeSelector\.effectiveAt\s*=\s*\{\s*\$lte:\s*now\s*\}/);
assert.match(publications, /startAt:\s*\{\s*\$lte:\s*now\s*\}/);

const saveHandler = client.match(/async 'submit \.js-dossier-personal-form'[\s\S]*?\n\s*},\n\s*async 'submit \.js-dossier-event-form'/)?.[0] || '';
assert.match(saveHandler, /Meteor\.callAsync\('dossiers\.profile\.save'/);
assert.doesNotMatch(saveHandler, /Meteor\.callAsync\('membership\.upsert'/);
assert.doesNotMatch(saveHandler, /Meteor\.callAsync\('dossiers\.personal\.update'/);

assert.match(methods, /async 'dossiers\.profile\.save'/);
assert.match(methods, /withMongoTransaction\(async \(session\)/);
assert.match(methods, /LodgeMemberships\.rawCollection\(\)/);
assert.match(methods, /BrotherDossiers\.rawCollection\(\)/);
assert.match(methods, /'dossiers\.profile\.save'/);

for (const dependency of [
  'LodgeMemberships.find',
  'OfficeTerms.find',
  'OfficeDelegations.find',
  'Meteor.roleAssignment',
]) assert.ok(reactive.includes(dependency), `Lipsește observatorul ${dependency}`);
assert.ok(reactive.indexOf('stopData({ retract: true })') < reactive.indexOf('void runRecheck()'));
assert.match(reactive, /context\.onStop/);

console.log('dossiers-security-contract: ok');


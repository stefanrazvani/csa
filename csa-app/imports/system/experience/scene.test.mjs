import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getScenePreset } from './server/scenes.js';
import { normalizeExperienceManifest } from './client/manifest.js';
import { makeGeometry } from './client/engine.js';

test('all grades reach the renderer intact, retaining candles and removing extra desk columns', () => {
  for (const grade of [1, 2, 3]) {
    const raw = getScenePreset(grade);
    const scene = normalizeExperienceManifest(raw);
    assert.equal(scene.architecture.length, raw.architecture.length, `grade ${grade} must not truncate furniture`);
    assert.equal(new Set(scene.architecture.map(item => item.id)).size, scene.architecture.length);
    assert.ok(scene.architecture.every(item => !/^(vm-column-small-|warden[12]-column$)/.test(item.id)));
    for (const [prefix, count] of [['vm', 3], ['warden1', 2], ['warden2', 1]]) {
      assert.equal(scene.architecture.filter(item => item.id.startsWith(`${prefix}-candelabrum-candle-`)).length, count);
    }
    assert.ok(scene.architecture.some(item => item.id === 'bench-south-wall-west-stretcher'));
    // Exercise real geometry construction after wire normalization, including the new almond.
    for (const item of scene.architecture) {
      const mesh = makeGeometry(THREE, item.geometry);
      mesh.computeBoundingBox();
      assert.ok([...mesh.boundingBox.min.toArray(), ...mesh.boundingBox.max.toArray()].every(Number.isFinite), item.id);
      mesh.dispose();
    }
  }
});

test('side seating faces the aisle, reaches the floor and leaves the south warden gap', () => {
  const items = normalizeExperienceManifest(getScenePreset(2)).architecture;
  for (const [side, sign] of [['north', 1], ['south', -1]]) {
    const seat = items.find(item => item.id === `seat-${side}-front-1`);
    const post = items.find(item => item.id === `seat-${side}-front-1-back-post-0`);
    const leg = items.find(item => item.id === `seat-${side}-front-1-leg-front-0`);
    assert.ok((leg.position[0] - post.position[0]) * sign > 0, 'backrest must face the wall');
    assert.equal(leg.position[1] - leg.scale[1] / 2, 0, 'leg rests on floor');
    assert.ok(seat.position[1] - seat.scale[1] / 2 > 0.4, 'space beneath seat');
  }
  const east = items.find(item => item.id === 'bench-south-wall-east');
  const west = items.find(item => item.id === 'bench-south-wall-west');
  assert.ok(east.position[2] + east.scale[0] / 2 < -0.8);
  assert.ok(west.position[2] - west.scale[0] / 2 > 1.5);
});

test('eye has almond silhouette and distinct relief layers; manifest remains bounded', () => {
  const raw = getScenePreset(2);
  const scene = normalizeExperienceManifest(raw);
  const eye = scene.architecture.find(item => item.id === 'delta-eye');
  assert.equal(eye.geometry.type, 'almond');
  const mesh = makeGeometry(THREE, eye.geometry);
  mesh.computeBoundingBox();
  const size = mesh.boundingBox.getSize(new THREE.Vector3());
  assert.ok(size.x > size.y * 2 && size.z < size.y / 4);
  mesh.dispose();
  const ids = ['delta-inset', 'delta-eye', 'delta-iris', 'delta-pupil', 'delta-eye-glint'];
  const depths = ids.map(id => scene.architecture.find(item => item.id === id).position[2]);
  assert.ok(depths.every((depth, index) => index === 0 || depth > depths[index - 1]));
  assert.equal(normalizeExperienceManifest({ ...raw, architecture: Array(1000).fill(raw.architecture[0]) }).architecture.length, 768);
});

test('plumb remains thin after normalization and warden candles rotate with their arm', () => {
  for (const grade of [1, 2, 3]) {
    const items = normalizeExperienceManifest(getScenePreset(grade)).architecture;
    const find = id => items.find(item => item.id === id);
    const cord = find('plumb-cord');
    const geometry = makeGeometry(THREE, cord.geometry);
    geometry.scale(...cord.scale);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x < 0.009 && size.z < 0.009 && size.y > 3.99 && size.y < 4.01);
    geometry.dispose();
    const first = find('warden1-candelabrum-candle-0');
    const second = find('warden1-candelabrum-candle-1');
    const direction = new THREE.Vector3().fromArray(second.position).sub(new THREE.Vector3().fromArray(first.position));
    assert.ok(Math.abs(direction.length() - 0.24) < 1e-9);
    assert.ok(Math.abs(Math.atan2(-direction.z, direction.x) - Math.PI / 4) < 1e-9);
    const arm = find('warden1-candelabrum-arm');
    const axis = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...arm.rotation));
    assert.ok(Math.abs(axis.dot(direction.normalize())) > 0.9999, 'arm connects rotated candle positions');
    for (const index of [0, 1]) {
      const candle = find(`warden1-candelabrum-candle-${index}`);
      const flame = find(`warden1-candelabrum-flame-${index}`);
      assert.equal(candle.position[0], flame.position[0]);
      assert.equal(candle.position[2], flame.position[2]);
    }
    const shaft = find('pillar-wisdom-se-shaft');
    assert.equal(shaft.geometry.type, 'flutedColumn');
    const column = makeGeometry(THREE, shaft.geometry);
    const radii = Array.from({ length: shaft.geometry.flutes * 6 }, (_, index) => Math.hypot(column.attributes.position.getX(index), column.attributes.position.getZ(index)));
    assert.ok(Math.max(...radii) - Math.min(...radii) > 0.01, 'flutes are carved into shaft geometry');
    column.dispose();
    assert.equal(items.filter(item => item.id.startsWith('sun-ray-')).length, 24);
    assert.equal(items.filter(item => item.id.startsWith('pillar-wisdom-se-volute-') && item.geometry.type === 'spiral').length, 4);
  }
});

test('zodiac follows the supplied ritual sides and panels face the room in every grade', () => {
  const north = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo'];
  const south = ['libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  for (const grade of [1, 2, 3]) {
    const scene = normalizeExperienceManifest(getScenePreset(grade));
    const signs = scene.architecture.filter(item => item.geometry.type === 'plane' && item.material.map.startsWith('zodiac-'));
    assert.equal(signs.length, 12);
    for (const [ids, side] of [[north, -1], [south, 1]]) for (const id of ids) {
      const panel = signs.find(item => item.id === `zodiac-${id}`);
      assert.ok(panel.position[0] * side > 8);
      assert.ok(panel.position[1] > 5.5 && panel.position[1] < 6.6);
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...panel.rotation));
      assert.ok(normal.x * side < -0.99, 'glyph must face the aisle');
      assert.equal(scene.architecture.find(item => item.id === `zodiac-support-${id}`).position[2], panel.position[2]);
    }
    const candles = scene.architecture.filter(item => /-candle(?:-\d+)?$/.test(item.id));
    assert.equal(candles.length, 9, '3 pillar candles and 3/2/1 on desks');
    const flames = scene.architecture.filter(item => /-flame(?:-\d+)?$/.test(item.id));
    assert.equal(flames.length, 9);
    assert.ok(candles.every(item => item.geometry.type === 'lathe'));
    assert.ok(flames.every(item => item.geometry.type === 'lathe' && item.geometry.profile.length >= 16));
    assert.equal(scene.architecture.filter(item => /-wick(?:-\d+)?$/.test(item.id)).length, 9);
    assert.equal(scene.architecture.filter(item => /pillar-beauty-sw-leaf-(low|up)-/.test(item.id)).length, 16);
  }
  const unknown = normalizeExperienceManifest({ architecture: [{ geometry: { type: 'plane' }, material: { map: 'zodiac-untrusted' } }] });
  assert.equal(unknown.architecture[0].material.map, '');
});

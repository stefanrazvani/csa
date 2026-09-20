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

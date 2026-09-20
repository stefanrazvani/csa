import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addTempleDiscovery } from './server/discovery.js';
import { getScenePreset } from './server/scenes.js';
import { normalizeExperienceManifest } from './client/manifest.js';
import { ExperienceRenderer } from './client/engine.js';
import { makeGeometry } from './client/engine.js';

function manifest(grade) {
  return normalizeExperienceManifest(addTempleDiscovery(getScenePreset(grade), grade));
}
function renderer(scene) {
  const value = Object.create(ExperienceRenderer.prototype);
  Object.assign(value, { THREE, manifest: scene, stage: new THREE.Group(), interactiveMeshes: [], interactiveGroups: new Map(),
    raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), quality: 'low', camera: new THREE.PerspectiveCamera(45, 1, .01, 100),
    renderer: { domElement: { getBoundingClientRect: () => ({left:0, top:0, width:100, height:100}) } } });
  return value;
}

test('small ritual objects and the reserved grand-master chair have distinct degree-scoped targets', () => {
  for(const grade of [1,2,3]) {
    const scene=manifest(grade), part=id=>scene.architecture.find(item=>item.id===id);
    assert.equal(part('grand-master-seat-back').interactionId,'discover-grand-master-seat');
    assert.notEqual(part('grand-master-seat-back').interactionId,part('vm-throne-seat-back').interactionId);
    assert.ok(part('grand-master-seat').position[0]<part('vm-throne-seat').position[0]);
    for(const [mesh,key] of [['study-rough-stone','rough-stone'],['study-cubic-stone','cubic-stone'],['study-mallet-head','mallet'],['study-chisel-edge','chisel']]) assert.equal(part(mesh).interactionId,`discover-${key}`);
    for(const key of ['ruler','lever','working-square','working-compass']) assert.equal(scene.interactives.some(item=>item.id===`discover-${key}`),grade>=2);
    assert.equal(!!part('study-wheat-stem'),grade===2); assert.equal(!!part('study-cubic-stone-point'),grade===2);
    assert.equal(!!part('study-acacia-stem'),grade===3); assert.equal(!!part('study-trowel-blade'),grade===3);
    if(grade===3) assert.match(scene.interactives.find(item=>item.id==='discover-trowel').sourceRef,/fără atestare/);
    const stone=part('study-rough-stone'), roughGeometry=makeGeometry(THREE,stone.geometry); roughGeometry.computeBoundingBox();
    assert.ok(Math.abs(stone.position[1]+roughGeometry.boundingBox.min.y-.24)<1e-6); roughGeometry.dispose();
    const cube=part('study-cubic-stone'); assert.ok(Math.abs(cube.position[1]-cube.scale[1]/2-.48)<1e-8);
    assert.ok(stone.position[0]<0 && cube.position[0]>0 && cube.scale[0]<.5);
    for (const [object, stepId] of [[stone,'orient-step-north-low'],[cube,'orient-step-south-mid'], ...(grade===2 ? [[part('study-cubic-stone-point'),'orient-step-south-mid']] : [])]) {
      const step=part(stepId), mesh=new THREE.Mesh(makeGeometry(THREE,object.geometry));
      mesh.position.fromArray(object.position); mesh.rotation.fromArray(object.rotation); mesh.scale.fromArray(object.scale); mesh.updateMatrixWorld();
      const box=new THREE.Box3().setFromObject(mesh, true);
      assert.ok(box.min.x>=step.position[0]-step.scale[0]/2 && box.max.x<=step.position[0]+step.scale[0]/2, 'stone stays fully over its step');
      assert.ok(box.min.z>=step.position[2]-step.scale[2]/2 && box.max.z<=step.position[2]+step.scale[2]/2, 'stone does not overhang the tread');
      assert.ok(step.position[0]<0 ? box.min.x>step.position[0]+.4 : box.max.x<step.position[0]-.4, 'stone leaves the middle of the stairs clear, towards the altar');
      mesh.geometry.dispose();
    }
    if (grade===2) {
      const tip=part('study-cubic-stone-point');
      assert.equal(tip.position[0],cube.position[0]); assert.equal(tip.position[2],cube.position[2]);
      assert.ok(Math.abs(tip.position[1]-tip.geometry.height/2-cube.position[1]-cube.scale[1]/2)<1e-8);
    }
    for(const id of ['tyler','expert']) {
      assert.equal(part(`${id}-sword-blade`).geometry.type,'blade');
      assert.equal(part(`${id}-sword-pommel`).interactionId,`discover-${id}-sword`);
      assert.ok(scene.architecture.filter(item=>item.id.startsWith(`${id}-sword-`)).every(item=>item.interactionId===`discover-${id}-sword`));
    }
    const square=part('vsl-square'),left=part('vsl-compass'),right=part('vsl-compass-arm');
    assert.equal(part('vsl-square-arm').interactionId,'discover-square');
    assert.equal(part('vsl-compass-hinge').interactionId,'discover-compass');
    assert.equal([left,right].filter(leg=>leg.position[1]>square.position[1]).length,grade-1);
  }
});

test('star and plumb clear the book in the actual initial camera projection', () => {
  const scene=manifest(2), part=id=>scene.architecture.find(item=>item.id===id);
  const camera=new THREE.PerspectiveCamera(45,16/9,.1,100);
  camera.position.fromArray(scene.environment.camera); camera.lookAt(...scene.environment.target); camera.updateMatrixWorld();
  const bounds=id=>{
    const p=part(id),m=new THREE.Mesh(makeGeometry(THREE,p.geometry));m.position.fromArray(p.position);m.rotation.fromArray(p.rotation);m.scale.fromArray(p.scale);m.updateMatrixWorld();
    const b=new THREE.Box3().setFromObject(m), ys=[];
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])ys.push(new THREE.Vector3(x,y,z).project(camera).y);
    m.geometry.dispose();return [Math.min(...ys),Math.max(...ys)];
  };
  const star=bounds('flaming-star'),book=bounds('vsl-page-north'),bob=bounds('plumb-bob');
  assert.ok(star[1]<book[0]-.025,'star below book in screen space');
  assert.ok(bob[0]>book[1]+.08,'plumb above book in screen space');
  const cord=part('plumb-cord');assert.ok(Math.abs(cord.position[1]+cord.geometry.height/2-7.2)<1e-8);
  assert.ok(Math.abs(cord.position[1]-cord.geometry.height/2-(part('plumb-bob').position[1]+.15))<.02);
});

test('discovery covers real symbols and sends only the selected degree, within bounds', () => {
  for (const grade of [1,2,3]) {
    const raw = addTempleDiscovery(getScenePreset(grade), grade);
    const scene = normalizeExperienceManifest(raw);
    assert.equal(scene.interactives.length, raw.interactives.length);
    const items = scene.interactives.filter(item => item.presentation === 'architecture');
    assert.ok(items.length >= 36);
    assert.equal(new Set(scene.interactives.map(item => item.id)).size, scene.interactives.length);
    for (const item of items) {
      assert.ok(item.description && item.sourceRef && item.education.prompt);
      assert.ok(item.education.sections.length);
      assert.ok(scene.architecture.some(part => part.interactionId === item.id) || [scene.environment.floor.interactionId, scene.environment.floor.borderInteractionId].includes(item.id), item.id);
    }
    for (const part of scene.architecture.filter(part => part.interactionId)) assert.ok(items.some(item => item.id === part.interactionId));
    for (const [id, target] of [['pillar-wisdom-se-shaft','discover-wisdom'], ['pillar-strength-nw-shaft','discover-strength'], ['pillar-beauty-sw-shaft','discover-beauty'], ['sun-disc','discover-sun'], ['moon-disc','discover-moon'], ['plumb-bob','discover-plumb']]) {
      assert.equal(scene.architecture.find(part => part.id === id)?.interactionId, target, id);
    }
    assert.equal(items.filter(item => item.id.startsWith('discover-zodiac-')).length,12);
    assert.equal(items.some(item => item.id === 'discover-star'), grade === 2);
    assert.equal(items.some(item => item.id === 'discover-globe-b'), grade >= 2);
    const serialized = JSON.stringify(items);
    if (grade === 1) assert.doesNotMatch(serialized, /Ritualul Calfei|Ritualul Maestrului|ambele brațe|un braț al Compasului/);
    if (grade === 2) assert.doesNotMatch(serialized, /Ritualul Maestrului|Camera de Mijloc|ambele brațe ale Compasului sunt/);
  }
  assert.deepEqual(addTempleDiscovery(getScenePreset(0),0),getScenePreset(0));
});

test('raycasting selects actual geometry, does not add proxy objects, and respects occlusion', () => {
  const scene = manifest(1);
  const engine = renderer(scene);
  const sun = scene.architecture.find(part => part.id === 'sun-disc');
  engine.createArchitecture(sun);
  assert.equal(engine.stage.children.length,1);
  engine.createInteractive(scene.interactives.find(item => item.id === 'discover-sun'),0);
  assert.equal(engine.stage.children.length,1);
  const mesh = engine.stage.children[0];
  engine.camera.position.set(...sun.position); engine.camera.position.z += 3;
  engine.camera.lookAt(new THREE.Vector3(...sun.position)); engine.camera.updateMatrixWorld();
  engine.stage.updateMatrixWorld(true);
  assert.equal(engine.pick({clientX:50,clientY:50})?.item?.id,'discover-sun');
  const original = { color: mesh.material.emissive.getHex(), intensity:mesh.material.emissiveIntensity, scale:mesh.scale.toArray(), pos:mesh.position.toArray() };
  engine.selectInteraction('discover-sun');
  assert.notEqual(mesh.material.emissive.getHex(),original.color);
  assert.deepEqual(mesh.scale.toArray(),original.scale); assert.deepEqual(mesh.position.toArray(),original.pos);
  engine.selectInteraction('');
  assert.equal(mesh.material.emissive.getHex(),original.color); assert.equal(mesh.material.emissiveIntensity,original.intensity);
  engine.createArchitecture({ ...sun, id:'blocker', interactionId:'', position:[sun.position[0],sun.position[1],sun.position[2]+1], geometry:{type:'box',width:2,height:2,depth:.1}, scale:[1,1,1] });
  engine.stage.updateMatrixWorld(true);
  assert.equal(engine.pick({clientX:50,clientY:50}),null);
});

test('floor and border have separate targets and reset highlights without shared-material spill', () => {
  const scene = manifest(1), engine = renderer(scene);
  engine.createFloor(scene.environment.floor);
  const tiles = engine.interactiveMeshes.filter(mesh => mesh.userData.interaction?.item.id === 'discover-mosaic');
  const borders = engine.interactiveMeshes.filter(mesh => mesh.userData.interaction?.item.id === 'discover-border');
  assert.equal(tiles.length,40); assert.equal(borders.length,4);
  const originalBorder = borders[0].material.emissiveIntensity;
  engine.selectInteraction('discover-mosaic');
  assert.equal(borders[0].material.emissiveIntensity,originalBorder);
  assert.ok(tiles.every(mesh => mesh.material.emissiveIntensity >= .45));
  engine.selectInteraction('discover-border');
  assert.ok(tiles.every(mesh => mesh.material.emissive.getHex() === 0 && mesh.material.emissiveIntensity === mesh.userData.originalEmissiveIntensity));
  assert.ok(borders.every(mesh => mesh.material.emissiveIntensity >= .45));
  engine.camera.position.set(.35,5,scene.environment.floor.carpet.z);
  engine.camera.lookAt(.35,0,scene.environment.floor.carpet.z); engine.camera.updateMatrixWorld(); engine.stage.updateMatrixWorld(true);
  assert.equal(engine.pick({clientX:50,clientY:50})?.item?.id,'discover-mosaic');
});

test('unresolved bindings are inert and normalization keeps only bounded plain text', () => {
  const scene = manifest(1), engine = renderer(scene);
  const item = {...scene.architecture[0], interactionId:'not-authorized'};
  engine.createArchitecture(item);
  assert.equal(engine.stage.children[0].userData.interaction,undefined);
  const normalized = normalizeExperienceManifest({interactives:Array.from({length:120}, (_,i) => ({id:`x-${i}`,label:'x',presentation:'architecture',education:{sections:Array(10).fill({title:'t',body:'x'.repeat(1000)})}}))});
  assert.equal(normalized.interactives.length,96);
  assert.equal(normalized.interactives[0].education.sections.length,5);
  assert.equal(normalized.interactives[0].education.sections[0].body.length,800);
});


test('officer desks, seats, swords and staff resolve to educational cards, without operational access', () => {
  const targets = {
    'vm-table-top':'office-venerable', 'vm-throne-seat-back':'office-venerable',
    'warden1-desk':'office-first_warden', 'warden2-chair-back':'office-second_warden',
    'secretary-desk-top':'office-secretary', 'orator-desk':'office-orator',
    'treasurer-table':'office-treasurer', 'hospitalier-chair':'office-hospitalier',
    'seat-north-front-1':'office-expert', 'seat-north-front-1-back':'office-expert',
    'mc-seat':'office-master_of_ceremonies', 'tyler-seat':'office-tyler',
    'tyler-sword-blade':'tyler-sword', 'expert-sword-guard':'expert-sword', 'mc-sceptre-head':'mc-staff',
    'seat-north-front-2':'seating-north', 'bench-north-wall':'seating-north',
    'seat-south-front-1':'seating-south', 'bench-south-wall-east':'seating-south', 'bench-south-wall-west':'seating-south',
  };
  for(const grade of [1,2,3]) {
    const scene=manifest(grade);
    assert.equal(scene.interactives.filter(item=>item.presentation==='architecture').length,{1:56,2:64,3:64}[grade]);
    for(const [mesh,key] of Object.entries(targets)) {
      assert.equal(scene.architecture.find(part=>part.id===mesh)?.interactionId,`discover-${key}`,mesh);
      const item=scene.interactives.find(item=>item.id===`discover-${key}`);
      assert.equal(item.kind,'symbol'); assert.equal(item.route,'/biblioteca'); assert.ok(!item.capabilities);
    }
    const north=scene.interactives.find(item=>item.id==='discover-seating-north');
    const south=scene.interactives.find(item=>item.id==='discover-seating-south');
    if(grade===1) { assert.match(north.label,/Ucenicilor/); assert.match(south.label,/Calfelor/); }
    if(grade===2) { assert.doesNotMatch(north.label,/Ucenicilor/); assert.match(JSON.stringify(north.education),/nu participă Ucenici/); }
    if(grade===3) { assert.match(north.label,/Maeștri/); assert.match(south.label,/Maeștri/); }
  }
});

test('each shared physical element has distinct object-specific study content at each degree', () => {
  const scenes=[1,2,3].map(manifest);
  for(const item of scenes[0].interactives.filter(item=>item.presentation==='architecture')) {
    const bodies=scenes.map(scene=>scene.interactives.find(other=>other.id===item.id).education.sections.find(section=>section.title.startsWith('Studiu propus')).body);
    assert.equal(new Set(bodies).size,3,item.id);
    assert.ok(bodies.every(body=>body.length>50));
  }
});

test('fellowcraft star stands in front of the altar and all four desk tops sit flat on their bodies', () => {
  for(const grade of [1,2,3]) {
    const scene=manifest(grade); const part=id=>scene.architecture.find(item=>item.id===id);
    for(const [bodyId,topId] of [['secretary-desk','secretary-desk-top'],['orator-desk','orator-desk-top'],['hospitalier-table','hospitalier-desk-top'],['treasurer-table','treasurer-desk-top']]) {
      const body=part(bodyId),top=part(topId);
      assert.deepEqual(top.rotation,[0,0,0]);
      assert.ok(Math.abs(top.position[1]-top.scale[1]/2-(body.position[1]+body.scale[1]/2))<1e-9);
      assert.ok(top.scale[0]>body.scale[0] && top.scale[2]>body.scale[2]);
    }
    if(grade!==2){assert.equal(part('flaming-star'),undefined);continue;}
    const star=part('flaming-star'),altar=part('altar-top');
    assert.ok(star.position[2]>altar.position[2]+altar.scale[2]/2+.5);
    assert.ok(star.position[1]+star.geometry.radius<altar.position[1]); assert.equal(part('flaming-star-base').position[1],.05);
    assert.equal(part('flaming-star-support').interactionId,'discover-star');
    assert.ok(part('flaming-star-support').position[1]+part('flaming-star-support').geometry.height/2 >= star.position[1]-.001);
    assert.equal(part('flaming-star-heart').position[1],star.position[1]);
  }
});

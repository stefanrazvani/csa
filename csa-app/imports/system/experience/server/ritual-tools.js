// Small, physical study objects. The ceremonial arrangement is not activated here.
export function ceremonialSword(p, id, x, z) {
  const metal = { metalness:.8, roughness:.28 };
  const brass = { metalness:.65, roughness:.35 };
  const items = [
    p(`${id}-blade`, 'blade', [x,.95,z], [1,1,1], '#dce4e8', {geometry:{width:.115,height:1.2,depth:.026},...metal}),
    p(`${id}-fuller`, 'box', [x,1.04,z+.017], [.018,.9,.006], '#7e929f', metal),
    p(`${id}-guard`, 'box', [x,1.58,z], [.34,.045,.085], '#d2b06a', brass),
    p(`${id}-grip`, 'cylinder', [x,1.73,z], [1,1,1], '#32282b', {geometry:{radiusTop:.031,radiusBottom:.036,height:.25,segments:16},roughness:.9}),
    p(`${id}-pommel`, 'sphere', [x,1.91,z], [.8,1,.65], '#d2b06a', {geometry:{size:.065,segments:20},...brass}),
  ];
  for (const side of [-1,1]) items.push(p(`${id}-quillon-${side<0 ? "left" : "right"}`, 'sphere', [x+side*.17,1.56,z], [1,.8,.7], '#d2b06a', {geometry:{size:.04,segments:12},...brass}));
  for (let n=0;n<5;n++) items.push(p(`${id}-grip-band-${n}`, 'torus', [x,1.63+n*.046,z], [1,1,1], '#786052', {geometry:{radius:.034,tube:.004,segments:16},rotation:[Math.PI/2,0,0],roughness:.8}));
  return items;
}

// Two arms at 90 degrees, laid in the XZ plane, opening towards Orient.
export function squareTool(p, id, x, y, z, length=.4) {
  return [-1,1].map((side,index)=>p(index ? `${id}-arm` : id,'box',
    [x+side*length*.354,y,z-length*.354],[length,.025,.045],'#cbb779',
    {rotation:[0,side*Math.PI/4,0],metalness:.65,roughness:.32}));
}

// Two compass legs at 60 degrees; independently layered over/under the square.
export function compassTool(p, id, x, y, z, length=.42, grade=3) {
  const result = [-1,1].map((side,index)=>p(index ? `${id}-arm` : id,'box',
    [x+side*length*.25,y+(grade===1 ? -.045 : grade===2 && side===1 ? -.045 : .045),z+length*.433],
    [length,.018,.028],'#e3c775',{rotation:[0,-side*Math.PI/3,0],metalness:.7,roughness:.3}));
  result.push(p(`${id}-hinge`,'cylinder',[x,y+.01,z],[1,1,1],'#b58a42',{geometry:{radiusTop:.035,radiusBottom:.035,height:.045,segments:16},metalness:.7}));
  return result;
}

export function ritualTools(p, grade) {
  const steel={metalness:.7,roughness:.35};
  const items=[
    // Stones rest at the inner ends of the Orient steps, next to the altar.
    p('study-rough-stone','roughStone',[-2.85,.44,-6.4],[1,1,1],'#858881',{geometry:{size:.29},roughness:1}),
    p('study-cubic-stone','box',[2.85,.68,-7.1],[.4,.4,.4],'#b2ac97',{roughness:.86}),
    p('study-mallet-handle','box',[-1.5,.09,-6.2],[.045,.05,.42],'#806345'),
    p('study-mallet-head','cylinder',[-1.5,.11,-6.4],[1,1,1],'#806345',{geometry:{radiusTop:.09,radiusBottom:.09,height:.27,segments:16},rotation:[0,0,Math.PI/2]}),
    p('study-chisel-shaft','box',[-1.15,.055,-6.28],[.055,.05,.4],'#9ba9b2',steel),
    p('study-chisel-edge','blade',[-1.15,.055,-6.53],[1,1,1],'#d5dce0',{geometry:{width:.09,height:.12,depth:.02},rotation:[Math.PI/2,0,0],...steel}),
  ];
  if(grade>=2) {
    // Educational presentation by S1, based on Calfa p.30; no ceremony is simulated.
    items.push(p('study-tools-tray','box',[-4.5,.04,5.4],[1.7,.08,1.35],'#353238'));
    items.push(...squareTool(p,'study-square',-4.85,.13,5.86,.48));
    items.push(...compassTool(p,'study-compass',-4.08,.17,5.08,.5));
    items.push(p('study-ruler','box',[-4.95,.11,5.05],[.85,.03,.07],'#c1a36c'));
    for(let n=0;n<9;n++) items.push(p(`study-ruler-mark-${n}`,'box',[-5.32+n*.092,.13,5.05],[.008,.004,n%2?.025:.05],'#352f27'));
    items.push(p('study-lever','cylinder',[-4.35,.11,5.95],[1,1,1],'#88949a',{geometry:{radiusTop:.025,radiusBottom:.025,height:.62,segments:12},rotation:[0,0,Math.PI/2],...steel}));
    items.push(p('study-lever-toe','box',[-4.67,.125,5.95],[.11,.035,.07],'#bac7cc',{rotation:[0,0,-.3],...steel}));
  }
  if(grade===2) {
    items.push(p('study-cubic-stone-point','cone',[2.85,1.015,-7.1],[1,1,1],'#b2ac97',{geometry:{radius:.283,height:.27,segments:4},rotation:[0,Math.PI/4,0]}));
    items.push(p('study-wheat-stem','cylinder',[2.9,.3,8.15],[.5,1,.5],'#cbb36f',{geometry:{radiusTop:.02,radiusBottom:.02,height:.6,segments:8}}));
    for(let n=0;n<4;n++) for(const sign of [-1,1]) items.push(p(`study-wheat-grain-${n}-${sign<0 ? "left" : "right"}`,'sphere',[2.9+sign*.034,.43+n*.05,8.15],[.33,.65,.25],'#e4cb85',{geometry:{size:.08,segments:10},rotation:[0,0,-sign*.45]}));
  }
  if(grade===3) {
    // Supplemental trowel requested by the lodge, not attributed to these rituals.
    items.push(p('study-trowel-blade','star',[1.3,.06,-5.5],[1,1,1],'#bdc9cf',{geometry:{points:3,radius:.21,innerRadius:.105,depth:.02},rotation:[-Math.PI/2,0,0],...steel}));
    items.push(p('study-trowel-neck','box',[1.3,.11,-5.32],[.026,.08,.15],'#8999a3',steel));
    items.push(p('study-trowel-handle','cylinder',[1.3,.16,-5.17],[1,1,1],'#8f6646',{geometry:{radiusTop:.033,radiusBottom:.042,height:.23,segments:16},rotation:[Math.PI/2,0,0]}));
    items.push(p('study-acacia-stem','box',[.02,.145,1.4],[.014,.02,.48],'#665439'));
    for(let n=0;n<5;n++) for(const side of [-1,1]) items.push(p(`study-acacia-leaf-${n}-${side<0 ? "left" : "right"}`,'almond',[side*.06,.16,1.22+n*.08],[1,1,1],'#8d9e62',{geometry:{width:.11,height:.04,depth:.01},rotation:[-Math.PI/2,0,side*.4]}));
  }
  return items;
}

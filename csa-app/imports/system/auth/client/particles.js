const COLOR = { r: 54, g: 127, b: 169 };

export function startNovaParticles(canvas) {
  if (!canvas) return () => {};
  const context = canvas.getContext('2d');
  let frameId = 0;
  let width = 0;
  let height = 0;
  let ratio = 1;
  const particles = [];

  function createParticle(x = Math.random() * width, y = Math.random() * height) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.35 + Math.random() * 0.75;
    return { x, y, radius: 1 + Math.random() * 2.3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(rect.width, 1);
    height = Math.max(rect.height, 1);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    while (particles.length < 40) particles.push(createParticle());
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0 || particle.x > width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > height) particle.vy *= -1;
      particle.x = Math.max(0, Math.min(width, particle.x));
      particle.y = Math.max(0, Math.min(height, particle.y));

      context.beginPath();
      context.fillStyle = `rgba(${COLOR.r},${COLOR.g},${COLOR.b},0.55)`;
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();

      for (let targetIndex = index + 1; targetIndex < particles.length; targetIndex += 1) {
        const target = particles[targetIndex];
        const dx = particle.x - target.x;
        const dy = particle.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 230) {
          context.beginPath();
          context.strokeStyle = `rgba(${COLOR.r},${COLOR.g},${COLOR.b},${0.34 * (1 - distance / 230)})`;
          context.lineWidth = 1.4;
          context.moveTo(particle.x, particle.y);
          context.lineTo(target.x, target.y);
          context.stroke();
        }
      }
    }
    frameId = window.requestAnimationFrame(draw);
  }

  function addParticles(event) {
    const rect = canvas.getBoundingClientRect();
    for (let index = 0; index < 4; index += 1) particles.push(createParticle(event.clientX - rect.left, event.clientY - rect.top));
    if (particles.length > 70) particles.splice(0, particles.length - 70);
  }

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('click', addParticles);
  frameId = window.requestAnimationFrame(draw);
  return () => {
    window.cancelAnimationFrame(frameId);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('click', addParticles);
  };
}

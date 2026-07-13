const loginPanel = document.getElementById('loginPanel');
const showLogin = document.getElementById('showLogin');
const closeLogin = document.getElementById('closeLogin');
const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const message = document.getElementById('message');
const registerPanel = document.getElementById('registerPanel');
const forgotPanel = document.getElementById('forgotPanel');
const resetPanel = document.getElementById('resetPanel');

function setLoginVisible(visible) {
  loginPanel.hidden = !visible;
  if (visible) document.getElementById('email').focus();
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = !text;
}

showLogin.addEventListener('click', () => setLoginVisible(true));
closeLogin.addEventListener('click', () => setLoginVisible(false));

const currentPath = window.location.pathname;
if (currentPath === '/inregistrare') registerPanel.hidden = false;
else if (currentPath === '/recuperare-parola') forgotPanel.hidden = false;
else if (currentPath === '/reset-password') resetPanel.hidden = false;
else if (new URLSearchParams(window.location.search).get('login') === 'required') setLoginVisible(true);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');
  loginButton.disabled = true;
  loginButton.textContent = 'Se verifică…';
  const form = new FormData(loginForm);
  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Autentificarea nu a reușit.');
    window.location.assign(result.redirect || '/portal/');
  } catch (error) {
    showMessage(error.message || 'Autentificarea nu a reușit.');
    loginButton.disabled = false;
    loginButton.textContent = 'Autentificare';
  }
});

function formMessage(element, text, success = false) {
  element.textContent = text;
  element.hidden = !text;
  element.style.background = success ? '#d1e7dd' : '#f8d7da';
  element.style.color = success ? '#0f5132' : '#842029';
}

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const output = document.getElementById('registerMessage');
  if (values.password !== values.confirmPassword) return formMessage(output, 'Parolele introduse nu coincid.');
  const button = document.getElementById('registerButton');
  button.disabled = true;
  try {
    const response = await fetch('/auth/register', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Înregistrarea nu a reușit.');
    event.currentTarget.reset();
    formMessage(output, 'Cererea a fost înregistrată. Contul va putea fi folosit după aprobarea administratorului.', true);
  } catch (error) {
    formMessage(output, error.message || 'Înregistrarea nu a reușit.');
  } finally { button.disabled = false; }
});

document.getElementById('forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const output = document.getElementById('forgotMessage');
  const button = document.getElementById('forgotButton');
  button.disabled = true;
  try {
    await fetch('/auth/forgot-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    event.currentTarget.reset();
    formMessage(output, 'Dacă adresa aparține unui cont, mesajul cu linkul de resetare a fost trimis.', true);
  } catch (error) {
    formMessage(output, 'Solicitarea nu a putut fi procesată.');
  } finally { button.disabled = false; }
});

document.getElementById('resetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const output = document.getElementById('resetMessage');
  if (values.password !== values.confirmPassword) return formMessage(output, 'Parolele introduse nu coincid.');
  const button = document.getElementById('resetButton');
  button.disabled = true;
  try {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const response = await fetch('/auth/reset-password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: values.password }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Parola nu a putut fi schimbată.');
    event.currentTarget.reset();
    formMessage(output, 'Parola a fost schimbată. Vă puteți autentifica.', true);
    window.setTimeout(() => window.location.assign('/?login=required'), 1500);
  } catch (error) {
    formMessage(output, error.message || 'Parola nu a putut fi schimbată.');
  } finally { button.disabled = false; }
});

const canvas = document.getElementById('particles');
const context = canvas.getContext('2d');
const points = [];
let width = 0;
let height = 0;

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  while (points.length < 40) points.push({ x: Math.random() * width, y: Math.random() * height, vx: Math.random() - .5, vy: Math.random() - .5 });
}

function draw() {
  context.clearRect(0, 0, width, height);
  points.forEach((point, index) => {
    point.x += point.vx;
    point.y += point.vy;
    if (point.x < 0 || point.x > width) point.vx *= -1;
    if (point.y < 0 || point.y > height) point.vy *= -1;
    context.fillStyle = 'rgba(54,127,169,.55)';
    context.beginPath(); context.arc(point.x, point.y, 2, 0, Math.PI * 2); context.fill();
    points.slice(index + 1).forEach((other) => {
      const distance = Math.hypot(point.x - other.x, point.y - other.y);
      if (distance < 210) {
        context.strokeStyle = `rgba(54,127,169,${.28 * (1 - distance / 210)})`;
        context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(other.x, other.y); context.stroke();
      }
    });
  });
  requestAnimationFrame(draw);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(draw);

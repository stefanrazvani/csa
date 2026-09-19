const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
// Keep the bearer token out of the address bar, referrers, and HTTP access logs.
history.replaceState(null, '', location.pathname);
const form = document.getElementById('confirmationForm');
const message = document.getElementById('confirmationMessage');
const yes = (value) => [true, 1, '1', 'true'].includes(value);
async function request(path, body) {
  const response = await fetch(`/auth/confirmation/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Operația nu a reușit.');
  return result;
}
async function load() {
  if (!token) throw new Error('Deschideți linkul complet din emailul de invitație.');
  const state = await request('view');
  document.getElementById('invitationTitle').textContent = state.name;
  const date = (value) => value ? new Date(value).toLocaleString('ro-RO') : '—';
  document.getElementById('invitationDates').textContent = `Ținută: ${date(state.date)} · Termen: ${date(state.deadline)}`;
  message.textContent = state.closed ? 'Ținuta nu mai acceptă răspunsuri. Contactați Secretarul.' : 'Puteți modifica răspunsul până la termenul de confirmare.';
  if (state.closed) return;
  for (const name of ['confirmareTinuta', 'confirmareAgapa']) if (state.response[name] != null) form.elements[name].value = yes(state.response[name]) ? '1' : '0';
  form.elements.menu.value = yes(state.response.confirmareMeniuVegetarian) ? 'vegetarian' : yes(state.response.confirmareMeniuStandard) ? 'standard' : '';
  for (const name of ['motivAbsenta', 'motivAbsentaAgapa']) form.elements[name].value = state.response[name] || '';
  form.hidden = false;
}
form.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = document.getElementById('saveResponse'); button.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    const result = await request('respond', { response: { confirmareTinuta: values.confirmareTinuta === '1', confirmareAgapa: values.confirmareAgapa === '1', confirmareMeniuStandard: values.menu === 'standard', confirmareMeniuVegetarian: values.menu === 'vegetarian', motivAbsenta: values.motivAbsenta, motivAbsentaAgapa: values.motivAbsentaAgapa } });
    message.textContent = result.notification === 'failed' ? 'Răspuns salvat. Emailul de confirmare nu a putut fi trimis.' : 'Răspunsul a fost salvat.';
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
load().catch((error) => { message.textContent = error.message; });

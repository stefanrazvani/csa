import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { Meteor } from 'meteor/meteor';
import { Entitati } from '/imports/api/collections.js';

const PUBLIC_TENANT_EID = String(process.env.CSA_LEGACY_EID || '').trim();

function cleanText(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Meteor.Error('validation-error', 'Adresa de email nu este validă.');
  }
  return email;
}

Accounts.config({ forbidClientAccountCreation: true });

Accounts.emailTemplates.siteName = 'Asociația Nova Reperta';
Accounts.emailTemplates.from = process.env.CSA_MAIL_FROM || 'Asociația Nova Reperta <no-reply@via-nova.ro>';
Accounts.emailTemplates.resetPassword = {
  subject() { return 'Resetare parolă — Asociația Nova Reperta'; },
  text(user, url) {
    return `A fost solicitată resetarea parolei contului Nova Reperta.\n\nDeschideți linkul: ${url}\n\nDacă nu ați făcut solicitarea, ignorați acest mesaj.`;
  },
  html(user, url) {
    return `<p>A fost solicitată resetarea parolei contului Nova Reperta.</p><p><a href="${url}">Resetați parola</a></p><p>Dacă nu ați făcut solicitarea, ignorați acest mesaj.</p>`;
  },
};

Meteor.methods({
  async 'auth.register'(payload) {
    check(payload, { prenume: String, nume: String, email: String, password: String, website: String });
    // Câmpul capcană oprește roboții simpli fără să afecteze utilizatorii reali.
    if (payload.website) return { status: 'pending' };
    if (!PUBLIC_TENANT_EID || !/^[A-Za-z0-9_-]+$/.test(PUBLIC_TENANT_EID)) {
      throw new Meteor.Error('registration-unavailable', 'Înregistrarea nu este configurată.');
    }
    const tenant = await Entitati.findOneAsync(PUBLIC_TENANT_EID, { fields: { nume: 1 } });
    if (!tenant) throw new Meteor.Error('registration-unavailable', 'Tenantul public nu este configurat.');

    const prenume = cleanText(payload.prenume, 80);
    const nume = cleanText(payload.nume, 80);
    const email = cleanEmail(payload.email);
    if (!prenume || !nume) throw new Meteor.Error('validation-error', 'Prenumele și numele sunt obligatorii.');
    if (String(payload.password || '').length < 12) {
      throw new Meteor.Error('validation-error', 'Parola trebuie să aibă minimum 12 caractere.');
    }

    const existing = await Meteor.users.findOneAsync({ 'emails.address': email }, { fields: { _id: 1 } });
    if (existing) throw new Meteor.Error('email-exists', 'Există deja un cont asociat acestei adrese.');

    const userId = await Accounts.createUserAsync({
      email,
      password: payload.password,
      profile: { name: `${prenume} ${nume}` },
    });
    await Meteor.users.updateAsync(userId, {
      $set: {
        setari: { prenume, nume, status: '2', tip: 'membru' },
        registration: { status: 'pending', source: 'public', requestedAt: new Date() },
        entitati: {
          [PUBLIC_TENANT_EID]: { nume: tenant.nume || 'Asociația Nova Reperta', activ: 0 },
          all: { nume: 'All', activ: 0 },
        },
      },
    });
    return { status: 'pending' };
  },

  async 'auth.requestPasswordReset'(rawEmail) {
    check(rawEmail, String);
    let email;
    try { email = cleanEmail(rawEmail); } catch (error) { return true; }
    const user = await Meteor.users.findOneAsync({ 'emails.address': email }, { fields: { _id: 1 } });
    if (user) {
      try {
        await Accounts.sendResetPasswordEmail(user._id, email);
      } catch (error) {
        // Nu divulgăm existența contului; eroarea SMTP rămâne doar în logul operațional.
        console.error('[auth] Trimiterea emailului de resetare a eșuat:', error?.message || error);
      }
    }
    return true;
  },
});

DDPRateLimiter.addRule({ type: 'method', name: 'auth.register' }, 3, 10 * 60 * 1000);
DDPRateLimiter.addRule({ type: 'method', name: 'auth.requestPasswordReset' }, 5, 15 * 60 * 1000);

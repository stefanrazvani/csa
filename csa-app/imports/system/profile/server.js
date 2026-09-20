import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { requireUser, getActiveEId, getEffectiveGrade } from '/imports/lib/access/server.js';
import { BrotherDossiers } from '/imports/modules/dossiers/api/collections.js';
import { LodgeMemberships } from '/imports/api/collections.js';

// Only the signed-in user's names, reactive across dossier edits and tenant switches.
Meteor.publish('profile.identity', function profileIdentityPublication() {
  if (!this.userId) return this.ready();
  return BrotherDossiers.find({ userId: this.userId }, {
    fields: { userId: 1, eId: 1, 'identity.givenName': 1, 'identity.familyName': 1, 'identity.preferredName': 1 },
  });
});

Meteor.methods({
  async 'profile.mine'() {
    const userId = await requireUser(this);
    const eId = await getActiveEId(userId);
    const [user, dossier, membership] = await Promise.all([
      Meteor.users.findOneAsync(userId, {fields:{emails:1, profile:1, profileExt:1, setari:1}}),
      BrotherDossiers.findOneAsync({eId,userId}),
      LodgeMemberships.findOneAsync({eId,userId}),
    ]);
    const identity=dossier?.identity || {}, contact=dossier?.contact || {}, legacy={...user?.profileExt,...user?.setari};
    const rows=[
      ['Nume',identity.familyName || legacy.nume], ['Prenume',identity.givenName || legacy.prenume],
      ['Nume afișat',identity.preferredName || user?.profile?.name], ['Nume la naștere',identity.birthName],
      ['Data nașterii',identity.birthDate], ['Locul nașterii',identity.birthPlace], ['Stare civilă',identity.maritalStatus],
      ['Email cont',user?.emails?.[0]?.address], ['Email contact',contact.email], ['Telefon',contact.phone || legacy.telefonMobil || legacy.telefon],
      ['Localitate',contact.address?.city || legacy.localitate], ['Județ',contact.address?.county || legacy.judet], ['Adresă',[contact.address?.street,contact.address?.line2,contact.address?.postalCode,contact.address?.country].filter(Boolean).join(', ')],
      ['Profesie',dossier?.professional?.occupation], ['Matricol',membership?.matriculationNo],
      ['Grad',({1:'Ucenic',2:'Calfă',3:'Maestru'})[await getEffectiveGrade(userId,eId)]], ['Statut',membership?.status],
    ];
    return {email:user?.emails?.[0]?.address || '',rows:rows.map(([label,value])=>({label,value:value instanceof Date ? value.toISOString().slice(0,10) : String(value || '—').slice(0,1000)}))};
  },
  async 'profile.requestPasswordReset'() {
    const userId=await requireUser(this);
    const user=await Meteor.users.findOneAsync(userId,{fields:{emails:1}});
    const email=user?.emails?.[0]?.address;
    if(!email) throw new Meteor.Error('missing-email','Contul nu are o adresă de email.');
    await Accounts.sendResetPasswordEmail(userId,email);
    return {ok:true};
  },
});
DDPRateLimiter.addRule({type:'method',name:'profile.requestPasswordReset',userId:()=>true},3,15*60*1000);

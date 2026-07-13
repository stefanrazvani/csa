import { Mongo } from 'meteor/mongo';

// DDP-only collection: publications emit an authorization revision, but no
// document from this collection is ever persisted in MongoDB.
export const TempleExperienceSignals = new Mongo.Collection('temple_experience_access_signals');


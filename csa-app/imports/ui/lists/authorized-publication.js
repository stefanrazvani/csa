import { Meteor } from 'meteor/meteor';
import { requireCompositeAccess } from '/imports/lib/access/server.js';
import { publishWithReactiveDossierAccess } from '/imports/modules/dossiers/server/reactive-publication.js';
import { LibraryWorks, StudyDebates, StudyConcepts } from '/imports/modules/study/api/collections.js';
import { Convocatoare } from '/imports/api/collections.js';
// Shared lifecycle for cursor publications: revoke first, then recompute every cursor.
export function publishAuthorized(name, handler) {
  Meteor.publish(name, async function (...args) {
    const context=this;
    const authorize=async()=>{
      const access=await requireCompositeAccess(context,{});
      const cursors=await handler.apply({userId:context.userId,connection:context.connection,ready:()=>[]},args);
      return {...access,cursors:(Array.isArray(cursors)?cursors:[cursors]).filter(Boolean)};
    };
    const watch=({eId})=> name.startsWith('study.') ? [LibraryWorks.find({eId},{fields:{minGrade:1,status:1,currentVersionId:1,reviewVersionId:1}}),StudyDebates.find({eId},{fields:{minGrade:1,status:1}}),StudyConcepts.find({eId},{fields:{minGrade:1,status:1}})] : name.startsWith('craft.') ? [Convocatoare.find({eId},{fields:{minGrade:1,sys_status:1}})] : [];
    return publishWithReactiveDossierAccess(context,{initialAccess:await authorize(),reauthorize:authorize,authorizationCursors:watch,buildStreams:access=>access.cursors.map(cursor=>({name:cursor._getCollectionName(),cursor}))});
  });
}

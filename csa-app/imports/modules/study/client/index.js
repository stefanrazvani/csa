import './index.html';
import './study.css';
import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Tracker } from 'meteor/tracker';
import * as echarts from 'echarts';
import {
  ConceptRelations, LibraryVersions, LibraryWorks, StudyConcepts, StudyDebates, StudyMessages, TextNodes,
} from '../api/collections.js';
import { renderPage } from '/imports/layout/client';
import { appPath, registerDualRoute } from '/imports/system/gateway/client';

registerDualRoute(FlowRouter, '/biblioteca', () => renderPage('studyLibrary'));
registerDualRoute(FlowRouter, '/biblioteca/:id', (params) => renderPage('studyReader', { id: params.id }));
registerDualRoute(FlowRouter, '/dezbatere/:id', (params) => renderPage('studyDebate', { id: params.id }));
registerDualRoute(FlowRouter, '/concepte', () => renderPage('studyConcepts'));

function setContext(instance) {
  instance.studyContext = new ReactiveVar({ grade: 0, canManage: false });
  Meteor.callAsync('study.context').then((value) => instance.studyContext.set(value)).catch(() => {});
}

Template.studyLibrary.onCreated(function created() { this.subscribe('study.catalog'); setContext(this); this.results = new ReactiveVar([]); this.error = new ReactiveVar(''); this.busy = new ReactiveVar(false); });
Template.studyLibrary.helpers({
  works: () => LibraryWorks.find({}, { sort: { title: 1 } }),
  canManage: () => Template.instance().studyContext.get().canManage,
  busy: () => Template.instance().busy.get(),
  error: () => Template.instance().error.get(),
  searchResults: () => Template.instance().results.get(),
  workPath: (id) => appPath(`/biblioteca/${id}`), conceptsPath: () => appPath('/concepte'),
  statusLabel(status) { return status === 'published' ? 'Publicată' : 'În lucru'; },
});
Template.studyLibrary.events({
  async 'submit #studyCreateWork'(event, instance) {
    event.preventDefault(); instance.busy.set(true); instance.error.set('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const file = event.currentTarget.elements.sourceFile?.files?.[0];
      if (!String(values.content || '').trim() && !file) throw new Error('Introduceți text sau selectați un fișier DOCX/PDF.');
      const result = await Meteor.callAsync('study.works.create', { title: values.title, author: values.author, minGrade: Number(values.minGrade), rightsHolder: values.rightsHolder, license: values.license, source: values.source, storageAllowed: values.storageAllowed === 'on', processingAllowed: values.processingAllowed === 'on' });
      if (String(values.content || '').trim()) {
        await Meteor.callAsync('study.works.importDirectText', result.id, { content: values.content });
      } else {
        const upload = new FormData(); upload.set('workId', result.id); upload.set('file', file, file.name);
        const response = await fetch('/portal-api/documents', { method: 'POST', credentials: 'include', headers: { 'X-CSA-Tenant': instance.studyContext.get().eId }, body: upload });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Importul nu a putut fi pornit.');
      }
      FlowRouter.go(appPath(`/biblioteca/${result.id}`));
    } catch (error) { instance.error.set(error?.reason || error?.message); } finally { instance.busy.set(false); }
  },
  async 'click .js-study-search'(event, instance) {
    const query = instance.$('#studySearch').val();
    try { instance.results.set(await Meteor.callAsync('study.search', query, 30)); } catch (error) { instance.error.set(error?.reason || error?.message); }
  },
  async 'keydown #studySearch'(event, instance) { if (event.key === 'Enter') { event.preventDefault(); instance.$('.js-study-search').trigger('click'); } },
});

Template.studyReader.onCreated(function created() { this.id = this.data.id; this.subscribe('study.work', this.id); setContext(this); });
Template.studyReader.helpers({
  work() { return LibraryWorks.findOne(Template.instance().id); },
  reviewVersion() { const work = LibraryWorks.findOne(Template.instance().id); return work?.reviewVersionId ? LibraryVersions.findOne(work.reviewVersionId) : null; },
  readableNodes() { const instance = Template.instance(); const work = LibraryWorks.findOne(instance.id); const canManage = instance.studyContext.get().canManageLibrary; const versionId = (canManage ? work?.reviewVersionId : null) || work?.currentVersionId; return versionId ? TextNodes.find({ versionId, type: { $ne: 'sentence' } }, { sort: { createdAt: 1 } }) : []; },
  debates() { return StudyDebates.find({ workId: Template.instance().id }, { sort: { updatedAt: -1 } }); },
  canManage: () => Template.instance().studyContext.get().canManage,
  isHeading(type) { return ['chapter', 'section'].includes(type); },
  debatePath: (id) => appPath(`/dezbatere/${id}`), libraryPath: () => appPath('/biblioteca'),
});
Template.studyReader.events({
  async 'click .js-publish-work'(event, instance) { const work = LibraryWorks.findOne(instance.id); if (work?.reviewVersionId) await Meteor.callAsync('study.works.publish', work._id, work.reviewVersionId); },
  async 'click .js-start-debate'(event, instance) {
    const title = window.prompt('Titlul dezbaterii'); if (!title) return;
    const work = LibraryWorks.findOne(instance.id);
    const result = await Meteor.callAsync('study.debates.create', { title, targetType: event.currentTarget.dataset.type, targetId: event.currentTarget.dataset.id, quoteSnapshot: event.currentTarget.dataset.text, workId: work?._id, minGrade: work?.minGrade || 1 });
    FlowRouter.go(appPath(`/dezbatere/${result.id}`));
  },
});

Template.studyDebate.onCreated(function created() { this.id = this.data.id; this.subscribe('study.debate', this.id); });
Template.studyDebate.helpers({
  debate: () => StudyDebates.findOne(Template.instance().id), messages: () => StudyMessages.find({ debateId: Template.instance().id }, { sort: { createdAt: 1 } }),
  libraryPath: () => appPath('/biblioteca'), authorLabel(id) { return id === Meteor.userId() ? 'Tu' : 'Membru'; },
  formatDate(value) { return value ? new Intl.DateTimeFormat('ro-RO', { dateStyle: 'short', timeStyle: 'short' }).format(value) : ''; },
});
Template.studyDebate.events({ async 'submit #studyMessageForm'(event, instance) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); await Meteor.callAsync('study.messages.insert', instance.id, values); event.currentTarget.reset(); } });

Template.studyConcepts.onCreated(function created() { this.subscribe('study.concepts'); setContext(this); });
Template.studyConcepts.onRendered(function rendered() {
  this.autorun(() => {
    const nodes = StudyConcepts.find({ status: { $ne: 'removed' } }).fetch();
    const edges = ConceptRelations.find({ status: 'published' }).fetch();
    Tracker.afterFlush(() => {
      const target = this.find('#studyConceptGraph');
      if (!target) return;
      this.graphChart ||= echarts.init(target, null, { renderer: 'canvas' });
      this.graphChart.setOption({
        backgroundColor: 'transparent', tooltip: {},
        series: [{ type: 'graph', layout: 'force', roam: true, draggable: true, force: { repulsion: 230, edgeLength: [90, 190] },
          label: { show: true, color: '#fff6dc', fontFamily: 'Georgia' },
          data: nodes.map((node) => ({ id: node._id, name: node.name, value: node.description, symbolSize: 42 + Number(node.minGrade || 1) * 8, itemStyle: { color: ['#234d71', '#1c6b8b', '#8b6a2c'][Number(node.minGrade || 1) - 1], borderColor: '#d1b673', borderWidth: 1 } })),
          links: edges.map((edge) => ({ source: edge.fromConceptId, target: edge.toConceptId, value: edge.type, label: { show: true, formatter: edge.type, color: '#c9b57e', fontSize: 10 }, lineStyle: { color: '#9bb3c7', opacity: .7, curveness: .08 } })),
        }],
      }, true);
      this.graphChart.resize();
    });
  });
  this.resizeHandler = () => this.graphChart?.resize();
  window.addEventListener('resize', this.resizeHandler);
});
Template.studyConcepts.onDestroyed(function destroyed() { window.removeEventListener('resize', this.resizeHandler); this.graphChart?.dispose(); });
Template.studyConcepts.helpers({
  concepts: () => StudyConcepts.find({}, { sort: { name: 1 } }), relations: () => ConceptRelations.find({}), canManage: () => Template.instance().studyContext.get().canManageStudy,
  libraryPath: () => appPath('/biblioteca'), conceptName(id) { return StudyConcepts.findOne(id)?.name || id; },
});
Template.studyConcepts.events({ async 'submit #studyConceptCreate'(event) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); await Meteor.callAsync('study.concepts.create', { ...values, minGrade: Number(values.minGrade) }); event.currentTarget.reset(); }, async 'submit #studyConceptLink'(event) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); await Meteor.callAsync('study.concepts.link', values); event.currentTarget.reset(); } });

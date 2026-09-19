import './client.html';
import './client.css';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Blaze } from 'meteor/blaze';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Random } from 'meteor/random';
import { Tracker } from 'meteor/tracker';
import { filterRows, normalizeQuery, valueAt, compareRows } from './query.js';
const ListRows = new Mongo.Collection('csa_list_rows');
export function registerList(templateName, helper, columns, options = {}) {
  const template = Template[templateName];
  const original = template.__helpers.get(helper);
  if (original) template.helpers({ [`${helper}Options`]: original });
  template.onCreated(function () {
    const instance = this;
    instance.lists ||= {};
    const state = new ReactiveVar(normalizeQuery({ sort: options.sort, direction: options.direction, size: options.size }, columns));
    const error = new ReactiveVar(''); const ready = new ReactiveVar(!options.remote);
    const scope = Random.id(); const cache = new ReactiveVar([]); let timer; let subscription; const currentScope = new ReactiveVar(scope);
    const list = { label: options.label || helper, columns, state: () => state.get(), remote: Boolean(options.remote), error: () => error.get(), loading: () => !ready.get(),
      set(patch) { if ('search' in patch && patch.search === '') clearTimeout(timer); state.set(normalizeQuery({ ...state.get(), page: 0, ...patch }, columns)); },
      search(patch) { clearTimeout(timer); timer = setTimeout(() => list.set(patch), 250); },
      compute() {
        if (options.remote) { const query=state.get(); return ListRows.find({ scope: currentScope.get() }).fetch().map(row => ({ _id: row.recordId, ...row.record })).sort((a,b) => compareRows(a,b,query)); }
        const source = options.rows ? options.rows(instance) : Blaze._withCurrentView(instance.view, () => original?.call(instance.data || {}));
        return filterRows(source?.fetch ? source.fetch() : source || [], state.get(), columns);
      },
      all: () => cache.get(),
      rows() { const rows = list.all(); const query = state.get(); if (options.remote) return rows.slice(0, query.size); const last = Math.max(0, Math.ceil(rows.length / query.size) - 1); if (query.page > last) Tracker.nonreactive(() => list.set({ page: last })); return rows.slice(Math.min(query.page,last)*query.size, (Math.min(query.page,last)+1)*query.size); },
      total: () => list.all().length, visibleCount: () => list.rows().length,
      pageNumber: () => state.get().page + 1, firstPage: () => state.get().page === 0,
      lastPage: () => options.remote ? list.all().length <= state.get().size : (state.get().page+1)*state.get().size >= list.all().length,
      sizes: [10,20,50,100],
      sort(field) { const query=state.get(); list.set({ sort:field, direction: query.sort===field ? -query.direction : 1 }); },
      directionLabel: () => state.get().direction === 1 ? '↑ Crescător' : '↓ Descrescător',
    };
    instance.lists[helper] = list;
    instance.autorun(() => cache.set(list.compute()));
    if (options.remote) instance.autorun(() => {
      const query = state.get(); const params = options.params?.(instance) || {};
      // Each request gets its own scope; late responses and other windows cannot contaminate the page.
      currentScope.set(Random.id()); ready.set(false); error.set('');
      subscription?.stop();
      if (options.enabled && !options.enabled(instance)) { ready.set(true); return; }
      subscription = instance.subscribe('csa.list', options.remote, currentScope.get(), query, params, { onReady() { ready.set(true); }, onError(err) { ready.set(true); error.set(err.reason || 'Lista nu este disponibilă.'); } });
    });
    instance._listCleanup ||= []; instance._listCleanup.push(() => { clearTimeout(timer); subscription?.stop(); });
  });
  template.onDestroyed(function () { this._listCleanup?.forEach(stop=>stop()); });
  template.helpers({ [helper]() { return Template.instance().lists[helper].rows(); }, [`${helper}List`]() { return Template.instance().lists[helper]; } });
}
function selected(field, key) { const list = Template.instance().data.list; return list?.state()[key] === field; }
Template.csaListTools.helpers({ selectedFilter(field) { return selected(field,'filterField'); }, selectedSort(field) { return selected(field,'sort'); } });
Template.csaListTools.events({
  'input .csa-list-search'(event, instance) { instance.data.list.search({ search: event.currentTarget.value }); },
  'input .csa-list-filter'(event, instance) { instance.data.list.search({ filter: event.currentTarget.value }); },
  'change .csa-list-filter-field'(event, instance) { instance.data.list.set({ filterField: event.currentTarget.value }); },
  'change .csa-list-sort'(event, instance) { instance.data.list.set({ sort: event.currentTarget.value }); },
  'click .csa-list-direction'(event, instance) { instance.data.list.set({ direction: -instance.data.list.state().direction }); },
  'click .csa-list-reset'(event, instance) { instance.data.list.set({ search:'', filter:'', filterField:'' }); },
});
Template.csaListPager.helpers({ selectedSize(size) { return selected(size,'size'); } });
Template.csaListPager.events({
  'change .csa-list-size'(event, instance) { instance.data.list.set({ size: Number(event.currentTarget.value) }); },
  'click .csa-list-prev'(event, instance) { const list=instance.data.list; list.set({ page: Math.max(0,list.state().page-1) }); },
  'click .csa-list-next'(event, instance) { const list=instance.data.list; if(!list.lastPage()) list.set({ page:list.state().page+1 }); },
});
Template.csaListColumn.helpers({ ariaSort() { const q=this.list?.state(); return q?.sort===this.field ? q.direction===1?'ascending':'descending':'none'; }, sortIcon() { const q=this.list?.state(); return q?.sort===this.field ? q.direction===1?'↑':'↓':'↕'; } });
Template.csaListColumn.events({ 'click .csa-list-column'(event, instance) { instance.data.list?.sort(instance.data.field); } });
Template.csaSimpleTable.helpers({ tableRows() { const { list, action }=Template.instance().data; return list.rows().map(row=>({ ...row, cells:list.columns.map(column=>{ const value=valueAt(row,column.field); return { value:/grade$/i.test(column.field) ? ({1:'Ucenic',2:'Calfă',3:'Maestru'}[value] || 'Neconfigurat') : column.type==='date'&&value ? new Intl.DateTimeFormat('ro-RO',{dateStyle:'short'}).format(new Date(value)) : value ?? '—' }; }), action:action ? { ...action, href:action.path ? `${action.path}/${row._id}` : '' } : null })); } });

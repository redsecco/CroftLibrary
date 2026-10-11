import { searchAuthors, fetchBooks } from './openlibrary.js';
import { state, save, replaceAll } from './store.js';

const WEEK = 7 * 24 * 3600 * 1000;
const $ = id => document.getElementById(id);
const view = $('view'), title = $('title'), back = $('back'), action = $('action');

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

function setBack(text, fn, label) {
  back.hidden = false;
  back.textContent = text;
  back.setAttribute('aria-label', label);
  back.onclick = fn;
}
const goBack = () => (history.length > 1 ? history.back() : (location.hash = '#/'));

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- data operations ----

// Merge freshly fetched books into an author, keeping "owned" flags.
// Books that appear after the first fetch are flagged isNew until the author is viewed.
function mergeBooks(author, fetched, first) {
  const old = new Map(author.books.map(b => [b.id, b]));
  author.books = fetched.map(b => {
    const prev = old.get(b.id);
    return prev
      ? { ...prev, title: b.title, year: b.year }
      : { ...b, owned: false, isNew: !first };
  });
  author.refreshed = Date.now();
}

async function refreshAuthor(author, first = false) {
  mergeBooks(author, await fetchBooks(author.id), first);
  save();
}

async function refreshStale(force = false) {
  const due = state.authors.filter(a => force || Date.now() - (a.refreshed || 0) > WEEK);
  if (!due.length) return;
  let failed = 0;
  for (const a of due) {
    try { await refreshAuthor(a); } catch { failed++; }
  }
  toast(failed ? `Refreshed with ${failed} failure(s)` : 'Books updated');
  render();
}

// ---- views ----

function renderList() {
  title.textContent = 'Croft Library';
  setBack('⚙', () => (location.hash = '#/settings'), 'Settings');
  action.hidden = false;
  action.textContent = '+';
  action.onclick = () => (location.hash = '#/add');

  if (!state.authors.length) {
    view.replaceChildren(h('div', { class: 'empty' }, 'No authors yet. Tap + to add one.'));
    return;
  }
  const authors = [...state.authors].sort((a, b) => a.name.localeCompare(b.name));
  const card = h('div', { class: 'card' }, authors.map(a => {
    const owned = a.books.filter(b => b.owned).length;
    const fresh = a.books.filter(b => b.isNew).length;
    return h('button', { class: 'row', onclick: () => (location.hash = `#/author/${a.id}`) },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, a.name)),
      fresh ? h('span', { class: 'badge' }, `${fresh} new`) : null,
      h('span', { class: 'count' }, `${owned}/${a.books.length}`));
  }));

  view.replaceChildren(card);
}

function renderSettings() {
  title.textContent = 'Settings';
  setBack('‹', goBack, 'Back');
  action.hidden = true;
  const oldest = Math.min(...state.authors.map(a => a.refreshed || 0));
  const last = state.authors.length && oldest
    ? `Oldest data is ${Math.floor((Date.now() - oldest) / 86400000)} day(s) old. Books refresh automatically after 7 days.`
    : 'Books refresh automatically after 7 days.';
  const importer = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importData });
  const refresh = h('button', { class: 'btn', onclick: async () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    await refreshStale(true);
  } }, 'Refresh all books now');
  view.replaceChildren(
    h('div', { class: 'sub', style: 'margin-bottom:8px' }, last),
    h('div', { class: 'actions', style: 'margin:0 0 24px' }, refresh),
    h('div', { class: 'sub', style: 'margin-bottom:8px' }, 'Backup your list to a file, or restore from one.'),
    h('div', { class: 'actions', style: 'margin:0' },
      h('button', { class: 'btn', onclick: exportData }, 'Export backup'),
      h('button', { class: 'btn', onclick: () => importer.click() }, 'Import backup'),
      importer));
}

let searchSeq = 0;
function renderAdd() {
  title.textContent = 'Add author';
  setBack('‹', goBack, 'Back');
  action.hidden = true;
  const results = h('div');
  const input = h('input', { type: 'search', placeholder: 'Author name', autocomplete: 'off' });
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value.trim(), results), 350);
  });
  view.replaceChildren(input, results);
  input.focus();
}

async function runSearch(q, out) {
  const seq = ++searchSeq;
  if (q.length < 2) return out.replaceChildren();
  out.replaceChildren(h('div', { class: 'empty' }, 'Searching…'));
  let found;
  try { found = await searchAuthors(q); }
  catch {
    if (seq === searchSeq) out.replaceChildren(h('div', { class: 'empty' }, 'Search failed. Check your connection.'));
    return;
  }
  if (seq !== searchSeq) return;
  if (!found.length) return out.replaceChildren(h('div', { class: 'empty' }, 'No matches.'));
  out.replaceChildren(h('div', { class: 'card' }, found.map(a => {
    const sub = [a.born && `b. ${a.born}`, a.workCount && `${a.workCount} works`, a.topWork && `e.g. ${a.topWork}`]
      .filter(Boolean).join(' · ');
    const added = state.authors.some(x => x.id === a.id);
    return h('button', { class: 'row', disabled: added, onclick: () => addAuthor(a) },
      h('div', { class: 'grow' }, h('div', { class: 'name' }, a.name), h('div', { class: 'sub' }, sub)),
      added ? h('span', { class: 'count' }, 'Added') : null);
  })));
}

async function addAuthor(a) {
  toast(`Adding ${a.name}…`);
  const author = { id: a.id, name: a.name, books: [], refreshed: 0 };
  try { await refreshAuthor(author, true); }
  catch { return toast('Could not fetch books. Try again.'); }
  state.authors.push(author);
  save();
  location.hash = `#/author/${author.id}`;
}

let filter = 'all';
function renderAuthor(id) {
  const author = state.authors.find(a => a.id === id);
  if (!author) return (location.hash = '#/');
  title.textContent = author.name;
  setBack('‹', goBack, 'Back');
  action.hidden = false;
  action.textContent = '↻';
  action.onclick = async () => {
    try { await refreshAuthor(author); toast('Updated'); renderAuthor(id); }
    catch { toast('Refresh failed'); }
  };

  const newIds = new Set(author.books.filter(b => b.isNew).map(b => b.id));
  author.books.forEach(b => (b.isNew = false));
  save();

  const seg = h('div', { class: 'seg' }, ['all', 'owned', 'missing'].map(f =>
    h('button', { class: f === filter ? 'on' : '', onclick: () => { filter = f; renderAuthor(id); } },
      f[0].toUpperCase() + f.slice(1))));

  const shown = author.books
    .filter(b => filter === 'all' || (filter === 'owned') === b.owned)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));

  const list = shown.length
    ? h('div', { class: 'card' }, shown.map(b => {
        const box = h('input', {
          type: 'checkbox', class: 'check', checked: b.owned, 'aria-label': `Own ${b.title}`,
          onchange: () => { b.owned = box.checked; save(); row.classList.toggle('owned', b.owned); },
        });
        const row = h('label', { class: 'row' + (b.owned ? ' owned' : '') },
          box,
          h('div', { class: 'grow' }, h('div', { class: 't' }, b.title), h('div', { class: 'sub' }, b.year ?? '')),
          newIds.has(b.id) ? h('span', { class: 'badge' }, 'new') : null);
        return row;
      }))
    : h('div', { class: 'empty' }, 'Nothing to show.');

  const owned = author.books.filter(b => b.owned).length;
  const days = author.refreshed ? Math.floor((Date.now() - author.refreshed) / 86400000) : null;
  view.replaceChildren(
    h('div', { class: 'sub', style: 'margin-bottom:12px' },
      `${owned} of ${author.books.length} owned` + (days != null ? ` · updated ${days === 0 ? 'today' : days + 'd ago'}` : '')),
    seg, list,
    h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: () => {
      if (confirm(`Remove ${author.name} and their ownership records?`)) {
        state.authors = state.authors.filter(a => a !== author); save(); location.hash = '#/';
      }
    } }, 'Remove author')));
}

// ---- backup ----

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `croft-library-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.authors)) throw new Error();
    if (!confirm('Replace your current list with this backup?')) return;
    replaceAll(data);
    toast('Backup restored');
    render();
  } catch { toast('Not a valid backup file'); }
}

// ---- routing ----

function render() {
  const [, route, arg] = location.hash.split('/');
  if (route === 'add') renderAdd();
  else if (route === 'author') renderAuthor(arg);
  else if (route === 'settings') renderSettings();
  else renderList();
  window.scrollTo(0, 0);
}

addEventListener('hashchange', render);
render();
refreshStale();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

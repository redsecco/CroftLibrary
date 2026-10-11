// Persistence in localStorage. Data is small (authors + book titles), so one JSON blob is enough.
const KEY = 'croft-library-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { authors: [] }; }
  catch { return { authors: [] }; }
}

export const state = load();

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function replaceAll(data) {
  state.authors = data.authors;
  save();
}

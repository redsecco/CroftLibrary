// Open Library API client (free, no key). https://openlibrary.org/developers/api
const BASE = 'https://openlibrary.org';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library returned ${res.status}`);
  return res.json();
}

export async function searchAuthors(query) {
  const data = await getJson(`${BASE}/search/authors.json?q=${encodeURIComponent(query)}&limit=15`);
  return (data.docs || []).map(d => ({
    id: d.key,
    name: d.name,
    topWork: d.top_work || '',
    workCount: d.work_count || 0,
    born: d.birth_date || '',
  }));
}

const normTitle = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Returns the author's works, de-duplicated by title, oldest first.
export async function fetchBooks(authorId) {
  const url = `${BASE}/search.json?author_key=${encodeURIComponent(authorId)}` +
    `&fields=key,title,first_publish_year&sort=old&limit=1000`;
  const data = await getJson(url);
  const seen = new Map();
  for (const d of data.docs || []) {
    if (!d.title) continue;
    const norm = normTitle(d.title);
    if (!norm || seen.has(norm)) continue;
    seen.set(norm, { id: d.key, title: d.title, year: d.first_publish_year || null });
  }
  return [...seen.values()];
}

// Hardcover GraphQL API client. https://docs.hardcover.app/api/getting-started/
// The API token is personal; it is entered in Settings and kept only in this browser's localStorage.
const ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const TOKEN_KEY = 'croft-library-hardcover-token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  // Accept the token pasted with or without the "Bearer " prefix.
  const clean = token.trim().replace(/^Bearer\s+/i, '');
  if (clean) localStorage.setItem(TOKEN_KEY, clean);
  else localStorage.removeItem(TOKEN_KEY);
}

export class NoTokenError extends Error {}

async function gql(query, variables) {
  const token = getToken();
  if (!token) throw new NoTokenError('No Hardcover API token set');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) throw new Error('Hardcover rejected the API token. Check it in Settings.');
  if (res.status === 429) throw new Error('Hardcover rate limit hit. Try again in a minute.');
  if (!res.ok) throw new Error(`Hardcover returned ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data;
}

export async function searchAuthors(q) {
  const data = await gql(
    `query ($q: String!) { search(query: $q, query_type: "Author", per_page: 15) { results } }`,
    { q });
  const hits = data.search.results?.hits || [];
  return hits.map(h => h.document)
    .filter(d => d.books_count > 0)
    .map(d => ({
      id: Number(d.id),
      name: d.name,
      workCount: d.books_count,
      topWork: d.books?.[0] || '',
    }));
}

const normTitle = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export { normTitle };

// The author's own catalogue: books they wrote, excluding other editions, compilations,
// roles such as foreword or translator, and books whose main edition is known to be
// in a language other than English. Books with no language data are kept. Oldest first.
export async function fetchBooks(authorId) {
  const data = await gql(
    `query ($id: Int!) {
       books(
         where: {
           canonical_id: { _is_null: true }
           compilation: { _eq: false }
           contributions: {
             author_id: { _eq: $id }
             _or: [{ contribution: { _eq: "Author" } }, { contribution: { _is_null: true } }]
           }
         }
         order_by: { release_year: asc }
         limit: 1000
       ) { id title release_year default_cover_edition { language { code2 } } }
     }`,
    { id: authorId });
  const seen = new Map();
  for (const b of data.books) {
    if (!b.title) continue;
    const lang = b.default_cover_edition?.language?.code2;
    if (lang && lang !== 'en') continue;
    const norm = normTitle(b.title);
    if (!norm || seen.has(norm)) continue;
    seen.set(norm, { id: b.id, title: b.title, year: b.release_year || null });
  }
  return [...seen.values()];
}

// Génère docs/data/characters/*.json à partir d'AniList (popularité) + tools/power/<univers>.json (puissance /10 000, éditée à la main).
// Usage : cd tools && node build-characters.mjs [univers…]      (Node 18+)
// Ajouter un univers : une entrée dans universes.json + un fichier power/<id>.json, puis relancer.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)), OUT = join(here, '../docs/data/characters');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { if (fallback !== undefined && e.code === 'ENOENT') return fallback; throw new Error(`${p} : ${e.message}`); } };
export const tokens = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

async function gql(query, variables) {
  for (let a = 0; a < 6; a++) {
    const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }) });
    if (r.status === 429) { const w = +(r.headers.get('retry-after') || 30); console.log(`  limite de requêtes AniList, pause ${w}s`); await sleep(w * 1000); continue; }
    if (!r.ok) throw new Error(`AniList HTTP ${r.status}`);
    const j = await r.json(); if (j.errors) throw new Error(j.errors.map(e => e.message).join('; ')); return j.data;
  }
  throw new Error('AniList : trop de tentatives');
}
async function resolveIds(u) {
  if (u.ids?.length) return u.ids;
  const ids = [];
  for (const q of u.search) {
    const d = await gql('query($q:String){Media(search:$q,type:ANIME,sort:POPULARITY_DESC){id title{romaji}}}', { q });
    console.log(`  « ${q} » -> ${d.Media.title.romaji} (id ${d.Media.id})  [vérifie, sinon renseigne "ids" dans universes.json]`); ids.push(d.Media.id); await sleep(700);
  }
  return ids;
}
async function fetchCharacters(mediaId, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    const d = await gql('query($id:Int,$p:Int){Media(id:$id){characters(page:$p,perPage:50,sort:FAVOURITES_DESC){pageInfo{hasNextPage} nodes{id name{full alternative} image{large} favourites}}}}', { id: mediaId, p });
    out.push(...d.Media.characters.nodes); await sleep(700);
    if (!d.Media.characters.pageInfo.hasNextPage) break;
  }
  return out;
}

async function buildUniverse(u) {
  console.log(`\n== ${u.label}`);
  const power = await readJson(join(here, 'power', `${u.id}.json`), {});
  const byKey = new Map(Object.entries(power).map(([k, v]) => [tokens(k), { name: k, v }]));
  const all = new Map();
  for (const id of await resolveIds(u)) for (const c of await fetchCharacters(id, u.pages)) if (!all.has(c.id) || all.get(c.id).favourites < c.favourites) all.set(c.id, c);
  const popular = [...all.values()].filter(c => c.favourites >= u.minFavourites).sort((a, b) => b.favourites - a.favourites).slice(0, u.maxCharacters);
  const chars = [], missing = [], used = new Set();
  for (const c of popular) {
    const names = [c.name.full, ...(c.name.alternative || [])].map(tokens), hit = names.map(n => byKey.get(n)).find(Boolean);
    if (!hit) { missing.push({ name: c.name.full, favourites: c.favourites, anilistId: c.id }); continue; }
    used.add(hit.name);
    chars.push({ id: `${u.id}-${c.id}`, name: c.name.full, image: c.image?.large || null, universe: u.id, power: hit.v, popularity: c.favourites, anilistId: c.id });
  }
  const unmatched = Object.keys(power).filter(k => !used.has(k));
  await writeFile(join(OUT, `${u.id}.json`), JSON.stringify({ universe: u.id, label: u.label, generatedAt: new Date().toISOString(), characters: chars }, null, 1));
  console.log(`  ${chars.length} personnages jouables · ${missing.length} populaires sans puissance (missing-power.json)`);
  if (unmatched.length) console.log(`  ⚠ clés de puissance sans correspondance AniList (écris le nom EXACT d'AniList) : ${unmatched.join(', ')}`);
  return { chars: chars.length, missing };
}

const universes = await readJson(join(here, 'universes.json')), only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const report = await readJson(join(here, 'missing-power.json'), {});
for (const u of universes.filter(u => !only.length || only.includes(u.id))) {
  try { const r = await buildUniverse(u); report[u.id] = r.missing; } catch (e) { console.error(`  ✖ ${u.label} : ${e.message}`); }
}
await writeFile(join(here, 'missing-power.json'), JSON.stringify(report, null, 1));
const built = (await readdir(OUT)).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.replace('.json', ''));
await writeFile(join(OUT, 'index.json'), JSON.stringify({ universes: built }, null, 1));
console.log(`\nindex.json : ${built.join(', ') || '(aucun univers)'}`);

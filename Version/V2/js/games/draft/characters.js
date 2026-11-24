// Charge les personnages d'un univers (data/characters/<univers>.json, généré à l'étape 6).
// Tant que les données n'existent pas, un jeu de personnages de TEST est généré pour pouvoir jouer.
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const getJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(url); return r.json(); };

const testPool = () => Array.from({ length: 80 }, (_, i) => ({ id: `test-${i + 1}`, name: `Personnage test ${i + 1}`, image: null,
  power: Math.round(500 + rand() * 9000), popularity: Math.round(rand() * 100), test: true }));

export async function loadDeck(universe, count) {
  let pool = [];
  try {
    const ids = universe === 'mix' ? (await getJson('data/characters/index.json')).universes : [universe];
    for (const id of ids) pool.push(...(await getJson(`data/characters/${id}.json`)).characters);
  } catch { pool = []; }
  if (pool.length < count) pool = testPool();
  return shuffle(pool).slice(0, count).map(c => ({ id: c.id, name: c.name, image: c.image || null, universe: c.universe || universe,
    power: c.power, popularity: c.popularity ?? null, test: !!c.test }));
}

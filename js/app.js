    // ============================================================================
//  STARDEW PERFECTION COCKPIT — v5
// ============================================================================

// ============ STATE ============
const STORAGE_KEY = 'stardew-perfection-v5';

const state = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.channels   ??= {};
      s.checks     ??= {};
      s.counts     ??= {};
      s.inGameDate ??= { season: 'spring', day: 1 };
      s.inGameDate.year ??= 1;
      s.predictor  ??= { seed: '', platform: 'PC', version: '1.6', jumpBack: null, searchQuery: '', searchResult: null };
      s.predictor.y1Guarantee ??= true;
      s.predictor.ccDone ??= false;
      s.weather    ??= 'sunny';
      s.activeView ??= 'spring';
      s.mode       ??= 'perfection';
      s.includeMB  ??= false;
      s.openTile   ??= null;
      // For Missing Bundle items not in ITEMS, use s.mbChannels keyed by slot index
      s.mbChecks   ??= {};
      s.bundleSlots ??= {};
      // Local-only heart event tracker (does NOT count toward perfection/CC)
      s.heChecks   ??= {};
      // Migrate: if old cc channels exist but no bundleSlots, seed bundleSlots from cc
      if (Object.keys(s.bundleSlots).length === 0 && Object.keys(s.channels).length > 0) {
        for (const b of DATA.bundles) {
          b.items.forEach((it, idx) => {
            if (it.item_id && s.channels[it.item_id]?.cc) {
              s.bundleSlots[b.id + '_' + idx] = true;
            }
          });
        }
      }
      return s;
    }
  } catch (e) {}
  return {
    channels: {}, checks: {}, counts: {},
    inGameDate: { season: 'spring', day: 1, year: 1 },
    predictor: { seed: '', platform: 'PC', version: '1.6', jumpBack: null, searchQuery: '', searchResult: null, y1Guarantee: true, ccDone: false },
    weather: 'sunny',
    activeView: 'spring',
    mode: 'perfection',
    includeMB: false,
    openTile: null,
    mbChecks: {},
    bundleSlots: {},
    heChecks: {},
  };
})();

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save'); }
}

function getChannels(id) { return state.channels[id] || { ship: false, cc: 0, cook: 0, craft: 0, mb: false }; }

function setChannel(id, ch, v) {
  const c = { ...getChannels(id) };
  c[ch] = v;
  if (!c.ship && !c.cc && !c.cook && !c.craft && !c.mb) delete state.channels[id];
  else state.channels[id] = c;
  save();
  // Surgical: update only what changed
  refreshAfterChannelChange(id);
}
function toggleChannel(id, ch) { const c = getChannels(id); setChannel(id, ch, !c[ch]); }
function adjCook(id, delta) {
  const c = getChannels(id);
  const item = itemsById[id];
  const max = item ? (state.mode === 'cc' ? (item.cookBundle || 0) : ((item.cookPerfection || 0) + (item.cookBundle || 0))) : 0;
  setChannel(id, 'cook', Math.max(0, Math.min(max, (c.cook||0) + delta)));
}
function adjCraft(id, delta) {
  const c = getChannels(id);
  const max = craftDemand(itemsById[id]) || 0;
  setChannel(id, 'craft', Math.max(0, Math.min(max, (c.craft||0) + delta)));
}
function inlineEdit(el, current, max, onCommit) {
  const input = document.createElement('input');
  input.type = 'number'; input.min = 0; input.max = max;
  input.value = current; input.style.cssText = 'width:3.5em;text-align:center;font-size:inherit;border:1px solid var(--accent);border-radius:4px;padding:1px 2px;';
  const commit = () => { const v = Math.max(0, Math.min(max, parseInt(input.value)||0)); onCommit(v); };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') input.blur(); });
  el.replaceWith(input); input.focus(); input.select();
}
function toggleCheck(id) {
  if (state.checks[id]) delete state.checks[id]; else state.checks[id] = true;
  save();
  refreshAfterCheckChange(id);
}
function toggleMBCheck(slotIdx) {
  const key = String(slotIdx);
  if (state.mbChecks[key]) delete state.mbChecks[key]; else state.mbChecks[key] = true;
  // Sync CC channel for the affected quality/base item so tile state stays in sync
  const bi = DATA.missingBundle.items[slotIdx];
  if (bi) {
    const qualItemId = bi.quality ? bi.item_id + '_' + bi.quality : bi.item_id;
    const allEntries = bundlesByItemId[qualItemId] || [];
    let ccCount = 0;
    for (const e of allEntries) {
      const si = e.bundle.items.indexOf(e.item);
      if (e.bundle.id === 'missing') {
        if (state.mbChecks[String(si)]) ccCount += (e.item.qty || 1);
      } else {
        if (state.bundleSlots[e.bundle.id + '_' + si]) ccCount += (e.item.qty || 1);
      }
    }
    setChannel(qualItemId, 'cc', ccCount);
  }
  save();
  refreshAfterMBChange();
}
function setCount(id, n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v === 0) delete state.counts[id]; else state.counts[id] = v;
  save();
  refreshAfterCountChange(id);
}
function adjCount(id, d) { setCount(id, (state.counts[id]||0) + d); }

// ============ DOM ============
function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return e;
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
// Inline quality star element
function qStar(quality) { return quality ? h('span', { class: 'q-star ' + quality, title: cap(quality) + ' quality' }, '★') : null; }
// Display name for a material: base name + star (no text prefix)
function matDisplayName(name, isQualityItem) {
  if (isQualityItem) {
    const m = name.match(/^(Gold|Silver|Iridium) (.+)$/);
    if (m) return { baseName: m[2], quality: m[1].toLowerCase() };
  }
  return { baseName: name, quality: null };
}

// IMAGES is the base64 sprite map provided by the build (may be empty during dev).
// Order of preference: inline base64 → wiki URL fallback.
function spriteSrc(filename) {
  if (typeof IMAGES !== 'undefined') {
    if (IMAGES[filename]) return IMAGES[filename];
    const decoded = decodeURIComponent(filename);
    if (IMAGES[decoded]) return IMAGES[decoded];
  }
  return null;
}
function ITEM_IMG(it)  { return spriteSrc(it.image); }
function PORTRAIT(v)   { return spriteSrc(v.name.replace(/ /g,'_') + '.png'); }
function ICON(filename, size) { const s = spriteSrc(filename); if (!s) return null; return h('img', { src: s, class: 'inline-icon', style: 'width:'+(size||16)+'px;height:'+(size||16)+'px;vertical-align:middle;object-fit:contain;image-rendering:pixelated;' }); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toast._t) clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 1800);
}

const MONSTER_SPRITES = {
  'mo-slime': 'Green_Slime.png', 'mo-void': 'Shadow_Brute.png', 'mo-bats': 'Bat.png',
  'mo-skeleton': 'Skeleton.png', 'mo-insects': 'Bug.png', 'mo-duggies': 'Duggy.png',
  'mo-dust': 'Dust_Sprite.png', 'mo-rockcrab': 'Rock_Crab.png', 'mo-mummies': 'Mummy.png',
  'mo-rex': 'Pepper_Rex.png', 'mo-serpents': 'Serpent.png', 'mo-magma': 'Magma_Sprite.png'
};

const WALNUT_HINTS = {
  'wa-coconut': 'Shake palm trees on Ginger Island; crack at Blacksmith',
  'wa-fishing': 'Fish anywhere on Ginger Island (ocean, river, pond)',
  'wa-east': 'Hidden in bushes and ground spots on Island East',
  'wa-banana': 'Place a Banana on the altar at the jungle shrine (Island East)',
  'wa-leohut': 'Shake the large tree next to Leo\u2019s treehouse',
  'wa-gembirds': 'Kill Gem Birds around the island, bring gems to the shrine on Island West',
  'wa-west': 'Hidden in bushes, trees, and ground on Island West',
  'wa-gourmand': 'Grow the crops requested by the Gourmand Frog in the island farm cave',
  'wa-journal6': 'Dig at the spot described in Journal Scrap #6',
  'wa-mussel': 'Break mussel stone nodes on the island beaches',
  'wa-mole': 'Whack-a-mole mini-game on Island West (near the farm)',
  'wa-piratewife': 'Complete the Pirate\u2019s Wife quest chain from the cove',
  'wa-journal4': 'Dig at the spot described in Journal Scrap #4',
  'wa-tigerslimes': 'Kill Tiger Slimes found on Ginger Island',
  'wa-simon': 'Complete the crystal memory game on Island North',
  'wa-north': 'Hidden in bushes, dig spots, and trees on Island North',
  'wa-fieldoffice': 'Donate fossils (bones & snake parts) to the Island Field Office',
  'wa-journal10': 'Dig at the spot described in Journal Scrap #10',
  'wa-mining': 'Break rocks and ore nodes in the Volcano Dungeon',
  'wa-forge': 'Hidden spots on the Volcano Forge floor (top level)',
  'wa-south': 'Hidden in bushes and ground on Island South (beach area)',
  'wa-starfish': 'Fish in the starfish tide pool on Island South',
  'wa-mermaid': 'Play the correct notes at the Mermaid Show (rain, night)',
  'wa-piratedarts': 'Win the darts mini-game at the Pirate Cove',
  'wa-birdie': 'Complete Birdie\u2019s quest (starts at Island West hut)',
  'wa-parrot': 'Tip the first Parrot Express ride (10 walnuts to unlock)'
};

const MONSTER_HINTS = {
  'mo-slime': 'Mines (all levels), Secret Woods, Skull Cavern, Mutant Bug Lair',
  'mo-void': 'Mines (floors 80\u2013120): Shadow Brutes & Shaman',
  'mo-bats': 'Mines (floors 40\u201379): Bats & Frost Bats',
  'mo-skeleton': 'Mines (floors 70\u201379), Skull Cavern',
  'mo-insects': 'Mines (floors 1\u201329): Bugs, Grubs & Flies',
  'mo-duggies': 'Mines (floors 6\u201329): pop out of the ground',
  'mo-dust': 'Mines (floors 40\u201379): frozen levels',
  'mo-rockcrab': 'Mines (floors 1\u201339), Skull Cavern (Iridium Crabs count)',
  'mo-mummies': 'Skull Cavern: use bombs to finish them off',
  'mo-rex': 'Skull Cavern: prehistoric floors (random)',
  'mo-serpents': 'Skull Cavern: flying, appear from floor ~50+',
  'mo-magma': 'Volcano Dungeon (Ginger Island)'
};

// ============ INDEXES ============
const itemsById = Object.fromEntries(DATA.items.map(i => [i.id, i]));
const itemsBySeason = { spring: [], summer: [], fall: [], winter: [], any: [] };
for (const item of DATA.items) for (const s of item.seasons) itemsBySeason[s].push(item);
const villagersById = Object.fromEntries(DATA.villagers.map(v => [v.id, v]));

// Bundles indexed by item_id (one item can appear in multiple bundles)
const bundlesByItemId = {};
for (const b of DATA.bundles) {
  for (const it of b.items) {
    if (it.item_id) (bundlesByItemId[it.item_id] ??= []).push({bundle: b, item: it});
  }
}
// Index Missing Bundle items the same way
for (const it of DATA.missingBundle.items) {
  // Assign item_id from DATA.items if missing
  if (!it.item_id) {
    const found = DATA.items.find(i => i.name === it.name);
    if (found) { it.item_id = found.id; }
    else {
      // Create a synthetic item for things like Prismatic Shard that aren't in DATA.items
      const synId = it.name.toLowerCase().replace(/[^a-z]/g, '');
      it.item_id = synId;
      const synItem = { id: synId, name: it.name, kind: 'resource', image: it.image,
        seasons: ['any'], forShipping: false, forFish: false, cc: null,
        cook: 0, url: 'https://stardewvalleywiki.com/' + it.name.replace(/ /g, '_'),
        where: it.hint || '', when: '', qualityItem: false };
      DATA.items.push(synItem);
      itemsById[synId] = synItem;
      (itemsBySeason['any'] ??= []).push(synItem);
    }
  }
  (bundlesByItemId[it.item_id] ??= []).push({bundle: DATA.missingBundle, item: it});
}

// Create virtual items for quality bundle requirements as completely separate items
for (const [itemId, entries] of Object.entries(bundlesByItemId)) {
  const qualEntries = entries.filter(e => e.item.quality);
  if (qualEntries.length === 0) continue;
  const baseItem = DATA.items.find(i => i.id === itemId);
  if (!baseItem) continue;
  for (const qe of qualEntries) {
    const qualId = itemId + '_' + qe.item.quality;
    const qualName = cap(qe.item.quality) + ' ' + baseItem.name;
    const vItem = { id: qualId, name: qualName, kind: baseItem.kind, image: baseItem.image,
      seasons: baseItem.seasons, forShipping: false, forFish: false, cc: qe.bundle.id === 'missing' ? null : qe.bundle.name,
      cook: 0, url: baseItem.url, where: baseItem.where, when: baseItem.when,
      qualityItem: true, baseItemId: itemId, quality: qe.item.quality };
    DATA.items.push(vItem);
    for (const s of vItem.seasons) (itemsBySeason[s] ??= []).push(vItem);
    (bundlesByItemId[qualId] ??= []).push(qe);
  }
  // Remove quality entries from original item
  bundlesByItemId[itemId] = entries.filter(e => !e.item.quality);
}
// Register quality items in itemsById so popovers can find them
for (const item of DATA.items) { if (item.qualityItem) itemsById[item.id] = item; }



const ROOM_ORDER = ['Crafts Room', 'Pantry', 'Fish Tank', 'Boiler Room', 'Bulletin Board', 'Vault'];

// The 8 Rarecrows — collecting all grants the Deluxe Scarecrow recipe. Tracked with crafting.
const RARECROWS = [
  { id: 'cr-rarecrow-1', name: 'Rarecrow #1', sprite: 'rarecrow_1.png', obtain: 'Purchase at the Stardew Valley Fair for 800 star tokens.' },
  { id: 'cr-rarecrow-2', name: 'Rarecrow #2', sprite: 'rarecrow_2.png', obtain: 'Purchase at the Spirit\u2019s Eve festival for 5,000g.' },
  { id: 'cr-rarecrow-3', name: 'Rarecrow #3', sprite: 'rarecrow_3.png', obtain: 'Purchase at the Casino for 10,000 Qi coins.' },
  { id: 'cr-rarecrow-4', name: 'Rarecrow #4', sprite: 'rarecrow_4.png', obtain: 'Purchase at the Traveling Cart randomly during fall or winter for 4,000g, or at the Festival of Ice for 5,000g.' },
  { id: 'cr-rarecrow-5', name: 'Rarecrow #5', sprite: 'rarecrow_5.png', obtain: 'Purchase at the Flower Dance for 2,500g.' },
  { id: 'cr-rarecrow-6', name: 'Rarecrow #6', sprite: 'rarecrow_6.png', obtain: 'Purchase from the Dwarf for 2,500g.' },
  { id: 'cr-rarecrow-7', name: 'Rarecrow #7', sprite: 'rarecrow_7.png', obtain: 'Donate 20 Artifacts (not counting Minerals) to the Museum. Can be bought from the Night Market once the first is earned.' },
  { id: 'cr-rarecrow-8', name: 'Rarecrow #8', sprite: 'rarecrow_8.png', obtain: 'Donate 40 items to the Museum. Can be bought from the Night Market once the first is earned.' },
];
// Group the Deluxe Scarecrow recipe with its 8 rarecrow prerequisites as one tracked goal.
// The recipe keeps its ingredients, so Wood/Fiber/Iridium still feed the material counters.
(() => {
  const item = DATA.craftingGroups.flatMap(g => g.items).find(i => i.id === 'cr-deluxescarecrow');
  for (const g of DATA.craftingGroups) g.items = g.items.filter(i => i.id !== 'cr-deluxescarecrow');
  const deluxe = item ? { ...item, sprite: 'deluxe_scarecrow.png' } : { id: 'cr-deluxescarecrow', name: 'Deluxe Scarecrow', sprite: 'deluxe_scarecrow.png' };
  DATA.craftingGroups.push({ group: 'Deluxe Scarecrow', items: [deluxe, ...RARECROWS] });
})();

// Crafting recipes indexed by ingredient item name → [{recipeId, qty}]
const craftByItemName = {};
for (const g of DATA.craftingGroups) {
  for (const r of g.items) {
    if (!r.ingredients) continue;
    for (const m of r.ingredients.matchAll(/([A-Za-z' \-]+?)\s*\((\d+)\)/g)) {
      const name = m[1].trim();
      const qty = parseInt(m[2], 10);
      (craftByItemName[name] ??= []).push({ recipeId: r.id, qty });
    }
  }
}
// Include obelisk building ingredients as craft demands
for (const ob of DATA.obelisks) {
  if (!ob.ingredients) continue;
  for (const m of ob.ingredients.matchAll(/([A-Za-z' \-]+?)\s*\((\d+)\)/g)) {
    const name = m[1].trim();
    const qty = parseInt(m[2], 10);
    (craftByItemName[name] ??= []).push({ recipeId: ob.id, qty });
  }
}

// Resolve cooking & crafting recipe ingredients recursively to base resources
const recipeByName = {};
const INGREDIENT_RE = /([A-Za-z' \-]+?)\s*\((\d+)\)/g;
for (const r of DATA.cooking) {
  recipeByName[r.name] = r.ingredients;
}
for (const g of DATA.craftingGroups) {
  for (const r of g.items) {
    if (r.ingredients) recipeByName[r.name] = r.ingredients;
  }
}
function resolveIngredients(ingredientStr, qty, seen) {
  if (!ingredientStr) return {};
  seen = seen || new Set();
  const result = {};
  for (const m of ingredientStr.matchAll(INGREDIENT_RE)) {
    const name = m[1].trim();
    const need = parseInt(m[2], 10) * qty;
    if (seen.has(name)) { result[name] = (result[name] || 0) + need; continue; }
    if (recipeByName[name]) {
      seen.add(name);
      const sub = resolveIngredients(recipeByName[name], need, seen);
      seen.delete(name);
      for (const [k, v] of Object.entries(sub)) result[k] = (result[k] || 0) + v;
    } else {
      result[name] = (result[name] || 0) + need;
    }
  }
  return result;
}
// Recompute item.cook: total quantity of each base item needed across all cooking recipes
const cookCountByName = {};
for (const r of DATA.cooking) {
  const baseIngredients = resolveIngredients(r.ingredients, 1, new Set());
  for (const [name, qty] of Object.entries(baseIngredients)) {
    cookCountByName[name] = (cookCountByName[name] || 0) + qty;
  }
}
// Also compute cook demand from cooked/crafted items in bundles
const bundleCookByName = {};
for (const b of DATA.bundles) {
  if (b.id.startsWith('vault-')) continue;
  for (const it of b.items) {
    const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
    if (recipeByName[matName]) {
      const base = resolveIngredients(recipeByName[matName], it.qty || 1, new Set());
      for (const [n, q] of Object.entries(base)) bundleCookByName[n] = (bundleCookByName[n] || 0) + q;
    }
  }
}
for (const item of DATA.items) {
  item.cookPerfection = cookCountByName[item.name] || 0;
  item.cookBundle = bundleCookByName[item.name] || 0;
  item.cook = item.cookPerfection + item.cookBundle;
}

function craftDemand(item) {
  const entries = craftByItemName[item.name];
  if (!entries || !entries.length) return 0;
  let total = 0;
  for (const e of entries) total += e.qty;
  return total;
}
function craftGot(item) {
  const entries = craftByItemName[item.name];
  if (!entries || !entries.length) return 0;
  let got = 0;
  for (const e of entries) { if (state.checks[e.recipeId]) got += e.qty; }
  return got;
}

// ============ DEMAND / PROGRESS ============
function ccNeeded(item) {
  const entries = bundlesByItemId[item.id];
  if (!entries || !entries.length) return 0;
  let total = 0;
  for (const e of entries) {
    if (e.bundle.id === 'missing' && !state.includeMB) continue;
    if (isBundleDone(e.bundle)) continue;
    const slotIdx = e.bundle.items.indexOf(e.item);
    if (bundleSlotDone(e.bundle, e.item, slotIdx)) continue;
    total += (e.item.qty || 1);
  }
  return total;
}
function demand(item) {
  const inBundle = !!(bundlesByItemId[item.id] && bundlesByItemId[item.id].length);
  if (state.mode === 'cc') {
    const cc = inBundle ? ccNeeded(item) : 0;
    const cook = item.cookBundle || 0;
    return { ship: 0, fish: 0, cc, cook, craft: 0, mb: 0, total: cc + cook };
  }
  const fish = item.forFish ? 1 : 0;
  const cc = inBundle ? ccNeeded(item) : 0;
  const craft = craftDemand(item);
  const cook = (item.cookPerfection || 0) + (item.cookBundle || 0);
  return {
    ship: item.forShipping ? 1 : 0,
    fish,
    cc,
    cook,
    craft,
    mb:   0,
    total: (item.forShipping ? 1 : 0) + fish + cc + cook + craft,
  };
}
function progress(item) {
  const c = getChannels(item.id);
  const d = demand(item);
  const fishDone = !d.fish || c.ship;
  const craftVal = Math.min(d.craft, c.craft || 0);
  const craftDone = craftVal >= d.craft;
  const ccGot = Math.min(d.cc, c.cc || 0);
  const ccDone = ccGot >= d.cc;
  return {
    ship: c.ship ? 1 : 0,
    cc: ccGot,
    cook: c.cook || 0,
    craft: craftVal,
    got: (c.ship?1:0)*(d.ship?1:0) + (c.ship?1:0)*(d.fish?1:0) + ccGot + (d.cook ? Math.min(d.cook, c.cook||0) : 0) + craftVal,
    total: d.total,
    done: (c.ship || !d.ship) && fishDone && ccDone && ((c.cook||0) >= d.cook) && craftDone,
    shipDone: c.ship || !d.ship,
    fishDone,
    ccDone,
    cookDone: (c.cook||0) >= d.cook,
    craftDone,
  };
}
// In CC mode, hide items that aren't in any CC bundle
function isItemRelevant(item) {
  if (state.mode === 'cc') {
    const entries = bundlesByItemId[item.id];
    if (!entries || !entries.length) return false;
    // Has at least one non-MB bundle, or MB is enabled
    return entries.some(e => e.bundle.id !== 'missing' || state.includeMB);
  }
  return true;
}

// ============ SCORE ============
function computeScore() {
  const r = {};
  const W = DATA.weights;
  if (state.mode === 'cc') {
    const ccItems = DATA.items.filter(i => i.cc);
    const got = ccItems.filter(i => { const p = progress(i); return p.ccDone; }).length;
    r.cc = { got, total: ccItems.length, weight: 1.0 };
    r.total = ccItems.length > 0 ? got / ccItems.length : 0;
    if (state.includeMB) {
      const mbDone = DATA.missingBundle.items.filter((_, i) => state.mbChecks[String(i)]).length;
      r.missingBundle = { got: mbDone, total: DATA.missingBundle.slots_to_fill, weight: 0 };
    }
    return r;
  }
  const ship = DATA.items.filter(i => i.forShipping);
  r.shipping = { got: ship.filter(i => getChannels(i.id).ship).length, total: ship.length, weight: W.shipping };
  const fish = DATA.items.filter(i => i.forFish);
  r.fish = { got: fish.filter(i => getChannels(i.id).ship).length, total: fish.length, weight: W.fish }; // ship channel = caught for fish
  r.friends   = { got: DATA.villagers.filter(v => state.checks[v.id]).length, total: DATA.villagers.length, weight: W.friends };
  r.skills    = { got: DATA.skills.filter(s => state.checks[s.id]).length,    total: DATA.skills.length,    weight: W.skills };
  r.stardrops = { got: DATA.stardrops.filter(s => state.checks[s.id]).length, total: DATA.stardrops.length, weight: W.stardrops };
  r.cooking   = { got: DATA.cooking.filter(c => state.checks[c.id]).length,   total: DATA.cooking.length,   weight: W.cooking };
  const allCraft = DATA.craftingGroups.flatMap(g => g.items);
  r.crafting = { got: allCraft.filter(c => state.checks[c.id]).length, total: allCraft.length, weight: W.crafting };
  const waTotal = DATA.walnuts.reduce((s, w) => s + w.total, 0);
  const waGot   = DATA.walnuts.reduce((s, w) => s + Math.min(state.counts[w.id] || 0, w.total), 0);
  r.walnuts = { got: waGot, total: waTotal, weight: W.walnuts };
  r.monster  = { got: DATA.monsters.filter(m => (state.counts[m.id] || 0) >= m.target).length, total: DATA.monsters.length, weight: W.monster };
  r.obelisks = { got: DATA.obelisks.filter(o => state.checks[o.id]).length, total: DATA.obelisks.length, weight: W.obelisks };
  r.goldClock = { got: state.checks[DATA.goldClock.id] ? 1 : 0, total: 1, weight: W.goldClock };
  let total = 0;
  for (const [, v] of Object.entries(r)) total += v.weight * (v.total > 0 ? v.got / v.total : 0);
  r.total = total;
  if (state.includeMB) {
    const mbDone = DATA.missingBundle.items.filter((_, i) => state.mbChecks[String(i)]).length;
    r.missingBundle = { got: mbDone, total: DATA.missingBundle.slots_to_fill, weight: 0 };
  }
  return r;
}

// Bundle done?
function bundleDoneCount(b) {
  return b.items.filter((it, idx) => bundleSlotDone(b, it, idx)).length;
}
function bundleSlotDone(b, it, idx) {
  if (b.id === 'missing') return !!state.mbChecks[String(idx)];
  return !!state.bundleSlots[b.id + '_' + idx];
}
function isBundleDone(b) {
  const need = b.slots_to_fill;
  return bundleDoneCount(b) >= need;
}

// ============ RENDER COORDINATION ============
let renderScheduled = false;
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => { renderScheduled = false; render(); });
}

let currentDOM = null;
function render() {
  document.body.className = state.mode === 'cc' ? 'mode-cc' : 'mode-perfection';
  if (typeof Predictor !== 'undefined') Predictor.setOptions({ y1Guarantee: state.predictor.y1Guarantee !== false });
  const app = document.getElementById('app');
  if (!currentDOM) {
    currentDOM = {};
    currentDOM.topbar = h('div'); app.appendChild(currentDOM.topbar);
    currentDOM.hero = h('div'); app.appendChild(currentDOM.hero);
    currentDOM.now = h('div'); app.appendChild(currentDOM.now);
    currentDOM.tabs = h('div'); app.appendChild(currentDOM.tabs);
    currentDOM.body = h('div'); app.appendChild(currentDOM.body);
    currentDOM.footer = h('div'); app.appendChild(currentDOM.footer);
  }
  replaceContents(currentDOM.topbar, renderTopbar());
  replaceContents(currentDOM.hero, renderHero());
  replaceContents(currentDOM.now, renderRightNow());
  replaceContents(currentDOM.tabs, renderSeasonTabs());

  const pr = state.predictor;
  const prKey = `${pr.seed}|${pr.platform}|${pr.searchResult ? pr.searchResult.dp + '-' + pr.searchResult.detail + '-' + (pr.searchResult.notFound ? 'nf' : '') : ''}|${pr.jumpBack ? '1' : '0'}|${pr.y1Guarantee !== false ? '1' : '0'}|${pr.ccDone ? '1' : '0'}`;
  const bodyKey = `${state.activeView}:${state.mode}:${state.includeMB}:${state.inGameDate.season}:${state.inGameDate.day}:${state.inGameDate.year}:${prKey}`;
  if (currentDOM.bodyKey !== bodyKey) {
    replaceContents(currentDOM.body, state.activeView === 'reference' ? renderReference() : renderSeasonView(state.activeView));
    currentDOM.bodyKey = bodyKey;
  } else {
    refreshTileStates(currentDOM.body);
  }
  replaceContents(currentDOM.footer, renderFooter());
  if (state.openTile) renderPopover();
}

function replaceContents(slot, newChild) {
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  if (newChild) slot.appendChild(newChild);
}

// ============ SURGICAL UPDATES ============
// These are called instead of scheduleRender() when only specific items change.
function refreshAfterChannelChange(itemId) {
  // Update tiles for this item (cockpit + bundle slots)
  document.querySelectorAll(`[data-item-id="${itemId}"]`).forEach(node => {
    if (node.classList.contains('tile')) updateTileState(node, itemsById[itemId]);
  });
  // Update bundle slots that reference this item
  document.querySelectorAll(`[data-bundle-slot-item="${itemId}"]`).forEach(slot => {
    const bundleId = slot.dataset.bundleId;
    const idx = parseInt(slot.dataset.slotIdx);
    const b = DATA.bundles.find(bb => bb.id === bundleId) || (bundleId === 'missing' ? DATA.missingBundle : null);
    if (b) updateBundleSlotState(slot, b, b.items[idx], idx);
  });
  // Update bundle done counts
  refreshBundleProgress();
  // Update Right Now widget (fish/forage/crops counts shift when items get done)
  if (currentDOM?.now) replaceContents(currentDOM.now, renderRightNow());
  // Update hero rings + mini-rings
  if (currentDOM?.hero) replaceContents(currentDOM.hero, renderHero());
  // Update season tab percentages
  if (currentDOM?.tabs) replaceContents(currentDOM.tabs, renderSeasonTabs());
  // Update popover if open and it's for this item
  if (state.openTile === itemId) renderPopover();
  // Refresh materials section (demands change when items are checked off)
  refreshMaterialsSection();
}

function refreshAfterCheckChange(checkId) {
  // checkId is a villager/skill/stardrop/cooking/crafting/obelisk id
  // Find the matching .list-item or .villager-card and update its state
  document.querySelectorAll(`[data-check-id="${checkId}"]`).forEach(node => {
    const isDone = !!state.checks[checkId];
    node.classList.toggle('done', isDone);
  });
  if (currentDOM?.hero) replaceContents(currentDOM.hero, renderHero());
  if (currentDOM?.tabs) replaceContents(currentDOM.tabs, renderSeasonTabs());
  // Refresh section count for the affected ref section
  refreshRefSectionCounts();
  // Refresh materials section (recipe completion changes material demands)
  refreshMaterialsSection();
  // Refresh gold tracker (obelisk/vault/clock toggles affect it)
  refreshGoldTracker();
}

function refreshAfterMBChange() {
  // Update each MB slot
  document.querySelectorAll(`[data-bundle-id="missing"]`).forEach(slot => {
    const idx = parseInt(slot.dataset.slotIdx);
    updateBundleSlotState(slot, DATA.missingBundle, DATA.missingBundle.items[idx], idx);
  });
  refreshBundleProgress();
  if (currentDOM?.hero) replaceContents(currentDOM.hero, renderHero());
  refreshMaterialsSection();
  if (state.openTile) renderPopover();
}

function refreshAfterCountChange(id) {
  // Update counter row
  document.querySelectorAll(`[data-counter-id="${id}"]`).forEach(node => {
    const target = parseInt(node.dataset.target);
    const cur = state.counts[id] || 0;
    node.classList.toggle('done', cur >= target);
    const fill = node.querySelector('.cr-bar .fill');
    if (fill) fill.style.width = `${Math.min(100, cur/target*100)}%`;
    const input = node.querySelector('input');
    if (input && parseInt(input.value) !== cur) input.value = cur;
  });
  if (currentDOM?.hero) replaceContents(currentDOM.hero, renderHero());
  refreshRefSectionCounts();
}

function refreshBundleProgress() {
  // Update each bundle header progress
  document.querySelectorAll('[data-bundle-card]').forEach(card => {
    const bundleId = card.dataset.bundleCard;
    const b = DATA.bundles.find(bb => bb.id === bundleId) || (bundleId === 'missing' ? DATA.missingBundle : null);
    if (!b) return;
    const done = bundleDoneCount(b);
    const target = b.slots_to_fill;
    card.classList.toggle('done', done >= target);
    const prog = card.querySelector('.bundle-progress');
    if (prog) prog.textContent = `${done}/${target}`;
  });
  // Update room progress counters
  document.querySelectorAll('[data-room-progress]').forEach(rp => {
    const room = rp.dataset.roomProgress;
    const bundles = DATA.bundles.filter(b => b.room === room);
    const done = bundles.filter(b => isBundleDone(b)).length;
    rp.textContent = `${done}/${bundles.length} bundles`;
  });
}

function refreshRefSectionCounts() {
  const p = computeScore();
  const map = {
    'cc-bundles': null, // computed differently
    'missing-bundle': p.missingBundle,
    'skills': p.skills, 'friends': p.friends, 'stardrops': p.stardrops,
    'obelisks': p.obelisks ? { got: p.obelisks.got + (p.goldClock?.got||0), total: p.obelisks.total + (p.goldClock ? 1 : 0) } : null,
    'walnuts': p.walnuts, 'cooking': p.cooking, 'crafting': p.crafting,
    'monsters': p.monster,
  };
  for (const [key, v] of Object.entries(map)) {
    if (!v) continue;
    document.querySelectorAll(`[data-ref-count="${key}"]`).forEach(node => {
      node.textContent = `${v.got} / ${v.total}`;
    });
  }
  // CC bundles count
  const ccDone = DATA.bundles.filter(b => isBundleDone(b)).length;
  document.querySelectorAll(`[data-ref-count="cc-bundles"]`).forEach(node => {
    node.textContent = `${ccDone} / ${DATA.bundles.length} bundles`;
  });
}

function refreshMaterialsSection() {
  const existing = document.getElementById('section-materials');
  if (!existing) return;
  const newSection = renderMaterialsSection();
  if (newSection) existing.replaceWith(newSection);
  else existing.remove();
}

// ============ COCKPIT TILE STATE ============
function refreshTileStates(root) {
  for (const tile of root.querySelectorAll('.tile[data-item-id]')) {
    const id = tile.dataset.itemId;
    const item = itemsById[id];
    if (item) updateTileState(tile, item);
  }
}

// ============ TOPBAR ============
function renderTopbar() {
  return h('div', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('span', { class: 'accent' }, 'MrKg\'s'),
      h('div', { class: 'brand-title' }, 'Stardew ', h('span', { class: 'accent' }, 'Cockpit')),
      h('div', { class: 'brand-sub' }, '· perfection assistant')
    ),
    h('div', { class: 'mode-toggle' },
      h('button', { class: 'perfection' + (state.mode === 'perfection' ? ' active' : ''),
        on: { click: () => { state.mode = 'perfection'; save(); scheduleRender(); } },
        title: 'Track everything needed for 100% perfection'
      }, '🎯 Perfection'),
      h('button', { class: 'cc' + (state.mode === 'cc' ? ' active' : ''),
        on: { click: () => { state.mode = 'cc'; save(); scheduleRender(); } },
        title: 'Track only Community Center bundles'
      }, '🏛️ CC Only')
    ),
    h('button', { class: 'mb-toggle' + (state.includeMB ? ' active' : ''),
      on: { click: () => { state.includeMB = !state.includeMB; save(); scheduleRender(); toast(state.includeMB ? 'Missing Bundle: ON' : 'Missing Bundle: OFF'); } },
      title: 'Toggle Missing Bundle (post-CC bonus → Movie Theater)'
    },
      h('span', { class: 'mb-toggle-dot' }),
      'Missing Bundle'
    ),
    h('div', { class: 'topbar-spacer' }),
    predSeedControls(),
    h('button', { class: 'btn', on: { click: exportData } }, '↓ Export'),
    h('button', { class: 'btn', on: { click: importData } }, '↑ Import'),
    h('button', { class: 'btn btn-danger', on: { click: resetData } }, 'Reset')
  );
}
function predSeedControls() {
  const p = state.predictor;
  const seed = h('input', { class: 'btn pred-seed-input', type: 'text', inputmode: 'numeric', placeholder: 'Game seed', value: p.seed ?? '', title: 'Your save\u2019s unique Game ID / seed (for cart & shop predictions)' });
  seed.addEventListener('change', (e) => { p.seed = e.target.value.trim(); save(); scheduleRender(); });
  const plat = h('select', { class: 'btn pred-plat-select', title: 'Platform (affects the RNG)' });
  for (const pl of ['PC', 'Switch']) { const o = h('option', { value: pl }, pl); if (pl === p.platform) o.setAttribute('selected', ''); plat.appendChild(o); }
  plat.addEventListener('change', (e) => { p.platform = e.target.value; save(); scheduleRender(); });
  const optToggle = (label, title, checked, onChange) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = checked;
    box.addEventListener('change', (e) => onChange(e.target.checked));
    return h('label', { class: 'pred-opt', title }, box, h('span', {}, label));
  };
  return h('div', { class: 'pred-seed-group' },
    seed, plat,
    h('span', { class: 'pred-ver-note', title: 'Cart & shop predictions are computed for Stardew 1.6+' }, '1.6+'),
    optToggle('Y1 guarantee', 'Save option \u201cGuarantee Year 1 Completable\u201d \u2014 forces Red Cabbage Seeds into the cart during year 1.',
      p.y1Guarantee !== false, (v) => { p.y1Guarantee = v; save(); scheduleRender(); }),
    optToggle('CC done', 'Community Center restored \u2014 Pierre\u2019s no longer closes on Wednesdays.',
      !!p.ccDone, (v) => { p.ccDone = v; save(); scheduleRender(); })
  );
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `stardew-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url); toast('Exported');
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { Object.assign(state, JSON.parse(r.result)); save(); currentDOM = null;
            document.getElementById('app').innerHTML = ''; scheduleRender(); toast('Imported'); }
      catch (e) { toast('Bad file'); }
    };
    r.readAsText(f);
  };
  inp.click();
}
function resetData() {
  if (!confirm('Wipe all progress?')) return;
  state.channels = {}; state.checks = {}; state.counts = {}; state.mbChecks = {}; state.bundleSlots = {};
  save(); currentDOM = null;
  document.getElementById('app').innerHTML = '';
  scheduleRender(); toast('Reset');
}

// ============ HERO ============
// Mini-rings are clickable; clicking jumps to that section in the Reference tab.
function navigateToSection(anchorId) {
  if (state.activeView !== 'reference') {
    state.activeView = 'reference';
    save();
    scheduleRender();
    // Wait for render to commit, then scroll
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(anchorId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  } else {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderHero() {
  const p = computeScore();
  const total = p.total || 0;
  const pct = Math.floor(total * 100);
  const dec = Math.floor((total * 1000) % 10);
  const C = 2 * Math.PI * 42;

  const ring = h('div', { class: 'perf-ring' + (state.mode === 'cc' ? ' cc' : '') });
  ring.innerHTML = `
    <svg viewBox="0 0 100 100">
      <defs>
        <linearGradient id="perfGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7eb35a"/>
          <stop offset="50%" stop-color="#5e7c47"/>
          <stop offset="100%" stop-color="#c6a04d"/>
        </linearGradient>
      </defs>
      <circle class="bg" cx="50" cy="50" r="42" stroke-width="6"/>
      <circle class="fg" cx="50" cy="50" r="42" stroke-width="8"
              stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - total)}"/>
    </svg>
    <div class="label">
      <div class="val">${pct}.${dec}%</div>
      <div class="sub">${state.mode === 'cc' ? 'CC Done' : 'Perfection'}</div>
    </div>`;

  let minis;
  if (state.mode === 'cc') {
    // Per-bundle breakdown — group by room
    const rooms = ROOM_ORDER.concat(state.includeMB ? ['Abandoned JojaMart'] : []);
    const bundles = state.includeMB ? DATA.bundles.concat([DATA.missingBundle]) : DATA.bundles;
    const ROOM_HINTS = {
      'Crafts Room': 'Room reward: Repairs the bridge to the Quarry.',
      'Pantry': 'Room reward: Restores the Greenhouse (grow crops year-round).',
      'Fish Tank': 'Room reward: Removes Glittering Boulder & grants Copper Pan.',
      'Boiler Room': 'Room reward: Repairs the Minecarts (Bus Stop, Mines, Quarry, Town).',
      'Bulletin Board': 'Room reward: +2 hearts with all non-datable villagers.',
      'Vault': 'Room reward: Repairs the Bus to Calico Desert. Total cost: 42,500g.',
      'Abandoned JojaMart': 'Reward: Unlocks the Movie Theater. Requires completing the Community Center first.',
    };
    minis = h('div', { class: 'mini-rings' },
      bundles.sort((a,b) => rooms.indexOf(a.room) - rooms.indexOf(b.room)).map(b => {
        const done = bundleDoneCount(b);
        const target = b.slots_to_fill;
        const isDone = done >= target;
        return h('div', { class: 'mini' + (isDone ? ' done' : ''),
          title: `${b.name}: ${done}/${target}`,
          on: {
            click: () => navigateToSection(`bundle-${b.id}`),
            contextmenu: (e) => { e.preventDefault(); showCounterPopover(b.name, (b.reward ? 'Reward: ' + b.reward + '\n' : '') + (ROOM_HINTS[b.room] || ''), 'https://stardewvalleywiki.com/Bundles', b.reward_image || 'Bundle_Purple.png'); }
          }
        },
          h('div', { class: 'mini-icon' }, isDone ? '✓' : '🎁'),
          h('div', { class: 'mini-label' }, b.name.length > 10 ? b.name.slice(0,9) + '…' : b.name),
          h('div', { class: 'mini-val' }, `${done}/${target}`)
        );
      })
    );
  } else {
    const PERF_HINTS = {
      shipping: 'Ship one of every item (154 total). Worth 15% of perfection.',
      fish: 'Catch every fish in the collections tab (72 total). Worth 10% of perfection.',
      friends: 'Reach max hearts with every villager (34 total). 8 hearts for datable, 10 for non-datable. Worth 11%. Kent requires Year 2+.',
      skills: 'Reach level 10 in all 5 skills (Farming, Mining, Foraging, Fishing, Combat). Worth 5%.',
      stardrops: 'Find all 7 Stardrops. Worth 10% of perfection.',
      cooking: 'Cook every recipe (81 total). Worth 10% of perfection.',
      crafting: 'Craft every item (149 recipes). Wedding Ring not required. Worth 10%.',
      walnuts: 'Find all 130 Golden Walnuts on Ginger Island. Worth 5% of perfection.',
      monster: 'Complete all 12 monster eradication goals at the Adventurer\'s Guild. Worth 10%.',
      obelisks: 'Build all 4 obelisks on the farm (Earth, Water, Desert, Island). Worth 4%.',
      goldClock: 'Build the Golden Clock on the farm. Prevents debris & fence decay. Worth 10%.',
    };
    const cats = [
      ['shipping','Mini-Shipping_Bin.png','Ship','section-ship-anchor'],
      ['fish','Bamboo_Pole.png','Fish','section-fish-anchor'],
      ['friends','Bouquet.png','Hearts','section-friends'],
      ['skills','Star_Shards.png','Skills','section-skills'],
      ['stardrops','Stardrop.png','Drops','section-stardrops'],
      ['cooking','Fried_Egg.png','Cook','section-cooking'],
      ['crafting','Dwarf_Hammer.png','Craft','section-crafting'],
      ['walnuts','Golden_Walnut.png','Walnut','section-walnuts'],
      ['monster','Galaxy_Sword.png','Monster','section-monsters'],
      ['obelisks','Obelisk.png','Obelisk','section-obelisks'],
      ['goldClock','Gold_Clock.png','Clock','section-obelisks'],
    ];
    minis = h('div', { class: 'mini-rings' },
      cats.map(([k, ic, lab, anchor]) => {
        const d = p[k];
        const done = d.got >= d.total;
        return h('div', { class: 'mini' + (done ? ' done' : ''),
          title: `${lab}: ${d.got}/${d.total} (click to jump)`,
          on: {
            click: () => {
              if (anchor === 'section-ship-anchor') {
                navigateToSection('section-cc-bundles');
              } else if (anchor === 'section-fish-anchor') {
                navigateToSection('section-fish');
              } else {
                navigateToSection(anchor);
              }
            },
            contextmenu: (e) => { e.preventDefault(); showCounterPopover(lab, PERF_HINTS[k], 'https://stardewvalleywiki.com/Perfection', ic); }
          }
        },
          h('div', { class: 'mini-icon' }, ICON(ic, 14)),
          h('div', { class: 'mini-label' }, lab),
          h('div', { class: 'mini-val' }, `${d.got}/${d.total}`)
        );
      }),
      state.includeMB && p.missingBundle ? h('div', {
        class: 'mini' + (p.missingBundle.got >= p.missingBundle.total ? ' done' : ''),
        title: 'Missing Bundle bonus',
        on: {
          click: () => navigateToSection('section-missing-bundle'),
          contextmenu: (e) => { e.preventDefault(); showCounterPopover('Missing Bundle', 'Post-CC bonus bundle in abandoned JojaMart. Completing it unlocks the Movie Theater. Requires Silver+ Wine, Dino Mayo, Prismatic Shard, Gold Ancient Fruit (5), Gold+ Void Salmon, and Caviar.', 'https://stardewvalleywiki.com/Bundles#Abandoned_JojaMart', 'Prismatic_Shard.png'); }
        }
      },
        h('div', { class: 'mini-icon' }, '✨'),
        h('div', { class: 'mini-label' }, 'Missing'),
        h('div', { class: 'mini-val' }, `${p.missingBundle.got}/${p.missingBundle.total}`)
      ) : null
    );
  }
  return h('div', { class: 'hero' }, ring, minis);
}

// ============ RIGHT NOW ============
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
function stepDay(delta) {
  let day = state.inGameDate.day + delta;
  let idx = SEASONS.indexOf(state.inGameDate.season);
  let year = state.inGameDate.year || 1;
  if (day < 1) {
    idx = (idx - 1 + 4) % 4; day = 28;
    if (state.inGameDate.season === 'spring') year -= 1; // wrapped back to prev year's winter
  } else if (day > 28) {
    idx = (idx + 1) % 4; day = 1;
    if (state.inGameDate.season === 'winter') year += 1; // wrapped into next year's spring
  }
  if (year < 1) return; // can't go before Year 1, Spring 1
  state.inGameDate.season = SEASONS[idx];
  state.inGameDate.day = day;
  state.inGameDate.year = year;
  state.activeView = state.inGameDate.season;
  save();
  scheduleRender();
}
function stepYear(delta) {
  const year = Math.max(1, (state.inGameDate.year || 1) + delta);
  state.inGameDate.year = year;
  save();
  scheduleRender();
}

// ============ PREDICTOR (oshawk 1.6 port) ============
function dpToDate(dp) {
  const year = Math.floor((dp - 1) / 112) + 1;
  const rem = (dp - 1) % 112;
  const season0 = Math.floor(rem / 28);
  const day = (rem % 28) + 1;
  return { year, season: SEASONS[season0], season0, day };
}
function predUid() {
  const n = Number(state.predictor.seed);
  return Number.isFinite(n) && String(state.predictor.seed).trim() !== '' ? n : null;
}
function jumpToDp(dp) {
  const p = state.predictor;
  p.jumpBack = { ...state.inGameDate };
  const dt = dpToDate(dp);
  state.inGameDate = { season: dt.season, day: dt.day, year: dt.year };
  state.activeView = dt.season;
  save();
  scheduleRender();
}
function jumpBackDate() {
  const p = state.predictor;
  if (!p.jumpBack) return;
  state.inGameDate = { ...p.jumpBack };
  state.activeView = state.inGameDate.season;
  p.jumpBack = null;
  save();
  scheduleRender();
}
// Map a predicted item name to its perfection-tracker DATA item (for the info popover).
const predDataByName = (() => { const m = {}; for (const it of DATA.items) if (!m[it.name]) m[it.name] = it; return m; })();
// Real wiki sprites for named cart specials that have no object-sheet icon.
const PRED_NAMED_SPRITE = {
  'Red Fez': 'red_fez.png',
  'Tea Set': 'tea_set.png',
  'Retro Catalogue': 'retro_catalogue.png',
  'Junimo Catalogue': 'junimo_catalogue.png',
  'Joja Catalogue': 'joja_catalogue.png',
  'Rarecrow (Snowman)': 'rarecrow.png',
  'Stardew Valley Almanac': 'almanac.png',
  'Bait And Bobber': 'bait_and_bobber.png',
  'Woodcutter\u2019s Weekly': 'woodcutters_weekly.png',
  'Mining Monthly': 'mining_monthly.png',
  'Combat Quarterly': 'combat_quarterly.png',
};
let _predSearchable = null;
function predSearchable() { return _predSearchable ??= (typeof Predictor !== 'undefined' ? Predictor.searchableItems() : []); }

function fmtDateShort(dp) { const d = dpToDate(dp); return `${cap(d.season)} ${d.day}, Y${d.year}`; }
function fmtPrice(priceStr) {
  const n = parseInt(String(priceStr).replace(/[^0-9]/g, ''), 10);
  if (!isFinite(n)) return String(priceStr);
  if (n >= 1000) { const k = n / 1000; return (Number.isInteger(k) ? k : k.toFixed(1)) + 'k'; }
  return n + 'g';
}

// Sprite element for a predicted item (object sheet crop, named wiki sprite, or a kind-based default).
function predSprite(item, px) {
  const named = PRED_NAMED_SPRITE[item.name];
  if (named) return h('div', { class: 'pred-sprite pred-sprite-img', style: `width:${px}px;height:${px}px;` },
    h('img', { src: 'assets/pred/' + named, style: `width:${px}px;height:${px}px;object-fit:contain;image-rendering:pixelated;` }));
  const kind = item.kind || 'object';
  const idx = kind === 'object' ? Predictor.objSprite(item.id) : null;
  if (idx != null) {
    const col = idx % 24, row = Math.floor(idx / 24);
    return h('div', { class: 'pred-sprite', style:
      `background-image:url(assets/springobjects.png);background-size:${24 * px}px ${39 * px}px;` +
      `background-position:-${col * px}px -${row * px}px;width:${px}px;height:${px}px;` });
  }
  let file = 'assets/default_furniture.png';
  if (kind === 'shirt') file = 'assets/default_shirt.png';
  else if (kind === 'wallpaper') file = 'assets/default_wallpaper.png';
  else if (kind === 'flooring') file = 'assets/default_flooring.png';
  return h('div', { class: 'pred-sprite pred-sprite-img', style: `width:${px}px;height:${px}px;` },
    h('img', { src: file, style: `width:${px}px;height:${px}px;object-fit:contain;image-rendering:pixelated;` }));
}

function openPredInfo(item) {
  const di = predDataByName[item.name];
  if (di) { state.openTile = di.id; scheduleRender(); return; }
  showPredItemPopover(item);
}
// ===== POPOVER DESIGN SYSTEM =====
// One modal shell for every popover. Callers supply content; the shell owns the
// backdrop, header (icon + title + subtitle), close behaviour and the wiki footer.
function wikiUrlFor(name, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  return 'https://stardewvalleywiki.com/' + encodeURIComponent(String(name).replace(/ /g, '_'));
}
function popoverImg(src, alt) {
  return src ? h('img', { class: 'popover-icon-img', src, alt: alt || '' }) : null;
}
function openPopover(opts) {
  document.querySelectorAll('.popover-backdrop').forEach(el => el.remove());
  const close = () => { document.querySelector('.popover-backdrop')?.remove(); if (opts.onClose) opts.onClose(); };
  const backdrop = h('div', { class: 'popover-backdrop', on: { click: e => { if (e.target === backdrop) close(); } } });
  const asList = (x) => Array.isArray(x) ? x.filter(n => n != null && n !== '') : (x == null || x === '' ? [] : [x]);
  const popover = h('div', { class: 'popover' },
    h('div', { class: 'popover-head' },
      h('div', { class: 'popover-icon' }, opts.icon || null),
      h('div', { class: 'popover-title' },
        h('div', { class: 'popover-name' }, ...asList(opts.title)),
        asList(opts.subtitle).length ? h('div', { class: 'popover-sub' }, ...asList(opts.subtitle)) : null
      ),
      h('button', { class: 'popover-close', on: { click: close } }, String.fromCharCode(215))
    ),
    ...asList(opts.body),
    opts.wikiUrl ? h('div', { class: 'popover-wiki' },
      h('a', { href: opts.wikiUrl, target: '_blank', rel: 'noopener' }, 'Open on Stardew Wiki \u2192')) : null
  );
  backdrop.appendChild(popover);
  document.body.appendChild(backdrop);
  return { backdrop, popover, close };
}

function showPredItemPopover(item) {
  openPopover({
    icon: predSprite(item, 34),
    title: item.name,
    subtitle: item.price ? 'Price ' + item.price : 'Travelling Cart / shop',
    wikiUrl: wikiUrlFor(item.name),
  });
}

// A predicted shop item rendered through the shared standard tile component.
function predTile(item, px) {
  let qn = null;
  if (item.qtyNum != null) qn = item.qtyNum;
  else if (typeof item.qty === 'number') qn = item.qty;
  else if (typeof item.qty === 'string') { const m = item.qty.match(/\d+/); qn = m ? +m[0] : null; }
  const overlays = [];
  if (item.qty === '\u221e') overlays.push(badge('\u221e'));
  else if (qn && qn > 1) overlays.push(badge(String(qn)));
  if (item.price != null && item.price !== '') overlays.push(banner(fmtPrice(item.price)));
  overlays.push(nameHover(item.name));
  return tile('standard', {
    title: item.name,
    sprite: predSprite(item, px),
    overlays,
    onContext: () => openPredInfo(item),
  });
}

function doPredictorSearchById(id, name) {
  const p = state.predictor;
  const uid = predUid();
  p.searchQuery = name;
  if (uid === null) { p.searchResult = null; save(); scheduleRender(); return; }
  const season0 = SEASONS.indexOf(state.inGameDate.season);
  const fromDp = Predictor.daysPlayed(state.inGameDate.year || 1, season0, state.inGameDate.day);
  const res = Predictor.searchExact(p.platform, uid, fromDp, id, 112 * 8);
  p.searchResult = res ? { ...res, query: name } : { notFound: true, query: name };
  save(); scheduleRender();
}

// Search combobox + jump controls, shown between the calendar and the shop boxes.
function renderPredictorSearch() {
  const p = state.predictor;
  const uid = predUid();
  const wrap = h('div', { class: 'pred-search-card' });
  wrap.appendChild(h('div', { class: 'pred-search-label' }, 'Find next in cart & shops'));

  const combo = h('div', { class: 'pred-combo' });
  const input = h('input', { class: 'pred-combo-input', type: 'text', placeholder: 'Type an item, e.g. Red Cabbage', value: p.searchQuery ?? '' });
  const sel = predSearchable().find(it => it.name === (p.searchQuery || '').trim());
  const menu = h('div', { class: 'pred-combo-menu' });
  menu.style.display = 'none';
  const closeMenu = () => { menu.style.display = 'none'; };
  const rebuild = () => {
    const q = input.value.trim().toLowerCase();
    const all = predSearchable();
    const list = (q ? all.filter(it => it.name.toLowerCase().startsWith(q)) : all).slice(0, 5);
    menu.innerHTML = '';
    if (!list.length) { closeMenu(); return; }
    for (const it of list) {
      const row = h('div', { class: 'pred-combo-item' }, predSprite({ id: it.id, kind: 'object' }, 20), h('span', {}, it.name));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = it.name; closeMenu(); doPredictorSearchById(it.id, it.name); });
      menu.appendChild(row);
    }
    menu.style.display = '';
  };
  input.addEventListener('input', rebuild);
  input.addEventListener('focus', rebuild);
  input.addEventListener('blur', () => setTimeout(closeMenu, 150));
  combo.appendChild(input);
  if (sel) { input.classList.add('has-sprite'); combo.appendChild(h('div', { class: 'pred-combo-sel' }, predSprite({ id: sel.id, kind: 'object' }, 18))); }
  combo.appendChild(menu);
  wrap.appendChild(combo);

  if (p.searchResult) {
    const r = p.searchResult;
    const res = h('div', { class: 'pred-search-result' });
    if (r.notFound) {
      res.appendChild(h('span', {}, `No upcoming \u201c${r.query}\u201d found.`));
    } else {
      const season0 = SEASONS.indexOf(state.inGameDate.season);
      const curDp = Predictor.daysPlayed(state.inGameDate.year || 1, season0, state.inGameDate.day);
      res.appendChild(h('span', { class: 'pred-search-result-text' }, `${fmtDateShort(r.dp)} · ${r.source}`));
      if (r.dp !== curDp) res.appendChild(h('button', { class: 'btn pred-jump', on: { click: () => jumpToDp(r.dp) } }, 'Jump'));
      else res.appendChild(h('span', { class: 'pred-here' }, 'today'));
    }
    if (p.jumpBack) res.appendChild(h('button', { class: 'btn pred-jumpback', on: { click: () => jumpBackDate() } }, 'Back'));
    res.appendChild(h('button', { class: 'pred-clear', on: { click: () => { p.searchResult = null; save(); scheduleRender(); } } }, String.fromCharCode(215)));
    wrap.appendChild(res);
  } else if (p.jumpBack) {
    wrap.appendChild(h('div', { class: 'pred-search-result' },
      h('button', { class: 'btn pred-jumpback', on: { click: () => jumpBackDate() } }, 'Jump back to previous day')));
  }
  if (uid === null) wrap.appendChild(h('div', { class: 'pred-search-hint' }, 'Enter a Game seed above to search.'));
  return wrap;
}

// The four permanent shop boxes shown below the calendar.
function renderPredictorBoxes() {
  const p = state.predictor;
  const uid = predUid();
  const D = 38; // sprite px inside the cockpit-style tiles
  const year = state.inGameDate.year || 1;
  const season0 = SEASONS.indexOf(state.inGameDate.season);
  const dp = Predictor.daysPlayed(year, season0, state.inGameDate.day);
  const wrap = h('div', { class: 'pred-shops' });

  const grid = (items) => tileGrid('standard', items.map(it => predTile(it, D)));
  const msg = (rows) => h('div', { class: 'pred-shop-msg', style: `min-height:${rows * 54 + (rows - 1) * 6}px;` }, 'Enter a Game seed & platform above.');
  const fileIcon = (src) => h('img', { class: 'pred-shop-icon', src });
  const b64Icon = (file) => { const s = spriteSrc(file); return s ? h('img', { class: 'pred-shop-icon', src: s }) : null; };
  const box = (iconEl, title, sub, body) => h('div', { class: 'pred-shop-box' },
    h('div', { class: 'pred-shop-head' }, iconEl, h('span', { class: 'pred-shop-title' }, title), sub ? h('span', { class: 'pred-shop-sub' }, sub) : null),
    body);

  // Traveling Cart — 4×4, today or next cart day (incl. festival / Night Market days).
  {
    let body, sub = '';
    if (uid === null) body = msg(4);
    else {
      const cDp = Predictor.isCartDay(dp) ? dp : Predictor.nextCartDay(dp);
      sub = cDp !== dp ? 'next · ' + fmtDateShort(cDp) : 'today';
      body = grid(Predictor.cartDay(p.platform, uid, cDp));
    }
    wrap.appendChild(box(fileIcon('assets/Traveling_Cart.png'), 'Traveling Cart', sub, body));
  }
  // Krobus — single next (or today's) offering.
  {
    let body, sub = '';
    if (uid === null) body = msg(1);
    else {
      const k = Predictor.nextKrobus(p.platform, uid, dp);
      if (k) { sub = (k.dp !== dp ? 'next · ' : '') + k.day + ' · ' + fmtDateShort(k.dp); body = grid([k]); }
      else body = msg(1);
    }
    wrap.appendChild(box(b64Icon('Krobus.png') || fileIcon('assets/Traveling_Cart.png'), 'Krobus', sub, body));
  }
  // Sandy — daily shirt.
  {
    let body, sub = '';
    if (uid === null) body = msg(1);
    else { sub = 'today'; body = grid([Predictor.sandyItem(p.platform, uid, dp)]); }
    wrap.appendChild(box(b64Icon('Sandy.png') || fileIcon('assets/Traveling_Cart.png'), 'Sandy', sub, body));
  }
  // Pierre / Joja — shared wallpaper + each shop's flooring.
  {
    let body, sub = '';
    if (uid === null) body = msg(1);
    else { sub = 'today'; body = grid(Predictor.wallFloorItems(p.platform, uid, dp)); }
    wrap.appendChild(box(fileIcon('assets/Pierres_shop.png'), 'Pierre / Joja', sub, body));
  }
  return wrap;
}
// Deterministic town/NPC schedule facts for a given season + day.
// dow: 0=Mon .. 6=Sun. A season is 28 days (4 weeks) and a year 112 days (16 weeks),
// so (day-1)%7 gives the correct weekday in every season and year.
function scheduleLines(season, day) {
  const dow = (day - 1) % 7;
  const cc = state.predictor.ccDone;
  const lines = [];
  // Marnie's Ranch — permanent first line (open/closed).
  const marnieClosed = dow === 0 || dow === 1
    || (season === 'spring' && day === 17)
    || (season === 'fall' && day === 18)
    || (season === 'winter' && day === 18);
  lines.push({ icon: 'Marnie.png', text: marnieClosed ? "Marnie's Ranch closed" : "Marnie's Ranch open" });
  // Tuesday — exercise class at Pierre's; Robin's shop closed.
  if (dow === 1) {
    lines.push({ icon: 'Pierre.png', text: 'Exercise class at Pierre\u2019s' });
    lines.push({ icon: 'Robin.png', text: "Robin's shop closed" });
  }
  // Wednesday — Pierre's closed until the Community Center is restored.
  if (dow === 2 && !cc) lines.push({ icon: 'Pierre.png', text: "Pierre's closed" });
  // Friday — Robin closes early; Clint closed once the Community Center is restored.
  if (dow === 4) {
    lines.push({ icon: 'Robin.png', text: "Robin's shop closes 4pm" });
    if (cc) lines.push({ icon: 'Clint.png', text: "Clint's closed" });
  }
  // Summer 18 — Robin at Harvey's Clinic.
  if (season === 'summer' && day === 18) lines.push({ icon: 'Robin.png', text: 'Robin at the clinic' });
  return lines.slice(0, 4);
}

function renderScheduleCard(season, day) {
  const card = h('div', { class: 'now-schedule-card' });
  card.appendChild(h('div', { class: 'now-schedule-label' }, ICON('Calendar.png', 14), ' Town today'));
  const list = h('div', { class: 'now-schedule-lines' });
  for (const l of scheduleLines(season, day)) {
    list.appendChild(h('div', { class: 'now-schedule-line' },
      ICON(l.icon, 16) || h('span', { class: 'now-schedule-icon-ph' }),
      h('span', {}, l.text)
    ));
  }
  card.appendChild(list);
  return card;
}

function renderRightNow() {
  const season = state.inGameDate.season;
  const day = state.inGameDate.day;
  const year = state.inGameDate.year || 1;
  const weather = state.weather;
  const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(day - 1) % 7];

  // Today's birthdays + festivals (used for the stable today-card)
  const bdToday = DATA.villagers.filter(v => v.birthday.season === season && v.birthday.day === day);
  const festsToday = (DATA.festivals[season] || []).filter(f => {
    const days = typeof f.day === 'string' ? f.day.split('-').map(Number) : [f.day, f.day];
    return day >= days[0] && day <= days[1];
  });

  // Build the stable today-card (always shown, even when nothing's happening)
  const todayCardChildren = [];
  todayCardChildren.push(h('div', { class: 'today-card-title' }, `${cap(season)} ${day} · Year ${year} · ${dow}`));
  if (bdToday.length === 0 && festsToday.length === 0) {
    todayCardChildren.push(h('div', { class: 'today-empty' }, '— Nothing scheduled today —'));
  } else {
    for (const v of bdToday) {
      const isDone = !!state.checks[v.id];
      const portrait = h('div', { class: 'portrait', style: 'cursor:pointer;', on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showVillagerPopover(v); } } });
      const src = PORTRAIT(v);
      if (src) { const img = h('img', { src, alt: v.name }); portrait.appendChild(img); }
      else { portrait.textContent = v.name.slice(0,2); }
      todayCardChildren.push(h('div', { class: 'today-bday' },
        portrait,
        h('div', {},
          h('div', { class: 'name' }, ICON('Pink_Cake.png',14), ` ${v.name}${isDone ? ' ✓' : ''}`),
          h('div', { class: 'gifts' }, h('span', { class: 'loved' }, '♥ '), (v.loved || []).slice(0, 3).join(', '))
        )
      ));
    }
    for (const f of festsToday) {
      const iconBlob = h('div', { class: 'icon-blob' }, h('img', { src: festIcon(f), style: 'width:20px;height:20px;object-fit:contain;image-rendering:pixelated;' }));
      todayCardChildren.push(h('div', { class: 'today-fest', style: 'cursor:pointer;', on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showFestivalPopover(f); } } },
        iconBlob,
        h('div', {},
          h('div', { class: 'name' }, f.name),
          h('div', { class: 'where' }, `${f.where} — ${f.hint}`)
        )
      ));
    }
  }

  // Date/weather control card
  const seasons = ['spring','summer','fall','winter'];
  const seasonSelect = h('select', { on: { change: e => { state.inGameDate.season = e.target.value; save(); scheduleRender(); } } });
  for (const s of seasons) {
    const opt = h('option', { value: s }, cap(s));
    if (s === season) opt.setAttribute('selected', '');
    seasonSelect.appendChild(opt);
  }

  // Upcoming events (birthdays + festivals) — spans across season boundaries
  const seasonIdx = seasons.indexOf(season);
  const currentAbsDay = seasonIdx * 28 + day;
  const bdSoon = DATA.villagers
    .filter(v => !state.checks[v.id])
    .map(v => {
      const vIdx = seasons.indexOf(v.birthday.season);
      let absDay = vIdx * 28 + v.birthday.day;
      if (absDay <= currentAbsDay) absDay += 112;
      return { ...v, daysUntil: absDay - currentAbsDay };
    })
    .filter(v => v.daysUntil > 0 && v.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  const festSoon = [];
  for (let si = 0; si < 4; si++) {
    const s = seasons[(seasonIdx + si) % 4];
    for (const f of (DATA.festivals[s] || [])) {
      const sd = typeof f.day === 'string' ? Number(f.day.split('-')[0]) : f.day;
      const fIdx = seasons.indexOf(s);
      let absDay = fIdx * 28 + sd;
      if (absDay <= currentAbsDay) absDay += 112;
      const daysUntil = absDay - currentAbsDay;
      if (daysUntil > 0 && daysUntil <= 7) festSoon.push({ ...f, sd, daysUntil, festSeason: s });
    }
  }
  festSoon.sort((a, b) => a.daysUntil - b.daysUntil);
  const eventPills = [];
  for (const v of bdSoon) {
    eventPills.push(h('span', { class: 'now-event-pill bd', title: `${v.name} birthday (${v.daysUntil}d) — ${(v.loved||[])[0] || ''}`, style: 'cursor:pointer;', on: { contextmenu: (e) => { e.preventDefault(); showVillagerPopover(v); } } },
      ICON(v.name + '.png', 18),
      h('span', { class: 'now-event-pill-text' }, `${v.name} (${v.daysUntil}d)`)
    ));
  }
  for (const f of festSoon) {
    eventPills.push(h('span', { class: 'now-event-pill fest', title: `${f.name} — ${cap(f.festSeason)} ${f.day}`, style: 'cursor:pointer;', on: { contextmenu: (e) => { e.preventDefault(); showFestivalPopover(f); } } },
      h('img', { src: festIcon(f), style: 'width:18px;height:18px;object-fit:contain;image-rendering:pixelated;' }),
      h('span', { class: 'now-event-pill-text' }, `${f.name} (${f.daysUntil}d)`)
    ));
  }

  const controlCol = h('div', { class: 'now-control' },
    h('div', { class: 'now-control-card' },
      h('div', { class: 'now-control-label' }, 'In-game date'),
      h('div', { class: 'now-date-row' },
        seasonSelect,
        h('div', { class: 'day-stepper' },
          h('button', { on: { click: () => { stepDay(-1); } } }, '‹'),
          h('div', { class: 'day-val' }, day),
          h('button', { on: { click: () => { stepDay(1); } } }, '›')
        )
      ),
      h('div', { class: 'now-year-row' },
        h('div', { class: 'day-of-week' }, dow),
        h('div', { class: 'now-year-stepper' },
          h('span', { class: 'now-year-label' }, 'Year'),
          h('div', { class: 'day-stepper' },
            h('button', { on: { click: () => { stepYear(-1); } } }, '‹'),
            h('div', { class: 'day-val' }, year),
            h('button', { on: { click: () => { stepYear(1); } } }, '›')
          )
        )
      ),

    ),
    h('div', { class: 'now-control-mid' },
      h('div', { class: 'today-card' }, ...todayCardChildren),
      renderScheduleCard(season, day),
      h('div', { class: 'now-events-section' },
        h('div', { class: 'now-events-label' }, ICON('Calendar.png', 14), ' Upcoming'),
        h('div', { class: 'now-event-pills' },
          eventPills.length ? eventPills : [h('span', { class: 'now-event-none' }, 'Nothing in the next few days')]
        )
      )
    ),
    renderGoldTracker()
  );

  // === FEED ===
  const feed = [];

  // FISH AVAILABLE TODAY — hide done, use FISH_AVAIL for per-location seasonality
  const allFish = DATA.items.filter(i => i.kind === 'fish' && !progress(i).done);
  // Build per-location entries: { fish, loc, exclusive }
  const fishEntries = [];
  for (const f of allFish) {
    if (f.note && f.note.includes('Night Market') && (season !== 'winter' || day < 15 || day > 17)) continue;
    const avail = FISH_AVAIL[f.id];
    if (avail) {
      for (const entry of avail) {
        const seasonOk = entry.seasons.includes('any') || entry.seasons.includes(season);
        if (!seasonOk) continue;
        const exclusive = entry.seasons.length === 1 && entry.seasons[0] === season;
        fishEntries.push({ fish: f, loc: entry.loc, exclusive, weather: entry.weather });
      }
    } else {
      // Legacy flat model
      const seasonOk = f.seasons.includes(season) || f.seasons.includes('any');
      if (!seasonOk) continue;
      const exclusive = f.seasons.length === 1 && f.seasons[0] === season;
      const locs = locsFor(f);
      for (const loc of locs) fishEntries.push({ fish: f, loc, exclusive, weather: f.weather });
    }
  }
  const fishToday = [...new Set(fishEntries.map(e => e.fish))];
  {
    const LOC_ORDER = ['Town River','Forest River','Forest Lake','Mountain Lake','Ocean','Island','Other'];
    const usedLocs = LOC_ORDER;
    const groupedOther = {};
    const groupedExcl = {};
    for (const e of fishEntries) {
      if (e.exclusive) (groupedExcl[e.loc] ??= []).push(e);
      else (groupedOther[e.loc] ??= []).push(e);
    }
    const buildPills = (list) => (list || []).map(e => {
      const f = e.fish;
      const w = e.weather || f.weather;
      const extra = [];
      if (w === 'sunny') extra.push('weather-sunny');
      else if (w === 'rainy') extra.push('weather-rainy');
      if (f.legendary) extra.push('legendary');
      return compactTile(f, {
        title: [f.name, f.legendary ? '\u2b50 Legendary' : null, f.when || 'Anytime', f.note || null].filter(Boolean).join(' \u00b7 '),
        extra,
      });
    });
    const gridChildren = [
      h('div', {}), // empty top-left corner
      h('div', { class: 'fish-now-col-head' }, 'Multi-season'),
      h('div', { class: 'fish-now-col-head' }, `${cap(season)} exclusive`)
    ];
    for (const loc of usedLocs) {
      gridChildren.push(h('div', { class: 'fish-now-label' }, loc));
      gridChildren.push(tileGrid('compact', buildPills(groupedOther[loc])));
      gridChildren.push(tileGrid('compact', buildPills(groupedExcl[loc])));
    }
    feed.push(h('div', { class: 'now-row' },
      h('div', { class: 'now-icon' }, ICON('Bamboo_Pole.png',20)),
      h('div', { class: 'now-content' },
        h('div', { class: 'now-title' }, 'Fish today', h('span', { class: 'count' }, fishToday.length)),
        h('div', { class: 'fish-now-grid' }, ...gridChildren)
      )
    ));
  }

  // Helper: render a split icon grid for forage/crops
  function renderSplitIcons(allItems, variant) {
    const excl = allItems.filter(i => i.seasons.length === 1 && i.seasons[0] === season);
    const other = allItems.filter(i => !(i.seasons.length === 1 && i.seasons[0] === season));
    const buildCol = (list) => tileGrid('compact', list.map(f => compactTile(f)));
    const cls = 'now-split' + (variant ? ' ' + variant : '');
    return h('div', { class: cls },
      h('div', { class: 'now-split-col' },
        h('div', { class: 'now-split-col-label' }, 'Multi-season'),
        buildCol(other)
      ),
      h('div', { class: 'now-split-col' },
        h('div', { class: 'now-split-col-label' }, `${cap(season)} exclusive`),
        buildCol(excl)
      )
    );
  }

  // Forage still missing (include 'any' season items)
  const forageLeft = DATA.items.filter(i =>
    i.kind === 'forage' &&
    (i.seasons.includes(season) || i.seasons.includes('any')) &&
    !progress(i).done &&
    (state.mode === 'perfection' || i.cc)
  );
  feed.push(h('div', { class: 'now-row' },
    h('div', { class: 'now-icon' }, ICON('Wild_Horseradish.png',20)),
    h('div', { class: 'now-content' },
      h('div', { class: 'now-title' }, 'Forage available', h('span', { class: 'count' }, forageLeft.length)),
      forageLeft.length ? renderSplitIcons(forageLeft) : h('div', { class: 'now-detail now-done' }, '\u2714 All collected')
    )
  ));

  // Crops still needed (include 'any' season items)
  const cropsLeft = DATA.items.filter(i =>
    i.kind === 'crop' &&
    (i.seasons.includes(season) || i.seasons.includes('any')) &&
    !progress(i).done &&
    (state.mode === 'perfection' || i.cc)
  );
  feed.push(h('div', { class: 'now-row' },
    h('div', { class: 'now-icon' }, ICON('Mixed_Seeds.png',20)),
    h('div', { class: 'now-content' },
      h('div', { class: 'now-title' }, 'Crops available', h('span', { class: 'count' }, cropsLeft.length)),
      cropsLeft.length ? renderSplitIcons(cropsLeft, 'crops') : h('div', { class: 'now-detail now-done' }, '\u2714 All collected')
    )
  ));

  // Fruit trees still needed (left) + Traveling Cart offerings you still need (right)
  const fruitsLeft = DATA.items.filter(i =>
    i.kind === 'fruit' &&
    !progress(i).done &&
    (state.mode === 'perfection' || i.cc)
  );
  const nowIconItem = (f) => compactTile(f);
  // Cart column: only when the next (or current) cart day offers a still-needed item.
  let cartCol = null;
  {
    const uid = predUid();
    if (uid !== null) {
      const curDp = Predictor.daysPlayed(year, seasonIdx, day);
      const cDp = Predictor.isCartDay(curDp) ? curDp : Predictor.nextCartDay(curDp);
      const seen = new Set();
      const needed = [];
      for (const l of Predictor.cartDay(state.predictor.platform, uid, cDp)) {
        const di = predDataByName[l.name];
        if (di && !progress(di).done && (state.mode === 'perfection' || di.cc) && !seen.has(di.id)) { seen.add(di.id); needed.push(di); }
      }
      if (needed.length) {
        const when = cDp === curDp ? 'today' : ('next ' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][((cDp - 1) % 7 + 7) % 7]);
        cartCol = h('div', { class: 'now-split-col' },
          h('div', { class: 'now-title' },
            h('img', { src: 'assets/Traveling_Cart.png', class: 'now-title-icon' }),
            'Traveling Cart', h('span', { class: 'now-sub-note' }, when), h('span', { class: 'count' }, needed.length)),
          tileGrid('compact', needed.slice(0, 15).map(nowIconItem))
        );
      }
    }
  }
  const fruitTitleNode = h('div', { class: 'now-title' }, 'Fruit trees', h('span', { class: 'count' }, fruitsLeft.length));
  const fruitBodyNode = fruitsLeft.length
    ? tileGrid('compact', fruitsLeft.map(nowIconItem))
    : h('div', { class: 'now-detail now-done' }, '\u2714 All collected');
  feed.push(h('div', { class: 'now-row' },
    h('div', { class: 'now-icon' }, ICON('Apple.png', 20)),
    cartCol
      ? h('div', { class: 'now-content' },
          h('div', { class: 'now-split excl-heavy' },
            h('div', { class: 'now-split-col' }, fruitTitleNode, fruitBodyNode),
            cartCol))
      : h('div', { class: 'now-content' }, fruitTitleNode, fruitBodyNode)
  ));

  return h('div', { class: 'now' }, controlCol, h('div', { class: 'now-feed' }, ...feed));
}

function locsFor(f) {
  const w = f.where || '';
  if (!w) return ['Other'];
  const locs = [];
  // Crab pot fish
  if (w.includes('Crab Pot')) {
    if (w.includes('Ocean')) locs.push('Ocean');
    else if (w.includes('Freshwater')) { locs.push('Town River'); locs.push('Forest River'); locs.push('Mountain Lake'); }
    return locs.length ? locs : ['Other'];
  }
  // Split compound locations by comma and classify each part
  const parts = w.split(/,\s*/);
  for (const p of parts) {
    // Island / Pirate Cove
    if (p.includes('Island') || p.includes('Pirate')) { if (!locs.includes('Island')) locs.push('Island'); continue; }
    // River variants
    if (p === 'River') { if (!locs.includes('Town River')) locs.push('Town River'); if (!locs.includes('Forest River')) locs.push('Forest River'); }
    else if (p === 'Forest River' || p.includes('Cindersap') || p.includes('Waterfalls')) { if (!locs.includes('Forest River')) locs.push('Forest River'); }
    else if (p === 'Town River' || p.includes('(Town)')) { if (!locs.includes('Town River')) locs.push('Town River'); }
    // Lake / Pond variants
    if (p === 'Mountain Lake' || p === 'Lake') { if (!locs.includes('Mountain Lake')) locs.push('Mountain Lake'); }
    if (p === 'Forest Pond' || p === 'Forest Lake') { if (!locs.includes('Forest Lake')) locs.push('Forest Lake'); }
    // Ocean
    if (p === 'Ocean') { if (!locs.includes('Ocean')) locs.push('Ocean'); }
    // Special locations → Other
    if (p.includes('Mines') || p.includes('Volcano')) { if (!locs.includes('Other')) locs.push('Other'); }
    if (p.includes('Desert')) { if (!locs.includes('Other')) locs.push('Other'); }
    if (p.includes('Sewer') || p.includes('Swamp') || p.includes('Witch') || p.includes('Secret') || p.includes('Mutant') || p.includes('Bug')) { if (!locs.includes('Other')) locs.push('Other'); }
    if (p.includes('Night Market') || p.toLowerCase().includes('submarine')) { if (!locs.includes('Other')) locs.push('Other'); }
  }
  return locs.length ? locs : ['Other'];
}

// ============ SEASON TABS ============
function renderSeasonTabs() {
  const tabs = [
    { id: 'spring', icon: 'Tulip.png', label: 'Spring' },
    { id: 'summer', icon: 'Sunflower.png', label: 'Summer' },
    { id: 'fall',   icon: 'Pumpkin.png', label: 'Fall' },
    { id: 'winter', icon: 'Snow_Yam.png', label: 'Winter' },
    { id: 'reference', icon: 'Book_Of_Stars.png', label: 'Reference' },
  ];
  return h('div', { class: 'season-tabs' },
    tabs.map(s => {
      let pct = '';
      if (s.id !== 'reference') {
        const items = (itemsBySeason[s.id] || []).filter(i => isItemRelevant(i) && demand(i).total > 0);
        const done = items.filter(i => progress(i).done).length;
        pct = items.length ? `${Math.floor(done/items.length*100)}%` : '';
      }
      return h('button', {
        class: 'season-tab' + (state.activeView === s.id ? ' active' : ''),
        'data-season': s.id,
        on: { click: () => { state.activeView = s.id; save(); scheduleRender(); } }
      }, ICON(s.icon, 16), ' ' + s.label, pct ? h('span', { class: 'pct' }, pct) : null);
    })
  );
}

// ============ GOLD TRACKER ============
const GOLD_COSTS_ALL = [
  { id: 'ob-earth',   name: 'Earth Obelisk',  gold: 500000,   image: 'Earth_Obelisk.png', mode: 'perfection' },
  { id: 'ob-water',   name: 'Water Obelisk',  gold: 500000,   image: 'Water_Obelisk.png', mode: 'perfection' },
  { id: 'ob-desert',  name: 'Desert Obelisk', gold: 1000000,  image: 'Desert_Obelisk.png', mode: 'perfection' },
  { id: 'ob-island',  name: 'Island Obelisk', gold: 1000000,  image: 'Island_Obelisk.png', mode: 'perfection' },
  { id: 'gc-gold',    name: 'Golden Clock',   gold: 10000000, image: 'Gold_Clock.png', mode: 'perfection' },
  { id: 'vault-2500', name: 'Vault: 2,500g',  gold: 2500,     image: 'Gold_Coin.png', cost: '2,500g', mode: 'both' },
  { id: 'vault-5000', name: 'Vault: 5,000g',  gold: 5000,     image: 'Gold_Coin.png', cost: '5,000g', mode: 'both' },
  { id: 'vault-10000',name: 'Vault: 10,000g', gold: 10000,    image: 'Gold_Coin.png', cost: '10,000g', mode: 'both' },
  { id: 'vault-25000',name: 'Vault: 25,000g', gold: 25000,    image: 'Gold_Coin.png', cost: '25,000g', mode: 'both' }
];

function getGoldCosts() { return GOLD_COSTS_ALL.filter(g => g.mode === state.mode || g.mode === 'both'); }
function getGoldTotal() { return getGoldCosts().reduce((s, x) => s + x.gold, 0); }

function fmtGold(n) {
  return n.toLocaleString() + 'g';
}

function isGoldItemDone(g) {
  if (g.id.startsWith('vault-')) {
    const b = DATA.bundles.find(b => b.id === g.id);
    return b ? isBundleDone(b) : false;
  }
  return !!state.checks[g.id];
}

function renderGoldTracker() {
  const costs = getGoldCosts();
  const total = getGoldTotal();
  const paid = costs.filter(g => isGoldItemDone(g));
  const paidSum = paid.reduce((s, x) => s + x.gold, 0);
  const remaining = total - paidSum;
  const pct = total ? Math.round(paidSum / total * 100) : 100;
  return h('div', { class: 'gold-tracker', on: { contextmenu: (e) => { e.preventDefault(); openGoldPopover(); } } },
    h('div', { class: 'gold-tracker-row' },
      ICON('Gold_Coin.png', 14),
      h('span', {}, remaining > 0 ? `Need ${fmtGold(remaining)} more` : 'All paid!'),
      h('span', { class: 'gold-pct' }, `${pct}%`)
    ),
    h('div', { class: 'gold-bar-wrap' },
      h('div', { class: 'gold-bar-fill', style: `width:${pct}%` })
    )
  );
}

function openGoldPopover() {
  const costs = getGoldCosts();
  const total = getGoldTotal();
  const paid = costs.filter(g => isGoldItemDone(g));
  const paidSum = paid.reduce((s, x) => s + x.gold, 0);
  const remaining = total - paidSum;
  const pct = total ? Math.round(paidSum / total * 100) : 100;
  openPopover({
    icon: popoverImg(spriteSrc('Gold_Coin.png'), 'Gold'),
    title: 'Gold Tracker',
    subtitle: `${fmtGold(paidSum)} paid \u00b7 ${fmtGold(remaining)} to go`,
    body: [
      h('div', { class: 'gold-popover-bar' }, h('div', { class: 'fill', style: `width:${pct}%` })),
      h('div', { class: 'gold-items' },
        [...costs].sort((a, b) => a.gold - b.gold).map(g => {
          const done = isGoldItemDone(g);
          return h('div', { class: 'gold-item' + (done ? ' done' : '') },
            h('img', { class: 'gold-item-img', src: spriteSrc(g.image), alt: g.name }),
            h('span', { class: 'gold-item-name' }, g.name),
            h('span', { class: 'gold-item-cost' }, fmtGold(g.gold)),
            done ? h('span', { class: 'gold-item-check' }, '✓') : null
          );
        })
      ),
    ],
  });
}

function refreshGoldTracker() {
  const el = document.querySelector('.gold-tracker');
  if (el) el.replaceWith(renderGoldTracker());
}

// ============ SEASONAL VIEW (cockpit) ============
function renderSeasonView(season) {
  const allRelevant = (itemsBySeason[season] || []).filter(i => isItemRelevant(i));
  const crops = allRelevant.filter(i => i.kind === 'crop');
  const forage = allRelevant.filter(i => i.kind === 'forage');
  const trees = allRelevant.filter(i => i.kind === 'tree');
  const fish = allRelevant.filter(i => i.kind === 'fish');

  const anyItems = (itemsBySeason.any || []).filter(i => isItemRelevant(i) && demand(i).total > 0);
  const anyAnimal   = anyItems.filter(i => i.kind === 'animal');
  const anyArtisan  = anyItems.filter(i => i.kind === 'artisan');
  const anyResource = anyItems.filter(i => i.kind === 'resource');
  const anyForage   = anyItems.filter(i => i.kind === 'forage');
  const anyFish     = anyItems.filter(i => i.kind === 'fish');
  const anyCrop     = anyItems.filter(i => i.kind === 'crop' || i.kind === 'tree');
  const anyFruit    = anyItems.filter(i => i.kind === 'fruit');
  // Store-bought resources (note field starts with "Buy")
  const anyStore    = anyResource.filter(i => i.note && i.note.startsWith('Buy'));
  const anyMining   = anyResource.filter(i => !i.note || !i.note.startsWith('Buy'));

  // Side column: calendar + predictor search + the four shop boxes
  const side = h('div', { class: 'cockpit-side' },
    renderCalendar(season),
    renderPredictorSearch(),
    renderPredictorBoxes()
  );

  // Main column: SEASONAL first (crops, forage, trees, fish), then a separator, then ALWAYS panels
  const main = h('div', { class: 'cockpit-main' },
    crops.length  ? renderTilePanel(ICON('Mixed_Seeds.png',18), `${cap(season)} Crops`,  crops)  : null,
    forage.length ? renderTilePanel(ICON('Wild_Horseradish.png',18), `${cap(season)} Forage`, forage) : null,
    trees.length  ? renderTilePanel(ICON('Hardwood.png',18), `${cap(season)} Trees`,  trees)  : null,
    fish.length   ? renderTilePanel(ICON('Bamboo_Pole.png',18), `${cap(season)} Fish`,   fish)   : null,
    (anyAnimal.length || anyMining.length || anyStore.length || anyArtisan.length || anyForage.length || anyFish.length || anyCrop.length || anyFruit.length) ? h('div', { class: 'always-header' }, '— always available —') : null,
    anyFish.length ? renderTilePanel(ICON('Bamboo_Pole.png',18), 'Fish (year-round)',  anyFish,  'panel-always') : null,
    anyAnimal.length ? renderTilePanel(ICON('White_Chicken.png',18), 'Animals',  anyAnimal,  'panel-always') : null,
    anyArtisan.length ? renderTilePanel(ICON('Wine.png',18), 'Artisan',  anyArtisan, 'panel-always') : null,
    anyMining.length ? renderTilePanel(ICON('Pickaxe.png',18), 'Resources', anyMining, 'panel-always') : null,
    anyStore.length ? renderTilePanel(ICON('Gold_Coin.png',18), 'Store-bought', anyStore, 'panel-always') : null,
    anyForage.length ? renderTilePanel(ICON('Wild_Horseradish.png',18), 'Forage (any season)', anyForage, 'panel-always') : null,
    anyCrop.length ? renderTilePanel(ICON('Mixed_Seeds.png',18), 'Crops (multi-season)', anyCrop, 'panel-always') : null,
    anyFruit.length ? renderTilePanel(ICON('Apple.png',18), 'Fruit Trees', anyFruit, 'panel-always') : null,
    state.mode === 'perfection' ? renderDeluxeScarecrowPanel() : null,
  );

  return h('div', { class: 'cockpit' }, side, main);
}

function renderTilePanel(icon, title, items, extraClass) {
  if (!items.length) return null;
  const done = items.filter(i => progress(i).done).length;
  return h('div', { class: 'panel' + (extraClass ? ' ' + extraClass : '') },
    h('div', { class: 'panel-head' },
      h('span', { class: 'panel-icon' }, icon),
      h('div', { class: 'panel-title' }, title),
      h('div', { class: 'panel-count' }, `${done} / ${items.length}`)
    ),
    tileGrid('standard', items.map(it => renderTile(it)))
  );
}

function autoCheckNext(item) {
  const d = demand(item);
  const c = getChannels(item.id);
  // Priority: ship/fish -> cc (per bundle slot) -> cook
  if (d.ship && !c.ship) { setChannel(item.id, 'ship', true); return; }
  if (d.fish && !c.ship) { setChannel(item.id, 'ship', true); return; }
  if (d.cc > (c.cc || 0)) {
    const newCc = (c.cc || 0) + 1;
    setChannel(item.id, 'cc', newCc);
    // Mark bundle slots done when accumulated count reaches their threshold
    const entries = (bundlesByItemId[item.id] || []).filter(e => e.bundle.id !== 'missing' || state.includeMB);
    let threshold = 0;
    for (const e of entries) {
      if (isBundleDone(e.bundle)) { threshold += (e.item.qty || 1); continue; }
      threshold += (e.item.qty || 1);
      const slotIdx = e.bundle.items.indexOf(e.item);
      if (newCc >= threshold && !bundleSlotDone(e.bundle, e.item, slotIdx)) {
        if (e.bundle.id === 'missing') {
          state.mbChecks[String(slotIdx)] = true;
        } else {
          state.bundleSlots[e.bundle.id + '_' + slotIdx] = true;
        }
      }
    }
    save(); scheduleRender();
    return;
  }
  if (d.cook && (c.cook || 0) < d.cook) { setChannel(item.id, 'cook', (c.cook || 0) + 1); return; }
  if (d.craft > 0 && (c.craft || 0) < d.craft) { setChannel(item.id, 'craft', (c.craft || 0) + 1); return; }
}

// ===== DESIGN SYSTEM: tile + grid + overlays =====
// Three tile sizes (standard / slot / compact), one grid component (variant =
// size), and single overlay builders (badge / quality / banner / tracker /
// nameHover) layered on top of a tile when applicable. Realized class names for
// the demand badge and channel tracker are kept (`.tile-badge`, `.tile-channels`)
// so the surgical state-update path (updateTileState) stays intact.
function badge(text) { return h('div', { class: 'tile-badge' }, text); }
function qualityStar(q) { return h('div', { class: 'tile-quality-star ' + (q || 'gold') }, '★'); }
function banner(content) { return h('div', { class: 'tile-meta' }, content); }
function tracker(pips) { return h('div', { class: 'tile-channels' }, ...pips); }
function nameHover(text, quality) {
  return h('div', { class: 'tile-name-hover' }, text, quality ? h('span', { class: 'q-star ' + quality }, '★') : null);
}
function tile(variant, o) {
  const cls = ['tile', 'tile-' + variant];
  if (o.done) cls.push('done');
  if (o.cls) cls.push(...(Array.isArray(o.cls) ? o.cls : [o.cls]));
  const attrs = { class: cls.join(' ') };
  if (o.id != null) attrs['data-item-id'] = o.id;
  if (o.checkId != null) attrs['data-check-id'] = o.checkId;
  if (o.title) attrs.title = o.title;
  const el = h('div', attrs);
  el.appendChild(o.sprite || h('div', { class: 'tile-img-fallback' }, o.fallback || ''));
  for (const ov of (o.overlays || [])) if (ov) el.appendChild(ov);
  if (o.onClick) el.addEventListener('click', o.onClick);
  else el.classList.add('tile-static');
  if (o.onContext) el.addEventListener('contextmenu', (e) => { e.preventDefault(); o.onContext(e); });
  return el;
}
function tileGrid(variant, children) {
  return h('div', { class: 'tile-grid tile-grid-' + variant }, ...children);
}
// Compact availability tile for a tracked item (now-section forage/crops/fish/fruit).
function compactTile(f, opts) {
  opts = opts || {};
  const src = ITEM_IMG(f);
  return tile('compact', {
    title: opts.title || f.name,
    cls: opts.extra,
    sprite: src ? h('img', { src, alt: f.name }) : h('div', { class: 'tile-img-fallback' }, f.name.slice(0, 2)),
    onClick: () => autoCheckNext(f),
    onContext: () => { state.openTile = f.id; scheduleRender(); },
  });
}

function renderTile(item) {
  const d = demand(item);
  const overlays = [badge()];
  if (item.qualityItem) overlays.push(qualityStar(item.quality));
  const pips = [];
  if (d.ship) pips.push(h('div', { class: 'pip ship' }));
  if (d.fish && !d.ship) pips.push(h('div', { class: 'pip fish' }));
  if (d.cc) pips.push(h('div', { class: 'pip cc' }));
  if (d.cook) { const cp = h('div', { class: 'pip cook' }); cp.appendChild(h('div', { class: 'fill' })); pips.push(cp); }
  if (craftByItemName[item.name]?.length) { const cp = h('div', { class: 'pip craft' }); cp.appendChild(h('div', { class: 'fill' })); pips.push(cp); }
  overlays.push(tracker(pips));
  if (item.kind === 'fish' && item.weather && item.weather !== 'any') {
    overlays.push(h('div', { class: 'tile-weather-icon' }, item.weather === 'sunny' ? '☀' : '☔'));
  }
  if (item.kind === 'fish' && (item.where || item.when)) {
    const parts = [];
    if (item.where) parts.push(item.where.slice(0, 4));
    if (item.when) parts.push(item.when);
    overlays.push(banner(parts.join(' · ')));
  }
  overlays.push(nameHover(item.qualityItem ? matDisplayName(item.name, true).baseName : item.name, item.qualityItem ? item.quality : null));

  const src = ITEM_IMG(item);
  let spriteNode;
  if (src) {
    const img = h('img', { src, alt: item.name, loading: 'eager' });
    img.addEventListener('error', () => { img.replaceWith(h('div', { class: 'tile-img-fallback' }, item.name)); }, { once: true });
    spriteNode = img;
  } else {
    spriteNode = h('div', { class: 'tile-img-fallback' }, item.name);
  }

  const el = tile('standard', {
    id: item.id,
    sprite: spriteNode,
    overlays,
    onClick: () => autoCheckNext(item),
    onContext: () => { state.openTile = item.id; scheduleRender(); },
  });
  updateTileState(el, item);
  return el;
}

function updateTileState(tile, item) {
  const p = progress(item);
  const d = demand(item);
  const classes = ['tile', 'tile-standard'];
  if (p.done) classes.push('done');
  if (item.legendary) classes.push('legendary');
  if (item.kind === 'fish' && item.weather === 'sunny') classes.push('weather-sunny');
  if (item.kind === 'fish' && item.weather === 'rainy') classes.push('weather-rainy');
  tile.className = classes.join(' ');
  const badge = tile.querySelector('.tile-badge');
  if (badge) {
    if (d.total > 0) {
      badge.textContent = p.done ? '✓' : p.got > 0 ? `${p.got}/${d.total}` : String(d.total);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }
  const pips = tile.querySelector('.tile-channels');
  if (pips) {
    const shipPip = pips.querySelector('.pip.ship'); if (shipPip) shipPip.classList.toggle('on', p.shipDone);
    const fishPip = pips.querySelector('.pip.fish'); if (fishPip) fishPip.classList.toggle('on', p.fishDone);
    const ccPip = pips.querySelector('.pip.cc');     if (ccPip)   ccPip.classList.toggle('on', p.ccDone);
    const cookPip = pips.querySelector('.pip.cook .fill');
    if (cookPip && d.cook) cookPip.style.width = `${(p.cook / d.cook) * 100}%`;
    const craftPip = pips.querySelector('.pip.craft .fill');
    if (craftPip) {
      const entries = craftByItemName[item.name];
      if (entries && entries.length) {
        const done = entries.filter(e => state.checks[e.recipeId]).length;
        craftPip.style.width = `${(done / entries.length) * 100}%`;
      }
    }
  }
}

// ============ CALENDAR ============
function renderCalendar(season) {
  const today = state.inGameDate.season === season ? state.inGameDate.day : null;
  const fests = DATA.festivals[season] || [];
  const festMap = {};
  for (const f of fests) {
    const days = typeof f.day === 'string' ? f.day.split('-').map(Number) : [f.day, f.day];
    for (let d = days[0]; d <= days[1]; d++) festMap[d] = f;
  }
  const bdMap = {};
  for (const v of DATA.villagers) if (v.birthday.season === season) bdMap[v.birthday.day] = v;
  return h('div', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('span', { class: 'panel-icon' }, ICON('Calendar.png',18)),
      h('div', { class: 'panel-title' }, `${cap(season)} Calendar`)
    ),
    h('div', { class: 'cal-header' }, ['M','T','W','T','F','S','Su'].map(d => h('div', {}, d))),
    (() => {
      const grid = h('div', { class: 'calendar-mini' });
      for (let d = 1; d <= 28; d++) {
        const isToday = d === today;
        const fest = festMap[d];
        const bd = bdMap[d];
        const cell = h('div', {
          class: 'cal-day' + (isToday ? ' today' : ''),
          title: [bd ? `${bd.name}'s birthday` : null, fest ? fest.name : null].filter(Boolean).join(' · '),
          on: {
            click: () => { state.inGameDate.season = season; state.inGameDate.day = d; state.activeView = season; save(); scheduleRender(); },
            contextmenu: (e) => {
              if (!bd && !fest) return;
              e.preventDefault(); e.stopPropagation();
              if (bd && !fest) { showVillagerPopover(bd); }
              else if (fest && !bd) { showFestivalPopover(fest); }
              // bd && fest: handled by split halves — fallback shows villager
              else { showVillagerPopover(bd); }
            }
          },
        },
          h('div', { class: 'd-num' }, d),
          bd && fest ? h('div', { class: 'cal-day-split' },
            h('div', { class: 'cal-day-split-half', title: `${bd.name}'s birthday`, on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showVillagerPopover(bd); } } },
              h('img', { src: PORTRAIT(bd), style: 'width:18px;height:18px;object-fit:cover;image-rendering:pixelated;border-radius:2px;' })
            ),
            h('div', { class: 'cal-day-split-half', title: fest.name, on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showFestivalPopover(fest); } } },
              h('img', { src: festIcon(fest), style: 'width:16px;height:16px;object-fit:contain;image-rendering:pixelated;' })
            )
          ) :
          bd ? h('div', { class: 'cal-day-icon', title: bd.name, on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showVillagerPopover(bd); } } },
            h('img', { src: PORTRAIT(bd), style: 'width:20px;height:20px;object-fit:cover;image-rendering:pixelated;border-radius:2px;' })
          ) :
          fest ? h('div', { class: 'cal-day-icon', title: fest.name, on: { contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); showFestivalPopover(fest); } } },
            h('img', { src: festIcon(fest), style: 'width:18px;height:18px;object-fit:contain;image-rendering:pixelated;' })
          ) : null,
        );
        grid.appendChild(cell);
      }
      return grid;
    })()
  );
}

// ============ POPOVER ============
const FEST_FLAG_IMG = 'https://stardewvalleywiki.com/mediawiki/images/4/47/Calendar_Flag_Anim.gif';
const FEST_MARKET_IMG = 'https://stardewvalleywiki.com/mediawiki/images/b/bc/Iridium_Quality.png';
const FEST_HOOK_IMG = 'https://stardewvalleywiki.com/mediawiki/images/2/23/Hook_Icon.png';
function festIcon(f) { return f.icon === 'market' ? FEST_MARKET_IMG : f.icon === 'hook' ? FEST_HOOK_IMG : FEST_FLAG_IMG; }

function showFestivalPopover(fest) {
  openPopover({
    icon: popoverImg(festIcon(fest), fest.name),
    title: fest.name,
    subtitle: `Day ${fest.day} \u00b7 ${fest.where}`,
    body: fest.hint ? h('div', { class: 'popover-tip' }, fest.hint) : null,
    wikiUrl: fest.url,
  });
}

function villagerGiftChips(gifts, liked) {
  return h('div', { class: 'gift-chips' },
    ...(gifts || []).map(gift => {
      const giftItem = DATA.items.find(it => it.name === gift);
      const gSrc = giftItem ? ITEM_IMG(giftItem) : spriteSrc(gift.replace(/ /g, '_') + '.png');
      return h('div', { class: 'gift-chip' + (liked ? ' liked' : ''), title: gift },
        gSrc ? h('img', { src: gSrc, alt: gift }) : null,
        gSrc ? null : gift
      );
    })
  );
}
function villagerHeartEvents(v) {
  const evs = (DATA.heartEvents && DATA.heartEvents[v.id]) || [];
  if (!evs.length) return null;
  return h('div', { class: 'popover-section' },
    h('div', { class: 'popover-label' }, 'Heart Events',
      h('span', { class: 'he-note' }, 'personal tracker')),
    h('div', { class: 'heart-events' },
      ...evs.map((e, idx) => {
        const key = v.id + '#' + idx;
        const done = !!state.heChecks[key];
        return h('div', { class: 'heart-event he-check' + (done ? ' done' : ''), role: 'button', tabindex: '0',
          title: done ? 'Seen — click to clear' : 'Click to mark as seen',
          on: {
            click: ev => toggleHeartEvent(key, ev.currentTarget),
            keydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleHeartEvent(key, ev.currentTarget); } }
          } },
          h('span', { class: 'he-box' }),
          h('span', { class: 'he-hearts' }, e.h + '\u2665'),
          h('span', { class: 'he-cond' }, e.c)
        );
      })
    )
  );
}
function toggleHeartEvent(key, rowEl) {
  if (state.heChecks[key]) delete state.heChecks[key]; else state.heChecks[key] = true;
  save();
  if (rowEl) {
    const done = !!state.heChecks[key];
    rowEl.classList.toggle('done', done);
    rowEl.title = done ? 'Seen — click to clear' : 'Click to mark as seen';
  }
}
function showVillagerPopover(v) {
  openPopover({
    icon: popoverImg(PORTRAIT(v), v.name) || h('div', { class: 'popover-icon-fallback' }, v.name.slice(0, 2)),
    title: v.name,
    subtitle: 'Birthday: ' + cap(v.birthday.season) + ' ' + v.birthday.day,
    body: [
      h('div', { class: 'popover-section' },
        h('div', { class: 'popover-label' }, 'Loved Gifts'),
        villagerGiftChips(v.loved)),
      (v.liked && v.liked.length) ? h('div', { class: 'popover-section' },
        h('div', { class: 'popover-label' }, 'Liked Gifts'),
        villagerGiftChips(v.liked, true)) : null,
      villagerHeartEvents(v),
      v.note ? h('div', { class: 'popover-tip' }, v.note) : null,
    ],
    wikiUrl: wikiUrlFor(v.name),
  });
}

// ===== FISH AVAILABILITY — per-location season data for multi-location fish =====
// Each entry: { loc (matches locsFor bucket), seasons[], weather }
// Fish NOT listed here use their flat item.seasons / item.weather as before.
const FISH_AVAIL = {
  'pufferfish':     [{ loc: 'Ocean',  seasons: ['summer'], weather: 'sunny' },
                     { loc: 'Island', seasons: ['any'],    weather: 'sunny' }],
  'tuna':           [{ loc: 'Ocean',  seasons: ['summer', 'winter'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'octopus':        [{ loc: 'Ocean',  seasons: ['summer'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'flounder':       [{ loc: 'Ocean',  seasons: ['spring', 'summer'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'tilapia':        [{ loc: 'Ocean',  seasons: ['summer', 'fall'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'supercucumber':  [{ loc: 'Ocean',  seasons: ['summer', 'fall'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'midnightcarp':   [{ loc: 'Mountain Lake', seasons: ['fall', 'winter'], weather: 'any' },
                     { loc: 'Forest Lake',   seasons: ['fall', 'winter'], weather: 'any' },
                     { loc: 'Island', seasons: ['any'],    weather: 'any' }],
  'catfish':        [{ loc: 'Town River',    seasons: ['spring', 'fall'], weather: 'rainy' },
                     { loc: 'Forest River',  seasons: ['spring', 'fall'], weather: 'rainy' },
                     { loc: 'Other',  seasons: ['any'],    weather: 'any' }],
  'carp':           [{ loc: 'Mountain Lake', seasons: ['spring', 'summer', 'fall'], weather: 'any' },
                     { loc: 'Other',  seasons: ['any'],    weather: 'any' }],
  'walleye':        [{ loc: 'Town River',    seasons: ['fall'], weather: 'rainy' },
                     { loc: 'Forest River',  seasons: ['fall'], weather: 'rainy' },
                     { loc: 'Mountain Lake', seasons: ['fall'], weather: 'rainy' },
                     { loc: 'Forest Lake',   seasons: ['fall'], weather: 'rainy' }],
};

// ===== ITEM TIPS — enriched popover data scraped from wiki =====
const ITEM_TIPS = {
  // ── Fish: difficulty, behavior, size, notable location details ──
  'Pufferfish': 'Difficulty 80 (floater) · 1–37" · Ocean, noon–4pm, sunny',
  'Anchovy': 'Difficulty 30 (dart) · 1–17" · Ocean, any time',
  'Tuna': 'Difficulty 70 (smooth) · 12–60" · Ocean, 6am–7pm',
  'Sardine': 'Difficulty 30 (dart) · 1–5" · Ocean, 6am–7pm',
  'Bream': 'Difficulty 35 (smooth) · 12–35" · River, 6pm–2am',
  'Largemouth Bass': 'Difficulty 50 (mixed) · 12–30" · Mountain Lake, 6am–7pm',
  'Smallmouth Bass': 'Difficulty 28 (mixed) · 12–24" · River/Forest Pond, any time',
  'Rainbow Trout': 'Difficulty 45 (mixed) · 12–25" · River/Mountain Lake, 6am–7pm, sunny',
  'Salmon': 'Difficulty 50 (mixed) · 24–66" · River & Forest Waterfalls, 6am–7pm (Fall)',
  'Walleye': 'Difficulty 45 (smooth) · 12–41" · River/Mountain Lake/Forest Pond, noon–2am, rainy',
  'Perch': 'Difficulty 35 (dart) · 12–25" · River/Mountain Lake/Forest Pond, any time',
  'Carp': 'Difficulty 15 (mixed) · 12–30" · Mountain Lake/Secret Woods/Sewers/Mutant Bug Lair, any time',
  'Catfish': 'Difficulty 75 (mixed) · 12–73" · River/Secret Woods/Witch Swamp, 6am–midnight, rainy',
  'Pike': 'Difficulty 60 (dart) · 15–37" · River/Forest Pond, any time',
  'Sunfish': 'Difficulty 30 (mixed) · 5–17" · River, 6am–7pm, sunny/windy',
  'Red Mullet': 'Difficulty 55 (smooth) · 5–18" · Ocean, 6am–7pm',
  'Herring': 'Difficulty 25 (dart) · 5–11" · Ocean, any time',
  'Eel': 'Difficulty 70 (smooth) · 12–53" · Ocean, 4pm–2am, rainy',
  'Octopus': 'Difficulty 95 (sinker) · 12–49" · Ocean, 6am–1pm (Summer)',
  'Red Snapper': 'Difficulty 40 (mixed) · 5–30" · Ocean, 6am–7pm, rainy',
  'Squid': 'Difficulty 75 (sinker) · 12–49" · Ocean, 6pm–2am (Winter)',
  'Sea Cucumber': 'Difficulty 40 (sinker) · 3–21" · Ocean, 6am–7pm (Fall/Winter)',
  'Super Cucumber': 'Difficulty 80 (sinker) · 12–37" · Ocean, 6pm–2am (Summer/Fall/Winter)',
  'Ghostfish': 'Difficulty 50 (mixed) · 10–37" · Mines floors 20 & 60',
  'Stonefish': 'Difficulty 65 (sinker) · 5–18" · Mines floor 20',
  'Ice Pip': 'Difficulty 85 (dart) · 5–9" · Mines floor 60',
  'Lava Eel': 'Difficulty 90 (mixed) · 31–33" · Mines floor 100 & Volcano Caldera',
  'Sandfish': 'Difficulty 65 (mixed) · 5–28" · Desert pond, 6am–8pm',
  'Scorpion Carp': 'Difficulty 90 (dart) · 5–28" · Desert pond, 6am–8pm · Requires Fishing 4',
  'Flounder': 'Difficulty 50 (sinker) · 5–21" · Ocean, 6am–8pm (Spring/Summer)',
  'Midnight Carp': 'Difficulty 55 (mixed) · 12–30" · Mountain Lake/Forest Pond, 10pm–2am (Fall/Winter)',
  'Sturgeon': 'Difficulty 78 (mixed) · 12–61" · Mountain Lake, 6am–7pm (Summer/Winter)',
  'Tiger Trout': 'Difficulty 60 (dart) · 12–25" · River, 6am–7pm (Fall/Winter)',
  'Bullhead': 'Difficulty 46 (smooth) · 12–25" · Mountain Lake, any time',
  'Tilapia': 'Difficulty 50 (mixed) · 12–25" · Ocean/Ginger Island, 6am–2pm (Summer/Fall)',
  'Chub': 'Difficulty 35 (dart) · 12–25" · Forest River/Mountain Lake, any time',
  'Dorado': 'Difficulty 78 (mixed) · 24–37" · Forest River, 6am–7pm (Summer)',
  'Albacore': 'Difficulty 60 (mixed) · 24–41" · Ocean, 6am–11am / 6pm–2am (Fall/Winter)',
  'Shad': 'Difficulty 45 (smooth) · 20–49" · River, 9am–2am, rainy',
  'Lingcod': 'Difficulty 85 (mixed) · 24–49" · River/Mountain Lake, any time (Winter)',
  'Halibut': 'Difficulty 50 (sinker) · 12–33" · Ocean, 6am–11am / 7pm–2am (Spring/Summer/Winter)',
  'Woodskip': 'Difficulty 50 (mixed) · 5–17" · Secret Woods pond / Forest Farm pond',
  'Void Salmon': 'Difficulty 80 (mixed) · 24–65" · Witch Swamp, any time',
  'Slimejack': 'Difficulty 55 (dart) · 5–17" · Mutant Bug Lair',
  'Stingray': 'Difficulty 80 (sinker) · 18–72" · Pirate Cove (Ginger Island)',
  'Lionfish': 'Difficulty 50 (smooth) · 3–12" · Ginger Island Ocean',
  'Blue Discus': 'Difficulty 60 (dart) · 5–18" · Ginger Island River',
  'Midnight Squid': 'Difficulty 55 (sinker) · 5–24" · Night Market submarine (Winter 15–17)',
  'Spook Fish': 'Difficulty 60 (dart) · 5–18" · Night Market submarine (Winter 15–17)',
  'Blobfish': 'Difficulty 75 (floater) · 5–18" · Night Market submarine (Winter 15–17)',
  'Crimsonfish': '⭐ Difficulty 95 (mixed) · 19–21" · East Pier on The Beach · Requires Fishing 5',
  'Angler': '⭐ Difficulty 85 (smooth) · 18–21" · North of JojaMart, near waterfall · Requires Fishing 3',
  'Legend': '⭐ Difficulty 110 (mixed) · 30–33" · Mountain Lake, near the log · Requires Fishing 10, rainy',
  'Glacierfish': '⭐ Difficulty 100 (mixed) · 24–27" · South tip of Arrowhead Island, Cindersap Forest · Requires Fishing 6',
  'Mutant Carp': '⭐ Difficulty 80 (dart) · 36–39" · The Sewers, any time',
  'Son of Crimsonfish': '⭐ Difficulty 100 (mixed) · Extended family quest',
  'Ms. Angler': '⭐ Difficulty 90 (smooth) · Extended family quest',
  'Legend II': '⭐ Difficulty 115 (mixed) · Extended family quest',
  'Glacierfish Jr.': '⭐ Difficulty 105 (mixed) · Extended family quest',
  'Radioactive Carp': '⭐ Difficulty 80 (dart) · Extended family quest',
  'Goby': 'Difficulty 55 (dart) · 3–13" · Forest Waterfalls (south of Leah\'s cottage), any time, all seasons',
  // ── Crops: grow time, regrow, special notes ──
  'Parsnip': 'Grows in 4 days · Spring',
  'Green Bean': 'Grows in 10 days, regrows every 3 days · Trellis crop · Spring',
  'Cauliflower': 'Grows in 12 days · Giant crop possible · Spring',
  'Potato': 'Grows in 6 days · 25% chance extra harvest · Spring',
  'Garlic': 'Grows in 4 days · Spring',
  'Kale': 'Grows in 6 days · Spring',
  'Rhubarb': 'Grows in 13 days · Spring',
  'Blue Jazz': 'Grows in 7 days · Spring',
  'Tulip': 'Grows in 6 days · Spring',
  'Strawberry': 'Grows in 8 days, regrows every 4 days · Spring (Egg Festival)',
  'Coffee Bean': 'Grows in 10 days, regrows every 2 days · Spring/Summer',
  'Rice': 'Grows in 8 days (6 if irrigated) · Spring',
  'Unmilled Rice': 'Grows in 8 days (6 if irrigated) · Spring',
  'Melon': 'Grows in 12 days · Giant crop possible · Summer',
  'Tomato': 'Grows in 11 days, regrows every 4 days · Summer',
  'Blueberry': 'Grows in 13 days, regrows every 4 days (3 per harvest) · Summer',
  'Hot Pepper': 'Grows in 5 days, regrows every 3 days · Summer',
  'Wheat': 'Grows in 4 days · Summer/Fall · Harvested with scythe',
  'Radish': 'Grows in 6 days · Summer',
  'Red Cabbage': 'Grows in 9 days · Summer',
  'Starfruit': 'Grows in 13 days · Summer · Highest wine profit',
  'Corn': 'Grows in 14 days, regrows every 4 days · Summer/Fall',
  'Hops': 'Grows in 11 days, regrows daily · Trellis crop · Summer',
  'Sunflower': 'Grows in 8 days · Summer/Fall · Drops seeds on harvest',
  'Poppy': 'Grows in 7 days · Summer',
  'Summer Spangle': 'Grows in 8 days · Summer',
  'Summer Squash': 'Grows in 6 days, regrows every 3 days · Summer',
  'Pumpkin': 'Grows in 13 days · Giant crop possible · Fall',
  'Yam': 'Grows in 10 days · Fall',
  'Eggplant': 'Grows in 5 days, regrows every 5 days · Fall',
  'Amaranth': 'Grows in 7 days · Fall',
  'Grape': 'Grows in 10 days, regrows every 3 days · Trellis crop · Fall',
  'Cranberries': 'Grows in 7 days, regrows every 5 days (2 per harvest) · Fall',
  'Artichoke': 'Grows in 8 days · Fall',
  'Beet': 'Grows in 6 days · Fall',
  'Bok Choy': 'Grows in 4 days · Fall',
  'Fairy Rose': 'Grows in 12 days · Fall · Best flower for honey',
  'Broccoli': 'Grows in 8 days, regrows every 4 days · Fall',
  'Powdermelon': 'Grows in 7 days · Winter (outdoors!)',
  'Carrot': 'Grows in 3 days · Spring (outdoors, no tilling needed)',
  'Ancient Fruit': 'Grows in 28 days, regrows every 7 days · Spring/Summer/Fall',
  'Sweet Gem Berry': 'Grows in 24 days · Fall · Sell to Old Master Cannoli for Stardrop',
  'Cactus Fruit': 'Grows in 12 days, regrows every 3 days · Greenhouse/Ginger Island only',
  'Pineapple': 'Grows in 14 days, regrows every 7 days · Ginger Island/Greenhouse',
  'Taro Root': 'Grows in 10 days (7 if irrigated) · Ginger Island/Greenhouse',
  'Tea Leaves': 'Bush matures in 20 days, produces last week each season',
  // ── Fruit trees: 28 days to mature, season, notes ──
  'Apricot': '28 days to mature · Produces in Spring · Sapling: 2,000g',
  'Cherry': '28 days to mature · Produces in Spring · Sapling: 3,400g',
  'Banana': '28 days to mature · Produces in Summer (year-round on Ginger Island) · Sapling: 5 Dragon Teeth',
  'Mango': '28 days to mature · Produces in Summer (year-round on Ginger Island) · Sapling: 75 Mussels',
  'Orange': '28 days to mature · Produces in Summer · Sapling: 4,000g',
  'Peach': '28 days to mature · Produces in Summer · Sapling: 6,000g',
  'Apple': '28 days to mature · Produces in Fall · Sapling: 4,000g',
  'Pomegranate': '28 days to mature · Produces in Fall · Sapling: 6,000g',
  // ── Forage: where to find ──
  'Leek': 'Found in Cindersap Forest & Mountain · Spring',
  'Daffodil': 'Found in Bus Stop, Forest, Mountain · Spring',
  'Dandelion': 'Found in Cindersap Forest & Bus Stop · Spring',
  'Wild Horseradish': 'Found in Secret Woods, Forest, Mountain · Spring',
  'Spring Onion': 'Found south of Leah\'s cottage, near sewer pipe · Spring (regrows daily)',
  'Morel': 'Found in Secret Woods & Forest Farm · Spring',
  'Common Mushroom': 'Found in Forest, Secret Woods, Mountain · Fall (Spring in Secret Woods)',
  'Red Mushroom': 'Found in Mines (floors 80+), Secret Woods · Summer/Fall',
  'Purple Mushroom': 'Found in Mines (floors 80+), Skull Cavern · Rare',
  'Chanterelle': 'Found in Secret Woods · Fall',
  'Sweet Pea': 'Found on any map · Summer',
  'Spice Berry': 'Found in Cindersap Forest & Mountain · Summer',
  'Fiddlehead Fern': 'Found in Secret Woods · Summer',
  'Wild Plum': 'Found in Bus Stop & Mountain · Fall',
  'Hazelnut': 'Found in Bus Stop, Forest, Mountain · Fall',
  'Blackberry': 'Found on any map · Fall · Abundant days 8–11',
  'Crystal Fruit': 'Found on any map · Winter',
  'Snow Yam': 'Dig from artifact spots · Winter',
  'Winter Root': 'Dig from artifact spots · Winter',
  'Crocus': 'Found on any map · Winter',
  'Holly': 'Found on any map · Winter',
  'Salmonberry': 'Found on any map · Spring · Abundant days 15–18',
  'Coconut': 'Found in Calico Desert · Any season',
  'Cactus Fruit': 'Grows in 12 days, regrows every 3 days · Greenhouse/Ginger Island only',
  'Cave Carrot': 'Found in Mines (any floor)',
  'Ginger': 'Found on Ginger Island (dig spots) · Any season',
  'Magma Cap': 'Found in Volcano Dungeon · Any season',
  'Moss': 'Shake/chop trees in Fall/Winter/Spring · Common on large trees',
  // ── Cooking recipes: key buff/heal info ──
  'Lucky Lunch': '+3 Luck · Great for Skull Cavern runs',
  'Spicy Eel': '+1 Speed, +1 Luck · Excellent for Skull Cavern',
  'Crab Cakes': '+1 Speed, +1 Defense · Drops from Lava Lurks',
  'Seafoam Pudding': '+4 Fishing · Best fishing buff food',
  'Dish O\' The Sea': '+3 Fishing · Easy fishing buff food',
  'Trout Soup': '+1 Fishing · Cheap fishing buff',
  'Pumpkin Soup': '+2 Luck, +2 Defense · Strong buffs',
  'Ginger Ale': '+1 Luck · Easy to mass produce',
  'Magic Rock Candy': '+5 Mining, +5 Luck, +3 Speed, +5 Defense, +5 Fishing · Rarest buff food',
  'Triple Shot Espresso': '+1 Speed · Stacks with food buffs',
  'Pepper Poppers': '+2 Speed, +1 Farming · Good general speed food',
  'Tom Kha Soup': '+2 Farming, +2 Foraging · Solid all-round buff',
  'Banana Pudding': '+1 Speed, +1 Luck · Good combo buff',
  'Mango Sticky Rice': '+3 Farming · Best farming buff',
  'Moss Soup': 'Source: Foraging Mastery · New in 1.6',
  'Mystic Syrup': 'Source: Foraging Mastery · New in 1.6',
};

const BUILDING_TIPS = {
  'Earth Obelisk': 'Warps to the Mountains (near Robin\'s shop)',
  'Water Obelisk': 'Warps to the Beach (near Willy\'s shop)',
  'Desert Obelisk': 'Warps to the Calico Desert entrance',
  'Island Obelisk': 'Warps to Ginger Island (Docks area)',
  'Golden Clock': 'Prevents debris from spawning & fences from decaying',
};

function renderPopover() {
  document.querySelectorAll('.popover-backdrop').forEach(el => el.remove());
  if (!state.openTile) return;
  const item = itemsById[state.openTile];
  if (!item) { state.openTile = null; return; }
  const d = demand(item);
  const c = getChannels(item.id);

  // Find any bundles this item participates in (CC + Missing) — used for showing quality requirements
  const bundleHits = (bundlesByItemId[item.id] || []).slice();
  // Also check if item appears in Missing Bundle items
  const mbHits = [];
  DATA.missingBundle.items.forEach((bi, idx) => {
    // For quality items, match via baseItemId + quality
    if (item.qualityItem && bi.item_id === item.baseItemId && bi.quality === item.quality) {
      mbHits.push({ idx, item: bi });
    } else if (!item.qualityItem && bi.item_id === item.id && !bi.quality) {
      mbHits.push({ idx, item: bi });
    }
  });

  const iconSrc = ITEM_IMG(item);
  const icon = iconSrc
    ? (() => { const img = popoverImg(iconSrc, item.name); img.addEventListener('error', () => img.style.display = 'none', { once: true }); return img; })()
    : h('div', { class: 'popover-icon-fallback' }, item.name);
  const tipName = item.qualityItem ? matDisplayName(item.name, true).baseName : item.name;

  const channelsNode = (d.total > 0 || bundleHits.length || (state.includeMB && mbHits.length)) ? h('div', { class: 'popover-channels' },
      d.ship ? channelRow(item, 'ship', ICON('Mini-Shipping_Bin.png',16), 'Ship to box', 'Counts for Items Shipped' + (d.fish ? ' & Master Angler' : ''), c.ship) : null,
      d.fish && !d.ship ? channelRow(item, 'ship', ICON('Bamboo_Pole.png',16), 'Catch this fish', 'Needed for Master Angler / Perfection', c.ship) : null,
      (d.cc || bundleHits.length) ? (() => {
        // Show each bundle requirement separately
        const entries = (bundlesByItemId[item.id] || []).filter(e => e.bundle.id !== 'missing');
        return entries.map(e => {
          const slotIdx = e.bundle.items.indexOf(e.item);
          const slotDone = !!state.bundleSlots[e.bundle.id + '_' + slotIdx];
          const qual = e.item.quality;
          const qty = e.item.qty;
          const subParts = [e.bundle.name];
          if (qty > 1) subParts.push(`${qty}× needed`);
          if (qual) subParts.push(`${cap(qual)} quality`);
          const onClick = () => {
            const key = e.bundle.id + '_' + slotIdx;
            state.bundleSlots[key] = !state.bundleSlots[key];
            if (!state.bundleSlots[key]) delete state.bundleSlots[key];
            // Sync CC channel count
            let ccCount = 0;
            for (const en of entries) {
              const si = en.bundle.items.indexOf(en.item);
              if (state.bundleSlots[en.bundle.id + '_' + si]) ccCount += (en.item.qty || 1);
            }
            setChannel(item.id, 'cc', ccCount);
            save(); scheduleRender();
          };
          return h('div', { class: 'channel' + (slotDone ? ' done' : ''), on: { click: onClick } },
            h('div', { class: 'channel-icon' }, ICON('Pink_Cake.png',16)),
            h('div', { class: 'channel-info' },
              h('div', { class: 'channel-label' }, `CC — ${e.bundle.name}`,
                qual ? h('span', { class: `channel-quality ${qual}` }, qual === 'iridium' ? ' ★★★' : qual === 'gold' ? ' ★★' : ' ★') : null
              ),
              h('div', { class: 'channel-sub' }, subParts.join(' · '))
            ),
            h('div', { class: 'channel-checkbox' })
          );
        });
      })() : null,
      d.cook ? channelCookRow(item, c.cook, d.cook) : null,
      d.craft ? channelCraftRow(item, c.craft, d.craft) : null,
      // Missing Bundle channel(s) — if this item appears in MB AND the toggle is on
      ...(state.includeMB ? mbHits.map(({ idx, item: bi }) => {
        const isDone = !!state.mbChecks[String(idx)];
        const qual = bi.quality;
        const qty = bi.qty;
        return h('div', { class: 'channel' + (isDone ? ' done' : ''), on: { click: () => toggleMBCheck(idx) } },
          h('div', { class: 'channel-icon' }, ICON('Prismatic_Shard.png',16)),
          h('div', { class: 'channel-info' },
            h('div', { class: 'channel-label' }, 'Missing Bundle'),
            h('div', { class: 'channel-sub' },
              qty > 1 ? `${qty}x  ` : '',
              qual ? h('span', { class: `channel-quality ${qual}` }, qual === 'iridium' ? ' ★★★' : qual === 'gold' ? ' ★★' : ' ★') : null,
              ' — ', bi.hint || 'Post-CC bonus'
            )
          ),
          h('div', { class: 'channel-checkbox' })
        );
      }) : []),
    ) : (item.forFish ? h('div', { class: 'popover-channels' },
      channelRow(item, 'ship', ICON('Bamboo_Pole.png',16), 'Catch this fish', 'Needed for Master Angler / Perfection', c.ship)
    ) : h('div', { class: 'popover-meta' }, state.mode === 'cc' ? 'This item is not in any CC bundle.' : 'No tracking needed.'));

  openPopover({
    icon,
    title: [
      tipName,
      item.qualityItem ? qStar(item.quality) : null,
    ],
    subtitle: [
      item.legendary ? '⭐ Legendary · ' : '',
      item.seasons.includes('any') ? 'Any season' : item.seasons.map(cap).join(' / '),
      item.note ? ` · ${item.note}` : '',
    ],
    body: [
      (item.where || item.when) ? h('div', { class: 'popover-meta' },
        item.where ? h('div', { class: 'popover-meta-row' }, h('span', { class: 'popover-meta-label' }, 'Where'), h('span', {}, item.where)) : null,
        item.when ? h('div', { class: 'popover-meta-row' }, h('span', { class: 'popover-meta-label' }, 'When'), h('span', {}, item.when)) : null,
        item.weather && item.weather !== 'any' ? h('div', { class: 'popover-meta-row' }, h('span', { class: 'popover-meta-label' }, 'Weather'), h('span', {}, item.weather === 'rainy' ? '🌧️ Rain' : '☀️ Sun')) : null,
      ) : null,
      ITEM_TIPS[tipName] ? h('div', { class: 'popover-tip' }, ITEM_TIPS[tipName]) : null,
      channelsNode,
    ],
    wikiUrl: wikiUrlFor(item.name, item.url),
    onClose: () => { state.openTile = null; },
  });
}

function channelRow(item, channel, icon, label, sub, isDone, quality) {
  const onClick = () => {
    if (channel === 'cc') {
      // Toggle ALL bundle slots for this item
      const entries = bundlesByItemId[item.id] || [];
      const newVal = !isDone;
      for (const e of entries) {
        const slotIdx = e.bundle.items.indexOf(e.item);
        const key = e.bundle.id + '_' + slotIdx;
        if (newVal) state.bundleSlots[key] = true;
        else delete state.bundleSlots[key];
      }
      setChannel(item.id, 'cc', newVal);
      save();
      scheduleRender();
    } else {
      toggleChannel(item.id, channel);
    }
  };
  return h('div', {
    class: 'channel' + (isDone ? ' done' : ''),
    on: { click: onClick }
  },
    h('div', { class: 'channel-icon' }, icon),
    h('div', { class: 'channel-info' },
      h('div', { class: 'channel-label' }, label,
        quality ? h('span', { class: `channel-quality ${quality}` }, quality === 'iridium' ? ' ★★★' : quality === 'gold' ? ' ★★' : ' ★') : null
      ),
      h('div', { class: 'channel-sub' }, sub)
    ),
    h('div', { class: 'channel-checkbox' })
  );
}
function channelCookRow(item, current, max) {
  const capped = Math.min(current || 0, max);
  return h('div', { class: 'channel' + (capped >= max ? ' done' : '') },
    h('div', { class: 'channel-icon' }, ICON('Fried_Egg.png',16)),
    h('div', { class: 'channel-info' },
      h('div', { class: 'channel-label' }, 'Set aside for cooking'),
      h('div', { class: 'channel-sub' }, `${max} needed across recipes`)
    ),
    h('div', { class: 'channel-counter' },
      h('button', { on: { click: e => { e.stopPropagation(); adjCook(item.id, -1); } } }, '−'),
      h('div', { class: 'val', on: { click: e => { e.stopPropagation(); inlineEdit(e.target, capped, max, v => setChannel(item.id, 'cook', v)); } } }, `${capped} / ${max}`),
      h('button', { on: { click: e => { e.stopPropagation(); adjCook(item.id, 1); } } }, '+')
    )
  );
}
function channelCraftRow(item, current, max) {
  const capped = Math.min(current || 0, max);
  return h('div', { class: 'channel' + (capped >= max ? ' done' : '') },
    h('div', { class: 'channel-icon' }, ICON('Dwarf_Hammer.png',16)),
    h('div', { class: 'channel-info' },
      h('div', { class: 'channel-label' }, 'Set aside for crafting'),
      h('div', { class: 'channel-sub' }, `${max} needed across recipes`)
    ),
    h('div', { class: 'channel-counter' },
      h('button', { on: { click: e => { e.stopPropagation(); adjCraft(item.id, -1); } } }, '−'),
      h('div', { class: 'val', on: { click: e => { e.stopPropagation(); inlineEdit(e.target, capped, max, v => setChannel(item.id, 'craft', v)); } } }, `${capped} / ${max}`),
      h('button', { on: { click: e => { e.stopPropagation(); adjCraft(item.id, 1); } } }, '+')
    )
  );
}

// ============================================================================
//  REFERENCE TAB — ordered per user feedback
//  Order: CC Bundles → Missing Bundle → Skills → Villagers → Stardrops
//         → Obelisks/Gold Clock → Walnuts → Cooking → Crafting
//         (Monsters tucked in with Obelisks/Walnuts area? putting it after Walnuts)
// ============================================================================
function renderReference() {
  const sections = [];
  sections.push(renderCCBundlesSection());
  if (state.includeMB) sections.push(renderMissingBundleSection());
  if (state.mode === 'perfection') {
    sections.push(renderFishSection());
    sections.push(renderSkillsSection());
    sections.push(renderFriendsSection());
    sections.push(renderStardropsSection());
    sections.push(renderObelisksSection());
    sections.push(renderWalnutsSection());
    sections.push(renderMonstersSection());
    sections.push(renderCookingSection());
    sections.push(renderCraftingSection());
  }
  sections.push(renderMaterialsSection());
  return h('div', {}, ...sections.filter(Boolean));
}

function refHead(icon, title, count, anchorId, key) {
  return h('div', { class: 'ref-section-head' },
    h('div', { class: 'ref-section-icon' }, icon),
    h('div', { class: 'ref-section-title' }, title),
    h('div', { class: 'ref-section-count', 'data-ref-count': key }, count)
  );
}

// ===== CC BUNDLES =====
function renderCCBundlesSection() {
  const ccDone = DATA.bundles.filter(b => isBundleDone(b)).length;
  const sec = h('div', { class: 'ref-section', id: 'section-cc-bundles' },
    refHead(ICON('Calendar.png',18), 'Community Center Bundles', `${ccDone} / ${DATA.bundles.length} bundles`, 'section-cc-bundles', 'cc-bundles'),
    h('div', { class: 'ref-section-note' }, 'Click a slot to toggle. Item slots sync with the cockpit. Hover any slot for the item name.'),
  );

  for (const room of ROOM_ORDER) {
    const bundles = DATA.bundles.filter(b => b.room === room);
    if (!bundles.length) continue;
    const roomDone = bundles.filter(b => isBundleDone(b)).length;
    const roomSlug = room.toLowerCase().replace(/[^a-z]/g,'-');
    sec.appendChild(h('div', { class: `bundle-room ${roomSlug}` },
      h('span', {}, room),
      h('span', { class: 'bundle-room-progress', 'data-room-progress': room }, `${roomDone}/${bundles.length} bundles`)
    ));
    const grid = h('div', { class: 'bundles-grid' });
    for (const b of bundles) grid.appendChild(renderBundleCard(b));
    sec.appendChild(grid);
  }
  return sec;
}

// ===== MISSING BUNDLE =====
function renderMissingBundleSection() {
  const b = DATA.missingBundle;
  const sec = h('div', { class: 'ref-section', id: 'section-missing-bundle' },
    refHead(ICON('Prismatic_Shard.png',18), 'The Missing Bundle', '', 'section-missing-bundle', 'missing-bundle'),
    h('div', { class: 'ref-section-note' }, 'Post-CC bonus. Donating 5 of these 6 items at the Abandoned JojaMart unlocks the Movie Theater. Some items require specific quality.'),
    h('div', { class: `bundle-room abandoned-jojamart` },
      h('span', {}, b.room)
    ),
    h('div', { class: 'bundles-grid' }, renderBundleCard(b))
  );
  return sec;
}

// ===== Shared bundle renderer =====
function renderBundleCard(b) {
  const done = bundleDoneCount(b);
  const target = b.slots_to_fill;
  const isDone = done >= target;
  const card = h('div', {
    class: 'bundle' + (isDone ? ' done' : ''),
    'data-color': b.color,
    'data-bundle-card': b.id,
    id: `bundle-${b.id}`
  },
    h('div', { class: 'bundle-header' },
      h('div', { class: 'bundle-name' }, b.name),
      h('div', { class: 'bundle-progress' }, `${done}/${target}`)
    ),
    h('div', { class: 'bundle-body' },
      b.note ? h('div', { class: 'bundle-note' }, b.note) : null,
      b.total_slots > b.slots_to_fill ? h('div', { class: 'bundle-pick' }, 'Pick any ', h('strong', {}, target), ' of ', b.total_slots) : null,
      tileGrid('slot', b.items.map((it, idx) => renderBundleSlot(b, it, idx)))
    ),
    h('div', { class: 'bundle-reward' },
      h('span', { class: 'reward-label' }, 'Reward'),
      h('span', { class: 'reward-name' }, b.reward)
    )
  );
  return card;
}

function renderBundleSlot(b, it, idx) {
  const src = it.image ? spriteSrc(it.image) : null;
  let spriteNode;
  if (src) {
    const img = h('img', { src, alt: it.name || '' });
    img.addEventListener('error', () => { const p = img.parentNode; img.remove(); if (p) p.appendChild(h('div', { class: 'tile-img-fallback' }, it.name || '?')); }, { once: true });
    spriteNode = img;
  } else {
    spriteNode = h('div', { class: 'tile-img-fallback' }, it.name || '?');
  }
  const overlays = [];
  if (it.qty > 1) overlays.push(badge(`${it.qty}×`));
  if (it.quality) overlays.push(qualityStar(it.quality));
  overlays.push(nameHover(it.name || '?'));
  const slot = tile('slot', {
    done: bundleSlotDone(b, it, idx),
    title: bundleSlotTitle(it),
    sprite: spriteNode,
    overlays,
  });
  slot.classList.remove('tile-static');
  slot.setAttribute('data-bundle-id', b.id);
  slot.setAttribute('data-slot-idx', idx);
  if (it.item_id) slot.setAttribute('data-bundle-slot-item', it.item_id);

  // Click handler
  slot.addEventListener('click', () => {
    if (b.id === 'missing') {
      // Missing-bundle slot — toggle that slot directly
      toggleMBCheck(idx);
    } else {
      // Toggle this specific bundle slot
      const key = b.id + '_' + idx;
      state.bundleSlots[key] = !state.bundleSlots[key];
      if (!state.bundleSlots[key]) delete state.bundleSlots[key];
      // Immediately update this slot's visual state
      updateBundleSlotState(slot, b, it, idx);
      refreshBundleProgress();
      // Sync the item's CC channel with proper count
      if (it.item_id) {
        const allSlots = (bundlesByItemId[it.item_id] || []).filter(e => e.bundle.id !== 'missing');
        let ccCount = 0;
        for (const e of allSlots) {
          const si = e.bundle.items.indexOf(e.item);
          if (state.bundleSlots[e.bundle.id + '_' + si]) ccCount += (e.item.qty || 1);
        }
        setChannel(it.item_id, 'cc', ccCount);
      }
      save();
      refreshGoldTracker();
      if (currentDOM?.hero) replaceContents(currentDOM.hero, renderHero());
    }
  });

  updateBundleSlotState(slot, b, it, idx);
  // Right-click opens item popover (or gold tracker for vault bundles)
  if (b.id.startsWith('vault-')) {
    slot.addEventListener('contextmenu', (e) => { e.preventDefault(); openGoldPopover(); });
  } else if (it.item_id) {
    const popId = it.quality ? it.item_id + '_' + it.quality : it.item_id;
    slot.addEventListener('contextmenu', (e) => { e.preventDefault(); state.openTile = popId; scheduleRender(); });
  }
  return slot;
}

function bundleSlotTitle(it) {
  const bits = [];
  if (it.qty > 1) bits.push(`${it.qty}×`);
  bits.push(it.name || '?');
  if (it.quality) bits.push(`(${it.quality === 'iridium' ? '★★★' : it.quality === 'gold' ? '★★' : '★'})`);
  if (it.hint) bits.push(`— ${it.hint}`);
  return bits.join(' ');
}

function updateBundleSlotState(slot, b, it, idx) {
  const done = bundleSlotDone(b, it, idx);
  slot.classList.toggle('done', done);
}

// ===== SKILLS =====
function renderSkillsSection() {
  const p = computeScore();
  const sec = h('div', { class: 'ref-section', id: 'section-skills' },
    refHead(ICON('Star_Shards.png',18), 'Skills', `${p.skills.got} / ${p.skills.total}`, 'section-skills', 'skills')
  );
  sec.appendChild(h('div', { class: 'ref-section-note' }, 'Reach level 10 in each skill.'));
  sec.appendChild(h('div', { class: 'list-grid' },
    DATA.skills.map(s => h('div', {
      class: 'list-item' + (state.checks[s.id] ? ' done' : ''),
      'data-check-id': s.id,
      on: {
        click: () => toggleCheck(s.id),
        contextmenu: (e) => { e.preventDefault(); showCounterPopover(s.name, 'Reach level 10. Unlocks professions at levels 5 and 10.', s.url, s.name.replace(/ /g,'_') + '_Skill_Icon.png'); }
      }
    },
      h('div', { class: 'li-cb' }),
      h('div', { class: 'li-name' }, ICON(s.name.replace(/ /g,'_') + '_Skill_Icon.png', 16), ' ' + s.name)
    ))
  ));
  return sec;
}

// ===== FRIENDS (Villagers) =====
function renderFriendsSection() {
  const p = computeScore();
  const groups = { bachelor: 'Bachelors', bachelorette: 'Bachelorettes', villager: 'Villagers' };
  const grouped = {};
  for (const v of DATA.villagers) (grouped[v.group] ??= []).push(v);
  const sec = h('div', { class: 'ref-section', id: 'section-friends' },
    refHead(ICON('Bouquet.png',18), 'Villagers — Max Hearts', `${p.friends.got} / ${p.friends.total}`, 'section-friends', 'friends')
  );
  sec.appendChild(h('div', { class: 'ref-section-note' }, '8 hearts for marriage candidates, 12 hearts for spouse, 10 hearts for everyone else.'));
  for (const [groupKey, label] of Object.entries(groups)) {
    if (!grouped[groupKey]) continue;
    sec.appendChild(h('div', { class: 'villager-subhead' }, label));
    sec.appendChild(h('div', { class: 'villager-grid' },
      grouped[groupKey].map(v => renderVillagerCard(v))
    ));
  }
  return sec;
}

function renderVillagerCard(v) {
  const isDone = !!state.checks[v.id];
  const portrait = h('div', { class: 'villager-portrait' });
  const src = PORTRAIT(v);
  if (src) {
    const img = h('img', { src, alt: v.name });
    img.addEventListener('error', () => { img.remove(); portrait.appendChild(h('div', { class: 'fallback' }, v.name.slice(0,3))); }, { once: true });
    portrait.appendChild(img);
  } else {
    portrait.appendChild(h('div', { class: 'fallback' }, v.name.slice(0,3)));
  }
  return h('div', {
    class: 'villager-card' + (isDone ? ' done' : ''),
    'data-check-id': v.id,
    on: { click: () => toggleCheck(v.id), contextmenu: (e) => { e.preventDefault(); showVillagerPopover(v); } }
  },
    portrait,
    h('div', { class: 'villager-main' },
      h('div', { class: 'villager-name-row' },
        h('div', { class: 'v-cb' }),
        h('div', { class: 'v-name' }, v.name)
      ),
      h('div', { class: 'v-gifts' }, h('span', { class: 'loved' }, '♥ '), (v.loved || []).slice(0, 5).join(', ')),
      v.note ? h('div', { class: 'v-gifts', style: 'color: var(--warn); font-style: italic;' }, v.note) : null
    ),
    h('div', { class: 'v-bday' }, `${cap(v.birthday.season).slice(0,3)} ${v.birthday.day}`)
  );
}

// ===== STARDROPS =====
function renderStardropsSection() {
  const p = computeScore();
  return h('div', { class: 'ref-section', id: 'section-stardrops' },
    refHead(ICON('Stardrop.png',18), 'Stardrops', `${p.stardrops.got} / ${p.stardrops.total}`, 'section-stardrops', 'stardrops'),
    h('div', { class: 'list-grid' },
      DATA.stardrops.map(s => h('div', {
        class: 'list-item' + (state.checks[s.id] ? ' done' : ''),
        'data-check-id': s.id,
        on: {
          click: () => toggleCheck(s.id),
          contextmenu: (e) => { e.preventDefault(); showCounterPopover(s.name, s.hint, s.url, 'Stardrop.png'); }
        }
      },
        h('div', { class: 'li-cb' }),
        h('div', { style: 'flex: 1;' },
          h('div', { class: 'li-name' }, s.name),
          h('div', { style: 'font-size: 11px; color: var(--ink-soft);' }, s.hint)
        )
      ))
    )
  );
}

// ===== OBELISKS / GOLD CLOCK =====
function renderObelisksSection() {
  const all = [...DATA.obelisks, DATA.goldClock];
  const got = all.filter(o => state.checks[o.id]).length;
  return h('div', { class: 'ref-section', id: 'section-obelisks' },
    refHead(ICON('Obelisk.png',18), 'Obelisks & Gold Clock', `${got} / ${all.length}`, 'section-obelisks', 'obelisks'),
    h('div', { class: 'list-grid' },
      all.map(o => {
        const src = o.image ? spriteSrc(o.image) : null;
        return h('div', {
          class: 'list-item' + (state.checks[o.id] ? ' done' : ''),
          'data-check-id': o.id,
          on: {
            click: () => toggleCheck(o.id),
            contextmenu: (e) => { e.preventDefault(); showBuildingPopover(o); }
          }
        },
          h('div', { class: 'li-cb' }),
          src ? h('img', { src, alt: o.name, style: 'width:28px;height:auto;image-rendering:pixelated;margin-right:8px;' }) : null,
          h('div', { style: 'flex: 1;' },
            h('div', { class: 'li-name' }, o.name),
            h('div', { style: 'font-size: 11px; color: var(--ink-soft);' }, o.cost),
            o.ingredients ? h('div', { style: 'display:flex;gap:2px;margin-top:3px;flex-wrap:wrap;align-items:center;' },
              ...[...o.ingredients.matchAll(/([A-Za-z\u2019' \-]+?)\s*\((\d+)\)/g)].map(m => {
                const ingName = m[1].trim();
                const ingQty = m[2];
                const ingItem = DATA.items.find(i => i.name === ingName);
                const ingSrc = ingItem ? spriteSrc(ingItem.image) : spriteSrc(ingName.replace(/ /g, '_') + '.png');
                return h('span', { style: 'display:inline-flex;align-items:center;gap:1px;font-size:10px;color:var(--ink-soft);', title: `${ingName} (${ingQty})` },
                  h('img', { src: ingSrc, alt: ingName, style: 'width:16px;height:16px;object-fit:contain;image-rendering:pixelated;' }),
                  h('span', {}, ingQty)
                );
              })
            ) : null
          )
        );
      })
    )
  );
}

function showBuildingPopover(o) {
  openPopover({
    icon: popoverImg(o.image ? spriteSrc(o.image) : null, o.name),
    title: o.name,
    body: [
      BUILDING_TIPS[o.name] ? h('div', { class: 'popover-tip' }, BUILDING_TIPS[o.name]) : null,
      h('div', { class: 'popover-row' }, h('span', { class: 'popover-label' }, 'Cost'), h('span', {}, o.cost)),
      o.ingredients ? h('div', { class: 'popover-section' }, h('div', { class: 'popover-label' }, 'Materials'), renderIngredientIcons(o.ingredients)) : null,
    ],
    wikiUrl: o.url,
  });
}

// ===== WALNUTS =====
function renderWalnutsSection() {
  const p = computeScore();
  return h('div', { class: 'ref-section', id: 'section-walnuts' },
    refHead(ICON('Golden_Walnut.png',18), 'Golden Walnuts', `${p.walnuts.got} / ${p.walnuts.total}`, 'section-walnuts', 'walnuts'),
    h('div', { class: 'counter-grid' },
      DATA.walnuts.map(w => {
        const cur = state.counts[w.id] || 0;
        const isDone = cur >= w.total;
        return h('div', { class: 'counter-row' + (isDone ? ' done' : ''),
          'data-counter-id': w.id, 'data-target': w.total,
          on: { contextmenu: (e) => { e.preventDefault(); showCounterPopover(w.name, WALNUT_HINTS[w.id], 'https://stardewvalleywiki.com/Golden_Walnut', 'Golden_Walnut.png'); } } },
          h('div', {},
            h('div', { class: 'cr-name' }, w.name),
            h('div', { class: 'cr-bar' }, h('div', { class: 'fill', style: `width: ${Math.min(100, cur/w.total*100)}%` }))
          ),
          h('div', { class: 'cr-controls' },
            h('button', { on: { click: () => adjCount(w.id, -1) } }, '−'),
            h('input', { type: 'number', min: 0, max: w.total, value: cur, on: { change: e => setCount(w.id, e.target.value) } }),
            h('button', { on: { click: () => adjCount(w.id, 1) } }, '+'),
            h('span', { class: 'cr-target' }, `/${w.total}`)
          )
        );
      })
    )
  );
}

// ===== MONSTERS =====
function renderMonstersSection() {
  const p = computeScore();
  return h('div', { class: 'ref-section', id: 'section-monsters' },
    refHead(ICON('Galaxy_Sword.png',18), 'Monster Slayer Goals', `${p.monster.got} / ${p.monster.total}`, 'section-monsters', 'monsters'),
    h('div', { class: 'counter-grid' },
      DATA.monsters.map(m => {
        const cur = state.counts[m.id] || 0;
        const isDone = cur >= m.target;
        return h('div', { class: 'counter-row' + (isDone ? ' done' : ''),
          'data-counter-id': m.id, 'data-target': m.target,
          on: { contextmenu: (e) => { e.preventDefault(); showCounterPopover(m.name, MONSTER_HINTS[m.id], 'https://stardewvalleywiki.com/Adventurer%27s_Guild', MONSTER_SPRITES[m.id]); } } },
          h('div', {},
            h('div', { class: 'cr-name' }, MONSTER_SPRITES[m.id] ? ICON(MONSTER_SPRITES[m.id], 22) : null, ' ' + m.name),
            h('div', { class: 'cr-bar' }, h('div', { class: 'fill', style: `width: ${Math.min(100, cur/m.target*100)}%` }))
          ),
          h('div', { class: 'cr-controls' },
            h('button', { on: { click: () => adjCount(m.id, -10) } }, '−10'),
            h('button', { on: { click: () => adjCount(m.id, -1) } }, '−'),
            h('input', { type: 'number', min: 0, value: cur, on: { change: e => setCount(m.id, e.target.value) } }),
            h('button', { on: { click: () => adjCount(m.id, 1) } }, '+'),
            h('button', { on: { click: () => adjCount(m.id, 10) } }, '+10'),
            h('span', { class: 'cr-target' }, `/${m.target}`)
          )
        );
      })
    )
  );
}

// ===== FISH =====
function renderFishSection() {
  const fishItems = DATA.items.filter(i => i.forFish);
  const got = fishItems.filter(i => getChannels(i.id).ship).length;
  const sec = h('div', { class: 'ref-section', id: 'section-fish' },
    refHead(ICON('Bamboo_Pole.png',18), 'Fish', `${got} / ${fishItems.length}`, 'section-fish', 'fish'),
    h('div', { class: 'ref-section-note' }, 'Click to mark as caught. Syncs with the ship channel on season tiles.')
  );
  sec.appendChild(h('div', { class: 'fish-grid' },
    fishItems.slice().sort((a,b) => a.name.localeCompare(b.name)).map(f => {
      const caught = !!getChannels(f.id).ship;
      const src = ITEM_IMG(f);
      const meta = [f.where, f.season && f.season !== 'all' ? f.season : null].filter(Boolean).join(' · ');
      const el = h('div', {
        class: 'fish-grid-item' + (caught ? ' done' : ''),
        title: `${f.name}${f.where ? '\n' + f.where : ''}${f.when ? '\nTime: ' + f.when : ''}${f.season ? '\nSeason: ' + f.season : ''}`,
        'data-item-id': f.id,
        on: {
          click: () => { setChannel(f.id, 'ship', !caught); scheduleRender(); },
          contextmenu: (e) => { e.preventDefault(); state.openTile = f.id; scheduleRender(); }
        }
      },
        src ? h('img', { src, alt: f.name }) : null,
        h('div', { style: 'flex:1; min-width:0;' },
          h('div', { class: 'fish-name' }, f.name),
          meta ? h('div', { class: 'fish-meta' }, meta) : null
        ),
        f.weather && f.weather !== 'any' ? h('span', { style: 'font-size:14px;' }, f.weather === 'sunny' ? '☀' : '☔') : null
      );
      return el;
    })
  ));
  return sec;
}

// ===== MATERIALS =====
function renderMaterialsSection() {
  // === TOTAL: full original demand per material name ===
  const total = {};
  const addTotal = (name, qty) => { total[name] = (total[name] || 0) + qty; };

  // Bundles (all items, regardless of completion)
  for (const b of DATA.bundles) {
    if (b.id.startsWith('vault-')) continue; // Vault bundles are gold, not materials
    for (const it of b.items) {
      const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
      if (!matName) continue;
      if (recipeByName[matName]) {
        const base = resolveIngredients(recipeByName[matName], it.qty || 1, new Set());
        for (const [n, q] of Object.entries(base)) addTotal(n, q);
      } else {
        addTotal(matName, it.qty || 1);
      }
    }
  }
  if (state.includeMB) {
    for (const it of DATA.missingBundle.items) {
      const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
      if (!matName) continue;
      if (recipeByName[matName]) {
        const base = resolveIngredients(recipeByName[matName], it.qty || 1, new Set());
        for (const [n, q] of Object.entries(base)) addTotal(n, q);
      } else {
        addTotal(matName, it.qty || 1);
      }
    }
  }
  // Cooking ingredients (perfection mode)
  if (state.mode === 'perfection') {
    for (const r of DATA.cooking) {
      if (!r.ingredients) continue;
      const base = resolveIngredients(r.ingredients, 1, new Set());
      for (const [n, q] of Object.entries(base)) addTotal(n, q);
    }
  }
  // Crafting ingredients (perfection mode)
  if (state.mode === 'perfection') {
    for (const g of DATA.craftingGroups) {
      for (const r of g.items) {
        if (!r.ingredients) continue;
        const base = resolveIngredients(r.ingredients, 1, new Set());
        for (const [n, q] of Object.entries(base)) addTotal(n, q);
      }
    }
  }
  // Shipping & fishing (perfection mode): 1 each
  if (state.mode === 'perfection') {
    for (const item of DATA.items) {
      if (item.qualityItem) continue;
      if (item.forShipping) addTotal(item.name, 1);
      else if (item.forFish) addTotal(item.name, 1);
    }
  }
  // Obelisk building materials (perfection mode)
  if (state.mode === 'perfection') {
    for (const ob of DATA.obelisks) {
      if (!ob.ingredients) continue;
      const base = resolveIngredients(ob.ingredients, 1, new Set());
      for (const [n, q] of Object.entries(base)) addTotal(n, q);
    }
  }

  // === ACQUIRED: items obtained via channel interactions ===
  const acquired = {};
  const addAcq = (name, qty) => { acquired[name] = (acquired[name] || 0) + qty; };

  for (const item of DATA.items) {
    if (item.qualityItem) continue;
    const c = getChannels(item.id);
    if (c.cook) addAcq(item.name, c.cook); // cook reserve
    if (c.craft) addAcq(item.name, c.craft); // craft reserve
  }
  // Ship/fish = acquired (and consumed simultaneously)
  if (state.mode === 'perfection') {
    for (const item of DATA.items) {
      if (item.qualityItem) continue;
      const c = getChannels(item.id);
      if (item.forShipping && c.ship) addAcq(item.name, 1);
      else if (item.forFish && !item.forShipping && c.ship) addAcq(item.name, 1);
    }
  }
  // CC channel: use bundle slots as authoritative source
  for (const b of DATA.bundles) {
    if (b.id.startsWith('vault-')) continue;
    for (let idx = 0; idx < b.items.length; idx++) {
      const it = b.items[idx];
      if (bundleSlotDone(b, it, idx)) {
        const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
        if (!matName) continue;
        if (recipeByName[matName]) {
          const base = resolveIngredients(recipeByName[matName], it.qty || 1, new Set());
          for (const [n, q] of Object.entries(base)) addAcq(n, q);
        } else {
          addAcq(matName, it.qty || 1);
        }
      }
    }
  }
  if (state.includeMB) {
    for (let idx = 0; idx < DATA.missingBundle.items.length; idx++) {
      const it = DATA.missingBundle.items[idx];
      if (bundleSlotDone(DATA.missingBundle, it, idx)) {
        const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
        if (!matName) continue;
        if (recipeByName[matName]) {
          const base = resolveIngredients(recipeByName[matName], it.qty || 1, new Set());
          for (const [n, q] of Object.entries(base)) addAcq(n, q);
        } else {
          addAcq(matName, it.qty || 1);
        }
      }
    }
  }

  // === CONSUMED: items used up ===
  const consumed = {};
  const addCon = (name, qty) => { consumed[name] = (consumed[name] || 0) + qty; };

  // Bundle slots done = consumed
  for (const b of DATA.bundles) {
    for (let idx = 0; idx < b.items.length; idx++) {
      const it = b.items[idx];
      if (bundleSlotDone(b, it, idx)) {
        const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
        if (matName) addCon(matName, it.qty || 1);
      }
    }
  }
  if (state.includeMB) {
    for (let idx = 0; idx < DATA.missingBundle.items.length; idx++) {
      const it = DATA.missingBundle.items[idx];
      if (bundleSlotDone(DATA.missingBundle, it, idx)) {
        const matName = it.quality ? cap(it.quality) + ' ' + it.name : it.name;
        if (matName) addCon(matName, it.qty || 1);
      }
    }
  }
  // Checked cooking recipes = ingredients consumed
  if (state.mode === 'perfection') {
    for (const r of DATA.cooking) {
      if (!state.checks[r.id] || !r.ingredients) continue;
      const base = resolveIngredients(r.ingredients, 1, new Set());
      for (const [n, q] of Object.entries(base)) addCon(n, q);
    }
  }
  // Checked crafting recipes = ingredients consumed
  if (state.mode === 'perfection') {
    for (const g of DATA.craftingGroups) {
      for (const r of g.items) {
        if (!state.checks[r.id] || !r.ingredients) continue;
        const base = resolveIngredients(r.ingredients, 1, new Set());
        for (const [n, q] of Object.entries(base)) addCon(n, q);
      }
    }
  }
  // Shipped/fished = consumed (same 1 we tracked in ship)
  if (state.mode === 'perfection') {
    for (const item of DATA.items) {
      if (item.qualityItem) continue;
      const c = getChannels(item.id);
      if (item.forShipping && c.ship) addCon(item.name, 1);
      else if (item.forFish && !item.forShipping && c.ship) addCon(item.name, 1);
    }
  }
  // Obelisks checked = consumed from craft reserve
  if (state.mode === 'perfection') {
    for (const ob of DATA.obelisks) {
      if (!ob.ingredients || !state.checks[ob.id]) continue;
      const base = resolveIngredients(ob.ingredients, 1, new Set());
      for (const [n, q] of Object.entries(base)) addCon(n, q);
    }
  }

  // === Compute display values ===
  const allNames = Object.keys(total).sort();
  if (!allNames.length) return null;

  const itemByName = {};
  for (const it of DATA.items) itemByName[it.name] = it;

  const rows = allNames.map(name => {
    const t = total[name] || 0;
    const a = acquired[name] || 0;
    const c = consumed[name] || 0;
    const remaining = t - a;
    const item = itemByName[name] || itemByName[name.replace(/^(Gold|Silver|Iridium) /, '')];
    const kind = item ? (item.kind || 'other') : 'other';
    return { name, total: t, acquired: a, consumed: c, remaining, kind };
  });

  // Sort: by kind, then remaining desc
  const KIND_ORDER = ['resource', 'crop', 'fruit', 'forage', 'fish', 'animal', 'artisan', 'other'];
  const KIND_LABELS = { resource: 'Resources', crop: 'Crops', fruit: 'Fruit Trees', forage: 'Forage', fish: 'Fish', animal: 'Animal Products', artisan: 'Artisan Goods', other: 'Other' };
  rows.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    const da = a.remaining <= 0 ? 1 : 0, db = b.remaining <= 0 ? 1 : 0;
    if (da !== db) return da - db;
    return b.remaining - a.remaining;
  });

  const doneCount = rows.filter(r => r.remaining <= 0).length;
  const activeCount = rows.length - doneCount;

  const sec = h('div', { class: 'ref-section', id: 'section-materials' },
    refHead(ICON('Hardwood.png',18), 'Materials Needed', `${activeCount} remaining / ${rows.length} total`, 'section-materials', 'materials')
  );

  const matSprite = (name) => {
    const item = itemByName[name];
    if (item) return spriteSrc(item.image);
    const baseName = name.replace(/^(Gold|Silver|Iridium) /, '');
    const baseItem = itemByName[baseName];
    if (baseItem) return spriteSrc(baseItem.image);
    return spriteSrc(baseName.replace(/ /g, '_').replace(/'/g, '\u2019') + '.png');
  };

  const renderRow = (r) => {
    const src = matSprite(r.name);
    const isQI = !!(itemByName[r.name] && itemByName[r.name].qualityItem);
    const { baseName, quality } = matDisplayName(r.name, isQI);
    const isDone = r.remaining <= 0;
    const tile = h('div', { class: 'mat-tile' + (isDone ? ' done' : ''),
      title: `${r.name}\nTotal: ${r.total}  Acquired: ${r.acquired}  Consumed: ${r.consumed}  Remaining: ${r.remaining}`,
      on: { contextmenu: (e) => { e.preventDefault(); const it = DATA.items.find(i => i.name === r.name); if (it) { state.openTile = it.id; scheduleRender(); } } }
    },
      src ? h('img', { src, alt: baseName, class: 'mat-sprite' }) : null,
      h('div', { class: 'mat-info' },
        h('div', { class: 'mat-name' }, baseName, qStar(quality)),
        h('div', {},
          h('span', { class: 'mat-head' }, isDone ? '✓' : `${r.remaining}`),
          h('span', { class: 'mat-sub' }, ` ${r.total}t ${r.acquired}a ${r.consumed}c`)
        )
      )
    );
    return tile;
  };

  const renderGroup = (kindRows, label) => {
    const frag = document.createDocumentFragment();
    if (label) frag.appendChild(h('div', { class: 'mat-group-head' }, label));
    frag.appendChild(h('div', { class: 'mat-grid' }, ...kindRows.map(renderRow)));
    return frag;
  };

  // Hide-completed toggle
  const hideState = !!state.matHideDone;
  const matSection = h('div', { class: 'mat-section' + (hideState ? ' hide-done' : '') });
  if (doneCount > 0) {
    const tog = h('div', { class: 'mat-done-toggle', on: { click: () => {
      state.matHideDone = !state.matHideDone; save(); refreshMaterialsSection();
    }}}, hideState ? `+ Show ${doneCount} completed` : `− Hide ${doneCount} completed`);
    matSection.appendChild(tog);
  }

  // Group ALL rows by kind (done items sorted to back within each group)
  let lastKind = null;
  let currentGroup = [];
  for (const r of rows) {
    if (r.kind !== lastKind) {
      if (currentGroup.length) matSection.appendChild(renderGroup(currentGroup, KIND_LABELS[lastKind]));
      currentGroup = [];
      lastKind = r.kind;
    }
    currentGroup.push(r);
  }
  if (currentGroup.length) matSection.appendChild(renderGroup(currentGroup, KIND_LABELS[lastKind]));
  sec.appendChild(matSection);

  return sec;
}
// ===== COOKING =====
// Shared checklist tile (cooking / crafting / goals): sprite + left-click toggle + right-click info.
function checklistTile(c, src, onContext) {
  return tile('slot', {
    checkId: c.id,
    done: !!state.checks[c.id],
    title: c.name + (c.obtain ? '\n' + c.obtain : c.source ? '\nSource: ' + c.source : c.ingredients ? '\nRecipe: ' + c.ingredients : ''),
    sprite: src ? h('img', { src, alt: c.name }) : h('div', { class: 'tile-img-fallback' }, c.name.slice(0, 4)),
    onClick: () => toggleCheck(c.id),
    onContext: () => onContext(c),
  });
}

function renderCookingSection() {
  const p = computeScore();
  return h('div', { class: 'ref-section', id: 'section-cooking' },
    refHead(ICON('Fried_Egg.png',18), 'Cooking', `${p.cooking.got} / ${p.cooking.total}`, 'section-cooking', 'cooking'),
    tileGrid('slot',
      DATA.cooking.slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => {
        const imgName = c.name.replace(/: /g, '_').replace(/ /g, '_').replace(/'/g, "'") + '.png';
        return checklistTile(c, spriteSrc(imgName), c => showRecipePopover(c, 'cooking'));
      })
    )
  );
}

function renderIngredientIcons(ingredientsStr) {
  if (!ingredientsStr) return null;
  const parts = [...ingredientsStr.matchAll(/([A-Za-z\u2019' \-]+?)\s*\((\d+)\)/g)];
  if (!parts.length) return h('span', {}, ingredientsStr);
  return h('div', { class: 'recipe-ingredients' },
    parts.map(m => {
      const name = m[1].trim();
      const qty = m[2];
      const imgFile = name.replace(/ /g, '_').replace(/'/g, "\u2019") + '.png';
      const src = spriteSrc(imgFile);
      return h('div', { class: 'recipe-ing-item', title: name },
        src ? h('img', { src, alt: name }) : null,
        h('span', { class: 'recipe-ing-qty' }, qty + '×'),
        !src ? h('span', { class: 'recipe-ing-name' }, name) : null
      );
    })
  );
}

function showRecipePopover(item, type) {
  const imgName = item.name.replace(/ /g, '_').replace(/'/g, "'") + '.png';
  openPopover({
    icon: popoverImg(spriteSrc(imgName), item.name),
    title: item.name,
    body: [
      item.source ? h('div', { class: 'popover-row' }, h('span', { class: 'popover-label' }, 'Source'), h('span', {}, item.source)) : null,
      ITEM_TIPS[item.name] ? h('div', { class: 'popover-tip' }, ITEM_TIPS[item.name]) : null,
      item.ingredients ? h('div', { class: 'popover-section' }, h('div', { class: 'popover-label' }, 'Ingredients'), renderIngredientIcons(item.ingredients)) : null,
    ],
    wikiUrl: wikiUrlFor(item.name),
  });
}

function showCounterPopover(name, hint, wikiUrl, spriteImg) {
  openPopover({
    icon: popoverImg(spriteImg ? spriteSrc(spriteImg) : null, name),
    title: name,
    body: hint ? h('div', { class: 'popover-tip' }, hint) : null,
    wikiUrl,
  });
}

// ===== CRAFTING =====
function renderCraftingSection() {
  const p = computeScore();
  const sec = h('div', { class: 'ref-section', id: 'section-crafting' },
    refHead(ICON('Dwarf_Hammer.png',18), 'Crafting', `${p.crafting.got} / ${p.crafting.total}`, 'section-crafting', 'crafting')
  );
  for (const g of DATA.craftingGroups) {
    const done = g.items.filter(i => state.checks[i.id]).length;
    sec.appendChild(h('div', { class: 'villager-subhead' }, `${g.group}  `, h('span', { style: 'color: var(--ink-faint); font-weight: 600;' }, `${done}/${g.items.length}`)));
    sec.appendChild(tileGrid('slot',
      g.items.map(c => {
        const imgName = c.name.replace(/: /g, '_').replace(/ /g, '_').replace(/'/g, "'") + '.png';
        const src = c.sprite ? ('assets/pred/' + c.sprite) : spriteSrc(imgName);
        return checklistTile(c, src, c => c.sprite ? showGoalPopover(c) : showRecipePopover(c, 'crafting'));
      })
    ));
  }
  return sec;
}

function showGoalPopover(c) {
  const isDeluxe = c.id === 'cr-deluxescarecrow';
  openPopover({
    icon: popoverImg('assets/pred/' + c.sprite, c.name),
    title: c.name,
    subtitle: isDeluxe ? 'Craftable \u00b7 collect all 8 rarecrows to unlock' : 'Rarecrow \u00b7 needed for the Deluxe Scarecrow',
    body: isDeluxe && c.ingredients
      ? h('div', { class: 'popover-section' },
          h('div', { class: 'popover-label' }, 'Ingredients'),
          renderIngredientIcons(c.ingredients))
      : (c.obtain ? h('div', { class: 'popover-tip' }, c.obtain) : null),
    wikiUrl: isDeluxe ? 'https://stardewvalleywiki.com/Deluxe_Scarecrow' : 'https://stardewvalleywiki.com/Scarecrow#Rarecrows',
  });
}
function deluxeTile(c) {
  const src = c.sprite ? ('assets/pred/' + c.sprite) : spriteSrc(c.name.replace(/ /g, '_') + '.png');
  return tile('standard', {
    checkId: c.id,
    done: !!state.checks[c.id],
    title: c.name + (c.obtain ? '\n' + c.obtain : c.ingredients ? '\nRecipe: ' + c.ingredients : ''),
    sprite: src ? h('img', { src, alt: c.name }) : h('div', { class: 'tile-img-fallback' }, c.name.slice(0, 4)),
    onClick: () => toggleCheck(c.id),
    onContext: () => showGoalPopover(c),
  });
}
function renderDeluxeScarecrowPanel() {
  const items = DATA.craftingGroups.find(g => g.group === 'Deluxe Scarecrow')?.items || [];
  const done = items.filter(i => state.checks[i.id]).length;
  return h('div', { class: 'panel panel-always' },
    h('div', { class: 'panel-head' },
      h('span', { class: 'panel-icon' }, h('img', { src: 'assets/pred/deluxe_scarecrow.png', style: 'width:20px;height:20px;object-fit:contain;image-rendering:pixelated;' })),
      h('div', { class: 'panel-title' }, 'Deluxe Scarecrow', h('span', { class: 'now-sub-note' }, 'recipe + 8 rarecrows')),
      h('div', { class: 'panel-count' }, `${done} / ${items.length}`)
    ),
    tileGrid('standard', items.map(deluxeTile))
  );
}
function renderFooter() {
  return h('div', { class: 'footer' },
    h('span', {}, 'Saves locally in your browser.')
  );
}

// ============ BOOT ============
function boot() {
  scheduleRender();
}
boot();


// ============================================================================
//  OSHAWK 1.6 PREDICTOR — pure-JS port of the verified stardew-seed-cracker.
//  Platform split: Switch -> Jkiss (Mono), PC -> MsCorLibRandom (.NET).
//  Seeds are xxHash32-based (Utility.CreateRandomSeed). Data tables live in
//  predictor-data.js (PRED_ALL_OBJECTS, PRED_ELIGIBLE, PRED_FURNITURE, PRED_SHIRTS).
// ============================================================================
(function (global) {
  'use strict';

  // ---- xxHash32 (seeds always hash a 20-byte little-endian buffer) ----------
  const P1 = 2654435761 | 0;
  const P2 = 2246822519 | 0;
  const P3 = 3266489917 | 0;
  const P4 = 668265263 | 0;
  const P5 = 374761393 | 0;

  function rotl(x, r) { return ((x << r) | (x >>> (32 - r))) | 0; }
  function readLE32(b, i) {
    return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) | 0;
  }
  function round(acc, input) {
    acc = (acc + Math.imul(input, P2)) | 0;
    acc = rotl(acc, 13);
    return Math.imul(acc, P1) | 0;
  }
  // bytes: array of length 20 (all seeds); returns signed i32 (Rust `as i32`).
  function xxh32(bytes, seed) {
    const len = bytes.length;
    let h, i = 0;
    seed = seed | 0;
    if (len >= 16) {
      let v1 = (seed + P1 + P2) | 0;
      let v2 = (seed + P2) | 0;
      let v3 = seed | 0;
      let v4 = (seed - P1) | 0;
      const limit = len - 16;
      do {
        v1 = round(v1, readLE32(bytes, i)); i += 4;
        v2 = round(v2, readLE32(bytes, i)); i += 4;
        v3 = round(v3, readLE32(bytes, i)); i += 4;
        v4 = round(v4, readLE32(bytes, i)); i += 4;
      } while (i <= limit);
      h = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) | 0;
    } else {
      h = (seed + P5) | 0;
    }
    h = (h + len) | 0;
    while (i + 4 <= len) {
      h = (h + Math.imul(readLE32(bytes, i), P3)) | 0;
      h = Math.imul(rotl(h, 17), P4) | 0;
      i += 4;
    }
    while (i < len) {
      h = (h + Math.imul(bytes[i], P5)) | 0;
      h = Math.imul(rotl(h, 11), P1) | 0;
      i += 1;
    }
    h ^= h >>> 15;
    h = Math.imul(h, P2) | 0;
    h ^= h >>> 13;
    h = Math.imul(h, P3) | 0;
    h ^= h >>> 16;
    return h | 0;
  }

  function hashKey(str) {
    const b = [];
    for (let i = 0; i < str.length; i++) b.push(str.charCodeAt(i) & 0xff);
    return xxh32(b, 0);
  }

  // ---- seeds (Utility.CreateRandomSeed) -------------------------------------
  function reduce(x) { return Math.trunc(x % 2147483647); }
  function writeLE32(buf, o, v) {
    buf[o] = v & 0xff;
    buf[o + 1] = (v >> 8) & 0xff;
    buf[o + 2] = (v >> 16) & 0xff;
    buf[o + 3] = (v >> 24) & 0xff;
  }
  function createRandomSeed(a, b, c, d, e) {
    const buf = new Array(20).fill(0);
    writeLE32(buf, 0, reduce(a));
    writeLE32(buf, 4, reduce(b));
    writeLE32(buf, 8, reduce(c));
    writeLE32(buf, 12, reduce(d));
    writeLE32(buf, 16, reduce(e));
    return xxh32(buf, 0);
  }
  // Travelling-cart / shared shop seed: CreateRandomSeed(days_played, uid/2).
  function shopSeed(daysPlayed, uid) {
    const buf = new Array(20).fill(0);
    writeLE32(buf, 0, reduce(daysPlayed));
    writeLE32(buf, 4, reduce(Math.floor(uid / 2)));
    return xxh32(buf, 0);
  }
  // SYNCED_RANDOM seed: CreateRandom(key_hash, uid, days_played) — full uid.
  function syncedRandomSeed(keyHash, uid, daysPlayed) {
    const buf = new Array(20).fill(0);
    writeLE32(buf, 0, reduce(keyHash));
    writeLE32(buf, 4, reduce(uid));
    writeLE32(buf, 8, reduce(daysPlayed));
    return xxh32(buf, 0);
  }

  // ---- PRNGs ---------------------------------------------------------------
  // Switch / Mono System.Random (Jkiss).
  class Jkiss {
    constructor(seed) {
      this.x = seed >>> 0;
      this.y = 987654321;
      this.z = 43219876;
      this.c = 6543217;
    }
    gen() {
      this.x = (Math.imul(314527869, this.x) + 1234567) >>> 0;
      let y = this.y >>> 0;
      y = (y ^ (y << 5)) >>> 0;
      y = (y ^ (y >>> 7)) >>> 0;
      y = (y ^ (y << 22)) >>> 0;
      this.y = y;
      const t = 4294584393n * BigInt(this.z >>> 0) + BigInt(this.c >>> 0);
      this.z = Number(t & 0xffffffffn);
      this.c = Number((t >> 32n) & 0xffffffffn);
      return (this.x + this.y + this.z) >>> 0;
    }
    next() {
      for (;;) {
        const r = this.gen() | 0;
        if (r === -2147483648) continue;
        const mask = r >> 31;
        return ((r ^ mask) + (mask & 1)) | 0;
      }
    }
    nextMax(max) {
      if (max <= 0) return 0;
      return (this.gen() % max) | 0;
    }
    nextMinMax(start, end) {
      const diff = (end - start) >>> 0;
      if (diff <= 1) return start;
      return (start + (this.gen() % diff)) | 0;
    }
    nextDouble() {
      const a = this.gen() >>> 6;
      const b = this.gen() >>> 5;
      return (a * 134217728 + b) / 9007199254740992;
    }
  }

  // PC / .NET System.Random (subtractive, mscorlib).
  class MsCorLib {
    constructor(seed) {
      const s = new Int32Array(56);
      const subtraction = seed === -2147483648 ? 2147483647 : Math.abs(seed | 0);
      let mj = (161803398 - subtraction) | 0;
      s[55] = mj;
      let mk = 1;
      for (let i = 1; i < 55; i++) {
        const ii = (21 * i) % 55;
        s[ii] = mk;
        mk = (mj - mk) | 0;
        if (mk < 0) mk += 2147483647;
        mj = s[ii];
      }
      for (let k = 1; k < 5; k++) {
        for (let i = 1; i < 56; i++) {
          s[i] = (s[i] - s[1 + ((i + 30) % 55)]) | 0;
          if (s[i] === 2147483647) s[i] -= 1;
          if (s[i] < 0) s[i] += 2147483647;
        }
      }
      this.s = s;
      this.n = 0;
      this.np = 21;
    }
    gen() {
      this.n += 1; if (this.n >= 56) this.n = 1;
      this.np += 1; if (this.np >= 56) this.np = 1;
      let result = this.s[this.n] - this.s[this.np];
      if (result === 2147483647) result -= 1;
      if (result < 0) result += 2147483647;
      this.s[this.n] = result;
      return result;
    }
    next() { return this.gen(); }
    nextDouble() { return this.gen() * (1 / 2147483647); }
    nextMax(max) { return Math.trunc(this.nextDouble() * max); }
    nextMinMax(start, end) {
      const diff = (end - start) >>> 0;
      if (diff <= 2147483647) {
        return (start + Math.trunc(this.nextDouble() * diff)) | 0;
      }
      let sample = this.gen();
      if (this.gen() % 2 === 0) sample = -sample;
      let d = sample + (2147483647 - 1);
      d /= (2 * 2147483647) - 1;
      return (start + ((Math.trunc(d * diff) >>> 0) | 0)) | 0;
    }
  }

  function getPrng(platform, seed) {
    return platform === 'Switch' ? new Jkiss(seed) : new MsCorLib(seed);
  }

  // Exported so chunk 2 (appended below) and tests can reach the internals.
  global.__oshawk = {
    xxh32, hashKey, createRandomSeed, shopSeed, syncedRandomSeed, getPrng,
    Jkiss, MsCorLib,
  };
})(typeof window !== 'undefined' ? window : globalThis);

// ============================================================================
//  Chunk 2 — cart, shops, search, and the public `Predictor` API.
// ============================================================================
(function (global) {
  'use strict';
  const O = global.__oshawk;
  const { hashKey, createRandomSeed, shopSeed, syncedRandomSeed, getPrng } = O;

  const ALL = PRED_ALL_OBJECTS;
  const ELIG = PRED_ELIGIBLE;
  const FURN = PRED_FURNITURE;
  const SHIRTS = PRED_SHIRTS;

  // Game options that affect predictions. y1Guarantee mirrors the save's
  // "Guarantee Year 1 Completable" setting (forces Red Cabbage Seeds into the cart).
  const OPT = { y1Guarantee: true };

  const RED_CABBAGE = 266;
  const RED_CABBAGE_SEEDS = 485;
  const SKILL_BOOKS = [
    'Stardew Valley Almanac', 'Bait And Bobber', 'Woodcutter\u2019s Weekly',
    'Mining Monthly', 'Combat Quarterly',
  ];

  const H = {
    travelerSkillBook: hashKey('travelerSkillBook'),
    teaset: hashKey('teaset'),
    cart_fez: hashKey('cart_fez'),
    cart_coffee_bean: hashKey('cart_coffee_bean'),
    cart_rarecrow: hashKey('cart_rarecrow'),
    cart_retroCatalogue: hashKey('cart_retroCatalogue'),
    cart_jojaCatalogue: hashKey('cart_jojaCatalogue'),
    cart_junimoCatalogue: hashKey('cart_junimoCatalogue'),
    krobus_bread: hashKey('krobus_bread'),
  };

  const byKey = (a, b) => a[0] - b[0]; // i32 sort keys (stable in V8)

  function daysPlayed(year, season0, day) {
    return (year - 1) * 112 + season0 * 28 + day;
  }
  function eligiblePrice(id) {
    for (const o of ELIG) if (o.id === id) return o.price;
    return 0;
  }
  function objectName(id) {
    for (const o of ALL) if (o.id === id) return o.name;
    return '?';
  }

  // ---- shared RANDOM_ITEMS shuffles -----------------------------------------
  function getRandomItems(prng, min, max, requirePrice, isRandomSale, doCategoryChecks, howMany) {
    const keyed = [];
    for (let i = 0; i < ALL.length; i++) {
      const o = ALL[i];
      const key = prng.next();
      if (o.id === 65535) continue;
      if (requirePrice && o.price === 0) continue;
      if (isRandomSale && o.off) continue;
      if (o.id >= min && o.id <= max) keyed.push([key, i]);
    }
    keyed.sort(byKey);
    const selected = [];
    for (const [, i] of keyed) {
      const o = ALL[i];
      if (doCategoryChecks && (o.cat >= 0 || o.cat === -999)) continue;
      if (doCategoryChecks && o.blk) continue;
      selected.push(i);
      if (selected.length >= howMany) break;
    }
    return selected;
  }
  function getRandomShirt(prng, min, max) {
    const keyed = [];
    for (let i = 0; i < SHIRTS.length; i++) {
      const s = SHIRTS[i];
      const key = prng.next();
      if (s.id === 65535 || s.price === 0 || s.off) continue;
      if (s.id >= min && s.id <= max) keyed.push([key, i]);
    }
    keyed.sort(byKey);
    return keyed[0][1];
  }
  function getRandomWallFloor(prng, min, max, extra, exclude, howMany) {
    const keyed = [];
    for (let id = min; id <= max + extra; id++) keyed.push([prng.next(), id]);
    keyed.sort(byKey);
    const selected = [];
    for (const [, id] of keyed) {
      if (exclude.indexOf(id) !== -1 || id > max) continue;
      selected.push(id);
      if (selected.length >= howMany) break;
    }
    return selected;
  }

  // ---- traveling cart -------------------------------------------------------
  function generateStockWith(prng) {
    const keyed = [];
    for (let i = 0; i < ALL.length; i++) {
      const key = prng.next();
      if (ALL[i].eli >= 0) keyed.push([key, ALL[i].eli]);
    }
    keyed.sort(byKey);
    const MULT = [3, 4, 5];
    const items = [];
    for (let slot = 0; slot < 10; slot++) {
      const setIdx = prng.nextMax(10);
      const multIdx = prng.nextMax(3);
      const qtyRoll = prng.nextDouble();
      const eligIdx = keyed[slot][1];
      const base = ELIG[eligIdx].price;
      const setPrice = (setIdx + 1) * 100;
      const multiplied = (base * MULT[multIdx]) & 0xffff;
      items.push({
        eligIdx,
        id: ELIG[eligIdx].id,
        name: ELIG[eligIdx].name,
        price: Math.max(setPrice, multiplied),
        quantity: qtyRoll < 0.1 ? 5 : 1,
      });
    }
    return items;
  }
  function pickFurniture(prng) {
    const keyed = [];
    for (let i = 0; i < FURN.length; i++) {
      const f = FURN[i];
      const key = prng.next();
      if (f.price > 0 && !f.off && f.id <= 1612) keyed.push([key, i]);
    }
    keyed.sort(byKey);
    return FURN[keyed[0][1]];
  }
  function isRegularCartDay(dp) {
    const m = ((dp - 1) % 7 + 7) % 7;
    return m === 4 || m === 6;
  }
  function isFestivalCartDay(dp) {
    const doy = ((dp - 1) % 112 + 112) % 112 + 1;
    return doy === 15 || doy === 16 || doy === 17 || doy === 99 || doy === 100 || doy === 101;
  }
  function isCartDay(dp) { return isRegularCartDay(dp) || isFestivalCartDay(dp); }

  function originalGuarantee(platform, uid) {
    const seed = (12 * uid) | 0;
    return getPrng(platform, seed).nextMinMax(2, 31);
  }
  function visitsNow(dp, original) {
    let v = original - Math.floor(dp / 7) - Math.floor((dp + 2) / 7);
    if (dp >= 99) v -= 1;
    if (dp >= 100) v -= 1;
    if (dp >= 101) v -= 1;
    return v;
  }
  function syncedPresent(platform, uid, dp, keyHash, prob) {
    const rng = getPrng(platform, syncedRandomSeed(keyHash, uid, dp));
    return rng.nextDouble() < prob;
  }

  // Full cart stock for one absolute day, in the game's RNG-consumption order.
  function cartDay(platform, uid, dp) {
    const season = Math.floor((dp - 1) / 28) % 4;
    const year = Math.floor((dp - 1) / 112) + 1;
    const lines = [];
    const prng = getPrng(platform, shopSeed(dp, uid));
    const items = generateStockWith(prng);
    let seenRareSeed = false;
    items.forEach((it, i) => {
      if (it.name === 'Rare Seed') seenRareSeed = true;
      lines.push({ category: 'Item ' + (i + 1), name: it.name, id: it.id, kind: 'object', qty: 'x' + it.quantity, qtyNum: it.quantity, price: it.price + 'g', note: null });
    });

    const original = originalGuarantee(platform, uid);
    if (OPT.y1Guarantee && year === 1 && isCartDay(dp) && visitsNow(dp, original) === 0) {
      const base = eligiblePrice(RED_CABBAGE_SEEDS);
      const setPrice = (prng.nextMax(10) + 1) * 100;
      const multiplied = (base * [3, 4, 5][prng.nextMax(3)]) & 0xffff;
      const qty = prng.nextDouble() < 0.1 ? 5 : 1;
      lines.push({ category: 'Y1 Guarantee', name: 'Red Cabbage Seeds', id: RED_CABBAGE_SEEDS, kind: 'object', qty: 'x' + qty, qtyNum: qty, price: Math.max(setPrice, multiplied) + 'g', note: null });
    }

    const furniture = pickFurniture(prng);
    const furniturePrice = prng.nextMinMax(1, 11) * 250;
    lines.push({ category: 'Furniture', name: furniture.name, id: null, kind: 'furniture', qty: 'x1', qtyNum: 1, price: furniturePrice + 'g', note: null });

    if (season < 2 && !seenRareSeed) {
      const qty = prng.nextDouble() < 0.1 ? 5 : 1;
      lines.push({ category: 'Seasonal', name: 'Rare Seed', id: 347, kind: 'object', qty: 'x' + qty, qtyNum: qty, price: '1000g', note: null });
    }

    if (syncedPresent(platform, uid, dp, H.travelerSkillBook, 0.05)) {
      const idx = prng.nextMax(SKILL_BOOKS.length);
      lines.push({ category: 'Skill Book', name: SKILL_BOOKS[idx], id: null, kind: 'book', qty: 'x1', qtyNum: 1, price: '6000g', note: null });
    }

    if (season >= 2) {
      if (syncedPresent(platform, uid, dp, H.cart_rarecrow, 0.4))
        lines.push({ category: 'Seasonal', name: 'Rarecrow (Snowman)', id: null, kind: 'bigcraftable', qty: 'x1', qtyNum: 1, price: '4000g', note: null });
      if (syncedPresent(platform, uid, dp, H.cart_coffee_bean, 0.25))
        lines.push({ category: 'Special', name: 'Coffee Bean', id: 433, kind: 'object', qty: 'x1', qtyNum: 1, price: '2500g', note: null });
    }
    if (syncedPresent(platform, uid, dp, H.cart_fez, 0.1))
      lines.push({ category: 'Special', name: 'Red Fez', id: null, kind: 'hat', qty: 'x1', qtyNum: 1, price: '8000g', note: null });
    if (syncedPresent(platform, uid, dp, H.cart_retroCatalogue, 0.1))
      lines.push({ category: 'Catalogue', name: 'Retro Catalogue', id: null, kind: 'furniture', qty: 'x1', qtyNum: 1, price: '110000g', note: null });
    if (syncedPresent(platform, uid, dp, H.cart_jojaCatalogue, 0.1))
      lines.push({ category: 'Catalogue', name: 'Joja Catalogue', id: null, kind: 'furniture', qty: 'x1', qtyNum: 1, price: '30000g', note: 'if Community Center completed' });
    if (syncedPresent(platform, uid, dp, H.cart_junimoCatalogue, 0.1))
      lines.push({ category: 'Catalogue', name: 'Junimo Catalogue', id: null, kind: 'furniture', qty: 'x1', qtyNum: 1, price: '70000g', note: 'if CC or Joja route completed' });
    if (year >= 25 && syncedPresent(platform, uid, dp, H.teaset, 0.05))
      lines.push({ category: 'Special', name: 'Tea Set', id: null, kind: 'furniture', qty: '\u221e', qtyNum: 0, price: '1000000g', note: null });

    return lines;
  }

  // ---- other 1.6 shops ------------------------------------------------------
  function krobusWednesday(platform, uid, dp) {
    const prng = getPrng(platform, shopSeed(dp, uid));
    const pick = getRandomItems(prng, 698, 708, true, true, false, 1);
    const o = ALL[pick[0]];
    return { id: o.id, name: o.name, qty: 5, price: 200 };
  }
  function krobusSaturday(platform, uid, dp) {
    const prng = getPrng(platform, shopSeed(dp, uid));
    const bread = getPrng(platform, createRandomSeed(H.krobus_bread, dp, 0, 0, 0));
    if (bread.nextDouble() < 0.0196078431) {
      const price = 10 * prng.nextMinMax(5, 51);
      return { id: 216, name: objectName(216), qty: 5, price };
    }
    const pick = getRandomItems(prng, 194, 244, true, true, false, 1);
    const o = ALL[pick[0]];
    const price = 10 * prng.nextMinMax(5, 51);
    return { id: o.id, name: o.name, qty: 5, price };
  }
  function krobusWeek(platform, uid, dp) {
    const offset = 7 * Math.floor((dp - 1) / 7);
    return {
      wednesday: krobusWednesday(platform, uid, offset + 3), wedDp: offset + 3,
      saturday: krobusSaturday(platform, uid, offset + 6), satDp: offset + 6,
    };
  }
  function sandyShirt(platform, uid, dp) {
    const prng = getPrng(platform, shopSeed(dp, uid));
    const s = SHIRTS[getRandomShirt(prng, 1000, 1126)];
    return { id: s.id, name: s.name };
  }
  function pierreWallFloor(platform, uid, dp) {
    const rng = getPrng(platform, shopSeed(dp, uid));
    const wallpaper = getRandomWallFloor(rng, 0, 111, 9, [21], 1)[0];
    const flooring = 1 + getRandomWallFloor(rng, 0, 55, 22, [], 1)[0];
    return { wallpaper, flooring };
  }
  function jojaWallFloor(platform, uid, dp) {
    const rng = getPrng(platform, shopSeed(dp, uid));
    const wallpaper = getRandomWallFloor(rng, 0, 111, 9, [21], 1)[0];
    const flooring = 1 + getRandomWallFloor(rng, 0, 39, 48, [], 1)[0];
    return { wallpaper, flooring };
  }

  function shops(platform, uid, dp) {
    return {
      krobus: krobusWeek(platform, uid, dp),
      sandy: sandyShirt(platform, uid, dp),
      pierre: pierreWallFloor(platform, uid, dp),
      joja: jojaWallFloor(platform, uid, dp),
    };
  }

  // ---- search: next day an item appears in the cart or a named shop ---------
  function search(platform, uid, fromDp, query, maxDays) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    const limit = maxDays || 112 * 8;
    for (let d = 0; d < limit; d++) {
      const dp = fromDp + d;
      if (dp < 1) continue;
      if (isCartDay(dp)) {
        for (const line of cartDay(platform, uid, dp)) {
          if (line.name.toLowerCase().indexOf(q) !== -1) {
            return { dp, source: 'Traveling Cart', detail: line.name };
          }
        }
      }
      const dow = ((dp - 1) % 7 + 7) % 7; // 0=Mon .. 6=Sun
      if (dow === 2) {
        const w = krobusWednesday(platform, uid, dp);
        if (w.name.toLowerCase().indexOf(q) !== -1)
          return { dp, source: 'Krobus (Wed)', detail: w.name };
      }
      if (dow === 5) {
        const s = krobusSaturday(platform, uid, dp);
        if (s.name.toLowerCase().indexOf(q) !== -1)
          return { dp, source: 'Krobus (Sat)', detail: s.name };
      }
      const shirt = sandyShirt(platform, uid, dp);
      if (shirt.name.toLowerCase().indexOf(q) !== -1)
        return { dp, source: 'Sandy', detail: shirt.name };
    }
    return null;
  }

  // ---- upcoming / next-occurrence helpers -----------------------------------
  function nextCartDay(fromDp) {
    let dp = Math.max(1, fromDp);
    while (!isCartDay(dp)) dp++;
    return dp;
  }
  // The single Krobus item for a specific day (Wed fish or Sat dish), or null.
  function krobusItemForDay(platform, uid, dp) {
    const dow = ((dp - 1) % 7 + 7) % 7; // 0=Mon .. 6=Sun
    if (dow === 2) return { ...krobusWednesday(platform, uid, dp), kind: 'object', day: 'Wed', dp };
    if (dow === 5) return { ...krobusSaturday(platform, uid, dp), kind: 'object', day: 'Sat', dp };
    return null;
  }
  // The next (or today's) single Krobus offering from fromDp onward.
  function nextKrobus(platform, uid, fromDp) {
    for (let dp = Math.max(1, fromDp); dp < fromDp + 14; dp++) {
      const it = krobusItemForDay(platform, uid, dp);
      if (it) return it;
    }
    return null;
  }
  function sandyItem(platform, uid, dp) {
    const s = sandyShirt(platform, uid, dp);
    return { name: 'Shirt #' + s.id, id: s.id, kind: 'shirt', qty: 'x1', price: null };
  }
  function wallFloorItems(platform, uid, dp) {
    const pr = pierreWallFloor(platform, uid, dp);
    const jj = jojaWallFloor(platform, uid, dp);
    return [
      { name: 'Wallpaper #' + pr.wallpaper, kind: 'wallpaper', qty: null, price: null },
      { name: 'Pierre Floor #' + pr.flooring, kind: 'flooring', qty: null, price: null, shop: 'Pierre' },
      { name: 'Joja Floor #' + jj.flooring, kind: 'flooring', qty: null, price: null, shop: 'Joja' },
    ];
  }

  // ---- searchable item list + exact (by-id) search --------------------------
  function searchableItems() {
    const seen = new Set();
    const out = [];
    for (const o of ELIG) {
      if (!seen.has(o.id)) { seen.add(o.id); out.push({ name: o.name, id: o.id }); }
    }
    for (const o of ALL) {
      const inKrobus = (o.id >= 698 && o.id <= 708) || (o.id >= 194 && o.id <= 244) || o.id === 216;
      if (inKrobus && !seen.has(o.id)) { seen.add(o.id); out.push({ name: o.name, id: o.id }); }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
  function searchExact(platform, uid, fromDp, id, maxDays) {
    const limit = maxDays || 112 * 8;
    for (let d = 0; d < limit; d++) {
      const dp = fromDp + d;
      if (dp < 1) continue;
      if (isCartDay(dp)) {
        for (const l of cartDay(platform, uid, dp)) {
          if (l.id === id) return { dp, source: 'Traveling Cart', detail: l.name };
        }
      }
      const k = krobusItemForDay(platform, uid, dp);
      if (k && k.id === id) return { dp, source: 'Krobus (' + k.day + ')', detail: k.name };
    }
    return null;
  }

  global.Predictor = {
    daysPlayed, isCartDay, cartDay, shops, search, searchExact, searchableItems,
    nextCartDay, krobusItemForDay, nextKrobus, sandyItem, wallFloorItems,
    krobusWeek, sandyShirt, pierreWallFloor, jojaWallFloor, objectName,
    objSprite: (id) => (id != null && PRED_OBJ_SPRITE[id] != null ? PRED_OBJ_SPRITE[id] : null),
    setOptions: (o) => { Object.assign(OPT, o); },
  };
})(typeof window !== 'undefined' ? window : globalThis);

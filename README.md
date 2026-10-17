# MrKg's Stardew Cockpit

A single-page Stardew Valley **Perfection / Community Center** tracker, plus a
built-in **1.6 travelling-cart & shop predictor**. Pure static HTML/CSS/JS — no
build step, no framework, no backend. State is saved in the browser via
`localStorage`.

Live site: **https://mrking.dk/StardewCockpit/**

## Project structure

```
index.html              Shell: loads the stylesheet and scripts in order
css/
  styles.css            All styles (theme variables + layout)
js/
  data.js               Game data (items, bundles, villagers, festivals, …)
  images.js             Inline base64 sprite map (IMAGES)
  predictor-data.js     AUTO-GENERATED cart/shop data tables (see tools/)
  predictor.js          1.6 predictor: PRNGs, xxHash32 seeds, cart & shops, search
  app.js                App state, rendering, calendar, predictor UI
tools/
  gen-predictor-data.mjs  Regenerates js/predictor-data.js from the oshawk assets
  setup-assets.ps1        Copies sprite sheets & downloads shop icons
  fetch-pred-sprites.ps1  Downloads wiki sprites for named cart specials
  fetch-rarecrows.ps1     Downloads the 8 rarecrow sprites
  test-predictor.mjs      Validates the port against known-good vectors
assets/
  springobjects.png       Object sprite sheet (cart & Krobus item icons, cropped via CSS)
  Traveling_Cart.png / Pierres_shop.png / Jojamart.png   Shop header icons
  default_*.png           Fallback sprites (shirt / wallpaper / flooring / furniture)
  pred/                   Wiki sprites for named specials, the 8 rarecrows, and the Deluxe Scarecrow
.github/workflows/
  pages.yml             Deploys the site to GitHub Pages on push to main
```

Scripts are plain classic `<script>` tags loaded in order; later scripts rely on
globals declared by earlier ones (`DATA`, `IMAGES`, `PRED_*`, `Predictor`).

## Predictor

The predictor is a pure-JavaScript port of the verified
[stardew-seed-cracker](https://github.com/) / oshawk predictor logic for **Stardew
Valley 1.6+**. Two subtle controls sit next to the **Reset** button in the top bar:

- **Game seed** — your save's `uniqueIDForThisGame` (the game ID).
- **Platform** — `PC` (.NET `System.Random`) or `Switch` (Mono / JKISS).

A `1.6+` tag notes the supported version (predictions are 1.6-only, so there is no
version selector). The values are saved in the browser.

Below the season calendar, four permanent boxes show the state of each shop for the
day the calendar is on, with item **sprites** (right-click a tile for its info /
wiki page; left-click does nothing):

- **Traveling Cart** — the full day's stock (10 random items, the Year-1 Red
  Cabbage Seeds guarantee, furniture, seasonal Rare Seed, skill book, and the
  SYNCED specials). The cart shows on Fri & Sun plus festival / Night Market days;
  off-days show the **next** cart day instead.
- **Krobus** — the next (or today's) single offering: Wed fish or Sat dish.
- **Sandy** — the daily shirt.
- **Pierre / Joja** — the shared daily wallpaper plus each shop's flooring.

Boxes are always present and sized to their maximum content; when no seed/platform
is set they show a short prompt instead of disappearing.

The calendar supports **years** (use the `Y‹ ›` stepper next to the day stepper),
because the cart's Year-1 guarantee and some specials are year-dependent.

### Deluxe Scarecrow & rarecrows

A **Deluxe Scarecrow** tracker (its own panel in the cockpit and a subsection of the
Crafting reference) groups the recipe with its 8 rarecrow prerequisites. The recipe
keeps its ingredients so Wood/Fiber/Iridium still feed the material counters, and
each rarecrow's popover says where to obtain it (festivals, casino, museum, …) and
links to the Scarecrow wiki page.

The **Now** section also surfaces a Traveling Cart row (next to Fruit trees) that
appears only when the cart's next visit offers a perfection/CC item you still need.

Geode prediction is intentionally **not** ported (it changed in 1.6 and needs the
player's multiplayer ID, which a cracked game ID can't provide).

### Search

Between the calendar and the boxes is a search combobox. Start typing an item name
(e.g. `Red Cabbage`) and it suggests the first five matches with sprites; pick one
and it finds the next day that **exact** item appears in the cart or a named shop,
with a **Jump** button. **Jump back** returns you to the day you were on.

## Regenerating the predictor data

`js/predictor-data.js` is generated from the oshawk Rust project's `assets/*.json`
(`Objects.json`, `Furniture16.json`, `Shirts16.json`). To regenerate:

```powershell
node tools/gen-predictor-data.mjs "path\to\oshawk\assets"
```

Sprite sheets and shop icons are prepared once by `tools/setup-assets.ps1` (copies
`springobjects.png`, crops the default sprites, and downloads the shop icons).
`tools/fetch-pred-sprites.ps1` downloads the wiki sprites for the named cart
specials (catalogues, Red Fez, Tea Set, the snowman Rarecrow, and the skill books)
into `assets/pred/`.

To validate the port against the known-good vectors (cart, Sandy, Pierre/Joja):

```powershell
node tools/test-predictor.mjs
```

## Running locally

Any static file server works, e.g.:

```powershell
python -m http.server 8777
# then open http://localhost:8777/index.html
```

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which publishes the repo
root to GitHub Pages. Because the custom domain `mrking.dk` is configured on the
user site repo (`mrking.github.io`), this project repo is served at
`https://mrking.dk/StardewCockpit/`.

## Credits

Prediction logic ported from the verified stardew-seed-cracker / oshawk
predictor. Item sprites and data from Stardew Valley by ConcernedApe.

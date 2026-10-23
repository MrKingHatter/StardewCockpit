// Validates the JS port against the Rust oshawk's known-good test vectors.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = new URL('../js/', import.meta.url);
const dataSrc = readFileSync(new URL('predictor-data.js', base), 'utf8');
const predSrc = readFileSync(new URL('predictor.js', base), 'utf8');

const test = `
const R = {};
R.cart = Predictor.cartDay('Switch', 450982496, Predictor.daysPlayed(1,0,26))
  .slice(0,10).map(l => [l.name, l.price, l.qty]);
R.sandy3 = Predictor.sandyShirt('PC',123456789,3).id;
R.sandy5 = Predictor.sandyShirt('PC',123456789,5).id;
R.pierre3 = Predictor.pierreWallFloor('PC',123456789,3);
R.joja3 = Predictor.jojaWallFloor('PC',123456789,3);
R.y1Qty = Predictor.cartDay('Switch', 450982496, 63).filter(l => l.name === 'Red Cabbage Seeds').map(l => l.qtyNum);
R.y1Off = Predictor.cartDay('Switch', 450982496, 68).some(l => l.name === 'Red Cabbage Seeds');
globalThis.__R = R;
`;

const context = { console };
vm.createContext(context);
vm.runInContext(dataSrc + '\n' + predSrc + '\n' + test, context);
const R = context.__R;

const expectedCart = [
  ['Walleye', '525g', 'x1'], ['Maple Bar', '1200g', 'x1'], ['Miner\u2019s Treat', '1000g', 'x1'],
  ['Fall Seeds', '800g', 'x1'], ['Pizza', '900g', 'x1'], ['Artichoke', '900g', 'x1'],
  ['Fairy Seeds', '900g', 'x1'], ['Poppy', '700g', 'x1'], ['Trout Soup', '900g', 'x1'],
  ['Brick Floor', '400g', 'x5'],
];

let pass = true;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) pass = false;
  console.log((ok ? 'PASS ' : 'FAIL ') + label);
  if (!ok) { console.log('  got : ' + JSON.stringify(got)); console.log('  want: ' + JSON.stringify(want)); }
}

console.log('--- cart (Switch 450982496, Y1 spring 26) ---');
R.cart.forEach((row, i) => {
  // Name comparison is lenient on the apostrophe glyph.
  const norm = (s) => s.replace(/\u2019/g, "'");
  const ok = norm(row[0]) === norm(expectedCart[i][0]) && row[1] === expectedCart[i][1] && row[2] === expectedCart[i][2];
  if (!ok) pass = false;
  console.log((ok ? 'PASS ' : 'FAIL ') + row.join('  ') + (ok ? '' : '  != ' + expectedCart[i].join('  ')));
});
check('sandy dp3 id', R.sandy3, 1096);
check('sandy dp5 id', R.sandy5, 1006);
check('pierre dp3', R.pierre3, { wallpaper: 96, flooring: 20 });
check('joja dp3', R.joja3, { wallpaper: 96, flooring: 20 });
check('Y1 guarantee Switch 450982496 Fall 7 (dp63) = 5x Red Cabbage Seeds', R.y1Qty, [5]);
check('Y1 guarantee NOT on Fall 12 (dp68)', R.y1Off, false);

console.log(pass ? '\nALL GOLDEN VECTORS PASS' : '\nSOME VECTORS FAILED');
process.exit(pass ? 0 : 1);

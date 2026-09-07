// Icon tich khi chon the o panel DAU VET HIEN TRUONG (ca list va grid view).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8080/');
await p.fill('input[name=username]','admin'); await p.fill('input[type=password]','admin123');
await p.click('button[type=submit]');
await p.getByRole('button',{name:/Dấu vết hiện trường/}).click();
await p.waitForSelector('.scp-t tbody tr',{timeout:25000});
await p.locator('.scp-t tbody tr').first().click();
await p.waitForSelector('.smp-tr-card, .smp-tr-row',{timeout:25000});
await p.waitForTimeout(600);

let bad=0;
const check = async (label, cardSel) => {
  await p.locator(cardSel).first().click();
  await p.waitForTimeout(350);
  const r = await p.evaluate((sel) => {
    const dot = document.querySelector(sel + ' .smp-tick-dot') || document.querySelector('.smp-tick-dot');
    if (!dot) return { err: 'khong thay .smp-tick-dot' };
    const svg = dot.querySelector('svg');
    const d = dot.getBoundingClientRect(), s = svg?.getBoundingClientRect();
    const ds = getComputedStyle(dot), ss = svg ? getComputedStyle(svg) : null;
    const rgb = v => (v.match(/\d+/g) || []).slice(0,3).join(',');
    return {
      dot: `${Math.round(d.width)}x${Math.round(d.height)}`,
      svg: s ? `${Math.round(s.width)}x${Math.round(s.height)}` : null,
      // dau tich phai NHO hon vong tron, khong thi tran kin => cuc xanh dac
      fits: s ? (s.width < d.width && s.height < d.height) : false,
      round: ds.borderRadius,
      stroke: ss ? rgb(ss.stroke) : null,
      bg: rgb(ds.backgroundColor),
      // LOI THAT o list view: global `svg{stroke:currentColor}` + .smp-check{color:#2272e8}
      // => tich xanh tren nen xanh = vo hinh. Size dung van khong thay gi.
      visible: ss ? rgb(ss.stroke) !== rgb(ds.backgroundColor) : false,
    };
  }, cardSel);
  const ok = !r.err && r.fits && r.svg === '12x12' && r.dot === '20x20' && r.visible;
  if (!ok) bad++;
  console.log(`${ok?'ok  ':'FAIL'} ${label.padEnd(12)} ${JSON.stringify(r)}`);
  await p.locator(cardSel).first().click();   // bo chon
  await p.waitForTimeout(250);
};

await check('GRID view', '.smp-tr-card');
await p.locator('.smp-viewtoggle button').last().click();   // sang list gon
await p.waitForTimeout(450);
await check('LIST view', '.smp-tr-row');

if (errs.length) { bad++; console.log('PAGEERR:', errs.slice(0,2)); }
console.log(bad?`\n${bad} FAIL`:'\nALL OK');
process.exitCode = bad?1:0;
await b.close();

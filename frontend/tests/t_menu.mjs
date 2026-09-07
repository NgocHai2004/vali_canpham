import { chromium } from 'playwright';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', e.message));

await p.goto('http://localhost:8080/');
await p.fill('input[name=username]', 'admin');
await p.fill('input[type=password]', 'admin123');
await p.click('button[type=submit]');

// tab Dau vet hien truong -> chon vu an -> man Phan tich doi sanh
await p.getByRole('button', { name: /Dấu vết hiện trường/ }).click();
await p.waitForSelector('text=/Trom cap tai san/', { timeout: 20000 });
await p.locator('tr', { hasText: 'Trom cap tai san tai cua hang dien may' }).first().click();
await p.waitForSelector('.smp-menu-btn', { timeout: 20000 });
await p.waitForTimeout(600);

const check = async (label) => {
  const btns = p.locator('.smp-panel-trace .smp-menu-btn');
  const n = await btns.count();
  if (!n) { console.log(`${label}: NO BUTTONS`); return; }
  const lines = [];
  for (const i of [...new Set([0, n - 1])]) {
    await btns.nth(i).click();
    const pop = p.locator('.smp-menu-pop:popover-open');
    await pop.waitFor({ state: 'visible', timeout: 3000 });
    const r = await pop.boundingBox();
    // hit-test 3 diem: top, giua, bottom cua popup
    const hits = await p.evaluate(([x, y, h]) => {
      const at = (yy) => !!document.elementFromPoint(x, yy)?.closest('.smp-menu-pop');
      return [at(y - h / 2 + 4), at(y), at(y + h / 2 - 4)];
    }, [r.x + r.width / 2, r.y + r.height / 2, r.height]);
    const inVp = r.x >= 0 && r.y >= 0 && r.x + r.width <= 1440 && r.y + r.height <= 900;
    const items = await pop.locator('button, a').count();
    lines.push(`btn#${i}: ${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)} items=${items} inViewport=${inVp} visible[top,mid,bot]=${hits.join(',')}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
  }
  console.log(`${label} (${n} menus):\n  ` + lines.join('\n  '));
};

await check('GRID');
await p.locator('.smp-viewtoggle button').last().click();
await p.waitForTimeout(400);
await check('LIST');

// List view: 6 con trong grid 6 cot -> phai la 1 hang. Do gridTemplateRows,
// KHONG do top cua tung con: align-items:center cho con cao thap khac nhau top
// khac nhau ngay trong cung 1 hang -> false positive.
const rowInfo = await p.locator('.smp-tr-row').first().evaluate(el => {
  const cs = getComputedStyle(el);
  return {
    children: el.children.length,
    gridRows: cs.gridTemplateRows.split(' ').length,
    cols: cs.gridTemplateColumns,
    metaColPx: Math.round(parseFloat(cs.gridTemplateColumns.split(' ')[1])),
  };
});
const ok = rowInfo.gridRows === 1 && rowInfo.metaColPx > 60;
console.log('LIST row layout:', JSON.stringify(rowInfo), ok ? '(1 hang, cot ma du rong OK)' : '(FAIL)');
if (!ok) process.exitCode = 1;

await b.close();

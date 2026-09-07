import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 900 } });
p.on('pageerror', e => console.log('PAGE-ERR', String(e).slice(0,200)));
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.fill('#fld-user','admin'); await p.fill('#fld-pw','admin123');
await p.click('button[type=submit]'); await p.waitForTimeout(2500);
await p.getByRole('button', { name: /Dấu vết hiện trường/ }).first().click();
await p.waitForTimeout(1200);
await p.locator('table tbody tr').first().click(); await p.waitForTimeout(2500);
// bam 1 the trong panel ket qua doi sanh -> man chi tiet
await p.locator('.smp-mt-row').first().click(); await p.waitForTimeout(2000);
console.log('verify panel:', await p.locator('.stf-verify').count());
console.log(JSON.stringify(await p.evaluate(() => {
  const row = document.querySelector('.stf-verify-row');
  if (!row) return null;
  const rr = row.getBoundingClientRect();
  return {
    row: { w: Math.round(rr.w || rr.width), h: Math.round(rr.height) },
    kids: [...row.children].map(c => ({
      cls: c.className, w: +c.getBoundingClientRect().width.toFixed(1),
      flex: getComputedStyle(c).flex,
    })),
    used: Math.round([...row.children].reduce((n,c)=>n+c.getBoundingClientRect().width,0)),
    rowW: Math.round(rr.width),
    gap: getComputedStyle(row).gap,
  };
}), null, 1));
await p.locator('.stf-verify').screenshot({ path: 'stf-before.png' });
await b.close();

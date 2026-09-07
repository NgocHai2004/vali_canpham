// Badge trang thai vu an o header man doi sanh phai khop voi list.
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
await p.goto('http://localhost:8080/');
await p.fill('input[name=username]','admin'); await p.fill('input[type=password]','admin123');
await p.click('button[type=submit]');
await p.getByRole('button',{name:/Dấu vết hiện trường/}).click();
await p.waitForSelector('.scp-t tbody tr',{timeout:25000});
await p.waitForTimeout(600);

// Doc trang thai tung hang o list
const rows = await p.$$eval('.scp-t tbody tr', trs => trs.map(tr => ({
  name: tr.querySelector('td')?.textContent.trim().slice(0,34),
  status: [...tr.querySelectorAll('.smp-chip')].map(c=>c.textContent.trim()).find(t=>/mở|đóng/i.test(t)) || '?',
})));
console.log('LIST:'); rows.forEach((r,i)=>console.log(`  ${i}: ${r.status.padEnd(12)} ${r.name}`));

let bad=0;
// Mo tung vu an, so badge header voi list
for (const i of [0, rows.length-1]) {
  await p.locator('.scp-t tbody tr').nth(i).click();
  await p.waitForSelector('.smp-top',{timeout:20000});
  await p.waitForTimeout(700);
  const hdr = await p.$eval('.smp-top .smp-chip', e => e.textContent.trim());
  const ok = hdr.replace(/^[●✓]\s*/,'') === rows[i].status.replace(/^[●✓]\s*/,'');
  if (!ok) bad++;
  console.log(`${ok?'ok  ':'FAIL'} row${i}: list="${rows[i].status}" header="${hdr}"`);
  await p.locator('.smp-back').click();
  await p.waitForSelector('.scp-t tbody tr',{timeout:20000});
  await p.waitForTimeout(500);
}
console.log(bad?`\n${bad} FAIL`:'\nALL OK');
process.exitCode = bad?1:0;
await b.close();

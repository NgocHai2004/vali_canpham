// Check hover dung chung: man Dau vet hien truong (.smp) + man chi tiet (.stf).
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8080/');
await p.fill('input[name=username]','admin'); await p.fill('input[type=password]','admin123');
await p.click('button[type=submit]');
await p.getByRole('button',{name:/Dấu vết hiện trường/}).click();
await p.waitForSelector('text=/Trom cap tai san/',{timeout:25000});
await p.locator('tr',{hasText:'Trom cap tai san tai cua hang dien may'}).first().click();
await p.waitForSelector('.smp-mt-row.go',{timeout:25000});
await p.waitForTimeout(700);

let bad=0;
const probe = async (sel,label,want,pos) => {
  const el = p.locator(sel).first();
  if (!await el.count()) { console.log(`SKIP ${label} (khong thay)`); return; }
  await p.mouse.move(2,2); await p.waitForTimeout(240);
  const read = () => el.evaluate(e=>{const c=getComputedStyle(e);
    return {t:c.transform,s:c.boxShadow,b:c.borderColor,sw:getComputedStyle(e,'::after').backgroundImage};});
  const A = await read();
  await el.hover({force:true, ...(pos?{position:pos}:{})}); await p.waitForTimeout(300);
  const B = await read();
  const got = {
    lift: /matrix\(1, 0, 0, 1, 0, -2\)/.test(B.t),
    glow: A.s!==B.s && /53, 216, 255|22, 139, 255/.test(B.s),
    cyan: /53, 216, 255/.test(B.b),
    sweep: B.sw.includes('linear-gradient'),
  };
  const pass = want.every(k=>got[k]);
  if (!pass) bad++;
  console.log(`${pass?'ok  ':'FAIL'} ${label.padEnd(30)} ${JSON.stringify(got)}`);
};

console.log('--- MAN DAU VET HIEN TRUONG (.smp) ---');
// Hover vung header panel: tam panel la card con -> rule chan double-lift.
await probe('.smp .smp-panel','panel (vung header)',['lift','glow','cyan'],{x:120,y:8});
await probe('.smp .smp-tr-card, .smp .smp-tr-row','the dau vet',['lift','glow','cyan']);
await probe('.smp .smp-sub-open, .smp .smp-sub-row','the ho so doi tuong',['lift','glow','cyan']);
await probe('.smp .smp-trg','btn Bo loc / Sap xep',['glow','cyan','sweep']);
await probe('.smp .smp-btn-primary','btn Import (co mau rieng)',['glow','sweep']);
await probe('.smp .smp-viewtoggle button','btn doi view',['glow','cyan','sweep']);
await probe('.smp .smp-pg button:not(:disabled)','btn phan trang',['glow','cyan','sweep']);

// Hover the con -> panel cha VAN giu hover (khong bi mat hieu ung).
{
  await p.mouse.move(2,2); await p.waitForTimeout(240);
  await p.locator('.smp .smp-tr-card, .smp .smp-tr-row').first().hover({force:true});
  await p.waitForTimeout(320);
  const r = await p.locator('.smp .smp-panel-trace').first().evaluate(e=>{
    const c = getComputedStyle(e);
    return { lift: /matrix\(1, 0, 0, 1, 0, -2\)/.test(c.transform),
             cyan: /53, 216, 255/.test(c.borderColor),
             glow: /22, 139, 255/.test(c.boxShadow) };
  });
  const pass = r.lift && r.cyan && r.glow;
  if (!pass) bad++;
  console.log(`${pass?'ok  ':'FAIL'} ${'panel GIU hover khi hover the con'.padEnd(30)} ${JSON.stringify(r)}`);
}

// The o hang dau khong bi cat canh tren khi ca panel + the deu nhac.
// Phai reset scrollTop: cac probe truoc do lam Playwright auto-scroll list ->
// the dau tien bi cuon len tren mep clip mot cach hop le => false positive.
{
  const card = p.locator('.smp .smp-tr-list .smp-tr-row, .smp .smp-tr-grid .smp-tr-card').first();
  await p.mouse.move(2,2); await p.waitForTimeout(240);
  await card.evaluate(e => { e.closest('.smp-tr-list, .smp-tr-grid').scrollTop = 0; });
  await p.waitForTimeout(120);
  await card.hover({force:true}); await p.waitForTimeout(320);
  const r = await card.evaluate(e => {
    const l = e.closest('.smp-tr-list, .smp-tr-grid');
    return { scrollTop: Math.round(l.scrollTop),
             cardTop:+e.getBoundingClientRect().top.toFixed(1),
             clipTop:+l.getBoundingClientRect().top.toFixed(1) };
  });
  const pass = r.scrollTop === 0 && r.cardTop >= r.clipTop;
  if (!pass) bad++;
  console.log(`${pass?'ok  ':'FAIL'} ${'the hang dau khong bi cat'.padEnd(30)} ${JSON.stringify(r)}`);
}

console.log('--- MAN CHI TIET (.stf) ---');
await p.locator('.smp-mt-row.go').first().click();
await p.waitForSelector('.stf',{timeout:15000}); await p.waitForTimeout(700);
await probe('.stf .stf-card','panel',['lift','glow','cyan']);
await probe('.stf .stf-file','the file 4.1',['lift','glow','cyan']);
await probe('.stf .smp-btn-ghost','btn Quay lai',['glow','cyan','sweep']);
await probe('.stf .smp-btn-line','btn Xem',['glow','cyan','sweep']);

// Panel 4.1 GIU hover khi hover the file ben trong + the hang dau khong bi cat.
{
  const card = p.locator('.stf .stf-files .stf-file').first();
  await p.mouse.move(2,2); await p.waitForTimeout(240);
  await card.evaluate(e => { const l = e.closest('.stf-files'); if (l) l.scrollTop = 0; });
  await card.hover({force:true}); await p.waitForTimeout(320);
  const r = await p.locator('.stf .stf-folder').first().evaluate(e=>{
    const c = getComputedStyle(e);
    return { lift: /matrix\(1, 0, 0, 1, 0, -2\)/.test(c.transform),
             cyan: /53, 216, 255/.test(c.borderColor),
             glow: /22, 139, 255/.test(c.boxShadow) };
  });
  const clip = await card.evaluate(e => {
    const l = e.closest('.stf-files');
    return { cardTop:+e.getBoundingClientRect().top.toFixed(1),
             clipTop:+l.getBoundingClientRect().top.toFixed(1) };
  });
  const pass = r.lift && r.cyan && r.glow;
  const pass2 = clip.cardTop >= clip.clipTop;
  if (!pass) bad++;
  if (!pass2) bad++;
  console.log(`${pass?'ok  ':'FAIL'} ${'panel 4.1 GIU hover khi hover the'.padEnd(30)} ${JSON.stringify(r)}`);
  console.log(`${pass2?'ok  ':'FAIL'} ${'the 4.1 khong bi cat'.padEnd(30)} ${JSON.stringify(clip)}`);
}

if (errs.length) { bad++; console.log('PAGEERR:', errs.slice(0,3)); }
console.log(bad? `\n${bad} FAIL` : '\nALL OK');
process.exitCode = bad?1:0;
await b.close();

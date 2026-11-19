// Screenshots and layout numbers for every NoBroke screen, for the brief's rule
// that each UI change is checked at 360px and 390px wide.
//
// Needs Playwright with Chromium on the machine (it is not a dependency of
// this project) and the dev server running:  npm run dev -- --port 5173
//
// Usage: node scripts/screens.cjs <tag> [persona=rajesh|aarav] [widths=390,1280] [screens=landing,intake,plan,portfolio,money]
// Writes <tag>-<screen>-<width>-<n>.png into the CURRENT directory (slices of at most 1500px, 3 per screen)
// and prints one JSON line per screen: share of text below 14px, capital-letter labels, sideways overflow, clipped elements.
// The store is imported from the URL the page itself loaded. After a hot reload Vite serves
// /src/store.ts with a ?t= stamp; importing the bare path would create a second, empty store
// and every app screen would silently be the landing page.
const { chromium } = require('playwright');
const [tag = 'shot', persona = 'rajesh', widthsArg = '390,1280', screensArg = 'landing,intake,plan,portfolio,money'] = process.argv.slice(2);
const widths = widthsArg.split(',').map(Number);
const screens = screensArg.split(',');
const BASE = 'http://127.0.0.1:5173';
const STORE = "import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.split('?')[0].endsWith('/src/store.ts')).pop() || '/src/store.ts')";
const PEOPLE = {
  rajesh: { p: { employment: 'salaried', takeHome: 160000, rent: 0, emi: 38000, monthlySpend: 65000, cashOnHand: 300000, investedValue: 1800000, cityTier: 'tier1', careerStage: 'stable', dependents: 'kids' }, goals: ['child', 'fire', 'parents'], answers: { timeline: '8', 'cost:child': '', 'cost:fire': '', 'cost:parents': '' } },
  aarav: { p: { employment: 'student', takeHome: 8000, rent: 0, emi: 0, monthlySpend: 3500, cashOnHand: 22000, investedValue: 6000, cityTier: 'tier1', careerStage: 'studying', dependents: 'none' }, goals: ['gadget', 'travel', 'course'], answers: { timeline: '2', 'cost:travel': '20000', 'cost:gadget': '70000', 'cost:course': '' } },
};
const seed = (who) => `(async () => {
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.split('?')[0].endsWith('/src/store.ts')).pop() || '/src/store.ts'); const a = m.actions; const d = ${JSON.stringify(PEOPLE[who])};
  a.startOnboarding();
  for (const [k, v] of Object.entries(d.p)) a.setProfileField(k, v);
  for (const g of d.goals) a.toggleGoal(g);
  for (const [k, v] of Object.entries(d.answers)) a.setAnswer(k, v);
  a.finishOnboarding();
  return m.getState().screen;
})()`;
const STATS = `(() => {
  let small = 0, total = 0, upper = 0; const vw = document.documentElement.clientWidth; const wide = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode.textContent.trim(); if (!t) continue;
    const el = w.currentNode.parentElement; const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    const fs = parseFloat(cs.fontSize); total += t.length; if (fs < 14) small += t.length;
    if (cs.textTransform === 'uppercase') upper++;
    if (r.right > vw + 1 || r.left < -1) wide.push(t.slice(0, 30));
    else if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible' && !cs.textOverflow.includes('ellipsis')) wide.push('clipped: ' + t.slice(0, 30));
  }
  return { pctBelow14: Math.round(100 * small / Math.max(1, total)), capitalLabels: upper, sidewaysScrollPx: document.documentElement.scrollWidth - vw, outsideOrClipped: wide.slice(0, 8) };
})()`;
async function slices(page, name, w, h = 1500, max = 3) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: w, height: Math.min(Math.max(total, 600), 5000) });
  await page.waitForTimeout(250);
  for (let i = 0; i < max && i * h < total; i++)
    await page.screenshot({ path: `${tag}-${name}-${w}-${i + 1}.png`, clip: { x: 0, y: i * h, width: w, height: Math.min(h, total - i * h) } });
  return total;
}
(async () => {
  const b = await chromium.launch();
  for (const w of widths) {
    const hgt = w < 700 ? 844 : 900;
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
    await page.goto(BASE, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    if (screens.includes('landing')) console.log(JSON.stringify({ screen: 'landing', width: w, ...(await page.evaluate(STATS)), heightPx: await slices(page, 'landing', w) }));
    await page.setViewportSize({ width: w, height: hgt });
    if (screens.includes('intake')) {
      // 1 is a choice step, 2 a money step, 11 the goals step, 14 the account step.
      for (const step of [1, 2, 11, 14]) {
        await page.evaluate(`(async()=>{const m=await import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.split('?')[0].endsWith('/src/store.ts')).pop() || '/src/store.ts');m.actions.startOnboarding();m.actions.setStep(${step});})()`);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${tag}-intake${step}-${w}-1.png` });
        console.log(JSON.stringify({ screen: 'intake step ' + step, width: w, ...(await page.evaluate(STATS)) }));
      }
    }
    await page.evaluate(seed(persona)); await page.waitForTimeout(600);
    for (const tab of ['plan', 'portfolio', 'money']) {
      if (!screens.includes(tab)) continue;
      await page.setViewportSize({ width: w, height: hgt });
      await page.evaluate(`(async()=>{const m=await import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.split('?')[0].endsWith('/src/store.ts')).pop() || '/src/store.ts');m.actions.setTab('${tab}');})()`);
      await page.waitForTimeout(600);
      const onScreen = await page.evaluate(`(async()=>{const m=await ${STORE};return m.getState().screen + '/' + m.getState().tab;})()`);
      if (onScreen !== 'plan/' + tab) throw new Error('the app is showing ' + onScreen + ', not plan/' + tab + ': the store import is stale');
      const st = await page.evaluate(STATS);
      console.log(JSON.stringify({ screen: tab, width: w, persona, ...st, heightPx: await slices(page, tab, w) }));
    }
    if (errors.length) console.log(JSON.stringify({ pageErrors: errors.slice(0, 5) }));
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });

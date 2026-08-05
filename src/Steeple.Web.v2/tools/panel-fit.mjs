// Does the property sheet fit the page it is read on?
//
// CONTRACT5 §3 asks for a two-space venue and a typical room to stand on a
// 1440×900 desktop with no scroll inside the sheet. A screenshot cannot answer
// that — the overflow is below the crop — so this measures it: for each view it
// reports the scrolling box's content height against its own height, and the
// height of every section, so a sheet that is 30px over says which 30px.
//
// The third argument narrows the rail the way a wider map would: the sheets
// must keep fitting when the browse surface gives the map more of the page.
//
//   node tools/panel-fit.mjs "http://localhost:5322/?q=low" [WxH] [map%]
import puppeteer from 'puppeteer';

const url = process.argv[2] ?? 'http://localhost:5322/?q=low';
const [w, h] = (process.argv[3] ?? '1440x900').split('x').map(Number);
const mapShare = process.argv[4] ?? null;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: w, height: h });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__steepleReady === true', { timeout: 25000 });
await page.evaluate('__steeple.roll.set(1)');
if (mapShare) {
  await page.evaluate(
    (share) => document.querySelector('.browse').style.setProperty('--browse-map', share),
    mapShare
  );
}
await wait(1200);

const CASES = [
  ['venue · two spaces', "__steeple.setView('venue',{venueId:'grace-community-vienna'})", '.sheet--venue'],
  ['venue · two spaces (2)', "__steeple.setView('venue',{venueId:'vienna-presbyterian'})", '.sheet--venue'],
  ['venue · two + a draft', "__steeple.setView('venue',{venueId:'oakton-baptist'})", '.sheet--venue'],
  ['venue · one space', "__steeple.setView('venue',{venueId:'merrifield-fellowship'})", '.sheet--venue'],
  ['room · fellowship hall', "__steeple.setView('room',{venueId:'grace-community-vienna',roomId:'fellowship-hall'})", '.sheet--room'],
  ['room · gymnasium', "__steeple.setView('room',{venueId:'oakton-baptist',roomId:'gymnasium'})", '.sheet--room'],
  ['room · music room', "__steeple.setView('room',{venueId:'vienna-presbyterian',roomId:'music-room'})", '.sheet--room'],
  ['room · community lounge', "__steeple.setView('room',{venueId:'dunn-loring-umc',roomId:'community-lounge'})", '.sheet--room'],
];

let over = 0;
for (const [label, drive, sel] of CASES) {
  await page.evaluate("__steeple.setView('village')");
  await page.evaluate(drive);
  await wait(900);
  const m = await page.evaluate((s) => {
    const sheet = document.querySelector(s);
    const body = sheet.querySelector('.sheet__body');
    // The venue sheet has no foot any more — its way back moved to the top of
    // the sheet, where it is on the page whatever the sheet is scrolled to
    // (CONTRACT6 §2.2). A part that is not there costs no height.
    const part = (node) => (node ? Math.round(node.getBoundingClientRect().height) : 0);
    // The body is a flex child that fills what the head and foot leave, so its
    // scrollHeight is never smaller than its box and cannot show slack. The
    // sections, the gaps between them and the padding can.
    const css = getComputedStyle(body);
    const kids = [...body.children];
    const content =
      kids.reduce((sum, n) => sum + n.getBoundingClientRect().height, 0) +
      parseFloat(css.rowGap || 0) * Math.max(0, kids.length - 1) +
      parseFloat(css.paddingTop) +
      parseFloat(css.paddingBottom);
    return {
      sheet: part(sheet),
      head: part(sheet.querySelector('.sheet__head')),
      foot: part(sheet.querySelector('.sheet__foot')),
      bodyBox: body.clientHeight,
      bodyContent: Math.round(content),
      sections: [...body.children].map((n) => `${n.className || n.tagName.toLowerCase()}:${part(n)}`),
    };
  }, sel);
  const spare = m.bodyBox - m.bodyContent;
  const ok = spare >= 0;
  if (!ok) over += 1;
  console.log(
    `${ok ? 'fits' : 'OVER'} ${label.padEnd(24)} body ${m.bodyContent}/${m.bodyBox} (${spare >= 0 ? '+' : ''}${spare})  head ${m.head} foot ${m.foot}`
  );
  console.log(`       ${m.sections.join('  ')}`);
}

console.log(over === 0 ? `\nall sheets fit ${w}×${h}` : `\n${over} sheet(s) scroll at ${w}×${h}`);
await browser.close();
process.exit(over === 0 ? 0 : 1);

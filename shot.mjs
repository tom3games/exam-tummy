// 場面を台本どおりに進めて撮る（その場面の少し前から実時間で動かす）。node shot.mjs [幅x高さ] [webkit]
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5872
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const [W, H] = (process.argv[2] || '390x844').split('x').map(Number)
const BT = process.argv[3] === 'webkit' ? webkit : chromium
const b = await BT.launch(BT === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: process.env.LOC || 'ja-JP', hasTouch: true, isMobile: BT === webkit })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__etReady && ET.charsReady, null, { timeout: 20000 })
await p.waitForTimeout(800)
const tag = `${W}${BT === webkit ? '-wk' : ''}${process.env.LOC ? '-' + process.env.LOC : ''}`
const snap = async n => p.screenshot({ path: `${ROOT}/shots/s-${n}-${tag}.png` })
// 指定の時刻の0.8秒前まで早送りして、そこから実時間で動かす
const goTo = async (t) => {  await p.evaluate(t => { ET.dbg.pause(true); ET.dbg.tick(Math.max(0, Math.round((t - 0.8 - ET.S.t) * 60))); ET.dbg.pause(false) }, t); await p.waitForFunction(t => ET.S.t >= t, t, { timeout: 5000 }); await p.evaluate(() => ET.dbg.pause(true)) }
await snap('title')
await p.click('#bHow'); await snap('how'); await p.click('#bHowBack')
await p.evaluate(() => { ET.dbg.start(3, { noTut: true }) })
const R = await p.evaluate(() => ET.S.rumbles.map(r => ({ i: r.i, t0: r.t0, on: r.onset, B: r.B, size: r.size, feint: r.feint, ext: r.ext || '' })))
const E = await p.evaluate(() => ET.S.exts.map(e => ({ k: e.kind, on: e.on, off: e.off })))
const free = R.filter(r => !r.feint && !r.ext)
const big = free.find(r => r.size === 3), small = free.find(r => r.size === 1)
for (const [r, n] of [[big, 'tell3'], [small, 'tell1']].filter(x => x[0]).sort((a, b) => a[0].t0 - b[0].t0)) { await goTo(r.t0 + r.B * 2.3); await snap(n) }
const after = t => free.find(r => r.t0 > t + 0.5)
// 鳴る瞬間に何もしない → ばれる
const nx = after(await p.evaluate(() => ET.S.t))
await goTo(nx.on + 0.7); await snap('bust')
// 合う大きさで押す → ごまかした
const ok = after(nx.on)
await goTo(ok.on); await p.evaluate(k => ET.press(k), ['cough', 'chair', 'pen'][ok.size - 1]); await p.evaluate(() => ET.dbg.pause(false)); await p.waitForTimeout(500); await snap('safe')
const dr = E.find(e => e.k === 'drill' && e.on > ok.on + 1) || E.find(e => e.k === 'chime' && e.on > ok.on + 1)
if (dr) { await goTo(dr.on + 0.6); await snap('drill') }
await p.evaluate(() => { ET.dbg.pause(true); ET.dbg.finish() })
await p.evaluate(() => ET.dbg.pause(false)); await p.waitForTimeout(4200); await snap('result')
console.log('errors', errs)
await b.close(); server.kill()

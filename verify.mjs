import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 試験中にお腹が鳴る の検証。node verify.mjs（音は出さない）
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5871
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}, keepLS = false) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  if (!keepLS) await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1') } } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  p.on('popup', pp => pp.close().catch(() => {}))
  await p.goto(URL0); await p.waitForFunction(() => window.__etReady && ET.charsReady, null, { timeout: 20000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) a')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  for (const v of document.querySelectorAll('main:not([hidden])')) if (v.scrollHeight > v.clientHeight + 1) over.push('view:' + v.id + ':' + v.scrollHeight)
  return { H, over: over.slice(0, 6) }
})
// WebGL の絵の散らばり（ほぼ単色＝描けていない）
const glVar = p => p.evaluate(() => new Promise(res => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 120; c.height = 240; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 120, 240); const d = x.getImageData(0, 0, 120, 240).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } res(Math.round(s2 / n - (s / n) ** 2)) }; img.src = document.getElementById('gl').toDataURL() }))
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'large']]
// 種を決めて試験を始め、指定の出来事の時刻まで進める（描画なしで速く）
const begin = (p, seed) => p.evaluate(seed => { ET.dbg.pause(true); ET.dbg.start(seed, { noTut: true }); return ET.S.rumbles.length }, seed)

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ロード画面が消えている（読み込みが終わってから）', async () => { const r = await p.evaluate(() => ({ hidden: document.getElementById('boot').hidden, p: getComputedStyle(document.getElementById('boot')).getPropertyValue('--p') })); expect(r.hidden && +r.p === 1, r); return r })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r); return r
})
await t('OGP 一式がある（画像は絶対URL）', async () => {
  const r = await p.evaluate(() => ({ list: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')), img: document.querySelector('meta[property="og:image"]').content }))
  expect(r.list.every(Boolean) && /^https:\/\/tom3games\.com\/play\/exam-tummy\/og\.png/.test(r.img), r)
})
await t('og.png が 1200x630', async () => { const r = await p.evaluate(() => new Promise(res => { const i = new Image(); i.onload = () => res([i.width, i.height]); i.onerror = () => res(null); i.src = 'og.png' })); expect(r && r[0] === 1200 && r[1] === 630, r) })
await t('日本語の端末では日本語で始まる', async () => { const r = await p.evaluate(() => ({ lang: document.documentElement.lang, start: document.getElementById('bStart').textContent })); expect(r.lang === 'ja' && r.start === 'はじめ', r) })
await t('タイトルの3Dが描けている', async () => { const v = await glVar(p); expect(v > 200, v); return v })
await t('遊び方の画面の下にプライバシーのリンク（押せる高さ38px以上）とクレジット', async () => {
  await p.click('#bHow')
  const r = await p.evaluate(() => { const a = document.querySelector('#vHow a[href="privacy.html"]'); return { h: a && a.getBoundingClientRect().height, credits: !!document.querySelector('#vHow a[href="CREDITS.md"]') } })
  await p.click('#bHowBack'); expect(r.h >= 38 && r.credits, r); return r
})

// ---- 遊びの判定
await t('同じ種なら同じ試験（出来事の台本が同じ）', async () => {
  const a = await p.evaluate(() => { ET.dbg.pause(true); ET.dbg.start(77, { noTut: true }); return JSON.stringify([ET.S.rumbles.map(r => [r.t0.toFixed(3), r.size, r.feint]), ET.S.exts.map(e => [e.kind, e.on.toFixed(3)])]) })
  const b = await p.evaluate(() => { ET.dbg.start(77, { noTut: true }); return JSON.stringify([ET.S.rumbles.map(r => [r.t0.toFixed(3), r.size, r.feint]), ET.S.exts.map(e => [e.kind, e.on.toFixed(3)])]) })
  expect(a === b, 'differs'); return { rumbles: JSON.parse(a)[0].length, exts: JSON.parse(a)[1].length }
})
await t('台本: 鳴る10〜16回・ひっかけ2〜3回・周りの音でかき消える回とわなの回がある', async () => {
  const r = await p.evaluate(() => { const o = []; for (let s = 1; s <= 20; s++) { ET.dbg.start(s, { noTut: true }); const R = ET.S.rumbles; o.push({ n: R.length, f: R.filter(x => x.feint).length, mask: R.filter(x => x.ext && !/trap/.test(x.ext)).length, trap: R.filter(x => /trap/.test(x.ext)).length, sizes: [1, 2, 3].map(k => R.filter(x => x.size === k && !x.feint).length) }) } return o })
  const bad = r.filter(x => !(x.n >= 10 && x.n <= 16 && x.f >= 2 && x.f <= 3 && x.mask >= 2 && x.trap >= 1 && x.sizes.every(k => k >= 1))); expect(!bad.length, bad); return r[0]
})
// 1つのお腹に対して、押し方ごとの結果を確かめる
const tryOne = (p, seed, pick, how) => p.evaluate(([seed, pick, how]) => {
  for (let sd = seed; sd < seed + 40; sd++) {
    ET.dbg.pause(true); ET.dbg.start(sd, { noTut: true })
    const S = ET.S, r = S.rumbles.find(x => !x.feint && !x.ext && x.size === pick)
    if (!r) continue
    ET.dbg.tick(Math.round((r.onset - S.t + (how.dt ?? 0.1)) * 60))
    const b0 = S.bust, s0 = S.safe
    if (how.k) ET.press(how.k)
    ET.dbg.tick(90)
    return { seed: sd, res: r.res, size: r.size, bust: S.bust - b0, safe: S.safe - s0 }
  }
  return { skip: true }
}, [seed, pick, how])
for (const size of [1, 2, 3]) {
  const k = ['cough', 'chair', 'pen'][size - 1]
  await t(`大きさ${size}: 同じ大きさの音（${k}）を鳴る瞬間に重ねる → ごまかした`, async () => { const r = await tryOne(p, 5, size, { k }); expect(r.res === 'safe' && r.bust === 0 && r.safe === 1, r); return r })
  await t(`大きさ${size}: 何もしない → ばれる`, async () => { const r = await tryOne(p, 5, size, {}); expect(r.res === 'bust' && r.bust === 1, r); return r })
}
await t('小さすぎる音（中に咳払い）→ ばれる', async () => { const r = await tryOne(p, 5, 2, { k: 'cough' }); expect(r.res === 'small', r); return r })
await t('大きすぎる音（小にペン落とし）→ ばれる（やりすぎ）', async () => { const r = await tryOne(p, 5, 1, { k: 'pen' }); expect(r.res === 'big', r); return r })
await t('早すぎる（鳴る1秒前）→ 空振りしてからばれる', async () => { const r = await tryOne(p, 5, 2, { k: 'chair', dt: -1.0 }); expect(r.res === 'bust', r); return r })
await t('反応が遅れても（0.4秒後）間に合う', async () => { const r = await tryOne(p, 5, 2, { k: 'chair', dt: 0.4 }); expect(r.res === 'safe', r); return r })
await t('周りの音（大きさが足りる）に重なると、何もしなくても安全', async () => {
  const r = await p.evaluate(() => { for (let s = 1; s < 40; s++) { ET.dbg.start(s, { noTut: true }); const S = ET.S, x = S.rumbles.find(r => r.ext === 'drill' || r.ext === 'chime'); if (!x) continue; ET.dbg.tick(Math.round((x.onset + 1) * 60)); return { seed: s, res: x.res, ext: x.ext } } })
  expect(r && r.res === 'ext', r); return r
})
await t('わな: くしゃみ（中）に大きいお腹が重なると、何もしないとばれる。ペンなら安全', async () => {
  const r = await p.evaluate(() => { for (let s = 1; s < 60; s++) { ET.dbg.start(s, { noTut: true }); const S = ET.S, x = S.rumbles.find(r => r.ext === 'sneeze-trap'); if (!x) continue; ET.dbg.tick(Math.round((x.onset + 1) * 60)); const a = x.res; ET.dbg.start(s, { noTut: true }); const y = ET.S.rumbles[x.i]; ET.dbg.tick(Math.round((y.onset + 0.1) * 60)); ET.press('pen'); ET.dbg.tick(60); return { seed: s, nothing: a, pen: y.res } } })
  expect(r && r.nothing === 'bust' && r.pen === 'safe', r); return r
})
await t('ひっかけ（輪が途中で消える）は鳴らない。押すと空振り（回数は数えない）', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); const S = ET.S, x = S.rumbles.find(r => r.feint); ET.dbg.tick(Math.round((x.t0 + (x.onset - x.t0) * 0.8) * 60)); ET.dbg.render(); const op = +document.getElementById('ringA').style.opacity; ET.dbg.tick(Math.round((x.onset - S.t) * 60)); const before = S.rumble; ET.press('chair'); ET.dbg.tick(60); return { res: x.res, wasted: S.wasted, counted: S.rumble - before, ringOpacity: op } })
  expect(r.res === 'feint' && r.wasted === 1 && r.counted === 0 && r.ringOpacity < 0.2, r); return r
})
await t('輪: 縮む輪が印に重なった時（半径が印と同じ）に押す → ごまかした', async () => {
  const r = await p.evaluate(() => { for (let s = 5; s < 40; s++) { ET.dbg.start(s, { noTut: true }); const S = ET.S, x = S.rumbles.find(r => !r.feint && !r.ext); ET.dbg.tick(Math.round((x.t0 + 0.05) * 60)); ET.dbg.render(); const r0 = +document.getElementById('ringA').getAttribute('r'); ET.dbg.tick(Math.round((x.onset - S.t) * 60)); ET.dbg.render(); const r1 = +document.getElementById('ringA').getAttribute('r'), m = +document.getElementById('ringM').getAttribute('r'); ET.press(['cough', 'chair', 'pen'][x.size - 1]); ET.dbg.tick(60); return { start: r0, atPress: r1, mark: m, res: x.res } } })
  expect(r.start > 90 && Math.abs(r.atPress - r.mark) < 2 && r.res === 'safe', r); return r
})
await t('輪: まだ大きい時（印の2倍）に押す → 早すぎてばれる', async () => {
  const r = await p.evaluate(() => { for (let s = 5; s < 40; s++) { ET.dbg.start(s, { noTut: true }); const S = ET.S, x = S.rumbles.find(r => !r.feint && !r.ext); const tk = x.t0 + (x.onset - x.t0) * (1 - 24 / 76); ET.dbg.tick(Math.round(tk * 60)); ET.dbg.render(); const rr = +document.getElementById('ringA').getAttribute('r'); ET.press(['cough', 'chair', 'pen'][x.size - 1]); ET.dbg.tick(Math.round((x.onset + 1 - S.t) * 60)); return { r: rr, res: x.res } } })
  expect(r.r > 44 && r.res === 'bust', r); return r
})
await t('咳払いは使うと喉が落ち着くまで押せず、5秒で戻る', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(60); ET.press('cough'); ET.dbg.tick(10); const a = ET.canUse('cough'), cool = +getComputedStyle(document.getElementById('b_cough')).getPropertyValue('--cool'); ET.dbg.tick(60 * 5); return { a, b: ET.canUse('cough'), cool } })
  expect(!r.a && r.b, r); return r
})
await t('椅子はきしませるとずれて「座り直す」になり、座り直すと戻る', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(60); ET.press('chair'); ET.dbg.render(); const label = document.querySelector('#b_chair .nm').textContent, off = ET.S.chairOff; ET.press('chair'); ET.dbg.tick(45); return { label, off, after: ET.S.chairOff } })
  expect(r.off && r.label === '座り直す' && !r.after, r); return r
})
await t('ペンを落とすと答案が書けず、拾うと（1.2秒）書ける', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(60); ET.press('pen'); ET.dbg.tick(30); const w0 = ET.write(); ET.press('pen'); ET.dbg.tick(30); const busy = !ET.canUse('chair'); ET.dbg.tick(50); return { w0, busy, penDown: ET.S.penDown, w1: ET.write() } })
  expect(!r.w0 && r.busy && !r.penDown && r.w1, r); return r
})
await t('答案: 5回タップで1問。速すぎるタップは数えない。解いた後は少し読む間', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(30); const S = ET.S; let ok = 0; for (let i = 0; i < 5; i++) { if (ET.write()) ok++; ET.dbg.tick(8) } const a1 = S.ans, fast = ET.write(); ET.dbg.tick(60); ET.write(); ET.write(); return { ok, a1, fast, strokes: S.strokes } })
  expect(r.ok === 5 && r.a1 === 1 && !r.fast && r.strokes === 1, r); return r
})
await t('答案はタップしないと進まない・解いた問題は判定に入る', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(60 * 20); const idle = ET.S.ans; ET.S.ans = 30; const hi = ET.judge().val; ET.S.ans = 0; const lo = ET.judge().val; return { idle, hi, lo } })
  expect(r.idle === 0 && r.hi > r.lo, r); return r
})
await t('同じ物を続けて使いすぎると監督が怪しむ（7秒以内に3回）', async () => {
  const r = await p.evaluate(() => { ET.dbg.start(5, { noTut: true }); ET.dbg.tick(60); for (let i = 0; i < 3; i++) { ET.press('cough'); ET.dbg.tick(Math.round(5.05 * 60)) } const a = { sus: ET.S.susN, R: ET.S.R }; ET.dbg.start(6, { noTut: true }); ET.dbg.tick(60); ET.press('cough'); ET.dbg.tick(330); ET.press('chair'); ET.dbg.tick(60); ET.press('chair'); ET.dbg.tick(60); ET.press('chair'); return { a, mixed: ET.S.susN } })
  expect(r.a.sus === 1 && r.a.R >= 1 && r.mixed === 0, r); return r
})
await t('使い切って何もできない時間が無い（全部押し続けても、押せる物か答案が1.3秒以内に必ずある）', async () => {
  const r = await p.evaluate(() => { const o = []; for (const seed of [3, 8, 21]) { ET.dbg.start(seed, { noTut: true }); const S = ET.S, D = ET.D; let idle = 0, max = 0, n = 0; while (S.mode === 'play') { if (n++ % 20 === 0) for (const k of ['cough', 'chair', 'pen']) ET.press(k); const any = ET.canUse('cough') || ET.canUse('chair') || ET.canUse('pen') || (!S.penDown && S.t >= S.busyUntil); if (any) idle = 0; else { idle += 1 / 60; max = Math.max(max, idle) } ET.dbg.tick(1) } o.push(+max.toFixed(2)) } return o })
  expect(r.every(x => x <= 1.3), r); return r
})
await t('何もしないで1回終える → 最低の判定（白紙の勇者）', async () => {
  const r = await p.evaluate(() => { const o = []; for (let s = 1; s <= 8; s++) { ET.dbg.start(s * 13, { noTut: true }); ET.dbg.finish(); const j = ET.judge(); o.push(j.blank ? 'blank' : j.rank) } return o })
  expect(r.every(x => x === 'blank'), r); return r
})
await t('同じ押し方なら同じ結果（乱数で当たり外れを決めない）', async () => {
  const r = await p.evaluate(() => { const run = () => { ET.dbg.start(31, { noTut: true }); const S = ET.S; let i = 0; while (S.mode === 'play') { const x = S.rumbles.find(r => !r.done && !r.feint && Math.abs(S.t - r.onset - 0.1) < 0.009); if (x) ET.press(['cough', 'chair', 'pen'][x.size - 1]); ET.dbg.tick(1); if (++i > 20000) break } ET.dbg.finish(); return JSON.stringify(ET.judge()) }; return [run(), run()] })
  expect(r[0] === r[1], r); return JSON.parse(r[0])
})
await t('HUD にバー・メーターが無い（答案と時計と輪で見せる）', async () => {
  const r = await p.evaluate(() => [...document.querySelectorAll('#vPlay progress,#vPlay meter,#vPlay [class*=bar],#vPlay [class*=gauge],#vPlay [class*=meter]')].length)
  expect(r === 0, r)
})

// ---- チュートリアル（最初の1回だけ）
await t('チュートリアル: 最初は答案をタップと教え、最初の黄色の輪が重なると止まり、咳払いで進む。2回目からは出ない', async () => {
  const q = await open(browser)
  await q.evaluate(() => { ET.dbg.pause(true) })
  await q.click('#bStart')
  const r = await q.evaluate(() => {
    const S = ET.S; S.introT = 99; ET.dbg.tick(30); ET.dbg.render()
    const first = document.getElementById('hint').textContent, fingerSheet = !document.getElementById('finger').hasAttribute('hidden')
    const r0 = S.rumbles[0]; for (let i = 0; i < 60 * 60 && S.speed !== 0; i++) ET.dbg.tick(1); ET.dbg.tick(30)
    const stopped = S.speed === 0 && !r0.done, hint = document.getElementById('hint').textContent, size = r0.size
    const finger = !document.getElementById('finger').hasAttribute('hidden')
    ET.press('cough'); ET.dbg.tick(60)
    return { first, fingerSheet, stopped, hint, size, finger, res: r0.res, speed: S.speed, tut: S.tut }
  })
  await q.evaluate(() => { ET.dbg.finish(); ET.dbg.result() })
  const again = await q.evaluate(() => { ET.dbg.start(9); return ET.S.tut })
  await q.context().close()
  expect(r.first === '答案をタップして解く' && r.fingerSheet && r.stopped && r.size === 1 && r.finger && r.res === 'safe' && r.speed === 1 && again === 2, { ...r, again }); return r
})

// ---- 文字の量（実時間で40秒遊んで、同時に出ている文字を数える）
await t('文字は同時に2つまで・吹き出しは12字前後（実時間で見る）', async () => {
  const q = await open(browser)
  await q.click('#bStart')
  const r = await q.evaluate(() => new Promise(res => {
    ET.S.introT = 99; let max = 0; const long = new Set(), seen = new Set()
    const S = ET.S
    const iv = setInterval(() => {
      // 鳴る瞬間に、たまに押す（反応の文字を出させる）
      const x = S.rumbles.find(r => !r.done && !r.feint && S.t > r.onset && S.t < r.onset + 0.2)
      if (x && Math.random() < 0.6) ET.press(['cough', 'chair', 'pen'][x.size - 1])
      ET.write(); if (S.penDown && Math.random() < 0.1) ET.press('pen'); if (S.chairOff && Math.random() < 0.1) ET.press('chair')
      max = Math.max(max, ET.texts())
      for (const el of document.querySelectorAll('#fx > *, #hint:not([hidden]), #bigMsg:not([hidden])')) { const s = el.textContent; seen.add(s); if ([...s].length > 13) long.add(s) }
    }, 50)
    // チュートリアルの止めは押して進める
    const iv2 = setInterval(() => { if (S.speed === 0) ET.press('cough') }, 300)
    setTimeout(() => { clearInterval(iv); clearInterval(iv2); res({ max, long: [...long], seen: seen.size, t: +S.t.toFixed(1) }) }, 40000)
  }))
  await q.context().close()
  expect(r.max <= 2 && r.long.length === 0 && r.seen >= 3, r); return r
})

// ---- 結果
await t('結果: 判定は発表まで見せない → 赤ペンで回数 → ハンコと称号', async () => {
  await begin(p, 21)
  const r = await p.evaluate(async () => {
    ET.dbg.finish(); ET.dbg.pause(false)
    await new Promise(r => setTimeout(r, 2600))  // やめ の後に結果
    const early = { hanko: document.getElementById('rHanko').classList.contains('on'), rank: getComputedStyle(document.getElementById('rRank')).opacity, mode: ET.S.mode }
    await new Promise(r => setTimeout(r, 4000))
    const late = { hanko: document.getElementById('rHanko').classList.contains('on'), rank: getComputedStyle(document.getElementById('rRank')).opacity, rows: [...document.querySelectorAll('.r.on')].length, name: document.getElementById('rName').textContent }
    return { early, late }
  })
  expect(r.early.mode === 'result' && !r.early.hanko && +r.early.rank < 0.5 && r.late.hanko && +r.late.rank === 1 && r.late.rows === 4 && r.late.name, r); return r
})
await t('結果: 支援リンク（もう一回のそば）・もう一回は bAgain', async () => {
  const r = await p.evaluate(() => { const a = document.getElementById('tmSupport'); return { a: !!a, text: a && a.textContent, again: !!document.getElementById('bAgain') } })
  expect(r.a && /パン/.test(r.text) && r.again, r); return r
})
await t('Xでポスト: x.com/intent/post・本文にURLを入れず url パラメータ', async () => {
  const r = await p.evaluate(() => { const u = new URL(ET.xUrl()); return { host: u.host + u.pathname, text: u.searchParams.get('text'), url: u.searchParams.get('url') } })
  expect(r.host === 'x.com/intent/post' && r.url === 'https://tom3games.github.io/exam-tummy/' && !/https?:/.test(r.text) && /#試験中にお腹が鳴る/.test(r.text), r); return r
})
await t('結果画像が描ける（1080x1350・中身がある）', async () => {
  const r = await p.evaluate(() => { const c = ET.resultCanvas(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let red = 0; for (let i = 0; i < d.length; i += 40) if (d[i] > 180 && d[i + 1] < 80 && d[i + 2] < 80) red++; return { w: c.width, h: c.height, red } })
  expect(r.w === 1080 && r.h === 1350 && r.red > 200, r); return r
})
await t('画像を保存を押すとダウンロード（またはシェア）', async () => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#bSave')])
  expect(dl && /exam-tummy\.png/.test(dl.suggestedFilename()), dl && dl.suggestedFilename())
})
await t('計測: 開始で TM.start、結果で TM.end、シェアで TM.share', async () => {
  await p.click('#bX')
  const r = await p.evaluate(() => window.__tmLog.map(x => x.name))
  expect(r.includes('game_start') && r.includes('game_end') && r.filter(x => x === 'share').length >= 2, r); return r.slice(-4)
})
await t('もう一回で試験が始まり直す', async () => {
  await p.click('#bAgain')
  const r = await p.evaluate(() => ({ mode: ET.S.mode, t: ET.S.t, bust: ET.S.bust, view: !document.getElementById('vPlay').hidden }))
  expect((r.mode === 'intro' || r.mode === 'play') && r.bust === 0 && r.view, r); return r
})
await t('Chromium: 音を鳴らす操作のあとも実際には無音・音は呼ばれている', async () => {
  await p.evaluate(() => { ET.dbg.pause(false); ET.S.introT = 99 })
  await p.waitForTimeout(800)
  await p.evaluate(() => ET.press('cough'))
  const r = await p.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls, played: Object.values(Snd.played).reduce((a, b) => a + b, 0) }))
  expect(r.ok && r.calls > 0 && r.played > 0, r); return r
})
await t('ミュートを押すとアイコンが切り替わる', async () => {
  await p.click('#bMute'); const a = await p.evaluate(() => [document.getElementById('icOn').hasAttribute('hidden'), document.getElementById('icOff').hasAttribute('hidden'), localStorage.getItem('et_mute')])
  await p.click('#bMute'); const b = await p.evaluate(() => [document.getElementById('icOn').hasAttribute('hidden'), document.getElementById('icOff').hasAttribute('hidden')])
  expect(a[0] && !a[1] && a[2] === '1' && !b[0] && b[1], { a, b })
})
await t('英語に切り替えられる（遊び方・ボタン・結果）', async () => {
  await p.evaluate(() => { ET.dbg.pause(true) })
  await p.click('#bLang')
  const r = await p.evaluate(() => ({ lang: document.documentElement.lang, start: document.getElementById('bStart').textContent, cough: document.querySelector('#b_cough .nm').textContent, how: document.querySelector('[data-h=h2]').textContent }))
  await p.click('#bLang')
  expect(r.lang === 'en' && r.start === 'Begin' && r.cough === 'Cough' && /Yellow/.test(r.how), r); return r
})
await t('最後まで: エラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- スマホ縦3サイズ × 全画面（タイトル・遊び方・遊び中・チュートリアル・結果）、英語も
for (const [w, h, name] of SIZES) for (const loc of ['ja-JP', 'en-US']) {
  const q = await open(browser, { viewport: { width: w, height: h }, locale: loc, deviceScaleFactor: 1 })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${loc}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${loc}-how.png` }); await q.click('#bHowBack')
  await q.evaluate(() => ET.dbg.pause(true)); await q.click('#bStart')
  await q.evaluate(() => { const S = ET.S; S.introT = 99; ET.dbg.tick(1); for (let i = 0; i < 60 * 60 && S.speed !== 0; i++) ET.dbg.tick(1); ET.dbg.snapCam(); ET.dbg.render() })
  await q.waitForTimeout(150)
  views.tut = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${loc}-tut.png` })
  const hintIn = await q.evaluate(() => { const h = document.getElementById('hint').getBoundingClientRect(), f = document.getElementById('finger').getBoundingClientRect(); return h.left >= 0 && h.right <= innerWidth && !document.getElementById('hint').hidden && f.width > 0 && f.bottom <= innerHeight })
  await q.evaluate(() => { ET.press('cough'); ET.dbg.tick(60 * 20); for (let i = 0; i < 12; i++) ET.write(); ET.dbg.render() })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${loc}-play.png` })
  await q.evaluate(() => { ET.dbg.finish(); ET.dbg.result() }); await q.waitForTimeout(300)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-${loc}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${loc} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name} ${loc}: チュートリアルの案内が画面内`, async () => { expect(hintIn, hintIn) })
  await t(`${name} ${loc}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  if (loc === 'en-US') await t(`${name}: 英語の端末では英語（タイトルに日本語が残らない）`, async () => { await q.click('#bTitle'); const r = await q.evaluate(() => ({ lang: document.documentElement.lang, ja: /[ぁ-んァ-ヶ一-龠]/.test(document.getElementById('vTitle').innerText.replace('ぐぅ', '')) })); expect(r.lang === 'en' && !r.ja, r) })
  await q.context().close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始めて、ボタンをタップで押せる', async () => {
  await wp.tap('#bStart')
  await wp.evaluate(() => { ET.S.introT = 99; ET.dbg.pause(true); ET.dbg.tick(2); for (let i = 0; i < 60 * 60 && ET.S.speed !== 0; i++) ET.dbg.tick(1); ET.dbg.pause(false) })
  await wp.tap('#b_cough')
  await wp.waitForFunction(() => ET.S.rumbles[0].res, null, { timeout: 4000 }).catch(() => {})
  await wp.evaluate(() => { ET.dbg.pause(true); ET.dbg.tick(120); ET.dbg.pause(false) })
  await wp.tap('#sheetBtn')
  const r = await wp.evaluate(() => ({ cool: !ET.canUse('cough'), res: ET.S.rumbles[0].res, strokes: ET.S.strokes }))
  expect(r.res === 'safe' && r.strokes === 1, r); return r
})
await t('WebKit: 実際には無音（タップで音を鳴らす操作のあと）', async () => { const r = await wp.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls })); expect(r.ok && r.calls > 0, r); return r })
await awayTest(wp)
await t('WebKit: 3Dが描けている', async () => { await wp.waitForTimeout(300); const v = await glVar(wp); expect(v > 200, v); return v })
await t('WebKit: 結果まで通る', async () => { await wp.evaluate(() => { ET.dbg.pause(true); ET.dbg.finish(); ET.dbg.result() }); await wp.waitForTimeout(300); await wp.screenshot({ path: `${ROOT}/shots/wk-result.png` }); const r = await fit(wp); expect(!r.over.length, r) })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await awayNavTest(wp)
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

// ---- ページを離れたら音を止める（WebKit。裏に回る→戻る（bfcache の pageshow）で鳴らない、触ると戻る（resume を呼ぶ）。音は出さない。mute.mjs が resume を数えるだけにしているので state は見ない）
async function awayTest(pg, o = {}) {
  await t('WebKit: 裏に回ると BGM と環境音が止まり suspend。戻っても触るまで鳴らない（bfcache の pageshow でも）', async () => {
    const r = await pg.evaluate(async (fb) => {
      const sl = ms => new Promise(r => setTimeout(r, ms))
      if (!Snd.ctx) Snd.init()
      await sl(900); let fbUsed = false
      if (!Snd.playing().length && fb) { fbUsed = true; Snd.loop('__bed', fb, 0.2); for (let i = 0; i < 40 && !Snd.playing().length; i++) await sl(100) }
      const before = Snd.playing().length
      const c = Snd.ctx; let sus = 0; const os = c.suspend.bind(c); c.suspend = () => { sus++; return os() }
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
      const hid = { away: Snd.away, playing: Snd.playing().length, sus, gain: Snd.master.gain.value }
      const nm = Object.keys(Snd.files)[0], src = nm ? Snd.play(nm) : null; Snd.loop('__q', fb || Object.values(Snd.files)[0][0], 0.2)   // 裏にいる間の音は鳴らさない
      await sl(400); const quiet = Snd.playing().length
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await sl(400); const back = { away: Snd.away, playing: Snd.playing().length, gain: Snd.master.gain.value }
      Snd.loop('__q', null)
      return { before, fbUsed, hid, src: !!src, quiet, back, calls0: window.__soundCalls || 0 }
    }, o.fb || null)
    const xy = o.tap ? await pg.evaluate(o.tap) : await pg.evaluate(() => ({ x: 8, y: innerHeight * 0.5 }))
    await pg.touchscreen.tap(xy.x, xy.y); await pg.waitForTimeout(800)
    const after = await pg.evaluate(() => ({ away: Snd.away, playing: Snd.playing().length, wake: Snd.life.wake, calls: window.__soundCalls || 0, mute: window.__muteOk() }))
    if (r.fbUsed) await pg.evaluate(() => Snd.loop('__bed', null))
    expect(r.before >= 1 && r.hid.away && r.hid.playing === 0 && r.hid.sus === 1 && r.hid.gain === 0 && !r.src && r.quiet === 0 && r.back.away && r.back.playing === 0 && r.back.gain === 0 && !after.away && after.playing >= r.before && after.wake === 1 && after.calls > r.calls0 && after.mute, JSON.stringify({ r, after }))
    return { before: r.before, after: after.playing, fb: r.fbUsed }
  })
}
async function awayNavTest(pg, o = {}) {
  await t('WebKit: 別のページへ移る（pagehide）と止まり、戻るで戻っても鳴っていない', async () => {
    await pg.evaluate(() => { if (!Snd.ctx) Snd.init(); addEventListener('pagehide', () => { try { sessionStorage.setItem('__awayHide', JSON.stringify({ away: Snd.away, playing: Snd.playing().length, hide: Snd.life.hide })) } catch (e) {} }) })
    const e0 = pg.errs.length
    await pg.goto(o.to || URL0 + 'privacy.html'); await pg.waitForTimeout(300)
    await pg.goBack({ waitUntil: 'commit' }).catch(() => {}); await pg.waitForFunction(() => document.readyState === 'complete' && typeof Snd === 'object', null, { timeout: 15000 }); await pg.waitForTimeout(1000)
    const back = await pg.evaluate(() => ({ playing: Snd.playing().length, ctx: !!Snd.ctx, away: Snd.away, h: JSON.parse(sessionStorage.getItem('__awayHide') || '{}') }))
    expect(back.h.away && back.h.playing === 0 && back.playing === 0 && pg.errs.length === e0, JSON.stringify(back) + pg.errs.slice(e0).join('|')); return back
  })
}

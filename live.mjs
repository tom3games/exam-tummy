import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// 試験中にお腹が鳴る v2: タイトル → はじめ → 答案をタップ → 最初の黄色の輪が重なったら咳払い → 早送りで終わり → 採点された答案
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る（2026-11-02 live.mjs に名前が文字で入ったまま5本公開していた）
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/exam-tummy/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__etReady && ET.charsReady, null, { timeout: 15000 })
  await (name === 'webkit' ? p.tap('#bStart') : p.click('#bStart'))
  await p.waitForFunction(() => ET.S.mode === 'play', null, { timeout: 20000 })
  for (let i = 0; i < 6; i++) { await (name === 'webkit' ? p.tap('#sheetBtn') : p.click('#sheetBtn')); await p.waitForTimeout(150) }   // 答案をタップして解く
  const strokes = await p.evaluate(() => ET.S.strokes + ET.S.ans * ET.D.STROKES)
  await p.waitForFunction(() => ET.S.speed === 0, null, { timeout: 20000 })   // チュートリアル: 最初の黄色の輪が重なると止まる
  await (name === 'webkit' ? p.tap('#b_cough') : p.click('#b_cough'))
  await p.waitForFunction(() => ET.S.rumbles[0].res, null, { timeout: 4000 }).catch(() => {})
  const first = await p.evaluate(() => ET.S.rumbles[0].res)
  await p.evaluate(() => { ET.dbg.pause(true); ET.dbg.finish(); ET.dbg.pause(false) })
  await p.waitForFunction(() => document.getElementById('rBtns').classList.contains('on'), null, { timeout: 15000 })
  const res = await p.evaluate(() => ({ rank: document.getElementById('rName').textContent, mute: window.__muteOk() }))
  out.push(`${name}: taps=${strokes} tutorial=${first} result=${res.rank} muteOk=${res.mute}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch(document.querySelector('meta[property="og:image"]').content); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/exam-tummy', 'https://github.com/tom3games/exam-tummy/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))

// 遊び方ごとの分布。読む bot・全部咳払い bot・何もしない bot・適当 bot を種を変えて12回ずつ。node sim.mjs
// 読む bot は見えている物だけ使う: 光の色（大きさ）、ぴくっの間隔（鳴る時刻）、光がしぼむ（ひっかけ）、周りの音の予告（工事のランプ・くしゃみののけぞり等）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const PORT = 5875
const server = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__etReady && ET.charsReady, null, { timeout: 20000 })
const N = Number(process.env.N || 12)
const BOTS = ['read', 'readSlow', 'cough', 'nothing', 'random', 'biggest']
const out = {}
for (const bot of BOTS) {
  out[bot] = []
  for (let seed = 1; seed <= N; seed++) {
    const r = await p.evaluate(([bot, seed]) => {
      const { S, D } = ET
      ET.dbg.pause(true); ET.dbg.start(seed * 101 + 7, { noTut: true })
      let rs = seed * 9301 + 49297; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280
      const plan = new Map()   // rumble i → [押す時刻, 種類]
      const K = ['cough', 'chair', 'pen']
      while (S.mode === 'play') {
        const t = S.t
        for (const r of S.rumbles) {
          if (r.done || t < r.t0 || plan.has(r.i)) continue
          if (bot === 'read' || bot === 'readSlow') {
            // ぴく2回で間隔がわかる。2回目のあと、光がしぼんでいるか（ひっかけ）を見てから決める
            if (t < r.t0 + r.B * 1.6) continue
            if (r.feint) { plan.set(r.i, null); continue }
            const ext = S.exts.find(e => t >= e.tell && e.on <= r.onset + 0.05 && e.off >= r.onset + 0.3 && e.mask >= r.size)
            if (ext) { plan.set(r.i, null); continue }
            const k = K[r.size - 1]
            if (S.uses[k] <= 0) { plan.set(r.i, null); continue }
            // 人の速さ: 拍に合わせて押すが、ずれる（readSlow は反応0.3秒遅れ）
            const lag = bot === 'readSlow' ? 0.3 : 0.1
            plan.set(r.i, [r.onset + lag + (rnd() - 0.5) * 0.24, k])
          } else if (bot === 'cough') {
            plan.set(r.i, [r.onset + 0.1, 'cough'])
          } else if (bot === 'biggest') {
            const k = ['pen', 'chair', 'cough'].find(k => S.uses[k] > 0); plan.set(r.i, k ? [r.onset + 0.1, k] : null)
          } else if (bot === 'random') {
            if (rnd() < 0.2) { plan.set(r.i, null); continue }
            const av = K.filter(k => S.uses[k] > 0); plan.set(r.i, av.length ? [r.onset + (rnd() - 0.4) * 1.0, av[Math.floor(rnd() * av.length)]] : null)
          } else plan.set(r.i, null)
        }
        for (const [i, a] of plan) if (a && !a.done && t >= a[0]) { a.done = true; ET.press(a[1]) }
        ET.dbg.tick(1)
      }
      ET.dbg.finish()
      const j = ET.judge()
      return { ...j, uses: { ...S.uses } }
    }, [bot, seed])
    out[bot].push(r)
  }
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log('bot        判定値(中央/最小/最大)  ばれた(中央)  ごまかした(中央)  解答(中央)  称号の内訳')
for (const bot of BOTS) {
  const a = out[bot], v = a.map(x => x.val)
  const ranks = {}; for (const x of a) { const k = x.blank ? '白紙' : x.rank; ranks[k] = (ranks[k] || 0) + 1 }
  console.log(`${bot.padEnd(10)} ${String(med(v)).padStart(5)} / ${String(Math.min(...v)).padStart(5)} / ${String(Math.max(...v)).padStart(5)}   ${String(med(a.map(x => x.bust))).padStart(4)}   ${String(med(a.map(x => x.safe))).padStart(4)}   ${String(med(a.map(x => x.ans))).padStart(4)}   ${JSON.stringify(ranks)}`)
}
console.log('errors', errs)
await b.close(); server.kill()

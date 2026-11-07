// 遊び方ごとの分布（v2: 輪のタイミング・答案をタップ・手持ちは戻る）。種を変えて12回ずつ。node sim.mjs
// 読む bot は見えている物だけ使う: 光と輪の色（大きさ）、縮む輪（鳴る時刻）、輪が消える（ひっかけ）、周りの音の予告。押すのは輪が重なってから反応0.25〜0.4秒後
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
const BOTS = ['read', 'answersOnly', 'nothing', 'cough', 'random']
const out = {}
for (const bot of BOTS) {
  out[bot] = []
  for (let seed = 1; seed <= N; seed++) {
    const r = await p.evaluate(([bot, seed]) => {
      const { S, D } = ET
      ET.dbg.pause(true); ET.dbg.start(seed * 101 + 7, { noTut: true })
      let rs = seed * 9301 + 49297; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280
      const plan = new Map(), K = ['cough', 'chair', 'pen']
      let nextTap = 0, nextRand = 1, idle = 0, idleMax = 0, lastAct = 0
      while (S.mode === 'play') {
        const t = S.t
        const tele = S.rumbles.find(r => !r.done && t >= r.t0 - 0.2 && t < r.onset + 0.5)
        const soon = S.rumbles.find(r => !r.done && !r.feint && r.t0 > t && r.t0 - t < 1.6)
        if (bot === 'read') {
          for (const r of S.rumbles) {
            if (r.done || t < r.t0 || plan.has(r.i)) continue
            if (t < r.t0 + (r.onset - r.t0) * 0.7) continue   // 輪が消えるかどうかは 7割まで縮めば分かる
            if (r.feint) { plan.set(r.i, null); continue }
            const ext = S.exts.find(e => t >= e.tell && e.on <= r.onset + 0.05 && e.off >= r.onset + 0.3 && e.mask >= r.size)
            if (ext) { plan.set(r.i, null); continue }
            plan.set(r.i, [r.onset + 0.25 + rnd() * 0.15, K[r.size - 1]])
          }
          // 手が空いたら直す（次の輪が近い時はやらない）
          if (!tele && !soon && t >= S.busyUntil) { if (S.penDown) ET.press('pen'); else if (S.chairOff) ET.press('chair') }
          if (!tele && t >= nextTap) { ET.write(); nextTap = t + 0.18 + rnd() * 0.08 }
        } else if (bot === 'answersOnly') {
          if (t >= nextTap) { ET.write(); nextTap = t + 0.18 + rnd() * 0.08 }
        } else if (bot === 'cough') {
          // どの大きさでも咳払い（輪が重なったら押す。ひっかけでも押す）。答案は読む bot と同じ速さで解く
          for (const r of S.rumbles) if (!r.done && t >= r.t0 && !plan.has(r.i)) plan.set(r.i, [r.onset + 0.25 + rnd() * 0.15, 'cough'])
          if (!tele && t >= nextTap) { ET.write(); nextTap = t + 0.18 + rnd() * 0.08 }
        } else if (bot === 'random') {
          if (t >= nextRand) { const k = K[Math.floor(rnd() * 3)]; ET.press(k); nextRand = t + 1 + rnd() * 3 }
          if (t >= nextTap && rnd() < 0.5) { ET.write(); nextTap = t + 0.3 }
        }
        for (const [i, a] of plan) if (a && !a.done && t >= a[0]) { a.done = true; ET.press(a[1]) }
        // 「何もできない時間」: ボタンも答案も押せない連続時間
        const any = ET.canUse('cough') || ET.canUse('chair') || ET.canUse('pen') || (!S.penDown && t >= S.busyUntil && S.ans < D.QN)
        if (any) idle = 0; else { idle += 1 / 60; idleMax = Math.max(idleMax, idle) }
        ET.dbg.tick(1)
      }
      ET.dbg.finish()
      return { ...ET.judge(), idleMax: +idleMax.toFixed(2) }
    }, [bot, seed])
    out[bot].push(r)
  }
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log('bot          判定値(中央/最小/最大)  ばれた  ごまかした  解いた  怪しまれた  手が空かない最長(秒)  称号')
for (const bot of BOTS) {
  const a = out[bot], v = a.map(x => x.val)
  const ranks = {}; for (const x of a) { const k = x.blank ? '白紙' : x.rank; ranks[k] = (ranks[k] || 0) + 1 }
  console.log(`${bot.padEnd(12)} ${String(med(v)).padStart(5)} / ${String(Math.min(...v)).padStart(5)} / ${String(Math.max(...v)).padStart(5)}   ${String(med(a.map(x => x.bust))).padStart(4)}   ${String(med(a.map(x => x.safe))).padStart(4)}   ${String(med(a.map(x => x.ans))).padStart(4)}   ${String(med(a.map(x => x.sus))).padStart(4)}   ${Math.max(...a.map(x => x.idleMax))}   ${JSON.stringify(ranks)}`)
}
console.log('errors', errs)
await b.close(); server.kill()

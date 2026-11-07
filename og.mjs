// SNS用サムネ og.png（1200x630）。node og.mjs
// 試験中にお腹が大きく鳴って赤く光り、教室じゅうが振り向く瞬間。右にタイトルと一言
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const ROOT = import.meta.dirname
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: '5876' } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage()
await p.goto('http://localhost:5876/'); await p.waitForFunction(() => window.__etReady && ET.charsReady, null, { timeout: 20000 })
await p.evaluate(() => document.fonts.ready); if (process.env.OGCAM) await p.evaluate(c => { window.__ogCam = c }, JSON.parse(process.env.OGCAM))
await p.evaluate(() => {
  ET.dbg.pause(true); ET.dbg.start(3, { noTut: true })
  const S = ET.S, r = S.rumbles.find(x => x.size === 3 && !x.feint && !x.ext)
  ET.dbg.tick(Math.round((r.onset - 0.4) * 60))
  S.R = 3; S.lastBust = S.t
  ET.CAM.play = window.__ogCam || { p: [0.35, 1.6, -2.4], l: [-0.75, 0.5, 0] }
  ET.dbg.snapCam()
  ET.dbg.fx.lookAll = 99
  const pr = ET.PEOPLE.proctor; pr.g.position.set(0.62, 0, -0.55); pr.lookT = 99
  for (const c of Object.values(ET.PEOPLE)) c.lookT = 99
  ET.PEOPLE.grandma.g.visible = false   // 自分の前の席の人は、写真の前をふさぐので消す
  ET.dbg.tick(24); ET.dbg.frames(40)
  ET.dbg.fx.camK = 0; ET.dbg.fx.shake = 0
  ET.dbg.frames(2)
  document.querySelectorAll('#fx > *').forEach(e => e.remove())
})
await p.addStyleTag({ content: `#corner,.ans,.desk,.hint,#finger,#bigMsg,#boot{display:none!important}
  body::after{content:'';position:fixed;inset:0 0 0 50%;background:linear-gradient(90deg,rgba(36,33,29,0),rgba(36,33,29,.94) 22%);z-index:30}` })
await p.evaluate(() => {
  ET.S.dbgPause = true
  document.querySelectorAll('#fx > *').forEach(e => e.remove())
  const v = ET.camera, pl = ET.PEOPLE.player, w = pl.torso.getWorldPosition(pl.g.position.clone()); w.y += 0.35
  const s = w.project(v), x = (s.x * 0.5 + 0.5) * innerWidth, y = (-s.y * 0.5 + 0.5) * innerHeight
  const ono = (t, x, y, size, rot, col) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20;font-family:Yomogi;font-size:${size}px;color:${col};-webkit-text-stroke:6px #1e1c19;paint-order:stroke fill;transform:rotate(${rot}deg);white-space:nowrap`; document.body.appendChild(d) }
  ono('ぐおおぉぉ', Math.min(x - 160, 330), y - 230, 74, -8, '#e0352a')
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;right:30px;top:0;bottom:0;width:470px;z-index:31;display:flex;flex-direction:column;justify-content:center;gap:18px;color:#f6f1e3'
  d.innerHTML = `<div style="font-family:'Shippori Mincho B1';font-weight:600;font-size:22px;letter-spacing:.3em;border-bottom:2px solid #f6f1e3;padding-bottom:6px;width:fit-content">試験中 / 私語厳禁</div>
  <div style="font-family:'Shippori Mincho B1';font-weight:800;font-size:76px;line-height:1.12">試験中に<br>お腹が<span style="color:#e0352a">鳴る</span></div>
  <div style="font-family:'Shippori Mincho B1';font-weight:600;font-size:27px;line-height:1.6">輪が重なった瞬間に、<br>咳払い・椅子・ペンの音を重ねろ。<br><span style="font-family:Yomogi;color:#ff6b5e;font-size:31px">大きさが合わないとばれる。</span></div>`
  document.body.appendChild(d)
  ET.dbg.render()
})
await p.waitForTimeout(300)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('ok')

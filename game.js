// 試験中にお腹が鳴る（exam-tummy）。仕様の正本は ~/Desktop/claudecode/ideas/exam-tummy.md
// 遊びの処理（S と step）は固定60Hz。見た目は render。遊びの乱数は S.rand（種つき）、見た目の乱数は Math.random
import * as THREE from 'three'
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from './vendor/jsm/utils/SkeletonUtils.js'
import { setupLook, enableShadows, castShadow, receiveShadow } from './look.js'

const D = window.ET_DATA
const $ = id => document.getElementById(id)
const DT = 1 / 60
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const KINDS = ['cough', 'chair', 'pen']
const GLOW = [null, 0xf2c230, 0xf08a24, 0xe0352a]
const CSSG = [null, '#f2c230', '#f08a24', '#e0352a']

// ---------- 言語
let LANG = 'ja'
try { LANG = localStorage.getItem('et_lang') || ((navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en') } catch (e) { LANG = (navigator.language || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en' }
const T = () => D.T[LANG]
function applyLang() {
  document.documentElement.lang = LANG
  for (const el of document.querySelectorAll('[data-t]')) { const v = T()[el.dataset.t]; if (typeof v === 'string') el.textContent = v }
  for (const el of document.querySelectorAll('[data-h]')) el.innerHTML = T()[el.dataset.h]
  $('langTxt').textContent = LANG === 'ja' ? 'EN' : 'JP'
  if (S.mode === 'play' || S.mode === 'intro' || S.mode === 'end') $('aSub').textContent = T().subjects[S.subject]
  drawBoard(); refreshButtons()
}

// ---------- 乱数
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// ---------- 状態
const S = {
  mode: 'title', t: 0, rand: Math.random, seed: 1, speed: 1, dbgPause: false,
  rumbles: [], exts: [], uses: { cough: 4, chair: 4, pen: 3 }, prog: 0, pauseUntil: 0,
  rumble: 0, safe: 0, bust: 0, extSafe: 0, wasted: 0, R: 0, lastBust: -99, coughN: 0, chairN: 0,
  masked: false, chairBroken: false, tut: 0, subject: 0, rare: {}, log: [], introT: 0, endT: 0, teacherBig: false,
}
function resetState(seed) {
  S.seed = seed; S.rand = mulberry(seed * 7919 + 13)
  S.t = 0; S.speed = 1; S.rumbles = []; S.exts = []; S.uses = { ...D.USES }; S.prog = 0; S.pauseUntil = 0
  S.rumble = 0; S.safe = 0; S.bust = 0; S.extSafe = 0; S.wasted = 0; S.R = 0; S.lastBust = -99; S.coughN = 0; S.chairN = 0
  S.masked = false; S.chairBroken = false; S.log = []; S.introT = 0; S.endT = 0
  S.subject = Math.floor(S.rand() * 5)
  S.rare = { ticket: S.rand() < 0.45, teacher: S.rand() < 0.3, teacherBig: S.rand() < 0.1 }
  S.teacherBig = false
  makeSchedule()
}

// ---------- 出来事の台本（種で決まる。同じ種なら同じ試験）
function makeSchedule() {
  const r = S.rand, DUR = D.DUR, tutorial = S.tut === 0
  let t = tutorial ? 4.5 : 6 + r() * 2
  const times = []
  while (t < DUR - 7) { times.push(t); t += lerp(10.5, 7.2, t / DUR) + r() * 2.2 }
  const pool = []; for (let i = 0; i < times.length; i++) pool.push(1 + (i % 3))
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]] }
  if (tutorial) { const k = pool.indexOf(1); if (k > 0) [pool[0], pool[k]] = [pool[k], pool[0]] }
  times.forEach((t0, i) => {
    const B = lerp(0.72, 0.52, t0 / DUR)
    S.rumbles.push({ i, t0, B, onset: t0 + 3 * B, size: pool[i], feint: false, done: false, cover: null, coverT: 0, res: null, played: false, beats: 0 })
  })
  // ひっかけ（光ったけど鳴らない）を2〜3個。最初の2つは本物
  const nf = 2 + (r() < 0.5 ? 1 : 0)
  const cand = S.rumbles.slice(2).map(x => x.i)
  for (let k = 0; k < nf && cand.length; k++) { const j = Math.floor(r() * cand.length); S.rumbles[cand[j]].feint = true; cand.splice(j, 1) }
  // 周りの音。鳴る瞬間にかぶせるもの（安全）・かぶせても足りないもの（わな）・何もない時に鳴るもの
  const real = S.rumbles.filter(x => !x.feint && x.i >= (tutorial ? 1 : 0))
  const used = new Set()
  const pickR = (want, from = 0, to = 1) => {
    const c = real.filter(x => !used.has(x.i) && want.includes(x.size) && x.onset > DUR * from && x.onset < DUR * to)
    if (!c.length) return null; const x = c[Math.floor(r() * c.length)]; used.add(x.i); return x
  }
  const addExt = (kind, mask, on, len, tell) => S.exts.push({ kind, mask, on, off: on + len, tell: on - tell, done: false, started: false })
  const LEN = { drill: 3.4, chime: 4.2, sneeze: 0.75, roll: 1.3, teacher: 1.2 }
  const TELL = { drill: 2.0, chime: 1.6, sneeze: 1.5, roll: 1.1, teacher: 1.5 }
  const MASK = { drill: 3, chime: 3, sneeze: 2, roll: 1, teacher: 2 }
  const align = (kind, x) => { if (!x) return; const on = x.onset - (kind === 'sneeze' || kind === 'roll' ? 0.15 : 0.7 + r() * 0.5); addExt(kind, MASK[kind], on, LEN[kind], TELL[kind]); x.ext = kind }
  align('drill', pickR([3], 0.1, 0.6)); if (r() < 0.5) align('drill', pickR([3, 2], 0.55, 1))
  // チャイムは真ん中あたりの1回（重なる相手がいればかぶせる）
  { const x = pickR([1, 2, 3], 0.35, 0.65); if (x) align('chime', x); else addExt('chime', 3, DUR * 0.5, LEN.chime, TELL.chime) }
  align('sneeze', pickR([2], 0, 1))
  { const x = pickR([3], 0, 1); if (x) { addExt('sneeze', 2, x.onset - 0.15, LEN.sneeze, TELL.sneeze); x.ext = 'sneeze-trap' } }
  if (r() < 0.6) align('roll', pickR([1], 0, 1))
  { const x = pickR([2, 3], 0, 1); if (x) { addExt('roll', 1, x.onset - 0.15, LEN.roll, TELL.roll); x.ext = 'roll-trap' } }
  if (S.rare.teacher) align('teacher', pickR([2], 0.2, 0.9))
  // 何もない時の工事（音だけ。押す必要なし）
  { const gaps = []; for (let i = 1; i < S.rumbles.length; i++) { const a = S.rumbles[i - 1].onset + 1.5, b = S.rumbles[i].t0 - 1; if (b - a > 4.5) gaps.push([a, b]) } if (gaps.length) { const g = gaps[Math.floor(r() * gaps.length)]; addExt('drill', 3, g[0] + 2, 2.4, 2.0) } }
  S.exts.sort((a, b) => a.on - b.on)
}

// ---------- 遊びの1歩（60Hz）
function step() {
  if (S.mode === 'intro') { S.introT += DT; if (S.introT >= (S.rare.ticket ? 5.2 : 2.2)) beginExam(); return }
  if (S.mode === 'end') { S.endT += DT; if (S.endT > 2.4) showResult(); return }
  if (S.mode !== 'play') return
  const dt = DT * S.speed
  S.t += dt
  // 書く（鉛筆があって手が空いている時だけ）
  if (S.uses.pen > 0 && S.t >= S.pauseUntil) S.prog = Math.min(D.QN, S.prog + dt / D.Q_SEC)
  // 周りの音
  for (const e of S.exts) {
    if (!e.started && S.t >= e.on) { e.started = true; onExtStart(e) }
    if (e.started && !e.done && S.t >= e.off) e.done = true
  }
  // お腹
  for (const r of S.rumbles) {
    if (r.done || S.t < r.t0) continue
    const beat = Math.floor((S.t - r.t0) / r.B) + 1
    if (beat > r.beats && beat <= (r.feint ? 2 : 3)) { r.beats = beat; onTwitch(r) }
    if (r.feint) { if (S.t >= r.onset + 0.3) { r.done = true; r.res = 'feint' } continue }
    if (!r.played && S.t >= r.onset) { r.played = true; onOnset(r) }
    if (S.t >= r.onset + D.WIN_POST) resolve(r)
  }
  // 周りの反応は、ばれずに22秒たつと1段下がる
  if (S.R > 0 && S.t - S.lastBust > 22) { S.R--; S.lastBust = S.t; onReactDown() }
  // チュートリアル: 最初の1回は鳴る直前でゆっくりにして、押すまで待つ
  if (S.tut === 0) {
    const r0 = S.rumbles[0]
    if (r0 && S.t >= r0.t0 && !r0.done && !r0.cover) { S.speed = S.t > r0.onset - 0.05 ? 0 : 0.45; tutHint(S.t > r0.t0 + r0.B ? 2 : 1) }
    if (r0 && r0.done) { S.speed = 1; S.tut = 1; tutHint(0) }
  } else if (S.tut === 1) {
    const e = S.exts.find(x => x.kind === 'drill' && S.t > x.tell && S.t < x.off)
    if (e) { tutHint(e.started ? 4 : 3); if (S.t > e.off - 0.3) { S.tut = 2; tutHint(0) } }
  }
  if (S.t >= D.DUR) endExam()
}
function activeExt(at, size) { return S.exts.find(e => e.on <= at + 0.05 && e.off >= at + 0.3 && e.mask >= size) }
function anyExtAt(at) { return S.exts.find(e => e.on <= at + 0.05 && e.off >= at + 0.3) }
function windowRumble(at) { return S.rumbles.find(r => !r.done && at >= r.onset - D.WIN_PRE && at <= r.onset + D.WIN_POST) }

// 押す
function press(k) {
  if (S.mode !== 'play' || S.uses[k] <= 0) return false
  if (S.tut === 0) { const r0 = S.rumbles[0]; if (!r0 || S.t < r0.t0) return false }
  S.uses[k]--
  S.pauseUntil = Math.max(S.pauseUntil, S.t + D.PAUSE[k])
  const r = windowRumble(S.t)
  let wasted = false
  if (r && !r.feint) { if (!r.cover) { r.cover = k; r.coverT = S.t } }
  else { wasted = true; S.wasted++ }
  if (r && r.feint) r.cover = k
  S.log.push({ t: +S.t.toFixed(2), k, r: r ? r.i : -1 })
  onCover(k, wasted)
  if (k === 'cough') { S.coughN++; if (S.coughN === 2 && S.uses.cough > 0) say('proctor', T().sCold); if (S.uses.cough === 0) { S.masked = true; fx.maskT = 0.01 } }
  if (k === 'chair') { S.chairN++; if (S.uses.chair === 0) { S.chairBroken = true; fx.breakT = 0.01 } }
  if (k === 'pen') dropPencil()
  if (r && !r.feint && r.played) resolve(r)
  refreshButtons()
  if (S.tut === 0 && r && r.i === 0) S.speed = 1
  return true
}
function resolve(r) {
  if (r.done) return
  r.done = true
  const ext = activeExt(r.onset, r.size), anyE = anyExtAt(r.onset)
  let res
  if (r.cover) {
    const c = D.SIZE[r.cover]
    if (c === r.size) res = 'safe'
    else if (ext) res = 'ext'
    else res = c < r.size ? 'small' : (anyE ? 'safe' : 'big')
  } else res = ext ? 'ext' : 'bust'
  r.res = res
  S.rumble++
  if (res === 'safe' || res === 'ext') { S.safe++; if (res === 'ext') S.extSafe++ }
  else { S.bust++; S.R = Math.min(3, S.R + 1); S.lastBust = S.t; S.pauseUntil = Math.max(S.pauseUntil, S.t + D.PAUSE.bust) }
  onResolve(r)
}
function beginExam() { S.mode = 'play'; S.t = 0; bigMsg(T().go, 1.0); Snd.play('paper', { vol: 0.8 }); Snd.play('chime', { vol: 0.5, rate: 0.9 }) }
function endExam() {
  S.mode = 'end'; S.endT = 0
  for (const r of S.rumbles) if (!r.done && !r.feint && r.played) resolve(r)
  bigMsg(T().stop, 1.6); Snd.play('chime', { vol: 0.8 })
  if (S.rare.teacherBig) { S.teacherBig = true; Snd.play('g3', { vol: 1, rate: 0.8 }); setTimeout(() => say('neighborL', T().sTeacherBig), 700) }
  else setTimeout(() => say('grandma', T().sEndGrand), 600)
}
function judge() {
  const ans = Math.floor(S.prog)
  const val = S.safe * 8 - S.bust * 18 + ans * 2.2 - S.wasted * 2
  let rank = D.RANKS.find(x => val >= x[0])[1]
  const blank = S.uses.pen === 0 && ans < 8
  return { val: Math.round(val), rank, blank, ans, rumble: S.rumble, safe: S.safe, bust: S.bust, extSafe: S.extSafe, wasted: S.wasted }
}

// ---------- 3D
const canvas = $('gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1))
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xcfd8d3)
scene.fog = new THREE.Fog(0xcfd8d3, 9, 18)
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 60)
const L = setupLook(renderer, scene, { sky: 0xfff6e6, ground: 0x7a6a5a, hemi: 0.95, sun: 2.0, sunPos: [4, 6, 1], fill: 0.5, exposure: 1.05 })
L.sun.position.set(6, 5, -1)
enableShadows(renderer, L.sun, { radius: 5, center: [0, 0, -1.5], mapSize: 1024 })
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o })
function mesh(g, m, x = 0, y = 0, z = 0, parent = scene) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }

const ROOM = { x0: -2.6, x1: 2.6, z0: -5.4, z1: 2.4, h: 2.9 }
const COLS = [-1.0, 0, 1.0], ROWS = [-2.5, -1.25, 0]
const DESK_H = 0.5, SEAT_H = 0.28, CH = 1.0
{
  // 床（木の板）
  const floorTex = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#b98b5e'; x.fillRect(0, 0, w, h)
    for (let i = 0; i < 16; i++) { const y = i * 32; x.fillStyle = `hsl(28,${35 + (i * 7) % 12}%,${46 + (i * 13) % 9}%)`; x.fillRect(0, y, w, 31); x.fillStyle = 'rgba(60,35,15,.35)'; x.fillRect(0, y + 31, w, 1); const off = (i * 173) % 512; x.fillRect(off, y, 1, 32) }
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(80,50,20,${Math.random() * 0.08})`; x.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 60, 1) }
  })
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 4)
  const f = mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), std(0xffffff, { map: floorTex, roughness: 0.55 }), 0, 0, (ROOM.z0 + ROOM.z1) / 2); f.rotation.x = -Math.PI / 2; f.receiveShadow = true
  const wallM = std(0xe9e3d3, { roughness: 0.95 }), lowM = std(0x8a9b8f, { roughness: 0.8 })
  // 前の壁と黒板
  mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.h), wallM, 0, ROOM.h / 2, ROOM.z0)
  // 左の壁（廊下側）と腰板
  const lw = mesh(new THREE.PlaneGeometry(ROOM.z1 - ROOM.z0, ROOM.h), wallM, ROOM.x0, ROOM.h / 2, (ROOM.z0 + ROOM.z1) / 2); lw.rotation.y = Math.PI / 2
  const lb = mesh(new THREE.PlaneGeometry(ROOM.z1 - ROOM.z0, 0.9), lowM, ROOM.x0 + 0.01, 0.45, (ROOM.z0 + ROOM.z1) / 2); lb.rotation.y = Math.PI / 2
  // 右の壁（窓側）: 腰壁と窓枠
  const rw = mesh(new THREE.PlaneGeometry(ROOM.z1 - ROOM.z0, 0.85), wallM, ROOM.x1, 0.425, (ROOM.z0 + ROOM.z1) / 2); rw.rotation.y = -Math.PI / 2
  const top = mesh(new THREE.PlaneGeometry(ROOM.z1 - ROOM.z0, 0.4), wallM, ROOM.x1, ROOM.h - 0.2, (ROOM.z0 + ROOM.z1) / 2); top.rotation.y = -Math.PI / 2
  const frameM = std(0xbfc4c7, { roughness: 0.4, metalness: 0.5 })
  for (let z = ROOM.z0; z <= ROOM.z1 + 0.01; z += 1.3) mesh(new THREE.BoxGeometry(0.06, ROOM.h - 1.25, 0.06), frameM, ROOM.x1, 0.85 + (ROOM.h - 1.25) / 2, z)
  mesh(new THREE.BoxGeometry(0.08, 0.05, ROOM.z1 - ROOM.z0), frameM, ROOM.x1, 0.86, (ROOM.z0 + ROOM.z1) / 2)
  mesh(new THREE.BoxGeometry(0.08, 0.05, ROOM.z1 - ROOM.z0), frameM, ROOM.x1, ROOM.h - 0.4, (ROOM.z0 + ROOM.z1) / 2)
  // 天井と蛍光灯
  const ce = mesh(new THREE.PlaneGeometry(ROOM.x1 - ROOM.x0, ROOM.z1 - ROOM.z0), new THREE.MeshBasicMaterial({ color: 0xcfcabd }), 0, ROOM.h, (ROOM.z0 + ROOM.z1) / 2); ce.rotation.x = Math.PI / 2
  for (const z of [-3.8, -1.8, 0.2]) for (const x of [-1.2, 1.2]) mesh(new THREE.BoxGeometry(0.16, 0.05, 1.2), new THREE.MeshBasicMaterial({ color: 0xfffdf4 }), x, ROOM.h - 0.03, z)
  // 教卓
  const wood = std(0x8a5a35, { roughness: 0.6 })
  mesh(new THREE.BoxGeometry(1.1, 0.85, 0.5), wood, 0, 0.425, -4.55).castShadow = true
  mesh(new THREE.BoxGeometry(1.8, 0.12, 0.6), std(0x6c4a33), 0, 0.06, -4.7)
  // 掲示物と時間割
  const poster = (x, z, ry, col, w = 0.5, h = 0.66) => { const p = mesh(new THREE.PlaneGeometry(w, h), std(col, { roughness: 1 }), x, 1.6, z); p.rotation.y = ry; return p }
  poster(ROOM.x0 + 0.02, -3.6, Math.PI / 2, 0xf4efe0); poster(ROOM.x0 + 0.02, -2.9, Math.PI / 2, 0xe3eef2, 0.45, 0.6); poster(ROOM.x0 + 0.02, -0.4, Math.PI / 2, 0xf6e1d6, 0.55, 0.7)
  // 前のドア（左の壁）
  const door = mesh(new THREE.PlaneGeometry(0.9, 1.95), std(0x9a7650, { roughness: 0.7 }), ROOM.x0 + 0.015, 0.975, -4.4); door.rotation.y = Math.PI / 2
  // 掃除用具入れ（後ろ）
  mesh(new THREE.BoxGeometry(0.6, 1.8, 0.45), std(0x9aa3a8, { metalness: 0.3, roughness: 0.5 }), -2.2, 0.9, 2.1)
}
// 黒板（文字は canvas）
const boardCanvas = document.createElement('canvas'); boardCanvas.width = 1024; boardCanvas.height = 384
const boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace
{
  const b = mesh(new THREE.PlaneGeometry(3.6, 1.35), std(0xffffff, { map: boardTex, roughness: 0.9 }), 0, 1.55, ROOM.z0 + 0.02)
  mesh(new THREE.BoxGeometry(3.8, 0.06, 0.12), std(0x8a5a35), 0, 0.86, ROOM.z0 + 0.06)
}
function drawBoard() {
  const x = boardCanvas.getContext('2d'), w = 1024, h = 384
  x.fillStyle = '#2f4a3c'; x.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; x.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 140, 2 + Math.random() * 4) }
  x.fillStyle = 'rgba(245,245,235,.92)'; x.textBaseline = 'middle'
  x.font = `800 112px ${getComputedStyle(document.documentElement).getPropertyValue('--mincho')}`
  x.textAlign = 'center'; x.fillText(T().board, 380, 150)
  x.font = `600 52px ${getComputedStyle(document.documentElement).getPropertyValue('--mincho')}`
  x.fillText(T().subjects[S.subject] + '  10:00 - 11:00', 380, 262)
  x.fillStyle = 'rgba(250,215,120,.9)'; x.font = `600 46px ${getComputedStyle(document.documentElement).getPropertyValue('--mincho')}`
  x.textAlign = 'left'; x.fillText(T().boardSub, 760, 130)
  x.strokeStyle = 'rgba(245,245,235,.6)'; x.lineWidth = 3; x.strokeRect(740, 88, 230, 84)
  boardTex.needsUpdate = true
}
// 壁の時計（試験の残りが一目で分かる。針は本物の時刻でなく試験の進み）
const clock = new THREE.Group(); clock.position.set(0, 2.55, ROOM.z0 + 0.03); scene.add(clock)
{
  const face = canvasTex(256, 256, (x) => { x.fillStyle = '#fbfaf5'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.lineWidth = 12; x.strokeStyle = '#2a2a2a'; x.stroke(); x.fillStyle = '#2a2a2a'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.save(); x.translate(128, 128); x.rotate(a); x.fillRect(-4, -108, 8, i % 3 ? 14 : 24); x.restore() } })
  mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshBasicMaterial({ map: face, toneMapped: false }), 0, 0, 0, clock)
  const hm = new THREE.MeshBasicMaterial({ color: 0x1e1e1e })
  clock.userData.h = mesh(new THREE.PlaneGeometry(0.03, 0.14).translate(0, 0.06, 0), hm, 0, 0, 0.005, clock)
  clock.userData.m = mesh(new THREE.PlaneGeometry(0.02, 0.21).translate(0, 0.095, 0), hm, 0, 0, 0.006, clock)
  clock.userData.s = mesh(new THREE.PlaneGeometry(0.008, 0.22).translate(0, 0.09, 0), new THREE.MeshBasicMaterial({ color: 0xd0281e }), 0, 0, 0.007, clock)
}
// 放送のスピーカー（チャイムの前にランプが点く）
const speaker = new THREE.Group(); speaker.position.set(-1.9, 2.45, ROOM.z0 + 0.08); scene.add(speaker)
mesh(new THREE.BoxGeometry(0.42, 0.3, 0.12), std(0xe8e2d2), 0, 0, 0, speaker)
mesh(new THREE.CircleGeometry(0.1, 20), std(0x555555), -0.05, 0, 0.061, speaker)
const spkLamp = mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: 0x552222 }), 0.14, 0.08, 0.062, speaker)

// 窓の外（空・向かいの工事現場）
const outside = new THREE.Group(); scene.add(outside)
{
  const sky = mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshBasicMaterial({ map: canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7fb6e6'); g.addColorStop(0.7, '#cfe4f2'); g.addColorStop(1, '#e9efe9'); x.fillStyle = g; x.fillRect(0, 0, w, h) }), fog: false }), 12, 3, -2, outside); sky.rotation.y = -Math.PI / 2
  const g = mesh(new THREE.PlaneGeometry(12, 16), std(0xa9b59b), 7, -0.8, -2, outside); g.rotation.x = -Math.PI / 2
  // 向かいの校舎
  for (const [z, h, c] of [[-7, 4.5, 0xd9d2c3], [2.5, 3.8, 0xcfc8b8]]) mesh(new THREE.BoxGeometry(2, h, 5), std(c), 9, h / 2 - 0.8, z, outside)
  // 工事の足場とクレーン
  const pipe = std(0x9aa0a5, { metalness: 0.5, roughness: 0.4 })
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 6), pipe, 5.2 + j * 0.6, 1, -3.4 + i * 0.9, outside)
  for (let y = -0.2; y < 3; y += 1) mesh(new THREE.BoxGeometry(1.4, 0.05, 3), std(0x7c6a4c), 5.8, y + 0.4, -2.05, outside)
  const crane = std(0xf0b429, { roughness: 0.5 })
  mesh(new THREE.BoxGeometry(0.3, 7, 0.3), crane, 7.6, 2.7, 0.4, outside)
  const jib = mesh(new THREE.BoxGeometry(0.25, 0.25, 6), crane, 7.6, 6.2, -1.6, outside)
  outside.userData.jib = jib
  // シート（防音シートの青）
  const sheet = mesh(new THREE.PlaneGeometry(3.2, 2.2), std(0x3c6fa6, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }), 6.6, 0.6, -2.0, outside); sheet.rotation.y = -Math.PI / 2
  outside.userData.beacon = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x663300 }), 5.4, 1.65, -0.8, outside)
}

// 机と椅子
const DESKS = [], CHAIRS = []
const deskTop = std(0xd9b98c, { roughness: 0.55 }), metal = std(0x7d8589, { metalness: 0.6, roughness: 0.35 }), chairSeat = std(0xc49a6c, { roughness: 0.6 })
for (const z of ROWS) for (const x of COLS) {
  const d = new THREE.Group(); d.position.set(x, 0, z - 0.42); scene.add(d)
  mesh(new THREE.BoxGeometry(0.64, 0.04, 0.44), deskTop, 0, DESK_H, 0, d)
  mesh(new THREE.BoxGeometry(0.6, 0.16, 0.4), std(0x6c7378, { metalness: 0.4, roughness: 0.5 }), 0, DESK_H - 0.11, -0.01, d)
  for (const sx of [-0.29, 0.29]) for (const sz of [-0.19, 0.19]) mesh(new THREE.CylinderGeometry(0.014, 0.014, DESK_H, 6), metal, sx, DESK_H / 2, sz, d)
  const paper = mesh(new THREE.PlaneGeometry(0.3, 0.38), std(0xf8f6ee, { roughness: 1 }), 0.02, DESK_H + 0.022, 0.02, d); paper.rotation.x = -Math.PI / 2; paper.rotation.z = (Math.random() - 0.5) * 0.2
  castShadow(d); receiveShadow(d)
  DESKS.push(d)
  const c = new THREE.Group(); c.position.set(x, 0, z + 0.05); scene.add(c)
  const seat = mesh(new THREE.BoxGeometry(0.38, 0.03, 0.36), chairSeat, 0, SEAT_H, 0, c)
  const back = mesh(new THREE.BoxGeometry(0.38, 0.26, 0.03), chairSeat, 0, SEAT_H + 0.28, 0.18, c)
  const legs = []
  for (const sx of [-0.17, 0.17]) for (const sz of [-0.16, 0.16]) legs.push(mesh(new THREE.CylinderGeometry(0.012, 0.012, SEAT_H, 6), metal, sx, SEAT_H / 2, sz, c))
  for (const sx of [-0.17, 0.17]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), metal, sx, SEAT_H + 0.2, 0.17, c)
  c.userData = { seat, legs, back }
  castShadow(c)
  CHAIRS.push(c)
}
const PDESK = DESKS[7], PCHAIR = CHAIRS[7]
PCHAIR.userData.back.visible = false   // 自分の椅子の背もたれは消す（後ろから見るので体が隠れる）
PCHAIR.children.forEach(m => { if (m.geometry && m.geometry.parameters && m.geometry.parameters.height === 0.42) m.visible = false })
// 自分の机: 鉛筆3本と消しゴム
const PENCILS = []
{
  const body = std(0x2f8a4e, { roughness: 0.5 }), wood = std(0xe9cfa5), lead = std(0x333333)
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Group(); p.position.set(0.2 - i * 0.045, DESK_H + 0.03, 0.05 + i * 0.01); p.rotation.set(0, 0.25 - i * 0.12, Math.PI / 2); PDESK.add(p)
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.17, 6), body, 0, 0, 0, p)
    mesh(new THREE.ConeGeometry(0.009, 0.025, 6), wood, 0, 0.097, 0, p)
    mesh(new THREE.ConeGeometry(0.003, 0.008, 6), lead, 0, 0.11, 0, p)
    p.userData = { fall: -1, v: new THREE.Vector3(), w: 0 }
    PENCILS.push(p)
  }
  mesh(new THREE.BoxGeometry(0.05, 0.02, 0.025), std(0xffffff), -0.24, DESK_H + 0.03, 0.12, PDESK)
}
// 前の列の人の転がす鉛筆（六角）
const ROLLP = new THREE.Group(); ROLLP.position.set(0.12, DESK_H + 0.035, 0.08); DESKS[5].add(ROLLP)
mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6), std(0xe8b830, { roughness: 0.5 }), 0, 0, 0, ROLLP).rotation.z = Math.PI / 2
// 受験票（写真が別人。猫）
const TICKET = (() => {
  const t = canvasTex(256, 160, (x, w, h) => {
    x.fillStyle = '#fbfaf2'; x.fillRect(0, 0, w, h); x.strokeStyle = '#555'; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8)
    x.fillStyle = '#333'; x.font = 'bold 22px serif'; x.fillText('受験票', 16, 34); x.font = '16px serif'; x.fillText('No. 0719', 16, 64)
    x.fillStyle = '#e6a85c'; x.fillRect(150, 30, 86, 108)
    x.fillStyle = '#c47a3a'; x.beginPath(); x.moveTo(160, 70); x.lineTo(172, 44); x.lineTo(184, 70); x.fill(); x.beginPath(); x.moveTo(202, 70); x.lineTo(214, 44); x.lineTo(226, 70); x.fill()
    x.fillStyle = '#222'; x.beginPath(); x.arc(178, 92, 5, 0, 7); x.arc(208, 92, 5, 0, 7); x.fill(); x.fillRect(190, 104, 6, 4)
    x.strokeStyle = '#222'; x.lineWidth = 2; for (const s of [-1, 1]) for (const dy of [-4, 4]) { x.beginPath(); x.moveTo(193 + s * 14, 108 + dy); x.lineTo(193 + s * 40, 104 + dy * 2); x.stroke() }
  })
  const m = mesh(new THREE.PlaneGeometry(0.16, 0.1), std(0xffffff, { map: t, roughness: 1 }), -0.2, DESK_H + 0.024, 0.12, DESKS[0]); m.rotation.x = -Math.PI / 2; m.rotation.z = 0.3
  return m
})()

// ---------- 人（Kenney Mini Characters, CC0）
const MODELS = {}
const loader = new GLTFLoader()
const CHAR_FILES = ['female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f']
let charsReady = false
function loadChars() { return Promise.all(CHAR_FILES.map(n => new Promise(res => loader.load(`chars/character-${n}.glb`, g => { MODELS[n] = g; res() }, undefined, () => res())))).then(() => { charsReady = true }) }
const PEOPLE = {}
function makeChar(name, o = {}) {
  const src = MODELS[name]; if (!src) return null
  const root = skClone(src.scene), g = new THREE.Group(); g.add(root)
  root.traverse(m => { if (m.isMesh) { m.castShadow = true; m.material = m.material.clone(); m.material.roughness = 0.75 } })
  const box = new THREE.Box3().setFromObject(root), hgt = box.max.y - box.min.y
  g.scale.setScalar((o.h ?? CH) / hgt)
  const mixer = new THREE.AnimationMixer(root), acts = {}
  for (const c of src.animations) acts[c.name] = mixer.clipAction(c)
  const c = { g, root, mixer, acts, cur: null, name, head: root.getObjectByName('head'), armL: root.getObjectByName('arm-left'), armR: root.getObjectByName('arm-right'), torso: root.getObjectByName('torso'),
    look: 0, lookT: 0, turn: 0, turnT: 0, baseYaw: o.yaw ?? Math.PI, pos: new THREE.Vector3(), giggle: 0, phase: Math.random() * 6 }
  // 足し算で動かす骨は、毎フレーム元の向きに戻してから動かす（アニメに含まれない骨は戻らず回り続けるため）
  c.bones = [c.head, c.armL, c.armR, c.torso].filter(Boolean); c.rest = c.bones.map(b => b.quaternion.clone())
  scene.add(g)
  playA(c, o.anim ?? 'sit')
  return c
}
function playA(c, name, fade = 0.25, speed = 1, once = false) {
  if (!c) return
  const a = c.acts[name]; if (!a) return
  a.timeScale = speed
  if (c.cur === name) return
  const prev = c.cur ? c.acts[c.cur] : null
  a.reset(); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true } else a.setLoop(THREE.LoopRepeat, Infinity)
  a.play(); if (prev) a.crossFadeFrom(prev, fade, false)
  c.cur = name
}
const SEATS = { player: [1, 2], neighborL: [0, 2], neighborR: [2, 2], r1L: [0, 1], grandma: [1, 1], roller: [2, 1], ticket: [0, 0], f1: [1, 0], f2: [2, 0] }
const CAST = { player: 'male-f', neighborL: 'female-b', neighborR: 'male-e', r1L: 'female-f', grandma: 'female-c', roller: 'male-d', ticket: 'male-a', f1: 'female-d', f2: 'female-e', proctor: 'male-b', worker: 'male-c' }
const SIT_Y = 0.27, SIT_Z = 0.0
let maskMesh = null, helmet = null, jack = null
function setupPeople() {
  for (const [k, [ci, ri]] of Object.entries(SEATS)) {
    const c = makeChar(CAST[k], { anim: 'sit' }); if (!c) continue
    c.seat = new THREE.Vector3(COLS[ci], SIT_Y, ROWS[ri] + SIT_Z); c.g.position.copy(c.seat); c.g.rotation.y = c.baseYaw
    PEOPLE[k] = c
  }
  const pr = makeChar(CAST.proctor, { anim: 'idle', h: 1.08 })
  if (pr) { pr.g.position.set(0.2, 0, -4.1); pr.baseYaw = 0; pr.g.rotation.y = 0; PEOPLE.proctor = pr; pr.target = new THREE.Vector3(0.2, 0, -4.1); pr.face = 0 }
  // 工事の人（ヘルメットと削岩機）
  const wk = makeChar(CAST.worker, { anim: 'idle', h: 1.15 })
  if (wk) {
    wk.g.position.set(5.6, 0.42, -1.4); wk.g.rotation.y = -Math.PI / 2; wk.baseYaw = -Math.PI / 2; PEOPLE.worker = wk
    if (wk.head) { const s = 1 / wk.g.scale.x; helmet = mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2c230, { roughness: 0.4 }), 0, 0.42 * s, 0, wk.head); helmet.scale.setScalar(s) }
    jack = new THREE.Group(); scene.add(jack)
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), std(0x555a5e, { metalness: 0.5 }), 0, 0.3, 0, jack)
    mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), std(0x222222), 0, 0.56, 0, jack)
    jack.position.set(5.6, 0.42, -1.75)
  }
  // マスク（咳を使い切ると監督が持ってくる）
  const pl = PEOPLE.player
  if (pl && pl.head) { const s = 1 / pl.g.scale.x; maskMesh = mesh(new THREE.BoxGeometry(0.42, 0.2, 0.06), std(0xffffff, { roughness: 0.9 }), 0, 0.2 * s, 0.3 * s, pl.head); maskMesh.scale.setScalar(s); maskMesh.visible = false }
  castShadow(scene)
}
// 自分の体の光（お腹のあたり。体越しでも見えるように一番上に重ねる）
// 光は色ごとに絵を作り、ふつうの重ね方で描く（足し算の重ね方は WebKit でざらつく）
const glowTexes = [null, 1, 2, 3].map(k => k && canvasTex(128, 128, (x) => { const c = CSSG[k], g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.18, c); g.addColorStop(0.55, c + '88'); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(0, 0, 128, 128) }))
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexes[1], color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
glow.renderOrder = 20; glow.visible = false; scene.add(glow)
const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, toneMapped: false, side: THREE.DoubleSide }))
ring.renderOrder = 21; ring.visible = false; scene.add(ring)
const sweat = []
for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.9, depthTest: false })); s.renderOrder = 22; s.visible = false; scene.add(s); sweat.push(s) }

// ---------- 演出（見た目だけの状態）
const fx = { twitch: 0, twitchSize: 1, shake: 0, maskT: 0, breakT: 0, glowK: 0, ringK: 0, extKinds: {}, coverAnim: { k: null, t: 0 }, lookAll: 0, camK: 0 }
function onTwitch(r) {
  fx.twitch = 1; fx.twitchSize = r.size
  if (r.beats >= 2) Snd.play('pre', { vol: 0.12 + 0.08 * r.size, rate: 1.1 - 0.1 * r.size })
}
function onOnset(r) {
  const covered = r.cover && D.SIZE[r.cover] === r.size, ext = activeExt(r.onset, r.size)
  const quiet = covered || ext
  r.snd = Snd.play('g' + r.size, quiet ? { vol: 0.35, dest: 'muf' } : { vol: 0.65 + 0.15 * r.size })
}
function onExtStart(e) {
  if (e.kind === 'drill') { Snd.play('drill', { vol: 0.8, dur: e.off - e.on, offset: Math.random() * 8 }); ono(T().oDrill, () => tmpV.set(2.3, 1.7, -1.6), 'g2', e.off - e.on) }
  if (e.kind === 'chime') { Snd.play('chime', { vol: 0.9, rate: 0.84 }); setTimeout(() => Snd.play('chime', { vol: 0.85, rate: 0.7 }), 900); ono(T().oChime, () => tmpV.set(-1.6, 2.2, ROOM.z0 + 0.3), 'g1', 2.4) }
  if (e.kind === 'sneeze') { Snd.play('sneeze', { vol: 1, rate: 0.95 }); ono(T().oSneeze, () => headAt('neighborR', 0.45), 'g2', 1.2) }
  if (e.kind === 'roll') { Snd.play('roll', { vol: 0.5 }); ono(T().oRoll, () => headAt('roller', 0.1), '', 1.0) }
  if (e.kind === 'teacher') { Snd.play('g2', { vol: 0.75, rate: 0.85 }); ono(T().oTeacher, () => headAt('proctor', -0.25), 'g2', 1.2); setTimeout(() => say('proctor', T().sProctorCough), 900) }
}
function onCover(k, wasted) {
  fx.coverAnim = { k, t: 0 }
  if (k === 'cough') { Snd.play('cough', { vol: 0.9 }); ono(T().oCough, () => headAt('player', 0.25), 'g1', 0.9) }
  if (k === 'chair') { Snd.play('creak', { vol: 1 }); ono(T().oChair, () => tmpV.copy(PCHAIR.position).setY(0.4), 'g2', 0.9) }
  if (k === 'pen') { Snd.play('pen', { vol: 1 }); ono(T().oPen, () => tmpV.copy(PDESK.position).add(tmpV2.set(0.35, 0.2, 0.1)), 'g3', 1.0) }
  if (wasted) { glanceAll(1.4, 0.6); if (k !== 'cough') verdict(T().vMiss, false) }
  else glanceAll(0.6, 0.3)
}
function onResolve(r) {
  const v = { safe: T().vSafe, ext: T().vExt, bust: T().vBust, small: T().vSmall, big: T().vBig }[r.res]
  const ok = r.res === 'safe' || r.res === 'ext'
  verdict(v, ok)
  if (ok) { if (r.snd && r.res === 'safe') Snd.fade(r.snd, 0.12, 0.08) }
  else {
    ono(T().grRumble[r.size - 1], () => tmpV.copy(PEOPLE.player ? PEOPLE.player.g.position : tmpV.set(0, 0, 0)).setY(0.6), 'g' + r.size, 1.2)
    fx.shake = 0.5 + 0.2 * r.size; fx.camK = 1
    if (S.R >= 1) { Snd.play('giggle', { vol: 0.5, delay: 0.5 }); PEOPLE.neighborL && (PEOPLE.neighborL.giggle = 3); PEOPLE.neighborR && (PEOPLE.neighborR.giggle = 3) }
    if (S.R >= 3) { Snd.play('murmur', { vol: 0.35, dur: 1.6, offset: 3 }); fx.lookAll = 4 }
    glanceAll(2.5, 1)
    if (S.R === 1) setTimeout(() => say('neighborL', T().sGiggle), 500)
  }
}
function onReactDown() {}
function dropPencil() {
  const p = PENCILS.find(x => x.userData.fall < 0); if (!p) return
  p.userData.fall = 0; p.userData.v.set(0.6 + Math.random() * 0.4, 0.8, 0.3); p.userData.w = 8 + Math.random() * 6
}
function glanceAll(sec, chance) { for (const k of Object.keys(SEATS)) { const c = PEOPLE[k]; if (!c || k === 'player') continue; if (Math.random() < chance || k.startsWith('neighbor')) c.lookT = Math.max(c.lookT, sec * (0.7 + Math.random() * 0.6)) } if (PEOPLE.proctor) PEOPLE.proctor.lookT = Math.max(PEOPLE.proctor.lookT, sec) }

// ---------- 画面の文字（同時に2つまで。表示は 0.9秒＋1字0.09秒以上）
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3()
const FLOATS = []
function readSec(text, min = 0) { return Math.max(min, 0.9 + 0.09 * [...text].length) }
function addFloat(el, anchor, sec) {
  if (S.mode === 'result' || S.mode === 'title') return   // 結果とタイトルの上には出さない（遅れて来る一言がボタンに重なった）
  const shown = FLOATS.length + (!$('hint').hidden ? 1 : 0) + (!$('bigMsg').hidden ? 1 : 0)
  if (shown >= 2 && FLOATS.length) { const o = FLOATS.shift(); o.el.remove() }
  else if (shown >= 2) return
  $('fx').appendChild(el); FLOATS.push({ el, anchor, life: sec, age: 0, born: performance.now() })
}
function ono(text, anchor, cls, sec) { const el = document.createElement('div'); el.className = 'ono ' + (cls || ''); el.textContent = text; addFloat(el, anchor, readSec(text, sec)) }
function verdict(text, ok) { const el = document.createElement('div'); el.className = 'verdict' + (ok ? ' ok' : ''); el.textContent = text; addFloat(el, () => headAt('player', 0.55), readSec(text, 1.1)) }
function say(who, text) { if (!PEOPLE[who] || !text) return; const el = document.createElement('div'); el.className = 'sb'; el.textContent = text; addFloat(el, () => headAt(who, 0.42), readSec(text)) }
function headAt(who, up = 0.3) { const c = PEOPLE[who]; if (!c) return tmpV.set(0, 1, -2); if (c.head) c.head.getWorldPosition(tmpV); else tmpV.copy(c.g.position).setY(0.8); return tmpV.add(tmpV2.set(0, up, 0)) }
let bigT = 0
function bigMsg(text, sec) { const b = $('bigMsg'); b.textContent = text; b.hidden = false; bigT = readSec(text, sec); while (FLOATS.length > 1) FLOATS.shift().el.remove() }
let hintState = -1
function tutHint(n) {
  if (n === hintState) return; hintState = n
  const h = $('hint'), f = $('finger')
  for (const b of document.querySelectorAll('.er')) b.classList.remove('ping')
  if (!n) { h.hidden = true; f.toggleAttribute('hidden', true); return }
  h.textContent = [null, T().tut1, T().tut2, T().tut3, T().tut4][n]; h.hidden = false
  if (n === 2) { const b = $('b_cough'); b.classList.add('ping'); const r = b.getBoundingClientRect(); f.style.left = (r.left + r.width / 2 - 8) + 'px'; f.style.top = (r.top + r.height / 2 - 6) + 'px'; f.toggleAttribute('hidden', false) } else f.toggleAttribute('hidden', true)
  while (FLOATS.length > 1) FLOATS.shift().el.remove()
}
function updateFloats(dt) {
  const W = innerWidth, H = innerHeight
  for (let i = FLOATS.length - 1; i >= 0; i--) {
    const o = FLOATS[i]; o.age += dt
    if (o.age > o.life) { o.el.remove(); FLOATS.splice(i, 1); continue }
    const p = o.anchor().clone().project(camera)
    let x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H
    const w = o.el.offsetWidth, h = o.el.offsetHeight
    x = clamp(x - w / 2, 6, W - w - 6); y = clamp(y - h, 50, H - h - 140)
    const k = Math.min(1, o.age / 0.12), out = o.life - o.age < 0.25 ? (o.life - o.age) / 0.25 : 1
    const sc = o.el.classList.contains('verdict') ? lerp(1.5, 1, k) : lerp(0.6, 1, k)
    o.el.style.transform = `translate(${x}px,${y}px) scale(${sc}) rotate(${o.el.classList.contains('ono') ? -6 : 0}deg)`
    o.el.style.opacity = out
  }
  // 2つの文字が重なったら後の方をずらす
  if (FLOATS.length === 2) {
    const a = FLOATS[0].el.getBoundingClientRect(), b = FLOATS[1].el.getBoundingClientRect()
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) FLOATS[1].el.style.transform += ` translateY(${a.top - b.bottom - 4}px)`
  }
}

// ---------- カメラ
const CAM = { title: { p: [1.6, 2.2, 1.6], l: [-0.2, 0.9, -3.2] }, play: { p: [0.5, 2.0, 1.75], l: [-0.05, 0.25, -1.8] }, result: { p: [0.3, 1.25, -3.5], l: [0, 0.75, 0] } }
const camPos = new THREE.Vector3(...CAM.title.p), camLook = new THREE.Vector3(...CAM.title.l)
function camTarget() { return S.mode === 'title' ? CAM.title : (S.mode === 'result' ? CAM.result : CAM.play) }
function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false); camera.aspect = w / h
  camera.fov = w / h < 0.6 ? 64 : 52; camera.updateProjectionMatrix()
}
addEventListener('resize', resize); resize()

// ---------- 見た目の更新
let clockT = 0
const _q = new THREE.Vector3()
function render(dt) {
  const tm = performance.now() / 1000
  for (const c of Object.values(PEOPLE)) { c.bones.forEach((b, i) => b.quaternion.copy(c.rest[i])); c.mixer.update(dt) }
  const pl = PEOPLE.player
  // 自分の予告: 光・ぴくっ・汗・お腹を押さえる
  let act = null
  if (S.mode === 'play') act = S.rumbles.find(r => !r.done && S.t >= r.t0 - 0.05 && S.t < r.onset + 0.5)
  let targetGlow = 0, gcol = 1
  if (act) {
    const k = clamp((S.t - act.t0) / (act.onset - act.t0), 0, 1)
    gcol = act.size
    targetGlow = act.feint ? (k < 0.4 ? k / 0.4 : Math.max(0, 1 - (k - 0.4) / 0.45)) * 0.85 : 0.45 + 0.55 * k
    if (S.t >= act.onset) targetGlow = 1.25
  }
  fx.glowK = lerp(fx.glowK, targetGlow, 1 - Math.exp(-dt * 14))
  fx.twitch = Math.max(0, fx.twitch - dt * 5)
  if (pl) {
    const base = pl.seat
    const tw = fx.twitch * (0.025 + 0.02 * fx.twitchSize)
    let sh = 0
    if (act && !act.feint && act.size === 3 && S.t > act.t0) sh = 0.008 * Math.sin(tm * 70)
    if (fx.shake > 0) { fx.shake -= dt; sh += 0.02 * Math.sin(tm * 50) * fx.shake }
    const broken = S.chairBroken ? -0.06 + 0.006 * Math.sin(tm * 30) : 0
    pl.g.position.set(base.x + sh, base.y + tw + broken, base.z)
    pl.g.scale.y = pl.g.scale.x * (1 - fx.twitch * 0.06)
    // お腹を押さえる腕（光の強さで深く）
    const hold = Math.min(1, act && !act.feint ? fx.glowK * (0.4 + 0.2 * act.size) : (act ? fx.glowK * 0.5 : 0))
    if (pl.armL) { pl.armL.rotation.x += -hold * 0.6; pl.armL.rotation.y += -hold * 0.8 }
    if (pl.armR) { pl.armR.rotation.x += -hold * 0.6; pl.armR.rotation.y += hold * 0.8 }
    if (pl.torso) pl.torso.rotation.x += hold * 0.25
    // 書く手（右腕を小さく動かす）
    if (S.mode === 'play' && S.uses.pen > 0 && S.t >= S.pauseUntil && pl.armR && hold < 0.2) pl.armR.rotation.x += -0.25 + 0.07 * Math.sin(tm * 14)
    // ごまかしの動き
    if (fx.coverAnim.k) {
      fx.coverAnim.t += dt; const a = fx.coverAnim.t, e = Math.max(0, 1 - a / 0.7) * Math.min(1, a / 0.08)
      if (fx.coverAnim.k === 'cough' && pl.armL) { pl.armL.rotation.z += -1.3 * e; if (pl.head) pl.head.rotation.x += -0.25 * e * Math.abs(Math.sin(a * 18)) }
      if (fx.coverAnim.k === 'chair') { pl.g.rotation.z = 0.08 * e * Math.sin(a * 20); PCHAIR.rotation.z = 0.06 * e * Math.sin(a * 20) }
      if (fx.coverAnim.k === 'pen' && pl.armR) pl.armR.rotation.y += -1.0 * e
      if (a > 0.8) { fx.coverAnim.k = null; pl.g.rotation.z = 0; PCHAIR.rotation.z = 0 }
    }
    // 光
    if (pl.torso) pl.torso.getWorldPosition(_q); else _q.copy(pl.g.position).setY(0.4)
    glow.position.copy(_q).add(tmpV2.set(0.02, 0.06, -0.1))
    const gs = (0.22 + 0.14 * gcol) * (0.6 + 0.5 * fx.glowK) * (1 + 0.12 * Math.sin(tm * (8 + gcol * 4)))
    glow.scale.set(gs * 2.8, gs * 2.8, 1); if (glow.material.map !== glowTexes[gcol]) { glow.material.map = glowTexes[gcol]; glow.material.needsUpdate = true } glow.material.opacity = clamp(fx.glowK, 0, 1) * 0.92
    glow.visible = fx.glowK > 0.03
    ring.position.copy(glow.position); ring.quaternion.copy(camera.quaternion)
    if (fx.twitch > 0.9) fx.ringK = 1
    fx.ringK = Math.max(0, fx.ringK - dt * 2.2)
    ring.visible = fx.ringK > 0 && glow.visible; ring.scale.setScalar(1 + (1 - fx.ringK) * (1.2 + gcol * 0.6)); ring.material.color.setHex(GLOW[gcol]); ring.material.opacity = fx.ringK * 0.9
    // 汗（大きい時だけ）
    const sw = act && !act.feint && act.size === 3 && S.t > act.t0 + act.B
    sweat.forEach((s, i) => { s.visible = !!sw; if (sw) { const ph = (tm * 1.3 + i / 3) % 1; headAt('player', 0.15 - ph * 0.3); s.position.copy(tmpV).add(tmpV2.set((i - 1) * 0.16, 0, 0.05)); s.material.opacity = 1 - ph } })
    if (maskMesh) maskMesh.visible = S.masked && fx.maskT > 1.6
    if (fx.maskT > 0) fx.maskT += dt
  }
  // 椅子が壊れる
  if (S.chairBroken) { fx.breakT += dt; PCHAIR.userData.legs.forEach((l, i) => { l.rotation.z = Math.min(1, fx.breakT * 3) * (i < 2 ? 0.7 : -0.7) }); PCHAIR.userData.seat.position.y = Math.max(0.05, SEAT_H - fx.breakT * 1.2) }
  else { PCHAIR.userData.legs.forEach(l => { l.rotation.z = 0 }); PCHAIR.userData.seat.position.y = SEAT_H }
  if (fx.breakT > 0 && fx.breakT < 0.05) { Snd.play('chairbreak', { vol: 0.9 }); say('neighborR', T().sChairBreak) }
  // 鉛筆が落ちる
  for (const p of PENCILS) {
    const u = p.userData; if (u.fall < 0) continue
    if (u.fall < 2) { u.fall += dt; p.position.addScaledVector(u.v, dt); u.v.y -= 9 * dt; p.rotation.x += u.w * dt; if (p.position.y < 0.01) { p.position.y = 0.01; u.v.set(0, 0, 0); u.w = 0 } }
  }
  if (S.mode === 'title') for (const p of PENCILS) { p.userData.fall = -1 }
  // 周りの人
  const now = S.mode === 'play' ? S.t : 0
  const extNow = k => S.mode === 'play' && S.exts.find(e => e.kind === k && now >= e.tell && now < e.off)
  for (const [k, c] of Object.entries(PEOPLE)) {
    if (k === 'player' || k === 'worker' || k === 'proctor') continue
    c.lookT = Math.max(0, c.lookT - dt)
    const wantTurn = fx.lookAll > 0 || (S.R >= 3 && S.mode === 'play') ? 1 : 0
    c.turn = lerp(c.turn, wantTurn, 1 - Math.exp(-dt * 6))
    c.look = lerp(c.look, c.lookT > 0 ? 1 : 0, 1 - Math.exp(-dt * 8))
    const dx = (pl ? pl.g.position.x : 0) - c.g.position.x, dz = (pl ? pl.g.position.z : 0) - c.g.position.z
    const toP = Math.atan2(dx, dz)
    let diff = toP - c.baseYaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2
    c.g.rotation.y = c.baseYaw + diff * c.turn * 0.8
    if (c.head) { const rest = diff * (1 - c.turn * 0.8); c.head.rotation.y += clamp(rest, -1.3, 1.3) * c.look }
    // くすくす
    if (c.giggle > 0) { c.giggle -= dt; if (c.torso) c.torso.rotation.z += 0.06 * Math.sin(tm * 26) }
    // 書く手
    if (c.armR && c.turn < 0.3) c.armR.rotation.x += -0.3 + 0.06 * Math.sin(tm * 11 + c.phase)
    // おばあちゃんはたまにうとうと
    if (k === 'grandma' && c.head && c.turn < 0.3) c.head.rotation.x += -0.35 * Math.max(0, Math.sin(tm * 0.4 + 1))
  }
  fx.lookAll = Math.max(0, fx.lookAll - dt)
  // くしゃみの予告（頭がのけぞる）
  const sn = extNow('sneeze'), nr = PEOPLE.neighborR
  if (sn && nr && nr.head) { const k = clamp((now - sn.tell) / (sn.on - sn.tell), 0, 1); nr.head.rotation.x += now < sn.on ? 0.55 * k : -0.6 * Math.max(0, 1 - (now - sn.on) * 3) }
  // 転がす鉛筆
  const rl = extNow('roll'), ro = PEOPLE.roller
  if (rl && now >= rl.on) { ROLLP.position.x = 0.12 - 0.12 * Math.sin((now - rl.on) * 6); ROLLP.rotation.x = (now - rl.on) * 20 }
  if (rl && ro && ro.armR && now < rl.on) ro.armR.rotation.z += 0.9
  // 監督のお腹
  const te = extNow('teacher'), pr = PEOPLE.proctor
  if (te && pr && pr.armL && now < te.off) { pr.armL.rotation.y += -0.9; pr.armL.rotation.z += -0.4 }
  // チャイムのランプ
  const ch = extNow('chime'); spkLamp.material.color.setHex(ch ? (Math.sin(tm * 12) > 0 ? 0xff4433 : 0x882222) : 0x552222)
  // 工事
  const dr = extNow('drill'), wk = PEOPLE.worker
  outside.userData.beacon.material.color.setHex(dr ? (Math.sin(tm * 14) > 0 ? 0xffa020 : 0x884400) : 0x663300)
  if (wk) { playA(wk, dr ? 'holding-both' : 'idle'); if (dr && now >= dr.on) wk.g.position.y = 0.42 + 0.02 * Math.sin(tm * 80); else wk.g.position.y = 0.42 }
  if (jack) jack.position.y = 0.42 + (dr && now >= dr.on ? 0.02 * Math.sin(tm * 90) : 0)
  outside.userData.jib.rotation.y = 0.2 * Math.sin(tm * 0.1)
  updateProctor(dt, tm)
  // 時計
  clockT = S.mode === 'play' ? S.t / D.DUR : (S.mode === 'end' || S.mode === 'result' ? 1 : 0)
  const mins = clockT * 60
  clock.userData.m.rotation.z = -mins / 60 * Math.PI * 2
  clock.userData.h.rotation.z = -(10 + mins / 60) / 12 * Math.PI * 2
  clock.userData.s.rotation.z = -(S.mode === 'play' ? S.t * 24 : tm) / 60 * Math.PI * 2 * (S.mode === 'play' ? 60 : 1)
  // カメラ
  const ct = camTarget()
  const ease = 1 - Math.exp(-dt * 2.4)
  camPos.lerp(tmpV.set(...ct.p), ease); camLook.lerp(tmpV2.set(...ct.l), ease)
  fx.camK = Math.max(0, fx.camK - dt * 1.5)
  camera.position.copy(camPos).add(tmpV.set(Math.sin(tm * 0.5) * 0.02, Math.sin(tm * 0.7) * 0.015, 0))
  if (S.mode === 'title') camera.position.x += Math.sin(tm * 0.15) * 0.3
  if (fx.camK > 0) camera.position.lerp(tmpV.set(0.4, 1.55, 1.3), fx.camK * 0.4)
  if (fx.shake > 0) camera.position.x += 0.02 * Math.sin(tm * 60) * fx.shake
  camera.lookAt(camLook)
  renderer.render(scene, camera)
}
function updateProctor(dt, tm) {
  const pr = PEOPLE.proctor; if (!pr) return
  pr.lookT = Math.max(0, pr.lookT - dt)
  // 行き先: マスクを渡す・反応2以上で横に立つ・ふだんは前と通路を見回る
  let tgt
  const nearP = new THREE.Vector3(0.55, 0, -0.35)
  if (S.mode === 'intro' && S.rare.ticket && S.introT < 4.2) tgt = new THREE.Vector3(-0.45, 0, -2.5)
  else if (S.mode === 'play' && (S.R >= 2 || (fx.maskT > 0 && fx.maskT < 2.2))) tgt = nearP
  else if (S.mode === 'play') { const ph = Math.floor(S.t / 18) % 4; tgt = [new THREE.Vector3(0.2, 0, -4.1), new THREE.Vector3(1.55, 0, -2.6), new THREE.Vector3(-1.55, 0, -1.0), new THREE.Vector3(-0.4, 0, -4.0)][ph] }
  else tgt = new THREE.Vector3(0.2, 0, -4.1)
  const d = tmpV.copy(tgt).sub(pr.g.position); d.y = 0
  const dist = d.length()
  if (dist > 0.08) {
    const sp = Math.min(dist, dt * 0.9); pr.g.position.addScaledVector(d.normalize(), sp)
    pr.face = Math.atan2(d.x, d.z); playA(pr, 'walk')
    if (Math.random() < dt * 3) Snd.play('step', { vol: 0.15 })
  } else {
    playA(pr, 'idle')
    const pl = PEOPLE.player
    const toP = pl ? Math.atan2(pl.g.position.x - pr.g.position.x, pl.g.position.z - pr.g.position.z) : 0
    const scan = 0.5 * Math.sin(tm * 0.35)
    const want = (pr.lookT > 0 || S.R >= 2 || (S.mode === 'intro')) ? (S.mode === 'intro' && S.rare.ticket && S.introT < 4.2 ? Math.PI * 0.7 : toP) : (S.mode === 'play' ? toP + scan : 0)
    let df = want - pr.face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2
    pr.face += df * (1 - Math.exp(-dt * 4))
  }
  pr.g.rotation.y = pr.face
  // 受験票の確認
  if (S.mode === 'intro' && S.rare.ticket) {
    if (S.introT > 1.6 && !S._said1) { S._said1 = 1; say('proctor', T().sCheck) }
    if (S.introT > 2.9 && !S._said2) { S._said2 = 1; say('ticket', T().sTicket); playA(PEOPLE.ticket, 'emote-yes', 0.2, 1, true); setTimeout(() => playA(PEOPLE.ticket, 'sit'), 1400) }
  }
  if (S.mode === 'play' && fx.maskT > 1.0 && fx.maskT < 1.0 + dt * 1.5) say('proctor', T().sMask)
  // 最後に監督のお腹が盛大に鳴る（まれ）
  if (S.mode === 'end' && S.teacherBig) { fx.lookAll = 1; for (const k of Object.keys(SEATS)) if (PEOPLE[k] && PEOPLE[k].head) PEOPLE[k].head.rotation.x += 0 }
}

// ---------- 音
Snd.def({
  g1: ['snd/g1a.mp3', 'snd/g1b.mp3', 'snd/g1c.mp3', 'snd/g1d.mp3'], g2: ['snd/g2a.mp3', 'snd/g2b.mp3', 'snd/g2c.mp3', 'snd/g2d.mp3'], g3: ['snd/g3a.mp3', 'snd/g3b.mp3', 'snd/g3c.mp3'], pre: ['snd/pre1.mp3', 'snd/pre2.mp3'],
  cough: ['snd/cough1.mp3', 'snd/cough2.mp3', 'snd/cough3.mp3'], creak: ['snd/creak1.mp3', 'snd/creak2.mp3', 'snd/creak3.mp3'], pen: ['snd/pen1.mp3', 'snd/pen2.mp3', 'snd/pen3.mp3'],
  drill: 'snd/drill.mp3', chime: 'snd/chime.mp3', sneeze: 'snd/sneeze.mp3', roll: ['snd/roll1.mp3', 'snd/roll2.mp3'], giggle: 'snd/giggle.mp3', murmur: 'snd/murmur.mp3',
  step: ['snd/step1.mp3', 'snd/step2.mp3', 'snd/step3.mp3'], paper: ['snd/paper1.mp3', 'snd/paper2.mp3', 'snd/paper3.mp3'], stamp: 'snd/stamp.mp3', chairbreak: 'snd/chairbreak.mp3',
  win: 'snd/win.mp3', lose: 'snd/lose.mp3', mid: 'snd/mid.mp3', click: 'snd/click.mp3',
})
let muted = false
try { muted = localStorage.getItem('et_mute') === '1' } catch (e) {}
Snd.setMute(muted)
function setMuteUI() { $('icOn').toggleAttribute('hidden', muted); $('icOff').toggleAttribute('hidden', !muted) }   // SVG は .hidden が効かないので属性で
setMuteUI()
function soundOn() { Snd.init(); Snd.loop('amb', 'snd/amb.mp3', 0.18) }

// ---------- 画面
const VIEWS = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of VIEWS) $(v).hidden = v !== id }
function toTitle() { S.mode = 'title'; show('vTitle'); for (const f of FLOATS.splice(0)) f.el.remove(); $('bigMsg').hidden = true; tutHint(0); resetPeople() }
function resetPeople() { for (const p of PENCILS) { p.userData.fall = -1 } PENCILS.forEach((p, i) => { p.position.set(0.2 - i * 0.045, DESK_H + 0.03, 0.05 + i * 0.01); p.rotation.set(0, 0.25 - i * 0.12, Math.PI / 2) }); fx.maskT = 0; fx.breakT = 0; S._said1 = S._said2 = 0; if (PEOPLE.proctor) PEOPLE.proctor.g.position.set(0.2, 0, -4.1) }
function startGame(seed) {
  soundOn()
  try { S.tut = localStorage.getItem('et_tut') === '1' ? 2 : 0 } catch (e) { S.tut = 0 }
  if (window.__etNoTut) S.tut = 2
  resetPeople()
  resetState(seed ?? ((Date.now() % 100000) + 1))
  S.mode = 'intro'; S.introT = 0
  $('aSub').textContent = T().subjects[S.subject]
  drawBoard(); buildGrid(); refreshButtons(); show('vPlay')
  for (const f of FLOATS.splice(0)) f.el.remove()
  Snd.play('paper', { vol: 0.6 })
  if (window.TM) TM.start()
}
function buildGrid() { const g = $('aGrid'); if (g.children.length !== D.QN) { g.innerHTML = ''; for (let i = 0; i < D.QN; i++) g.appendChild(document.createElement('i')) } }
function refreshButtons() {
  for (const k of KINDS) {
    const b = $('b_' + k); if (!b) continue
    const left = b.querySelector('.left'); let html = ''
    for (let i = 0; i < D.USES[k]; i++) html += `<i class="${i < S.uses[k] ? '' : 'off'}"></i>`
    left.innerHTML = html
    b.disabled = S.uses[k] <= 0
    let gone = b.querySelector('.gone')
    if (S.uses[k] <= 0) { if (!gone) { gone = document.createElement('span'); gone.className = 'gone'; b.appendChild(gone) } gone.textContent = k === 'cough' ? (LANG === 'ja' ? 'マスク中' : 'masked') : k === 'chair' ? (LANG === 'ja' ? '空気椅子' : 'no chair') : (LANG === 'ja' ? '鉛筆なし' : 'no pens') }
    else if (gone) gone.remove()
  }
}
function updateHud() {
  if (S.mode !== 'play' && S.mode !== 'end') return
  const n = Math.floor(S.prog), cells = $('aGrid').children
  for (let i = 0; i < cells.length; i++) { const c = cells[i], cls = i < n ? 'on' : (i === n && S.prog - n > 0.5 ? 'half' : ''); if (c.className !== cls) c.className = cls }
  $('aNum').textContent = `${n}/${D.QN}`
}

// ---------- 結果
let RES = null, revealTimers = []
function showResult() {
  if (S.mode === 'result') return
  S.mode = 'result'
  for (const f of FLOATS.splice(0)) f.el.remove()
  $('bigMsg').hidden = true; tutHint(0)
  try { localStorage.setItem('et_tut', '1') } catch (e) {}
  RES = judge()
  const t = T()
  $('rSub').textContent = t.subjects[S.subject]
  $('rv1').innerHTML = `${RES.rumble}<small>${t.rUnit}</small>`
  $('rv2').innerHTML = `${RES.safe}<small>${t.rUnit}</small>`
  $('rv3').innerHTML = `${RES.bust}<small>${t.rUnit}</small>`
  $('rv4').innerHTML = `${RES.ans}<small>/${D.QN}${t.rQ}</small>`
  const nm = RES.blank ? t.blank : t.rankName[RES.rank]
  $('rName').textContent = nm
  $('rCmt').textContent = S.teacherBig ? t.teacherRare : (RES.blank ? t.blankCmt : t.rankCmt[RES.rank])
  $('rHanko').textContent = RES.blank ? (LANG === 'ja' ? '白' : '0') : RES.rank
  for (const id of ['r1', 'r2', 'r3', 'r4']) $(id).classList.remove('on')
  $('rHanko').classList.remove('on'); $('rRank').classList.remove('on'); $('rBtns').classList.remove('on')
  show('vResult')
  revealTimers.forEach(clearTimeout); revealTimers = []
  const at = (ms, f) => revealTimers.push(setTimeout(f, ms))
  ;['r1', 'r2', 'r3', 'r4'].forEach((id, i) => at(450 + i * 520, () => { $(id).classList.add('on'); Snd.play('paper', { vol: 0.7 }) }))
  at(2700, () => { $('rHanko').classList.add('on'); Snd.play('stamp', { vol: 1 }); Snd.play(['S', 'A'].includes(RES.rank) && !RES.blank ? 'win' : (['B', 'C'].includes(RES.rank) ? 'mid' : 'lose'), { vol: 0.8, delay: 0.15 }); fx.lookAll = 3 })
  at(2950, () => $('rRank').classList.add('on'))
  at(3500, () => $('rBtns').classList.add('on'))
  if (window.TM) TM.end(Math.max(0, RES.val), true)
}
function revealAll() { revealTimers.forEach(clearTimeout); revealTimers = [];['r1', 'r2', 'r3', 'r4'].forEach(id => $(id).classList.add('on')); $('rHanko').classList.add('on'); $('rRank').classList.add('on'); $('rBtns').classList.add('on') }
function resultCanvas() {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'), t = T()
  const M = getComputedStyle(document.documentElement).getPropertyValue('--mincho'), H = getComputedStyle(document.documentElement).getPropertyValue('--hand')
  x.fillStyle = '#2b3a33'; x.fillRect(0, 0, 1080, 1350)
  x.save(); x.translate(540, 675); x.rotate(0.012); x.fillStyle = '#f6f1e3'; x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 40; x.fillRect(-440, -580, 880, 1160); x.restore()
  x.fillStyle = '#24211d'; x.textBaseline = 'alphabetic'
  x.font = `800 64px ${M}`; x.fillText(t.title, 150, 200)
  x.font = `600 30px ${M}`; x.fillText(t.resHd + '  ' + t.subjects[S.subject], 150, 252)
  x.fillRect(150, 275, 780, 4)
  const rows = [[t.rRumble, `${RES.rumble}${t.rUnit}`], [t.rSafe, `${RES.safe}${t.rUnit}`], [t.rBust, `${RES.bust}${t.rUnit}`], [t.rAns, `${RES.ans}/${D.QN}${t.rQ}`]]
  rows.forEach(([k, v], i) => {
    const y = 380 + i * 120
    x.fillStyle = '#24211d'; x.font = `600 40px ${M}`; x.fillText(k, 170, y)
    x.fillStyle = '#9fb7c9'; x.fillRect(150, y + 34, 780, 2)
    x.fillStyle = '#d0281e'; x.font = `86px ${H}`; x.fillText(v, 520, y + 14)
  })
  x.save(); x.translate(270, 1000); x.rotate(-0.25); x.strokeStyle = '#d0281e'; x.lineWidth = 10; x.beginPath(); x.arc(0, 0, 105, 0, 7); x.stroke()
  x.fillStyle = '#d0281e'; x.font = `800 120px ${M}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(RES.blank ? (LANG === 'ja' ? '白' : '0') : RES.rank, 0, 6); x.restore()
  x.fillStyle = '#d0281e'; x.font = `64px ${H}`; x.textAlign = 'left'
  const nm = RES.blank ? t.blank : t.rankName[RES.rank]; x.fillText(nm, 420, 990, 520)
  x.fillStyle = '#24211d'; x.font = `600 34px ${M}`; x.fillText(S.teacherBig ? t.teacherRare : (RES.blank ? t.blankCmt : t.rankCmt[RES.rank]), 420, 1060, 520)
  x.fillStyle = '#7a6f5c'; x.font = `600 26px ${M}`; x.fillText('tom3games.github.io/exam-tummy', 150, 1215)
  return c
}
async function saveImage() {
  if (window.TM) TM.share('save')
  const c = resultCanvas()
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  const file = new File([blob], 'exam-tummy.png', { type: 'image/png' })
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return } } catch (e) { if (e && e.name === 'AbortError') return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'exam-tummy.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}
function xUrl() {
  const t = T(), r = { ...RES, rank: RES.blank ? t.blank : t.rankName[RES.rank] }
  return `https://x.com/intent/post?text=${encodeURIComponent(t.xText(r))}&url=${encodeURIComponent(D.URL)}`
}

// ---------- 入力
$('bStart').onclick = () => { Snd.init(); Snd.play('click', { vol: 0.6 }); startGame() }
$('bHow').onclick = () => { Snd.init(); show('vHow') }
$('bHowBack').onclick = () => show('vTitle')
$('bAgain').onclick = () => startGame()
$('bTitle').onclick = () => toTitle()
$('bSave').onclick = () => saveImage()
$('bX').onclick = () => { if (window.TM) TM.share('x'); window.open(xUrl(), '_blank', 'noopener') }
$('bLang').onclick = () => { LANG = LANG === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('et_lang', LANG) } catch (e) {} applyLang(); if (S.mode === 'result' && RES) { const keep = [...document.querySelectorAll('#vResult .on')].length; S.mode = 'end'; showResult(); if (keep) revealAll() } }
$('bMute').onclick = () => { muted = !muted; Snd.init(); Snd.setMute(muted); try { localStorage.setItem('et_mute', muted ? '1' : '0') } catch (e) {} setMuteUI() }
for (const k of KINDS) $('b_' + k).addEventListener('pointerdown', e => { e.preventDefault(); press(k) })
addEventListener('keydown', e => { const i = ['1', '2', '3'].indexOf(e.key); if (i >= 0) press(KINDS[i]) })
document.addEventListener('visibilitychange', () => { if (document.hidden) lastT = 0 })

// ---------- ループ（固定60Hz）
let lastT = 0, acc = 0
function frame(now) {
  requestAnimationFrame(frame)
  const t = now / 1000, dt = lastT ? Math.min(0.1, t - lastT) : DT; lastT = t
  if (!S.dbgPause) { acc += dt; let n = 0; while (acc >= DT && n < 8) { step(); acc -= DT; n++ } if (n >= 8) acc = 0 }
  if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('bigMsg').hidden = true }
  updateHud()
  updateFloats(dt)
  render(S.dbgPause ? 0 : dt)
}

// ---------- 検証用の窓口
window.ET = {
  S, D, PEOPLE, CAM, judge, press, camera, scene, renderer, FLOATS, xUrl, resultCanvas,
  get charsReady() { return charsReady },
  state: () => ({ mode: S.mode, t: +S.t.toFixed(2), rumble: S.rumble, safe: S.safe, bust: S.bust, ext: S.extSafe, wasted: S.wasted, R: S.R, uses: { ...S.uses }, prog: +S.prog.toFixed(2), masked: S.masked, chairBroken: S.chairBroken }),
  texts: () => FLOATS.length + (!$('hint').hidden ? 1 : 0) + (!$('bigMsg').hidden ? 1 : 0),
  dbg: {
    pause(on) { S.dbgPause = on },
    start(seed, o = {}) { if (o.noTut) window.__etNoTut = true; startGame(seed); S.introT = 99; step() },
    tick(n = 1) { for (let i = 0; i < n; i++) step() },
    step(n = 1) { for (let i = 0; i < n; i++) step(); render(DT * n > 0.1 ? 0.1 : DT * n) },
    render() { render(0) },
    frames(n = 1) { for (let i = 0; i < n; i++) render(DT) },
    fx,
    snapCam() { const ct = camTarget(); camPos.set(...ct.p); camLook.set(...ct.l); render(0) },
    finish() { if (S.tut === 0) { S.tut = 2; S.speed = 1; tutHint(0) } let n = 0; while ((S.mode === 'play' || S.mode === 'end' || S.mode === 'intro') && n++ < 60 * 400) step() },
    result() { showResult(); revealAll() },
  },
}
applyLang()
toTitle()
requestAnimationFrame(frame)
window.__jsUp = true
// ロード画面: 人物と音の本物の読み込みで進み、そろったら消す。遅い回線でも12秒で必ず消す
{
  let shown = 0, done = false
  const set = p => { shown = Math.max(shown, Math.min(1, p)); $('boot').style.setProperty('--p', shown.toFixed(3)) }
  let got = 0
  THREE.DefaultLoadingManager.onProgress = () => {}
  set(0.08)
  const finish = () => { if (done) return; done = true; set(1); setTimeout(() => { $('boot').classList.add('out'); setTimeout(() => { $('boot').hidden = true; window.__etReady = true }, 380) }, 200) }
  const fontP = (document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]) : Promise.resolve()).then(() => { drawBoard(); set(shown + 0.1) })
  const charP = Promise.all(CHAR_FILES.map(n => new Promise(res => loader.load(`chars/character-${n}.glb`, g => { MODELS[n] = g; got++; set(0.12 + 0.78 * got / CHAR_FILES.length); res() }, undefined, () => res())))).then(() => { charsReady = true; setupPeople() })
  Promise.all([charP, fontP]).then(finish)
  setTimeout(finish, 12000)
}

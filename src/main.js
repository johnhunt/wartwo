import { Game } from './sim.js';
import { Renderer, VIEW, MINI, SCREEN, setScreenWidth } from './render.js';
import { Lockstep, Lobby } from './net.js';
import { TILE, TICK_MS, UNITS, BUILDINGS, MAX_SELECT, nameOf } from './data.js';
import { TEAM_COLORS, teamCSS } from './palette.js';
import * as sfx from './audio/sfx.js';
import * as music from './audio/music.js';
import * as speech from './audio/speech.js';
import * as GA from './audio/game-audio.js';
import { settings, setSetting, whenUnlocked, holdAudio } from './audio/core.js';
import { cursorSprite, prewarm, warmStep, stonePanel } from './sprites.js';

const $ = (id) => document.getElementById(id);
const cv = $('screen'), overlay = $('overlay');
Renderer.overlay = overlay;
let game = null, R = null, LS = null, lobby = null, running = false, paused = false;
let ui = null;

// ------------------------------------------------------------------ scaling
function fit() {
  // Always fit the whole picture on screen (phones scale it down), and widen the map view to use
  // whatever width the window or phone has beyond 4:3.
  const iw = window.innerWidth, ih = window.innerHeight, s = Math.min(iw / 640, ih / 480);
  const k = s >= 2 ? Math.floor(s) : s; // integer scale when big enough
  setScreenWidth(Math.floor(iw / k));
  if (cv.width !== SCREEN.w) cv.width = SCREEN.w;
  cv.style.width = overlay.style.width = (SCREEN.w * k) + 'px'; cv.style.height = overlay.style.height = (480 * k) + 'px';
  // the text overlay is backed by real device pixels
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(SCREEN.w * k * dpr); overlay.height = Math.round(480 * k * dpr);
}
window.addEventListener('orientationchange', () => setTimeout(fit, 250));
const coarse = () => !!window.matchMedia?.('(pointer: coarse)').matches;
// phones: play fullscreen and sideways where the browser allows it (needs a tap, so it is called from Start buttons)
function goImmersive() { if (!coarse() || document.fullscreenElement) return; document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); }
function toggleFullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
$('b-full').onclick = $('pz-full').onclick = () => { sfx.play('click'); toggleFullscreen(); };
window.addEventListener('resize', fit); fit();

// menus share the in-game carved stone texture
try { document.documentElement.style.setProperty('--stone-img', `url(${stonePanel(176, 208, 5).toDataURL()})`); } catch { /* cosmetic only */ }

// ------------------------------------------------------------------ menus
const panels = ['p-title', 'p-sp', 'p-mp', 'p-room', 'p-help', 'p-pause', 'p-sound'];
function show(id) { $('menu').classList.toggle('hidden', !id); for (const p of panels) $(p).classList.toggle('hidden', p !== id); }
const store = { get(k, d) { try { return localStorage.getItem('wartwo.' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('wartwo.' + k, v); } catch { /* ignore */ } } };
const defaultName = store.get('name', 'Commander' + Math.floor(Math.random() * 900 + 100));
$('sp-name').value = $('mp-name').value = defaultName;
$('sp-faction').value = $('mp-faction').value = store.get('faction', '0');
$('sp-level').value = store.get('level', '0');
$('sp-seed').value = Math.floor(Math.random() * 99999);
$('mp-title').value = defaultName + "'s battle";

$('b-sp').onclick = () => { sfx.play('click'); show('p-sp'); };
$('b-help').onclick = () => { sfx.play('click'); show('p-help'); };
$('help-back').onclick = () => show(running ? 'p-pause' : 'p-title');
$('sp-back').onclick = () => show('p-title');

// ------------------------------------------------------------------ sound settings
music.playlist('menu');
whenUnlocked(() => { $('snd-hint').style.visibility = 'hidden'; }); // keep its space: removing it would shift the buttons mid-tap
let soundBack = 'p-title';
function openSound(from) {
  soundBack = from; sfx.play('click');
  $('snd-music').value = settings.music; $('snd-sfx').value = settings.sfx; $('snd-speech').value = settings.speech; $('snd-voice').value = settings.voiceMode === 'off' ? 'off' : 'voices';
  speech.preload([0, 1]);
  show('p-sound');
}
$('b-sound').onclick = () => openSound('p-title');
$('pz-sound').onclick = () => openSound('p-pause');
$('snd-back').onclick = () => { sfx.play('click'); show(soundBack); };
for (const k of ['music', 'sfx', 'speech']) $('snd-' + k).oninput = (e) => { setSetting(k, +e.target.value); if (k === 'sfx') sfx.play('sword'); };
$('snd-voice').onchange = (e) => { setSetting('voiceMode', e.target.value); speech.preview(0); };
$('snd-test0').onclick = () => speech.unitLine(['worker', 'soldier', 'archer', 'knight', 'siege'][Math.floor(Math.random() * 5)], 0, 'select');
$('snd-test1').onclick = () => speech.unitLine(['worker', 'soldier', 'archer', 'knight', 'siege'][Math.floor(Math.random() * 5)], 1, 'select');
$('snd-next').onclick = () => music.skip();
music.onTrack((t) => { $('snd-now').textContent = t; });
$('sp-go').onclick = () => {
  goImmersive();
  const name = $('sp-name').value.trim() || 'Commander', faction = +$('sp-faction').value;
  store.set('name', name); store.set('faction', faction);
  const n = +$('sp-opp').value, level = +$('sp-level').value, players = [{ name, faction, color: 0 }];
  store.set('level', level);
  for (let i = 0; i < n; i++) players.push({ name: 'Computer ' + (i + 1), faction: (faction + 1 + i) % 2 === 0 && i > 0 ? faction : 1 - faction, color: i + 1, ai: true, level });
  startGame({ seed: +$('sp-seed').value || 1, size: +$('sp-size').value, players }, 0, null);
};

$('b-mp').onclick = async () => {
  sfx.play('click'); show('p-mp'); music.playlist('lobby');
  if (lobby) return;
  const name = $('mp-name').value.trim() || 'Commander';
  lobby = new Lobby(name, renderLobby);
  lobby.on('start', (d) => { const slot = d.players.findIndex(p => p.peer === lobby.selfId); startGame(d, slot, lobby); });
  lobby.on('msg', (m) => { if (running) return; $('mp-status').textContent = m; show('p-mp'); });
  try { await lobby.connect(); $('mp-status').textContent = 'connected — looking for games'; }
  catch (e) { console.error(e); $('mp-status').textContent = 'could not load networking: ' + e.message; lobby = null; }
  renderLobby();
};
$('mp-name').onchange = () => { if (lobby) { lobby.name = $('mp-name').value.trim() || 'Commander'; lobby.sayHello(); } store.set('name', $('mp-name').value); };
$('mp-back').onclick = () => { if (lobby) { lobby.leaveGame(); } show('p-title'); music.playlist('menu'); };
$('mp-host').onclick = () => {
  if (!lobby || !lobby.a) return;
  lobby.name = $('mp-name').value.trim() || 'Commander';
  lobby.host($('mp-title').value.trim() || 'Battle', +$('mp-faction').value, +$('mp-max').value, +$('mp-size').value);
  show('p-room');
};
$('room-ai0').onclick = () => lobby && lobby.addAI(0);
$('room-ai1').onclick = () => lobby && lobby.addAI(1);
$('room-leave').onclick = () => { lobby && lobby.leaveGame(); show('p-mp'); };
$('room-start').onclick = () => {
  if (!lobby || !lobby.hosting) return;
  goImmersive();
  const d = lobby.start(Math.floor(Math.random() * 1e9));
  startGame(d, 0, lobby);
};

function esc(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function renderLobby() {
  if (!lobby) return;
  const games = lobby.openGames();
  const gl = $('mp-games');
  gl.innerHTML = games.length ? '' : `<div class="muted" style="padding:8px">No open games yet. Host one, or wait for others… (${lobby.peers.size} players online)</div>`;
  for (const g of games) {
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<span><b>${esc(g.title)}</b><br><span class="muted">${esc(g.players.join(', '))} · ${g.players.length}/${g.max} · ${g.size}×${g.size}</span></span>`;
    const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Join';
    b.disabled = g.players.length >= g.max;
    b.onclick = () => { lobby.name = $('mp-name').value.trim() || 'Commander'; lobby.join(g.id, +$('mp-faction').value); show('p-room'); };
    el.appendChild(b); gl.appendChild(el);
  }
  // room
  const r = lobby.roster; const isHost = !!lobby.hosting;
  $('room-title').textContent = r ? r.title : 'Joining…';
  $('room-host-tools').classList.toggle('hidden', !isHost);
  $('room-start').classList.toggle('hidden', !isHost);
  $('room-note').textContent = isHost ? (r && r.slots.length < 2 ? 'Waiting for players… (add a computer player or wait for someone to join)' : 'Ready when you are.') : (r ? 'Waiting for the host to start…' : 'Contacting host…');
  $('room-start').disabled = !r || r.slots.length < 2;
  const sl = $('room-slots'); sl.innerHTML = '';
  if (r) r.slots.forEach((s, i) => {
    const el = document.createElement('div'); el.className = 'item';
    el.innerHTML = `<span><span class="swatch" style="background:${TEAM_COLORS[i][2]}"></span>${esc(s.name)} <span class="muted">${s.faction ? 'Ashen Warband' : 'Kingdom of Vale'}${s.ai ? ' · computer' : ''}${i === 0 ? ' · host' : ''}</span></span>`;
    if (isHost && i > 0) { const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Remove'; b.onclick = () => lobby.removeSlot(i); el.appendChild(b); }
    sl.appendChild(el);
  });
}

// pause menu
$('pz-resume').onclick = () => { show(null); if (!LS || !LS.online) paused = false; };
$('pz-quit').onclick = () => {
  if (LS && game && !game.over) LS.issue({ t: 'resign' });
  setTimeout(() => { running = false; GA.detach(); music.playlist('menu'); if (lobby) { lobby.close(); lobby = null; } show('p-title'); }, 400);
  show(null); paused = false;
};

// ------------------------------------------------------------------ game start
function startGame(opts, mySlot, lob) {
  game = new Game(opts);
  R = new Renderer(cv, game, mySlot);
  LS = new Lockstep(game, opts.players, mySlot, lob);
  if (lob) lob.on('chat', (d, peer) => { const s = opts.players.findIndex(p => p.peer === peer); addMsg((s >= 0 ? opts.players[s].name : '?') + ': ' + String(d.text).slice(0, 80)); sfx.play('menu'); });
  ui = {
    selection: [], mode: null, menu: null, msgs: [], mouse: { x: 320, y: 240, inView: false }, drag: null, buttons: [], hoverBtn: null,
    groups: {}, marker: null, ping: null, lastAlert: null, players: opts.players, lastGroup: null, lastGroupT: 0,
  };
  prewarm([...new Set(opts.players.map(p => p.faction))]);
  running = true; paused = false; show(null);
  window.__wartwo = { game, R, LS, ui };
  addMsg('Gather gold and lumber, build farms and raise an army!');
  GA.attach(game, R, mySlot, addMsg, VIEW);
  last = performance.now(); acc = 0;
}
function addMsg(text) { ui.msgs.push({ text, t: performance.now() }); if (ui.msgs.length > 20) ui.msgs.shift(); }

// ------------------------------------------------------------------ loop
let last = performance.now(), acc = 0, alertT = 0, lastFrame = last, wasFrozen = false, frozenAt = 0, audioHeld = false;
function isFrozen() { return running && paused && !!LS && !LS.online; }
function loop(now) {
  requestAnimationFrame(loop);
  warmStep(running ? 4 : 8);
  const fdt = Math.min(50, now - lastFrame); lastFrame = now;
  // a paused single-player game is frozen completely: no simulation, no orders, no sound or music
  const frozen = isFrozen();
  if (frozen && !wasFrozen) frozenAt = now; wasFrozen = frozen;
  const hold = frozen && $('p-sound').classList.contains('hidden') && now - frozenAt > 200; // (the sound settings screen still needs to be heard)
  if (hold !== audioHeld) { audioHeld = hold; holdAudio(hold); }
  if (!running) { drawTitleBackdrop(now); return; }
  advance(now);
  scroll(fdt);
  ui.paused = frozen && $('menu').classList.contains('hidden');
  updateHover();
  ui.netStatus = LS.online ? (LS.desync ? 'DESYNC!' : LS.waiting ? 'Waiting for players…' : '') : (paused ? 'PAUSED' : '');
  ui.selection = ui.selection.filter(id => { const e = game.get(id); return e && !e.hidden; });
  ui.touch = touchMode;
  if (ui.mode === 'place') { ui.placeAt = touchMode && ui.placeFixed ? ui.placeFixed : placeTile(); if (touchMode) ui.mouse.inView = true; }
  if (!paused || LS.online) GA.ambience(now); // a paused world is a silent one
  R.draw(Math.min(1, acc / TICK_MS), ui);
  drawCursor();
}
function advance(now) {
  let dt = now - last; last = now; if (dt > 500) dt = 500;
  if (paused && !LS.online) return;
  acc += dt;
  let n = 0;
  while (acc >= TICK_MS && n++ < 12) {
    if (!LS.ready()) { acc = Math.min(acc, TICK_MS); break; }
    LS.step(); acc -= TICK_MS; drainEvents();
  }
}
// keep the lockstep alive when the tab is in the background (rAF stops there)
setInterval(() => { if (running && document.hidden) advance(performance.now()); }, 200);

function onScreen(x, y) { return x * TILE >= R.cam.x - 64 && x * TILE <= R.cam.x + VIEW.w + 64 && y * TILE >= R.cam.y - 64 && y * TILE <= R.cam.y + VIEW.h + 64; }
function drainEvents() {
  const me = LS.mySlot;
  for (const ev of game.events) {
    R.onEvent(ev);
    GA.event(ev);
    switch (ev.t) {
      case 'msg': if (ev.p === me || ev.p === -1) addMsg(ev.text); break;
      case 'built': if (ev.p === me) addMsg(nameOf(ev.type, game.players[me].faction) + ' complete.'); break;
      case 'attacked':
        if (ev.p === me && performance.now() - alertT > 8000 && !onScreen(ev.x, ev.y)) { alertT = performance.now(); addMsg('We are under attack! (Space to look)'); ui.ping = { x: ev.x, y: ev.y, t: 90 }; ui.lastAlert = { x: ev.x, y: ev.y }; }
        break;
      case 'defeat': if (ev.p === me) { ui.banner = 'Defeat'; ui.subBanner = 'Your forces have been destroyed. Press F10 to leave.'; R.revealAll = true; } else addMsg(game.players[ev.p].name + ' has been defeated!'); break;
      case 'over': {
        const won = me >= 0 && game.players[me].team === ev.team, draw = ev.draw && me >= 0 && !game.players[me].defeated;
        ui.banner = won ? 'Victory!' : draw ? 'Stalemate' : 'Defeat';
        ui.subBanner = won ? 'The land is yours. Press F10 to leave.' : draw ? 'No army can be raised by either side. Press F10 to leave.' : 'Press F10 to leave.';
        R.revealAll = true; break;
      }
    }
  }
  game.events.length = 0;
}

// ------------------------------------------------------------------ input
function canvasPos(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) * SCREEN.w / r.width), Math.floor((e.clientY - r.top) * 480 / r.height)]; }
function inView(x, y) { return x >= VIEW.x && y >= VIEW.y && x < VIEW.x + VIEW.w && y < VIEW.y + VIEW.h; }
function inMini(x, y) { return x >= MINI.x && y >= MINI.y && x < MINI.x + MINI.s && y < MINI.y + MINI.s; }
function miniToTile(x, y) { return [Math.floor((x - MINI.x) / MINI.s * game.w), Math.floor((y - MINI.y) / MINI.s * game.h)]; }
function btnAt(x, y) { return ui.buttons.find(b => b.rect && b.act && x >= b.rect[0] && y >= b.rect[1] && x < b.rect[0] + b.rect[2] && y < b.rect[1] + b.rect[3]); }
function placeTile() {
  const [wx, wy] = R.screenToWorld(ui.mouse.x, ui.mouse.y); const s = BUILDINGS[ui.buildType].size;
  return [Math.floor(wx / TILE - s / 2 + 0.5), Math.floor(wy / TILE - s / 2 + 0.5)];
}
function mySel() { return ui.selection.map(id => game.get(id)).filter(e => e && e.owner === LS.mySlot); }
// kind: speech response — 'ack' | 'attack' | 'work' | 'build' | null
function issue(cmd, kind = 'ack') { LS.issue(cmd); if (kind) GA.ordered(mySel(), kind); }

let lastClick = 0;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!running || isFrozen()) return;
  const [x, y] = canvasPos(e); ui.mouse.x = x; ui.mouse.y = y; ui.mouseDown = true;
  // right or middle button: drag to slide the map; a right click that doesn't move is an order
  if (e.button === 1 || (e.button === 2 && inView(x, y) && !ui.mode)) { e.preventDefault(); ui.pan = { x, y, cx: R.cam.x, cy: R.cam.y, moved: e.button === 1, button: e.button }; return; }
  if (e.button === 2) { rightClick(x, y); return; }
  if (e.button !== 0) return;
  if (x >= 8 && x < 168 && y >= 440 && y < 458) { openMenu(); return; }
  const b = btnAt(x, y); if (b) { pressButton(b); return; }
  if (inMini(x, y)) {
    if (ui.mode === 'target') { const [tx, ty] = miniToTile(x, y); targetAt(tx, ty, null, e.shiftKey); return; }
    ui.miniDrag = true; const [tx, ty] = miniToTile(x, y); R.centerOn(tx * TILE, ty * TILE); return;
  }
  if (!inView(x, y)) return;
  if (ui.mode === 'place') {
    const [tx, ty] = ui.placeAt; const w = mySel().find(u => u.unit && UNITS[u.type].worker);
    if (w) { issue({ t: 'build', ids: [w.id], btype: ui.buildType, x: tx, y: ty }, 'build'); sfx.play('place'); if (!e.shiftKey) { ui.mode = null; ui.menu = null; } }
    return;
  }
  if (ui.mode === 'target') {
    const [wx, wy] = R.screenToWorld(x, y); const t = R.entityAt(wx, wy);
    targetAt(Math.floor(wx / TILE), Math.floor(wy / TILE), t, e.shiftKey); return;
  }
  ui.drag = { x0: x, y0: y, x1: x, y1: y, active: false, shift: e.shiftKey, ctrl: e.ctrlKey };
});
window.addEventListener('mousemove', e => {
  if (!running) return;
  touchMode = false;
  const [x, y] = canvasPos(e); ui.mouse.x = x; ui.mouse.y = y; ui.mouse.inView = inView(x, y);
  if (ui.pan) {
    const p = ui.pan; if (Math.abs(x - p.x) + Math.abs(y - p.y) > 5) p.moved = true;
    if (p.moved) { R.cam.x = p.cx - (x - p.x); R.cam.y = p.cy - (y - p.y); R.clampCam(); }
  }
  if (ui.miniDrag) { const [tx, ty] = miniToTile(Math.max(MINI.x, Math.min(MINI.x + MINI.s - 1, x)), Math.max(MINI.y, Math.min(MINI.y + MINI.s - 1, y))); R.centerOn(tx * TILE, ty * TILE); }
  if (ui.drag) { ui.drag.x1 = Math.max(VIEW.x, Math.min(VIEW.x + VIEW.w - 1, x)); ui.drag.y1 = Math.max(VIEW.y, Math.min(VIEW.y + VIEW.h - 1, y)); if (Math.abs(ui.drag.x1 - ui.drag.x0) + Math.abs(ui.drag.y1 - ui.drag.y0) > 5) ui.drag.active = true; }
});
window.addEventListener('mouseup', e => {
  if (!running) return;
  ui.mouseDown = false; ui.miniDrag = false;
  if (ui.pan && e.button === ui.pan.button) { const p = ui.pan; ui.pan = null; if (!p.moved) rightClick(p.x, p.y); return; }
  if (e.button !== 0 || !ui.drag) return;
  const d = ui.drag; ui.drag = null;
  if (d.active) boxSelect(d);
  else clickSelect(d.x0, d.y0, d.shift, performance.now() - lastClick < 350 || d.ctrl);
  lastClick = performance.now();
});

// mouse wheel / two-finger trackpad scroll slides the map
cv.addEventListener('wheel', e => {
  if (!running || !R) return; e.preventDefault();
  const r = cv.getBoundingClientRect(), k = (e.deltaMode === 1 ? 24 : 1) * SCREEN.w / r.width;
  R.cam.x += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k; R.cam.y += (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k; R.clampCam();
}, { passive: false });
cv.addEventListener('auxclick', e => e.preventDefault());

function boxSelect(d) {
  const [ax, ay] = R.screenToWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
  const [bx, by] = R.screenToWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
  const hits = game.ents.filter(e => !e.dead && !e.hidden && e.unit && e.owner === LS.mySlot && (e._px ?? 0) + 24 >= ax && (e._px ?? 0) + 8 <= bx && (e._py ?? 0) + 24 >= ay && (e._py ?? 0) + 8 <= by);
  let sel = d.shift ? mySel().filter(e => e.unit) : [];
  for (const h of hits) if (!sel.includes(h)) sel.push(h);
  if (!sel.length) return;
  ui.selection = sel.slice(0, MAX_SELECT).map(e => e.id); ui.menu = null; GA.selected(sel);
}
function clickSelect(x, y, shift, all, picked) {
  const [wx, wy] = R.screenToWorld(x, y); const t = picked !== undefined ? picked : R.entityAt(wx, wy);
  if (!t) { if (!shift) { ui.selection = []; ui.menu = null; } return; }
  if (all && t.owner === LS.mySlot && t.unit) {
    const vis = game.ents.filter(e => !e.dead && !e.hidden && e.owner === LS.mySlot && e.type === t.type && e._px >= R.cam.x - 16 && e._px <= R.cam.x + VIEW.w && e._py >= R.cam.y - 16 && e._py <= R.cam.y + VIEW.h);
    ui.selection = vis.slice(0, MAX_SELECT).map(e => e.id);
  } else if (shift && t.owner === LS.mySlot && t.unit && mySel().every(e => e.unit)) {
    if (ui.selection.includes(t.id)) ui.selection = ui.selection.filter(i => i !== t.id);
    else if (ui.selection.length < MAX_SELECT) ui.selection.push(t.id);
  } else ui.selection = [t.id];
  ui.menu = null; GA.selected([t]);
}

function rightClick(x, y) {
  if (ui.mode) { ui.mode = null; if (ui.menu && ui.menu !== 'build' && ui.menu !== 'build2') ui.menu = null; return; }
  let tx, ty, t = null;
  if (inMini(x, y)) [tx, ty] = miniToTile(x, y);
  else if (inView(x, y)) { const [wx, wy] = R.screenToWorld(x, y); t = R.entityAt(wx, wy); tx = Math.floor(wx / TILE); ty = Math.floor(wy / TILE); }
  else return;
  const sel = mySel(); if (!sel.length) return;
  const enemy = t && t.owner >= 0 && t.owner !== LS.mySlot && game.enemies(LS.mySlot, t.owner);
  const harvest = (t && t.type === 'mine') || (!t && game.isTree(tx, ty)) || (game.canRepair(LS.mySlot, t) && sel.some(e => e.unit && UNITS[e.type].worker));
  issue({ t: 'smart', ids: sel.map(e => e.id), x: tx, y: ty, target: t ? t.id : 0 }, enemy ? 'attack' : harvest ? 'work' : 'ack');
  ui.marker = { x: tx * TILE + 16, y: ty * TILE + 16, t: 16, color: enemy ? '#f33' : '#3f3' };
}

function targetAt(tx, ty, t, shift) {
  const sel = mySel(); const ids = sel.map(e => e.id);
  const kind = ui.targetKind;
  if (kind === 'move') issue({ t: 'move', ids, x: tx, y: ty });
  else if (kind === 'attack') { if (t && t.owner !== LS.mySlot && t.type !== 'mine') issue({ t: 'attack', ids, target: t.id }, 'attack'); else issue({ t: 'amove', ids, x: tx, y: ty }, 'attack'); }
  else if (kind === 'repair') { if (game.canRepair(LS.mySlot, t)) issue({ t: 'repair', ids, target: t.id }, 'work'); else { sfx.play('error'); addMsg('Choose one of your damaged buildings.'); return; } }
  else if (kind === 'gather') { if (t && t.type === 'mine') issue({ t: 'gather', ids, target: t.id }, 'work'); else if (game.isTree(tx, ty)) issue({ t: 'gather', ids, x: tx, y: ty }, 'work'); else { sfx.play('error'); addMsg('Choose a gold mine or a tree.'); return; } }
  ui.marker = { x: tx * TILE + 16, y: ty * TILE + 16, t: 16, color: kind === 'attack' ? '#f33' : '#3f3' };
  if (!shift) ui.mode = null;
}

function pressButton(b) {
  if (b.disabled) { addMsg(b.cost || 'Not available'); sfx.play('error'); return; }
  sfx.play('click');
  const a = b.act; const ids = mySel().map(e => e.id);
  if (a.k === 'cmd') { issue({ t: a.t, ids }, a.t === 'cancel' ? null : 'ack'); ui.mode = null; }
  else if (a.k === 'target') { ui.mode = 'target'; ui.targetKind = a.t; ui.targetLabel = b.label; }
  else if (a.k === 'menu') { ui.menu = a.menu; ui.mode = null; }
  else if (a.k === 'place') { ui.mode = 'place'; ui.buildType = a.btype; ui.placeFixed = null; }
  else if (a.k === 'train') issue({ t: 'train', ids, utype: a.utype }, null);
}

function updateHover() {
  if (touchMode) { if (performance.now() > (ui.hoverUntil || 0)) ui.hoverBtn = null; return; } // a tapped button keeps its label up briefly
  const b = btnAt(ui.mouse.x, ui.mouse.y); ui.hoverBtn = b ? b.id : null;
}

function nextIdleWorker() {
  const idle = game.ents.filter(u => u.owner === LS.mySlot && u.unit && UNITS[u.type].worker && !u.order && !u.hidden && !u.dead);
  if (!idle.length) { addMsg('No idle workers.'); return; }
  const next = idle[(idle.findIndex(u => u.id === ui.selection[0]) + 1) % idle.length];
  ui.selection = [next.id]; ui.menu = null; ui.mode = null; R.centerOn(next.x * TILE + 16, next.y * TILE + 16); GA.selected([next]);
}

// ------------------------------------------------------------------ touch controls
// Tap: select your own units, or send the selected ones there (move / attack / harvest / repair).
// Drag: slide the map. Hold, then drag: box-select. Double tap a unit: select all of its kind on screen.
// Tap the info panel to deselect; with nothing selected it offers "idle worker" and "last alert".
let touchMode = false, tch = null, lastTap = { t: 0, x: 0, y: 0 };
const INFO = { x: 8, y: 150, w: 160, h: 112 };
function pickAt(wx, wy) {
  const exact = R.entityAt(wx, wy); if (exact && exact.unit) return exact;
  let best = null, bd = 24 * 24; // fingers are blunt: take the nearest unit within reach before any building underneath
  for (const e of game.ents) {
    if (!e.unit || e.dead || e.hidden || e._px === undefined || (!R.ally(e.owner) && !R.isVisible(e))) continue;
    const dx = e._px + 16 - wx, dy = e._py + 12 - wy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; }
  }
  return best || exact;
}
function handleTap(x, y, dbl) {
  if (!inView(x, y)) return;
  const [wx, wy] = R.screenToWorld(x, y), tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE), me = LS.mySlot;
  if (ui.mode === 'place') { // first tap puts the outline down, a tap on the outline builds
    const s = BUILDINGS[ui.buildType].size, f = ui.placeFixed;
    if (f && tx >= f[0] && tx < f[0] + s && ty >= f[1] && ty < f[1] + s) {
      const w = mySel().find(u => u.unit && UNITS[u.type].worker);
      if (w) { issue({ t: 'build', ids: [w.id], btype: ui.buildType, x: f[0], y: f[1] }, 'build'); sfx.play('place'); ui.mode = null; ui.menu = null; }
    } else ui.placeFixed = [Math.floor(wx / TILE - s / 2 + 0.5), Math.floor(wy / TILE - s / 2 + 0.5)];
    return;
  }
  const t = pickAt(wx, wy);
  if (ui.mode === 'target') { targetAt(tx, ty, t, false); return; }
  const sel = mySel(), units = sel.filter(e => e.unit);
  if (t && t.owner === me && t.unit) { clickSelect(x, y, false, dbl, t); return; }
  if (units.length) {
    if (t && t.owner === me && !t.unit) { // own building: only an order if the workers have business there
      const w = units.filter(u => UNITS[u.type].worker), d = BUILDINGS[t.type].depot;
      if (!(w.length && (game.canRepair(me, t) || (t.built && d && w.some(u => u.carry && d.includes(u.carryKind)))))) { clickSelect(x, y, false, false, t); return; }
    }
    rightClick(x, y); return;
  }
  if (sel.length && !t) { rightClick(x, y); return; } // buildings selected, bare ground or a tree: rally point
  clickSelect(x, y, false, false, t);
}
const touchById = (list, id) => { for (const t of list) if (t.identifier === id) return t; return null; };
const centroid = (list) => { let x = 0, y = 0; for (const t of list) { const p = canvasPos(t); x += p[0]; y += p[1]; } return [x / list.length, y / list.length]; };
cv.addEventListener('touchstart', e => {
  e.preventDefault(); touchMode = true;
  if (!running || isFrozen()) return;
  if (e.touches.length >= 2) { // two fingers always slide the map
    if (tch) clearTimeout(tch.timer); ui.drag = null;
    const c = centroid(e.touches); tch = { kind: 'pan2', x0: c[0], y0: c[1], cx: R.cam.x, cy: R.cam.y }; return;
  }
  const t0 = e.changedTouches[0], [x, y] = canvasPos(t0), id = t0.identifier;
  ui.mouse.x = x; ui.mouse.y = y; ui.mouse.inView = inView(x, y);
  if (x >= 8 && x < 168 && y >= 432 && y < 466) { openMenu(); return; }
  const b = btnAt(x, y);
  if (b) { ui.mouseDown = true; ui.hoverBtn = b.id; ui.hoverUntil = performance.now() + 3000; pressButton(b); tch = { kind: 'ui', id }; return; }
  if (x >= INFO.x && x < INFO.x + INFO.w && y >= INFO.y && y < INFO.y + INFO.h) {
    if (ui.selection.length) { ui.selection = []; ui.menu = null; ui.mode = null; }
    else if (x < INFO.x + INFO.w / 2) nextIdleWorker();
    else if (ui.lastAlert) R.centerOn(ui.lastAlert.x * TILE, ui.lastAlert.y * TILE); else addMsg('No alerts yet.');
    return;
  }
  if (inMini(x, y)) {
    const [tx, ty] = miniToTile(x, y);
    if (ui.mode === 'target') targetAt(tx, ty, null, false); else { R.centerOn(tx * TILE, ty * TILE); tch = { kind: 'mini', id }; }
    return;
  }
  if (!inView(x, y)) return;
  tch = { kind: 'pending', id, x0: x, y0: y, cx: R.cam.x, cy: R.cam.y };
  const f = ui.mode === 'place' && ui.placeFixed, s = f ? BUILDINGS[ui.buildType].size : 0, [wx, wy] = R.screenToWorld(x, y);
  if (f && wx >= f[0] * TILE && wx < (f[0] + s) * TILE && wy >= f[1] * TILE && wy < (f[1] + s) * TILE) tch.onGhost = true; // drag the outline itself
  else if (!ui.mode) tch.timer = setTimeout(() => {
    if (!tch || tch.kind !== 'pending') return;
    tch.kind = 'box'; ui.drag = { x0: tch.x0, y0: tch.y0, x1: tch.x0, y1: tch.y0, active: true, shift: false }; navigator.vibrate?.(12);
  }, 380);
}, { passive: false });
cv.addEventListener('touchmove', e => {
  e.preventDefault(); if (!tch || !running) return;
  if (e.touches.length >= 2) {
    const c = centroid(e.touches);
    if (tch.kind !== 'pan2') { clearTimeout(tch.timer); ui.drag = null; tch = { kind: 'pan2', x0: c[0], y0: c[1], cx: R.cam.x, cy: R.cam.y }; }
    R.cam.x = tch.cx - (c[0] - tch.x0); R.cam.y = tch.cy - (c[1] - tch.y0); R.clampCam(); return;
  }
  const t = touchById(e.touches, tch.id); if (!t) return;
  const [x, y] = canvasPos(t); ui.mouse.x = x; ui.mouse.y = y;
  if (tch.kind === 'pending' && Math.abs(x - tch.x0) + Math.abs(y - tch.y0) > 10) { clearTimeout(tch.timer); tch.kind = tch.onGhost ? 'ghost' : 'pan'; }
  if (tch.kind === 'pan') { R.cam.x = tch.cx - (x - tch.x0); R.cam.y = tch.cy - (y - tch.y0); R.clampCam(); }
  else if (tch.kind === 'ghost') { const [wx, wy] = R.screenToWorld(x, y), s = BUILDINGS[ui.buildType].size; ui.placeFixed = [Math.floor(wx / TILE - s / 2 + 0.5), Math.floor(wy / TILE - s / 2 + 0.5)]; }
  else if (tch.kind === 'box' && ui.drag) { ui.drag.x1 = Math.max(VIEW.x, Math.min(VIEW.x + VIEW.w - 1, x)); ui.drag.y1 = Math.max(VIEW.y, Math.min(VIEW.y + VIEW.h - 1, y)); }
  else if (tch.kind === 'mini') { const [tx, ty] = miniToTile(Math.max(MINI.x, Math.min(MINI.x + MINI.s - 1, x)), Math.max(MINI.y, Math.min(MINI.y + MINI.s - 1, y))); R.centerOn(tx * TILE, ty * TILE); }
}, { passive: false });
function touchEnd(e) {
  e.preventDefault(); if (ui) ui.mouseDown = false;
  if (!tch || !running) { tch = null; return; }
  if (tch.kind === 'pan2') { if (e.touches.length === 0) tch = null; return; }
  if (!touchById(e.changedTouches, tch.id)) return;
  clearTimeout(tch.timer);
  const k = tch; tch = null;
  if (k.kind === 'box') { const d = ui.drag; ui.drag = null; if (d && Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) > 8) boxSelect(d); }
  else if (k.kind === 'pending' && e.type === 'touchend') {
    const now = performance.now(), dbl = now - lastTap.t < 380 && Math.abs(k.x0 - lastTap.x) + Math.abs(k.y0 - lastTap.y) < 30;
    lastTap = { t: now, x: k.x0, y: k.y0 };
    handleTap(k.x0, k.y0, dbl);
  }
}
cv.addEventListener('touchend', touchEnd, { passive: false });
cv.addEventListener('touchcancel', touchEnd, { passive: false });

const keys = new Set();
window.addEventListener('keydown', e => {
  if (!running) return;
  const chat = $('chat');
  if (document.activeElement === chat) {
    if (e.key === 'Enter') { const t = chat.value.trim(); if (t) { addMsg(game.players[LS.mySlot].name + ': ' + t); if (LS.online) lobby.send('chat', { text: t }, LS.peers()); } chat.value = ''; chat.classList.add('hidden'); chat.blur(); }
    else if (e.key === 'Escape') { chat.value = ''; chat.classList.add('hidden'); chat.blur(); }
    return;
  }
  if (!$('menu').classList.contains('hidden')) { if (e.key === 'Escape' || e.key === 'F10') { e.preventDefault(); $('pz-resume').onclick(); } return; }
  keys.add(e.key);
  if (e.key === 'F10') { e.preventDefault(); openMenu(); return; }
  if (isFrozen()) { if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') paused = false; if (!e.key.startsWith('Arrow')) return; }
  if (e.key === 'Enter') { chat.classList.remove('hidden'); chat.focus(); e.preventDefault(); return; }
  if (e.key === 'Escape') {
    if (ui.mode) { ui.mode = null; return; }
    if (ui.menu) { ui.menu = null; return; }
    const c = ui.buttons.find(b => b.hot === 'Escape' && b.act); if (c) pressButton(c);
    return;
  }
  if (e.key === 'Tab') { e.preventDefault(); nextIdleWorker(); return; }
  if (e.key === ' ') { if (ui.lastAlert) R.centerOn(ui.lastAlert.x * TILE, ui.lastAlert.y * TILE); e.preventDefault(); return; }
  if ((e.key === 'p' || e.key === 'P') && !LS.online && !e.ctrlKey) { const hb = ui.buttons.find(b => b.hot === 'p'); if (!hb) { paused = !paused; return; } }
  if (/^[1-9]$/.test(e.key)) {
    if (e.ctrlKey || e.metaKey) { ui.groups[e.key] = mySel().map(s => s.id); addMsg('Group ' + e.key + ' assigned.'); e.preventDefault(); }
    else if (ui.groups[e.key]) {
      const ids = ui.groups[e.key].filter(id => game.get(id)); if (!ids.length) return;
      if (ui.lastGroup === e.key && performance.now() - ui.lastGroupT < 500) { const f = game.get(ids[0]); R.centerOn(f.x * TILE, f.y * TILE); }
      ui.selection = ids; ui.menu = null; ui.lastGroup = e.key; ui.lastGroupT = performance.now();
    }
    return;
  }
  const k = e.key.toLowerCase();
  const b = ui.buttons.find(b => b.act && b.hot && b.hot.toLowerCase() === k);
  if (b && !e.ctrlKey) { pressButton(b); e.preventDefault(); }
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());

function openMenu() { sfx.play('menu'); show('p-pause'); if (!LS.online) paused = true; }

function scroll(fdt) {
  const sp = Math.round(14 * fdt / (1000 / 60)); let dx = 0, dy = 0;
  if (keys.has('ArrowLeft')) dx -= sp; if (keys.has('ArrowRight')) dx += sp; if (keys.has('ArrowUp')) dy -= sp; if (keys.has('ArrowDown')) dy += sp;
  if (document.hasFocus() && $('menu').classList.contains('hidden') && !ui.drag && !ui.pan && !touchMode) {
    const { x, y } = ui.mouse;
    if (x <= 2) dx -= sp; if (x >= SCREEN.w - 3) dx += sp; if (y <= 2) dy -= sp; if (y >= 477) dy += sp;
  }
  if (dx || dy) { R.cam.x += dx; R.cam.y += dy; R.clampCam(); }
}

// ------------------------------------------------------------------ cursor
function drawCursor() {
  if (touchMode) return; // no pointer to draw on a touch screen
  const ctx = overlay.getContext('2d'), k = overlay.height / SCREEN.h; const { x, y } = ui.mouse;
  ctx.setTransform(k, 0, 0, k, 0, 0); ctx.imageSmoothingEnabled = false;
  if (ui.mode === 'target' && inView(x, y) || ui.mode === 'target' && inMini(x, y)) {
    ctx.strokeStyle = ui.targetKind === 'attack' ? '#ff4040' : '#f0d878'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, 6, 0, Math.PI * 2); ctx.moveTo(x - 9, y + 0.5); ctx.lineTo(x - 3, y + 0.5); ctx.moveTo(x + 4, y + 0.5); ctx.lineTo(x + 10, y + 0.5); ctx.moveTo(x + 0.5, y - 9); ctx.lineTo(x + 0.5, y - 3); ctx.moveTo(x + 0.5, y + 4); ctx.lineTo(x + 0.5, y + 10); ctx.stroke();
    return;
  }
  let kind = 'gold';
  if (inView(x, y) && !ui.mode) { const [wx, wy] = R.screenToWorld(x, y); const t = R.entityAt(wx, wy); if (t) kind = t.owner === LS.mySlot ? 'own' : t.owner < 0 ? 'neutral' : 'enemy'; }
  ctx.drawImage(cursorSprite(kind), Math.round(x) - 1, Math.round(y) - 1);
}

// ------------------------------------------------------------------ title backdrop
let backdrop = null;
function drawTitleBackdrop(now) {
  const ctx = cv.getContext('2d');
  if (!backdrop) {
    backdrop = new Game({ seed: 4242, size: 64, players: [{ name: 'a', faction: 0, color: 1, ai: true }, { name: 'b', faction: 1, color: 0, ai: true }] });
    for (let i = 0; i < 3000; i++) { backdrop.step([]); backdrop.events.length = 0; }
    backdrop.R = new Renderer(cv, backdrop, -1); backdrop.R.revealAll = true; backdrop.t = 0;
  }
  backdrop.step([]); for (const ev of backdrop.events) backdrop.R.onEvent(ev); backdrop.events.length = 0;
  if (backdrop.over) backdrop = null;
  else {
    backdrop.t += 0.4; const R2 = backdrop.R;
    R2.cam.x = 600 + Math.sin(backdrop.t / 300) * 500; R2.cam.y = 600 + Math.cos(backdrop.t / 400) * 400; R2.clampCam();
    R2.draw(0, { selection: [], msgs: [], mouse: {}, buttons: [] });
  }
}
requestAnimationFrame(loop);

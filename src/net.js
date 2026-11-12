// Networking: public P2P lobby (Trystero over public Nostr relays, WebRTC data channels)
// and a deterministic lockstep driver.
import { TICK_MS } from './data.js';

export const APP_ID = 'wartwo-rts-p2p-v1';
const TURN_TICKS = 2;      // a network turn = 2 sim ticks (100ms)
const DELAY = 3;           // commands execute 3 turns after being issued (~300ms)

let trystero = null;
async function lib() {
  if (!trystero) trystero = await import('../vendor/trystero.js');
  return trystero;
}

// ------------------------------------------------------------------ lobby
export class Lobby {
  constructor(name, onChange) {
    this.name = name; this.onChange = onChange;
    this.peers = new Map();  // peerId -> {name, game, seen}
    this.hosting = null;     // {title, slots:[...], size}
    this.joined = null;      // hostId we've joined
    this.roster = null;      // last roster from host
    this.handlers = {};
  }
  async connect() {
    const { joinRoom, selfId } = await lib();
    this.selfId = selfId;
    this.room = joinRoom({ appId: APP_ID }, 'public-lobby');
    const mk = (n) => this.room.makeAction(n);
    this.a = { hello: mk('hello'), join: mk('join'), leave: mk('leave'), roster: mk('roster'), start: mk('start'), turn: mk('turn'), hash: mk('hash'), chat: mk('chat'), drop: mk('drop') };
    this.a.hello.onMessage = (d, { peerId }) => { this.peers.set(peerId, { ...d, seen: Date.now() }); this.changed(); };
    this.room.onPeerJoin = (peerId) => this.sayHello(peerId);
    this.room.onPeerLeave = (peerId) => {
      this.peers.delete(peerId);
      if (this.hosting) { const i = this.hosting.slots.findIndex(s => s.peer === peerId); if (i >= 0 && !this.hosting.started) { this.hosting.slots.splice(i, 1); this.pushRoster(); } }
      if (this.joined === peerId && !this.started) { this.joined = null; this.roster = null; this.emit('msg', 'The host left.'); }
      this.emit('peerLeave', peerId);
      this.changed();
    };
    this.a.join.onMessage = (d, { peerId }) => {
      if (!this.hosting || this.hosting.started) return;
      let s = this.hosting.slots.find(x => x.peer === peerId);
      if (!s) { if (this.hosting.slots.length >= this.hosting.max) return; s = { peer: peerId }; this.hosting.slots.push(s); }
      s.name = String(d.name || 'Player').slice(0, 16); s.faction = d.faction ? 1 : 0;
      this.pushRoster();
    };
    this.a.leave.onMessage = (d, { peerId }) => { if (this.hosting) { this.hosting.slots = this.hosting.slots.filter(s => s.peer !== peerId); this.pushRoster(); } };
    this.a.roster.onMessage = (d, { peerId }) => {
      if (this.joined !== peerId) return;
      if (!d || d.closed || !Array.isArray(d.slots)) { this.joined = null; this.roster = null; this.emit('msg', d && d.kicked ? 'You were removed from the game.' : 'The host closed the game.'); }
      else this.roster = d;
      this.changed();
    };
    this.a.start.onMessage = (d, { peerId }) => { if (this.joined === peerId) { this.started = true; this.emit('start', d); } };
    for (const k of ['turn', 'hash', 'chat', 'drop']) this.a[k].onMessage = (d, { peerId }) => this.emit(k, d, peerId);
    this.helloTimer = setInterval(() => { this.sayHello(); this.prune(); }, 3000);
    this.sayHello();
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...args) { this.handlers[ev] && this.handlers[ev](...args); }
  changed() { this.onChange && this.onChange(); }
  prune() { const now = Date.now(); for (const [k, v] of this.peers) if (now - v.seen > 10000) this.peers.delete(k); this.changed(); }
  sayHello(target) {
    if (!this.a) return;
    const game = this.hosting && !this.hosting.started ? { title: this.hosting.title, players: this.hosting.slots.map(s => s.name), max: this.hosting.max, size: this.hosting.size } : null;
    this.a.hello.send({ name: this.name, game, v: 1 }, target ? { target } : undefined);
  }
  openGames() { return [...this.peers.entries()].filter(([, p]) => p.game).map(([id, p]) => ({ id, ...p.game, host: p.name })); }
  host(title, faction, max, size) {
    this.hosting = { title, max, size, started: false, slots: [{ peer: this.selfId, name: this.name, faction }] };
    this.joined = null; this.roster = null; this.sayHello(); this.pushRoster();
  }
  addAI(faction) { if (this.hosting && this.hosting.slots.length < this.hosting.max) { this.hosting.slots.push({ ai: true, name: 'Computer', faction }); this.pushRoster(); } }
  removeSlot(i) {
    if (!this.hosting || i <= 0) return;
    const [s] = this.hosting.slots.splice(i, 1);
    if (s && s.peer) this.a.roster.send({ closed: true, kicked: true }, { target: [s.peer] });
    this.pushRoster();
  }
  pushRoster() {
    if (!this.hosting) return;
    const r = { title: this.hosting.title, slots: this.hosting.slots, size: this.hosting.size, max: this.hosting.max };
    this.roster = r;
    const targets = this.hosting.slots.filter(s => s.peer && s.peer !== this.selfId).map(s => s.peer);
    if (targets.length) this.a.roster.send(r, { target: targets });
    this.sayHello(); this.changed();
  }
  join(hostId, faction) { this.hosting = null; this.joined = hostId; this.faction = faction; this.a.join.send({ name: this.name, faction }, { target: hostId }); this.changed(); }
  leaveGame() {
    if (!this.a) return;
    if (this.joined) this.a.leave.send({}, { target: this.joined });
    if (this.hosting && !this.hosting.started) { const t = this.hosting.slots.filter(s => s.peer && s.peer !== this.selfId).map(s => s.peer); if (t.length) this.a.roster.send({ closed: true }, { target: t }); }
    this.started = false; this.joined = null; this.roster = null; this.hosting = null; this.sayHello(); this.changed(); }
  start(seed) {
    const h = this.hosting; if (!h) return null;
    h.started = true;
    const players = h.slots.map((s, i) => ({ name: s.name, faction: s.faction, color: i, ai: !!s.ai, peer: s.ai ? null : s.peer }));
    const d = { seed, size: h.size, players };
    const targets = players.filter(p => p.peer && p.peer !== this.selfId).map(p => p.peer);
    if (targets.length) this.a.start.send(d, { target: targets });
    this.sayHello();
    return d;
  }
  send(kind, data, targets) { if (this.a && targets.length) this.a[kind].send(data, { target: targets }); }
  close() { clearInterval(this.helloTimer); try { this.room && this.room.leave(); } catch (e) { /* ignore */ } }
}

// ------------------------------------------------------------------ lockstep
export class Lockstep {
  // players: [{peer|null, ai}] ; mySlot ; lobby (null for local games)
  constructor(game, players, mySlot, lobby) {
    this.g = game; this.mySlot = mySlot; this.lobby = lobby;
    this.humans = players.map((p, i) => (!p.ai ? i : -1)).filter(i => i >= 0);
    this.peerOf = players.map(p => p.peer);
    this.dropped = new Map(); // slot -> from turn
    this.turns = new Map();   // turn -> Map(slot -> cmds)
    this.local = [];
    this.waiting = false; this.desync = false; this.myHashes = new Map(); this.theirHashes = new Map();
    this.online = !!lobby && this.humans.length > 1;
    this.delay = this.online ? DELAY : 1;
    for (let t = 0; t < this.delay; t++) for (const s of this.humans) this.put(t, s, []);
    this.sentUpTo = this.delay - 1;
    if (lobby) {
      lobby.on('turn', (d, peer) => { const s = this.peerOf.indexOf(peer); if (s >= 0) this.put(d.turn, s, d.cmds); });
      lobby.on('hash', (d, peer) => { this.theirHashes.set(d.turn, d.h); this.checkHash(d.turn); });
      lobby.on('peerLeave', (peer) => this.onLeave(peer));
      lobby.on('drop', (d) => this.applyDrop(d));
    }
  }
  put(turn, slot, cmds) { let m = this.turns.get(turn); if (!m) { m = new Map(); this.turns.set(turn, m); } if (!m.has(slot)) m.set(slot, cmds); }
  issue(cmd) { cmd.p = this.mySlot; this.local.push(cmd); }
  peers() { return this.humans.filter(s => s !== this.mySlot && !this.dropped.has(s)).map(s => this.peerOf[s]).filter(Boolean); }
  activeHumans(turn) { return this.humans.filter(s => !(this.dropped.has(s) && this.dropped.get(s) <= turn)); }
  ready() {
    if (this.g.tick % TURN_TICKS !== 0) return true;
    const turn = this.g.tick / TURN_TICKS; const m = this.turns.get(turn);
    const ok = !!m && this.activeHumans(turn).every(s => m.has(s));
    this.waiting = !ok; return ok;
  }
  step() {
    let cmds = [];
    if (this.g.tick % TURN_TICKS === 0) {
      const turn = this.g.tick / TURN_TICKS;
      // send our commands for a future turn
      const future = turn + this.delay;
      if (this.mySlot >= 0 && future > this.sentUpTo) {
        const mine = this.local; this.local = [];
        this.put(future, this.mySlot, mine); this.sentUpTo = future;
        if (this.online) this.lobby.send('turn', { turn: future, cmds: mine }, this.peers());
      }
      const m = this.turns.get(turn);
      if (m) {
        for (const s of [...m.keys()].sort((a, b) => a - b)) {
          if (this.dropped.has(s) && this.dropped.get(s) <= turn && !m.get(s).some(c => c.t === 'resign')) continue;
          for (const c of m.get(s)) { c.p = s; cmds.push(c); }
        }
        this.turns.delete(turn);
      }
      if (this.online && turn % 25 === 0) {
        const h = this.g.hash(); this.myHashes.set(turn, h);
        this.lobby.send('hash', { turn, h }, this.peers()); this.checkHash(turn);
      }
    }
    this.g.step(cmds);
  }
  checkHash(turn) {
    if (this.myHashes.has(turn) && this.theirHashes.has(turn) && this.myHashes.get(turn) !== this.theirHashes.get(turn)) this.desync = true;
    if (this.myHashes.size > 40) { const k = [...this.myHashes.keys()].sort((a, b) => a - b)[0]; this.myHashes.delete(k); this.theirHashes.delete(k); }
  }
  // When a peer disconnects, the lowest remaining human slot decides the drop turn and relays
  // everything it has from that peer so all survivors stay in step.
  onLeave(peer) {
    const slot = this.peerOf.indexOf(peer); if (slot < 0 || this.dropped.has(slot)) return;
    const alive = this.humans.filter(s => s !== slot && !this.dropped.has(s));
    if (alive[0] !== this.mySlot) return; // not the arbiter
    let maxT = this.g.tick / TURN_TICKS | 0; const turns = {};
    for (const [t, m] of this.turns) if (m.has(slot)) { turns[t] = m.get(slot); if (t > maxT) maxT = t; }
    const d = { slot, at: maxT + 1, turns };
    this.lobby.send('drop', d, this.peers().filter(p => p !== peer));
    this.applyDrop(d);
  }
  applyDrop(d) {
    if (this.dropped.has(d.slot)) return;
    for (const t in d.turns) this.put(+t, d.slot, d.turns[t]);
    this.put(d.at, d.slot, [{ t: 'resign' }]);
    this.dropped.set(d.slot, d.at + 1);
    // fill gaps between now and `at` with empty turns
    for (let t = (this.g.tick / TURN_TICKS | 0); t <= d.at; t++) this.put(t, d.slot, []);
  }
}

export { TICK_MS };

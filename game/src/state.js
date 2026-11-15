// HELIX BREACH — the one place the game's state lives. Every module reads and
// writes this object; nothing keeps a second copy of a round, a score or a wallet.
export const G = {
  // Match flow: 'menu' | 'freeze' | 'live' | 'roundEnd' | 'matchEnd'
  phase: 'menu',
  round: 1,
  wins: { vanguard: 0, ember: 0 },
  attacking: 'vanguard', // the team planting the spike this round
  matchWinner: null,
  // Timers (seconds, sim time)
  time: 0,
  phaseTime: 0, // time left in the current phase
  freezeTime: 4,
  roundTime: 100,
  fuseTime: 40,
  // The spike (bomb): 'carried' | 'dropped' | 'planting' | 'planted' | 'defusing' | 'defused' | 'exploded'
  spike: {
    state: 'carried',
    carrier: null, // combatant index carrying it
    site: null, // 'A' | 'B'
    pos: { x: 0, y: 0, z: 0 },
    progress: 0, // plant/defuse channel 0..1
    fuse: 0, // seconds left once planted
    planter: null,
    defuser: null,
  },
  // Combatants: index 0 is always the human player. Each one:
  // { id, name, team, isPlayer, alive, hp, armor, money, kills, deaths,
  //   pos:Vector3-like {x,y,z}, yaw, pitch, weapon, mag, reserve, grenades,
  //   bot: null | { skill, role, state, path, pathI, holdPos, target, reactAt,
  //          burstLeft, burstAt, lastSeen, heardPos, strafeDir, strafeAt } }
  combatants: [],
  // Kill feed entries { text, team, time }
  feed: [],
  // Round/match bookkeeping
  roundKills: 0,
  lossStreak: { vanguard: 0, ember: 0 },
  // Player settings (persisted to localStorage)
  settings: { sensitivity: 1.0, volume: 0.7, muted: false, quality: 'high' },
  // Deterministic RNG, re-seeded per round from the match seed.
  seed: 1,
  // Shot (screenshot) mode: 'start' | 'play' | 'buy' | 'end' | null
  shot: null,
  // Transient UI flags the HUD reads
  banner: null, // { title, sub, team }
  flash: 0, // flashbang white-out 0..1
  damageDir: 0, // angle of the last damage source, for the direction indicator
  damageAt: -10,
  shake: 0,
};

export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function resetMatchState(seed) {
  G.phase = 'menu';
  G.round = 1;
  G.wins = { vanguard: 0, ember: 0 };
  G.attacking = 'vanguard';
  G.matchWinner = null;
  G.time = 0;
  G.phaseTime = 0;
  G.spike = { state: 'carried', carrier: null, site: null, pos: { x: 0, y: 0, z: 0 }, progress: 0, fuse: 0, planter: null, defuser: null };
  G.feed = [];
  G.roundKills = 0;
  G.lossStreak = { vanguard: 0, ember: 0 };
  G.banner = null;
  G.flash = 0;
  G.shake = 0;
  G.seed = seed;
}

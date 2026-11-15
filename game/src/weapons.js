// HELIX BREACH — the armoury. Five guns with distinct roles, three grenades, and
// the buy economy around them. A weapon's numbers are its identity: the rifle is
// the all-rounder, the SMG is fast up close, the sniper deletes at range, the
// shotgun owns corners, the sidearm is always there when the mag runs dry.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 2, price: 0,
    damage: 34, headMult: 3, legMult: 0.75, mag: 12, reserve: 36,
    interval: 0.16, auto: false, spread: 0.011, moveSpread: 0.022,
    recoil: 0.010, bloom: 0.006, reloadTime: 1.1, range: 60, pellets: 1,
    falloff: 0.75, zoom: 1, speed: 1.0, sound: 'pistol',
  },
  vk47: {
    id: 'vk47', name: 'VK-47 Rifle', slot: 1, price: 2700,
    damage: 36, headMult: 3.2, legMult: 0.75, mag: 30, reserve: 90,
    interval: 0.1, auto: true, spread: 0.013, moveSpread: 0.03,
    recoil: 0.016, bloom: 0.005, reloadTime: 2.2, range: 80, pellets: 1,
    falloff: 0.85, zoom: 1, speed: 0.96, sound: 'rifle',
  },
  kx9: {
    id: 'kx9', name: 'KX-9 SMG', slot: 1, price: 1500,
    damage: 26, headMult: 3, legMult: 0.75, mag: 32, reserve: 96,
    interval: 0.075, auto: true, spread: 0.017, moveSpread: 0.032,
    recoil: 0.011, bloom: 0.004, reloadTime: 1.9, range: 45, pellets: 1,
    falloff: 0.6, zoom: 1, speed: 1.02, sound: 'smg',
  },
  lw88: {
    id: 'lw88', name: 'LW-88 Longshot', slot: 1, price: 4500,
    damage: 110, headMult: 4, legMult: 0.8, mag: 5, reserve: 15,
    interval: 1.15, auto: false, spread: 0.0012, moveSpread: 0.05,
    recoil: 0.055, bloom: 0.02, reloadTime: 3.0, range: 120, pellets: 1,
    falloff: 1, zoom: 3.2, speed: 0.92, sound: 'sniper',
  },
  m12: {
    id: 'm12', name: 'M12 Breacher', slot: 1, price: 1800,
    damage: 12, headMult: 2, legMult: 0.7, mag: 6, reserve: 24,
    interval: 0.85, auto: false, spread: 0.05, moveSpread: 0.055,
    recoil: 0.035, bloom: 0.012, reloadTime: 2.6, range: 22, pellets: 8,
    falloff: 0.4, zoom: 1, speed: 0.96, sound: 'shotgun',
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, max: 2 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, max: 2 },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, max: 2 },
};

export const ARMOR_PRICE = 1000;
export const ARMOR_AMOUNT = 50;

// Fresh weapon state for one combatant: sidearm owned, rifle slot empty.
export function createLoadout() {
  return {
    primary: null, // weapon id in slot 1, or null
    secondary: 'p9',
    current: 'p9',
    mag: { p9: WEAPONS.p9.mag },
    reserve: { p9: WEAPONS.p9.reserve },
    cooldown: 0,
    reloading: false,
    reloadEnd: 0,
    bloom: 0, // accumulated spread from firing, decays over time
    scoped: false,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    selectedGrenade: 'frag',
  };
}

export function currentWeapon(loadout) {
  return WEAPONS[loadout.current];
}

// Spread right now: base + movement + air + bloom, reduced by crouch/stand-still/ADS.
export function spreadFor(weapon, moveSpeed, crouched, airborne, bloom, scoped) {
  let s = weapon.spread + bloom;
  if (moveSpeed > 0.5) s += weapon.moveSpread * Math.min(1, moveSpeed / 4.6);
  if (airborne) s += 0.03;
  if (crouched) s *= 0.75;
  if (scoped) s *= 0.35;
  return s;
}

// Damage at a distance: full inside half range, then a linear falloff to the floor.
export function damageAt(weapon, dist) {
  const half = weapon.range * 0.5;
  if (dist <= half) return weapon.damage;
  const t = Math.min(1, (dist - half) / half);
  return weapon.damage * (1 - (1 - weapon.falloff) * t);
}

export function startReload(loadout, now) {
  const w = currentWeapon(loadout);
  if (loadout.reloading || loadout.mag[w.id] >= w.mag || loadout.reserve[w.id] <= 0) return false;
  loadout.reloading = true;
  loadout.reloadEnd = now + w.reloadTime;
  return true;
}

export function finishReload(loadout) {
  const w = currentWeapon(loadout);
  const need = w.mag - loadout.mag[w.id];
  const take = Math.min(need, loadout.reserve[w.id]);
  loadout.mag[w.id] += take;
  loadout.reserve[w.id] -= take;
  loadout.reloading = false;
}

// Buying. Returns a message for the HUD, or null when it cannot be bought.
export function buyWeapon(combatant, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w) return null;
  if (combatant.money < w.price) return 'Not enough credits';
  if (w.slot === 1 && combatant.loadout.primary === weaponId) return 'Already owned';
  combatant.money -= w.price;
  if (w.slot === 1) {
    combatant.loadout.primary = weaponId;
    combatant.loadout.mag[weaponId] = w.mag;
    combatant.loadout.reserve[weaponId] = w.reserve;
    combatant.loadout.current = weaponId;
  } else {
    combatant.loadout.mag.p9 = w.mag;
    combatant.loadout.reserve.p9 = w.reserve;
  }
  return `Bought ${w.name}`;
}

export function buyGrenade(combatant, grenadeId) {
  const g = GRENADES[grenadeId];
  if (!g) return null;
  if (combatant.loadout.grenades[grenadeId] >= g.max) return 'Carrying max';
  if (combatant.money < g.price) return 'Not enough credits';
  combatant.money -= g.price;
  combatant.loadout.grenades[grenadeId] += 1;
  return `Bought ${g.name}`;
}

export function buyArmor(combatant) {
  if (combatant.armor >= ARMOR_AMOUNT) return 'Armor full';
  if (combatant.money < ARMOR_PRICE) return 'Not enough credits';
  combatant.money -= ARMOR_PRICE;
  combatant.armor = ARMOR_AMOUNT;
  return 'Bought armor';
}

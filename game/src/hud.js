// HELIX BREACH — the HUD and menus. Everything the player sees that is not the
// 3D scene: crosshair with live spread, health/ammo/money, round timer and score,
// kill feed, banners, the buy menu, the scoreboard, and the plant/defuse bar.
// DOM writes are cached so unchanged text is never touched twice.
import { G } from './state.js';
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';

function $(id) { return document.getElementById(id); }

export function createHud(deps) {
  const { onDeploy, onRematch, onBuy } = deps;
  const els = {
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), scope: $('scope'),
    timer: $('timer'), score: $('score-num'), roundLabel: $('round-label'),
    healthNum: $('health-num'), healthBar: $('health-bar'), armorBar: $('armor-bar'),
    weaponName: $('weapon-name'), ammo: $('ammo'), money: $('money'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    objective: $('objective'), vignette: $('vignette'), flash: $('flash'), damageDir: $('damage-dir'),
    plantWrap: $('plant-wrap'), plantLabel: $('plant-label'), plantFill: $('plant-fill'),
    buyMenu: $('buy-menu'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    scoreboard: $('scoreboard'), scoreRows: $('score-rows'),
    menu: $('menu'), deployBtn: $('deploy-btn'),
    matchEnd: $('match-end'), matchTitle: $('match-title'), matchStats: $('match-stats'), rematchBtn: $('rematch-btn'),
    hint: $('hint'), grenades: $('grenades'),
  };
  const cache = {};
  let bannerAt = -10;
  let buyOpen = false;
  let feedTimer = 0;

  function setText(el, key, value) {
    if (cache[key] !== value) { cache[key] = value; el.textContent = value; }
  }
  function setWidth(el, key, pct) {
    const v = `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
    if (cache[key] !== v) { cache[key] = v; el.style.width = v; }
  }

  function banner(title, sub = '') {
    setText(els.bannerTitle, 'bannerTitle', title);
    setText(els.bannerSub, 'bannerSub', sub);
    els.banner.classList.add('show');
    bannerAt = G.time;
  }

  function clearBanner() {
    els.banner.classList.remove('show');
    bannerAt = -10;
  }

  function addFeed(text, kind = '') {
    const div = document.createElement('div');
    div.className = `feed-item ${kind}`;
    div.textContent = text;
    els.killfeed.prepend(div);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    feedTimer = 5;
  }

  function buildBuyMenu() {
    const items = [
      ...Object.values(WEAPONS).filter((w) => w.slot === 1).map((w) => ({ key: w.id === 'vk47' ? '1' : w.id === 'kx9' ? '2' : w.id === 'lw88' ? '3' : '4', label: w.name, price: w.price, kind: 'weapon', id: w.id })),
      { key: '5', label: 'P9 Sidearm ammo', price: 0, kind: 'ammo', id: 'p9' },
      { key: '6', label: 'Kevlar + Helmet', price: ARMOR_PRICE, kind: 'armor', id: 'armor' },
      { key: '7', label: GRENADES.frag.name, price: GRENADES.frag.price, kind: 'grenade', id: 'frag' },
      { key: '8', label: GRENADES.smoke.name, price: GRENADES.smoke.price, kind: 'grenade', id: 'smoke' },
      { key: '9', label: GRENADES.flash.name, price: GRENADES.flash.price, kind: 'grenade', id: 'flash' },
    ];
    els.buyList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('button');
      row.className = 'buy-row';
      row.dataset.buy = `${item.kind}:${item.id}`;
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => onBuy(item.kind, item.id));
      els.buyList.appendChild(row);
    }
  }

  function showBuy(show) {
    buyOpen = show;
    els.buyMenu.classList.toggle('hidden', !show);
  }
  function toggleBuy() {
    if (G.phase !== 'freeze') return;
    showBuy(!buyOpen);
  }

  function showMenu(show) { els.menu.classList.toggle('hidden', !show); }
  function showMatchEnd(show, winner, stats) {
    els.matchEnd.classList.toggle('hidden', !show);
    if (show) {
      setText(els.matchTitle, 'matchTitle', winner === G.combatants[0].team ? 'VICTORY' : 'DEFEAT');
      setText(els.matchStats, 'matchStats', stats);
    }
  }

  function hint(text) {
    setText(els.hint, 'hint', text || '');
    els.hint.classList.toggle('hidden', !text);
  }

  function hitmarker(kill) {
    els.hitmarker.classList.remove('kill');
    if (kill) els.hitmarker.classList.add('kill');
    els.hitmarker.classList.add('show');
    setTimeout(() => els.hitmarker.classList.remove('show'), 120);
  }

  els.deployBtn.addEventListener('click', () => { onDeploy(); });
  els.rematchBtn.addEventListener('click', () => { onRematch(); });
  buildBuyMenu();

  function update(dt, player, spread) {
    const now = G.time;
    if (G.phase === 'menu') els.banner.classList.remove('show');
    if (bannerAt >= 0 && now - bannerAt > 3.2) {
      els.banner.classList.remove('show');
      bannerAt = -10;
    }
    feedTimer -= dt;
    if (feedTimer <= 0 && els.killfeed.children.length) {
      els.killfeed.lastChild.remove();
      feedTimer = 1.5;
    }
    const p = G.combatants[0];
    // Crosshair: gap follows the live spread; hidden while scoped.
    const gap = 4 + spread * 900;
    els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    els.crosshair.classList.toggle('hidden', p.loadout.scoped || G.phase === 'menu' || G.phase === 'matchEnd');
    els.scope.classList.toggle('hidden', !p.loadout.scoped);
    // Timer and score.
    const planted = G.spike.state === 'planted' || G.spike.state === 'defusing';
    const t = planted ? Math.max(0, G.spike.fuse) : Math.max(0, G.roundTimer);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60).toString().padStart(2, '0');
    setText(els.timer, 'timer', `${mm}:${ss}`);
    els.timer.classList.toggle('danger', t <= 10);
    els.timer.classList.toggle('bomb', planted);
    setText(els.score, 'score', `${G.wins.vanguard} — ${G.wins.ember}`);
    setText(els.roundLabel, 'roundLabel', `ROUND ${G.round} · ${G.phase === 'freeze' ? 'BUY PHASE' : G.phase === 'live' ? (planted ? 'SPIKE PLANTED' : 'LIVE') : G.phase.toUpperCase()}`);
    // Health / armour.
    setText(els.healthNum, 'healthNum', `${Math.ceil(p.hp)}`);
    setWidth(els.healthBar, 'healthBar', p.hp);
    setWidth(els.armorBar, 'armorBar', p.armor);
    els.healthNum.classList.toggle('low', p.hp <= 30);
    // Weapon, ammo, money, grenades.
    const w = WEAPONS[p.loadout.current];
    setText(els.weaponName, 'weaponName', w.name);
    const ammoText = p.loadout.reloading ? 'RELOADING…' : `${p.loadout.mag[w.id]} / ${p.loadout.reserve[w.id]}`;
    setText(els.ammo, 'ammo', ammoText);
    setText(els.money, 'money', `$${p.money}`);
    setText(els.buyMoney, 'buyMoney', `$${p.money}`);
    const g = p.loadout.grenades;
    setText(els.grenades, 'grenades', `FRAG ${g.frag} · SMOKE ${g.smoke} · FLASH ${g.flash}`);
    // Objective line.
    let obj = '';
    if (G.phase === 'freeze') obj = p.team === G.attacking ? 'Buy up — then plant the spike at A or B' : 'Buy up — hold A and B';
    else if (G.phase === 'live') {
      if (planted) obj = p.team === G.attacking ? `Spike planted at ${G.spike.site} — defend it` : `Spike planted at ${G.spike.site} — defuse it (E)`;
      else if (p.hasSpike) obj = 'You carry the spike — plant it at A or B (hold E)';
      else if (G.spike.state === 'dropped') obj = 'Spike dropped — pick it up';
      else obj = p.team === G.attacking ? 'Push a site and plant the spike' : 'Hold the sites — don\'t let them plant';
    }
    setText(els.objective, 'objective', obj);
    // Plant / defuse progress.
    const prog = G.spike.state === 'planting' || G.spike.state === 'defusing' ? G.spike.progress : -1;
    els.plantWrap.classList.toggle('hidden', prog < 0);
    if (prog >= 0) {
      setText(els.plantLabel, 'plantLabel', G.spike.state === 'planting' ? `PLANTING SPIKE — SITE ${G.spike.site}` : 'DEFUSING SPIKE');
      setWidth(els.plantFill, 'plantFill', prog * 100);
    }
    // Damage vignette fades after a hit; direction ring rotates to the attacker.
    const sinceHit = now - G.damageAt;
    els.vignette.style.opacity = sinceHit < 0.6 ? (0.6 - sinceHit).toFixed(2) : '0';
    if (sinceHit < 1.2) {
      const facing = player.yaw + Math.PI;
      let rel = G.damageDir - facing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      els.damageDir.style.transform = `translate(-50%, -50%) rotate(${(rel * 180 / Math.PI).toFixed(0)}deg)`;
      els.damageDir.style.opacity = (1.2 - sinceHit).toFixed(2);
    } else els.damageDir.style.opacity = '0';
    // Flashbang whiteout.
    els.flash.style.opacity = G.flash > 0 ? G.flash.toFixed(2) : '0';
    // Buy menu auto-opens in freeze, closes when the round goes live.
    if (G.phase === 'freeze' && !buyOpen && p.alive) showBuy(true);
    if (G.phase !== 'freeze' && buyOpen) showBuy(false);
  }

  function updateScoreboard(show) {
    els.scoreboard.classList.toggle('hidden', !show);
    if (!show) return;
    const rows = [...G.combatants].sort((a, b) => b.kills - a.kills);
    els.scoreRows.innerHTML = rows.map((c) => `<div class="score-row ${c.team} ${c.isPlayer ? 'me' : ''}"><span>${c.isPlayer ? 'YOU' : c.name}</span><span>${c.team.toUpperCase()}</span><span>${c.kills} / ${c.deaths}</span><span>$${c.money}</span></div>`).join('');
  }

  return { banner, clearBanner, addFeed, showBuy, toggleBuy, showMenu, showMatchEnd, hint, hitmarker, update, updateScoreboard, onBuyRef: onBuy };
}

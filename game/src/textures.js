// Procedural canvas textures: the game ships no image assets, so every surface is
// painted here — asphalt, concrete, hazard stripes, corrugated containers, site signs,
// a smoke puff and a muzzle-flash sprite. All deterministic, all local.
import * as THREE from 'three';

// Deterministic speckles so the same seed paints the same texture every run.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, rand, n, alpha, light, dark) {
  for (let i = 0; i < n; i += 1) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? light : dark;
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    const s = 1 + rand() * 2.5;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function toTexture(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeTextures() {
  const out = {};

  { // Asphalt: dark slab with speckles, faint expansion joints and a worn centre line.
    const [c, x] = canvas(512, 512);
    x.fillStyle = '#232833'; x.fillRect(0, 0, 512, 512);
    speckle(x, 512, 512, rng(11), 5200, 0.16, '#3a4152', '#141821');
    x.strokeStyle = 'rgba(20,24,33,0.9)'; x.lineWidth = 3;
    x.strokeRect(1, 1, 510, 510);
    x.strokeStyle = 'rgba(245,165,36,0.28)'; x.lineWidth = 5;
    x.setLineDash([46, 30]); x.beginPath(); x.moveTo(256, 0); x.lineTo(256, 512); x.stroke();
    x.setLineDash([]);
    out.asphalt = toTexture(c, 8, 6);
  }

  { // Concrete panels with seams, stains and edge wear.
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#39415a'; x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng(23), 2200, 0.14, '#4a5470', '#272e40');
    x.strokeStyle = 'rgba(20,24,33,0.85)'; x.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      x.beginPath(); x.moveTo(0, i * 64); x.lineTo(256, i * 64); x.stroke();
      x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 256); x.stroke();
    }
    x.fillStyle = 'rgba(20,24,33,0.18)';
    x.fillRect(0, 200, 256, 56);
    out.concrete = toTexture(c, 2, 2);
  }

  { // Hazard stripes, diagonal amber on near-black.
    const [c, x] = canvas(256, 128);
    x.fillStyle = '#15181f'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#f5a524';
    for (let i = -2; i < 8; i += 1) {
      x.beginPath();
      x.moveTo(i * 64, 128); x.lineTo(i * 64 + 32, 0);
      x.lineTo(i * 64 + 64, 0); x.lineTo(i * 64 + 32, 128);
      x.closePath(); x.fill();
    }
    speckle(x, 256, 128, rng(37), 500, 0.2, '#ffffff', '#000000');
    out.hazard = toTexture(c, 1, 1);
  }

  // Corrugated container sides in three paint jobs, with rust streaks and a stencil code.
  for (const [name, base, code] of [
    ['containerTeal', '#1f6f6b', 'HX-04'],
    ['containerRust', '#8a4a2b', 'HX-17'],
    ['containerBlue', '#2b4a6b', 'HX-22'],
  ]) {
    const [c, x] = canvas(256, 256);
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i += 1) {
      x.fillStyle = i % 2 ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.10)';
      x.fillRect(i * 16, 0, 8, 256);
    }
    speckle(x, 256, 256, rng(41 + name.length), 900, 0.2, '#7a4a28', '#10141c');
    x.fillStyle = 'rgba(233,230,223,0.85)';
    x.font = 'bold 34px ui-monospace, monospace';
    x.fillText(code, 18, 52);
    x.font = '20px ui-monospace, monospace';
    x.fillText('HELIX YARD', 18, 84);
    out[name] = toTexture(c, 1, 1);
  }

  { // Site sign: a big glowing letter on a dark plate (A reactor, B depot).
    for (const [key, letter, color] of [['signA', 'A', '#35c4ff'], ['signB', 'B', '#f5a524']]) {
      const [c, x] = canvas(256, 256);
      x.fillStyle = '#141821'; x.fillRect(0, 0, 256, 256);
      x.strokeStyle = color; x.lineWidth = 10; x.strokeRect(14, 14, 228, 228);
      x.fillStyle = color; x.font = 'bold 150px system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(letter, 128, 138);
      out[key] = toTexture(c, 1, 1);
    }
  }

  { // Soft radial puff for smoke grenades.
    const [c, x] = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(220,226,233,0.85)');
    g.addColorStop(0.55, 'rgba(180,188,198,0.45)');
    g.addColorStop(1, 'rgba(160,168,178,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    out.smoke = toTexture(c, 1, 1);
  }

  { // Starburst for the muzzle flash.
    const [c, x] = canvas(128, 128);
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.35, 'rgba(255,190,90,0.85)');
    g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    out.flash = toTexture(c, 1, 1);
  }

  return out;
}

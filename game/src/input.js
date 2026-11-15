// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Also exposes one-shot key presses (buy, reload, use,
// weapon slots, grenades, scoreboard, pause, mute) through a consumed-press queue.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set(); // codes pressed since last takePresses()
  const state = { keys, locked: false, firing: false, firingAlt: false, lookX: 0, lookY: 0, wheel: 0 };

  function setKey(event, down) {
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else keys.delete(event.code);
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); state.firing = false; });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.firingAlt = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.firingAlt = false;
  });
  window.addEventListener('wheel', (event) => { state.wheel += Math.sign(event.deltaY); }, { passive: true });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { keys.clear(); state.firing = false; state.firingAlt = false; }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() { canvas.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    takeLook() {
      const x = state.lookX; const y = state.lookY;
      state.lookX = 0; state.lookY = 0;
      return { x, y };
    },
    takeWheel() { const w = state.wheel; state.wheel = 0; return w; },
    takePresses() {
      const out = [...pressed];
      pressed.clear();
      return out;
    },
  };
}

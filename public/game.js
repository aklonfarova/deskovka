/* ═══════════════════════════════════════════════════════════════════
   Labyrint – client-side game logic
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── Treasure emoji map ────────────────────────────────────────────────
const TREASURE_EMOJIS = {
  'strašidlo': '👻', 'skřítek': '🧙', 'drak': '🐉', 'víla': '🧚',
  'netopýr': '🦇', 'pavouk': '🕷️', 'krysa': '🐀',
  'kniha': '📚', 'měšec': '💰', 'prsten': '💍', 'mapa': '🗺️',
  'koruna': '👑', 'klíče': '🗝️', 'meč': '⚔️', 'lebka': '💀',
  'svícen': '🕯️', 'pohár': '🏆',
  'motýl': '🦋', 'brouk': '🐛', 'sova': '🦉', 'salamandr': '🦎',
  'amfora': '🏺', 'helma': '⛑️', 'truhla': '📦'
};

// ── State ─────────────────────────────────────────────────────────────
const state = {
  myId: null,
  roomCode: null,
  isHost: false,
  waitingPlayers: [],
  gs: null,            // latest game state from server
};

// ── Canvas globals ────────────────────────────────────────────────────
let canvas, ctx;
let ftCanvas, ftCtx;  // free tile preview canvas
let TILE_SZ = 70;
let ARROW_SZ = 42;
let _resizeHandler = null;

// ── Socket ────────────────────────────────────────────────────────────
const socket = io();

socket.on('connect', () => {
  // noop – wait for user action
});

socket.on('room-created', ({ roomCode, playerId }) => {
  state.myId = playerId;
  state.roomCode = roomCode;
  state.isHost = true;
  showWaiting([{ id: playerId, name: getMyName() }]);
});

socket.on('room-joined', ({ playerId, players }) => {
  state.myId = playerId;
  renderWaitingPlayers(players);
  showScreen('waiting-screen');
  document.getElementById('display-room-code').textContent = state.roomCode;
  document.getElementById('start-game-btn').classList.add('hidden');
  document.getElementById('waiting-status').textContent = 'Čekám na zahájení hry…';
});

socket.on('player-joined', ({ players }) => {
  state.waitingPlayers = players;
  renderWaitingPlayers(players);
  const canStart = players.length >= 2;
  if (state.isHost) {
    const btn = document.getElementById('start-game-btn');
    btn.classList.toggle('hidden', !canStart);
    document.getElementById('waiting-status').textContent =
      canStart ? 'Můžeš spustit hru!' : `Čekám na hráče (${players.length}/4)…`;
  }
});

socket.on('game-started', (gs) => {
  state.gs = gs;
  initGameCanvas();
  showScreen('game-screen');
  document.getElementById('game-room-code').textContent = state.roomCode;
  renderAll();
});

socket.on('game-state', (gs) => {
  state.gs = gs;
  renderAll();
  if (gs.winner) showWinner(gs);
});

socket.on('error', (msg) => {
  showError(msg);
});

// ── Lobby interactions ────────────────────────────────────────────────
// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('create-room-btn').addEventListener('click', () => {
  const name = getMyName();
  socket.emit('create-room', name);
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const name = getMyName();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!code || code.length < 3) { showError('Zadej platný kód místnosti'); return; }
  state.roomCode = code;
  socket.emit('join-room', { roomCode: code, name });
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
  const code = document.getElementById('display-room-code').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  socket.emit('start-game', state.roomCode);
});

// ── Screen management ─────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = document.getElementById(id);
  if (el) {
    el.style.display = 'flex';
    el.classList.add('active');
  }
}

function showWaiting(players) {
  state.waitingPlayers = players;
  showScreen('waiting-screen');
  document.getElementById('display-room-code').textContent = state.roomCode;
  renderWaitingPlayers(players);
  if (state.isHost) {
    document.getElementById('start-game-btn').classList.add('hidden');
    document.getElementById('waiting-status').textContent = 'Čekám na dalšího hráče…';
  }
}

function renderWaitingPlayers(players) {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
  const el = document.getElementById('player-list');
  el.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <span class="player-dot" style="background:${colors[i] || '#aaa'}"></span>
      <span>${p.name}</span>
      ${i === 0 ? '<span class="player-label">host</span>' : ''}
    </div>
  `).join('');
}

function getMyName() {
  return document.getElementById('player-name').value.trim() || 'Hráč';
}

function showError(msg) {
  // Show error in visible screen
  const errEls = document.querySelectorAll('.error-msg');
  errEls.forEach(el => {
    if (el.closest('.screen.active') || el.closest('.screen[style*="flex"]')) {
      el.textContent = msg;
      el.classList.remove('hidden');
      setTimeout(() => { el.textContent = ''; el.classList.add('hidden'); }, 4000);
    }
  });
}

// ── Canvas initialisation ─────────────────────────────────────────────
function initGameCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  ftCanvas = document.getElementById('free-tile-canvas');
  ftCtx = ftCanvas.getContext('2d');

  const resizeCanvas = () => {
    const boardWrapper = document.querySelector('.board-wrapper');
    const panelW = document.querySelector('.right-panel')?.offsetWidth || 180;
    const maxW = (boardWrapper ? boardWrapper.clientWidth : window.innerWidth - panelW) - 8;
    const maxH = window.innerHeight - 52;  // subtract top bar height only
    const available = Math.min(maxW, maxH);
    ARROW_SZ = Math.floor(available / 10);
    TILE_SZ = Math.floor((available - ARROW_SZ * 2) / 7);
    TILE_SZ = Math.max(50, Math.min(105, TILE_SZ));  // allow up to 105px tiles
    ARROW_SZ = Math.floor(TILE_SZ * 0.55);

    const sz = ARROW_SZ * 2 + TILE_SZ * 7;
    canvas.width = sz;
    canvas.height = sz;

    if (state.gs) renderAll();
  };

  // Run after layout is painted
  requestAnimationFrame(() => { requestAnimationFrame(resizeCanvas); });

  // Re-calculate on window resize
  if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
  _resizeHandler = resizeCanvas;
  window.addEventListener('resize', _resizeHandler);

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    onCanvasClick({ clientX: t.clientX, clientY: t.clientY, _rect: rect, _scaleX: scaleX, _scaleY: scaleY });
  }, { passive: false });

  document.getElementById('rotate-btn').addEventListener('click', () => {
    socket.emit('rotate-free-tile', state.roomCode);
  });
}

// ── Render everything ─────────────────────────────────────────────────
function renderAll() {
  if (!canvas || !state.gs) return;
  renderBoard();
  renderFreeTile();
  renderSidePanel();
}

// ── Board rendering ───────────────────────────────────────────────────
const WALL_CLR    = '#f5f0e0';   // tile background: creamy white
const PATH_CLR    = '#7B3F00';   // corridor: dark brown
const PATH_LITE   = '#A0522D';   // reachable corridor: lighter brown
const BORDER_CLR  = '#000000';   // grid lines: black
const ARROW_ACT   = '#f0e060';
const ARROW_DIM   = '#4a4a4a';
const ARROW_FORBD = '#2a2a2a';

function renderBoard() {
  const gs = state.gs;
  const as = ARROW_SZ;
  const ts = TILE_SZ;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Outer background
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Determine target treasure for current player
  const myPlayer = gs.players.find(p => p.id === state.myId);
  const myTarget = myPlayer?.currentTarget || null;

  // Board tiles
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const tile = gs.board[r][c];
      if (!tile) continue;
      const x = as + c * ts;
      const y = as + r * ts;
      const reach = gs.reachable && gs.reachable[r][c];
      const isTarget = myTarget && tile.treasure === myTarget;
      drawTile(ctx, x, y, ts, tile, reach, isTarget);
    }
  }

  // Grid lines between tiles
  ctx.strokeStyle = BORDER_CLR;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 7; i++) {
    const p = as + i * ts;
    ctx.beginPath(); ctx.moveTo(as, p); ctx.lineTo(as + 7 * ts, p); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p, as); ctx.lineTo(p, as + 7 * ts); ctx.stroke();
  }

  // Player tokens (draw all)
  for (const p of gs.players) {
    drawPlayerToken(as + p.col * ts + ts / 2, as + p.row * ts + ts / 2, p.color, p.playerIndex + 1, ts);
  }

  // Push arrows
  drawPushArrows(gs);
}

function drawTile(ctx, x, y, sz, tile, reachable, isTarget) {
  const cw = Math.floor(sz * 0.36);  // corridor width
  const cx = x + sz / 2;
  const cy = y + sz / 2;
  const [N, E, S, W] = tile.openings;

  // Tile background: white
  ctx.fillStyle = WALL_CLR;
  ctx.fillRect(x, y, sz, sz);

  // Corridor fill: brown (lighter if reachable)
  ctx.fillStyle = reachable ? PATH_LITE : PATH_CLR;

  // Center square
  ctx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), cw, cw);

  if (N) ctx.fillRect(Math.round(cx - cw / 2), y, cw, Math.round(sz / 2 + cw / 2));
  if (E) ctx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), Math.round(sz / 2 + cw / 2), cw);
  if (S) ctx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), cw, Math.round(sz / 2 + cw / 2));
  if (W) ctx.fillRect(x, Math.round(cy - cw / 2), Math.round(sz / 2 + cw / 2), cw);

  // Reachable highlight overlay (blue tint on walls)
  if (reachable) {
    ctx.fillStyle = 'rgba(30,120,255,0.12)';
    ctx.fillRect(x, y, sz, sz);
    ctx.strokeStyle = 'rgba(60,140,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 1.5, y + 1.5, sz - 3, sz - 3);
  }

  // Target treasure highlight: golden glow
  if (isTarget) {
    // Outer soft glow
    ctx.strokeStyle = 'rgba(255,215,0,0.35)';
    ctx.lineWidth = 8;
    ctx.strokeRect(x + 1, y + 1, sz - 2, sz - 2);
    // Bright inner border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, sz - 6, sz - 6);
    // Subtle golden fill on white walls
    ctx.fillStyle = 'rgba(255,215,0,0.12)';
    ctx.fillRect(x, y, sz, sz);
  }

  // Treasure emoji
  if (tile.treasure) {
    const emoji = TREASURE_EMOJIS[tile.treasure] || '?';
    const eSz = Math.floor(sz * 0.38);
    ctx.font = `${eSz}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
  }
}

function drawPlayerToken(x, y, color, num, tileSize) {
  const r = Math.floor(tileSize * 0.19);
  // Shadow
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, r + 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Number
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.floor(tileSize * 0.18)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y);
}

// ── Push arrows ───────────────────────────────────────────────────────
function drawPushArrows(gs) {
  const as = ARROW_SZ;
  const ts = TILE_SZ;
  const boardEnd = as + 7 * ts;
  const myTurn = isMyTurn(gs) && gs.phase === 'push';

  for (const idx of [1, 3, 5]) {
    const ry = as + idx * ts + ts / 2;   // row center y
    const cx2 = as + idx * ts + ts / 2;  // col center x

    // → right-push:  arrow on left edge
    drawArrow(as / 2, ry, '→', arrowColor(gs, myTurn, 'row', idx, 'right'));
    // ← left-push:   arrow on right edge
    drawArrow(boardEnd + as / 2, ry, '←', arrowColor(gs, myTurn, 'row', idx, 'left'));
    // ↓ down-push:   arrow on top edge
    drawArrow(cx2, as / 2, '↓', arrowColor(gs, myTurn, 'col', idx, 'down'));
    // ↑ up-push:     arrow on bottom edge
    drawArrow(cx2, boardEnd + as / 2, '↑', arrowColor(gs, myTurn, 'col', idx, 'up'));
  }
}

function arrowColor(gs, myTurn, type, index, dir) {
  if (isForbidden(gs, type, index, dir)) return ARROW_FORBD;
  return myTurn ? ARROW_ACT : ARROW_DIM;
}

function isForbidden(gs, type, index, dir) {
  if (!gs.lastPush) return false;
  const lp = gs.lastPush;
  const opp = { right: 'left', left: 'right', down: 'up', up: 'down' }[lp.dir];
  return lp.type === type && lp.index === index && opp === dir;
}

function drawArrow(x, y, symbol, color) {
  const r = Math.floor(ARROW_SZ * 0.42);
  if (color === ARROW_FORBD) return; // don't draw forbidden arrows at all

  // Circle background
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color === ARROW_ACT
    ? 'rgba(240,224,96,0.2)'
    : 'rgba(100,100,100,0.15)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Arrow text
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y);
}

// ── Free tile canvas ──────────────────────────────────────────────────
function renderFreeTile() {
  const gs = state.gs;
  if (!ftCanvas || !gs.freeTile) return;
  const sz = 120;
  ftCanvas.width = sz;
  ftCanvas.height = sz;
  ftCtx.clearRect(0, 0, sz, sz);

  drawTileLocal(ftCtx, 0, 0, sz, gs.freeTile);
}

function drawTileLocal(lCtx, x, y, sz, tile) {
  const cw = Math.floor(sz * 0.36);
  const cx = x + sz / 2;
  const cy = y + sz / 2;
  const [N, E, S, W] = tile.openings;

  lCtx.fillStyle = WALL_CLR;   // white tile
  lCtx.fillRect(x, y, sz, sz);

  lCtx.fillStyle = PATH_CLR;   // brown corridors
  lCtx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), cw, cw);
  if (N) lCtx.fillRect(Math.round(cx - cw / 2), y, cw, Math.round(sz / 2 + cw / 2));
  if (E) lCtx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), Math.round(sz / 2 + cw / 2), cw);
  if (S) lCtx.fillRect(Math.round(cx - cw / 2), Math.round(cy - cw / 2), cw, Math.round(sz / 2 + cw / 2));
  if (W) lCtx.fillRect(x, Math.round(cy - cw / 2), Math.round(sz / 2 + cw / 2), cw);

  if (tile.treasure) {
    const emoji = TREASURE_EMOJIS[tile.treasure] || '?';
    const eSz = Math.floor(sz * 0.38);
    lCtx.font = `${eSz}px sans-serif`;
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText(emoji, cx, cy);
  }
}

// ── Side panel ────────────────────────────────────────────────────────
function renderSidePanel() {
  const gs = state.gs;
  const myPlayer = gs.players.find(p => p.id === state.myId);
  const curPlayer = gs.players[gs.currentPlayerIndex];
  const myTurnNow = isMyTurn(gs);

  // Turn indicator
  const turnEl = document.getElementById('turn-indicator');
  if (gs.phase === 'ended') {
    turnEl.textContent = '🏆 Hra skončila!';
    turnEl.style.color = '#f0e050';
  } else if (myTurnNow) {
    turnEl.textContent = gs.phase === 'push'
      ? '🎯 Tvůj tah — posuň dlaždici'
      : '🚶 Tvůj tah — přesuň se';
    turnEl.style.color = '#f0e050';
  } else {
    turnEl.textContent = `Hraje: ${curPlayer?.name || '?'}`;
    turnEl.style.color = '#aaaaaa';
  }

  // Rotate button
  const rotBtn = document.getElementById('rotate-btn');
  rotBtn.disabled = !(myTurnNow && gs.phase === 'push');

  // Phase hint
  const phaseHint = document.getElementById('phase-hint');
  if (myTurnNow) {
    phaseHint.textContent = gs.phase === 'push'
      ? '1. Otočit (volitelné)\n2. Kliknout na šipku'
      : 'Klikni na zvýrazněné pole';
  } else {
    phaseHint.textContent = '';
  }

  // Current treasure target
  if (myPlayer) {
    const emojiEl = document.getElementById('treasure-emoji');
    const nameEl  = document.getElementById('treasure-name');
    const remEl   = document.getElementById('cards-remaining');

    if (myPlayer.currentTarget) {
      emojiEl.textContent = TREASURE_EMOJIS[myPlayer.currentTarget] || '?';
      nameEl.textContent  = myPlayer.currentTarget;
    } else if (myPlayer.collected >= myPlayer.totalCards) {
      emojiEl.textContent = '🏁';
      nameEl.textContent  = 'Vrať se na start!';
    } else {
      emojiEl.textContent = '✅';
      nameEl.textContent  = 'Vše sebráno!';
    }
    const rem = myPlayer.totalCards - myPlayer.collected;
    remEl.textContent = `Zbývá: ${rem} / ${myPlayer.totalCards}`;
  }

  // Players list
  const listEl = document.getElementById('players-status');
  listEl.innerHTML = gs.players.map((p, i) => {
    const active = i === gs.currentPlayerIndex;
    const me = p.id === state.myId;
    return `<div class="player-status-item ${active ? 'active-player' : ''}">
      <span class="player-status-dot" style="background:${p.color}"></span>
      <span class="player-status-name">${p.name}${me ? ' 👤' : ''}</span>
      <span class="player-status-cards">${p.collected}/${p.totalCards}</span>
    </div>`;
  }).join('');
}

// ── Canvas click handler ──────────────────────────────────────────────
function onCanvasClick(e) {
  const gs = state.gs;
  if (!gs || !isMyTurn(gs)) return;

  const rect = e._rect || canvas.getBoundingClientRect();
  const scaleX = e._scaleX || canvas.width / rect.width;
  const scaleY = e._scaleY || canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;

  if (gs.phase === 'push') {
    handlePushClick(mx, my, gs);
  } else if (gs.phase === 'move') {
    handleMoveClick(mx, my, gs);
  }
}

function handlePushClick(mx, my, gs) {
  const as = ARROW_SZ;
  const ts = TILE_SZ;
  const boardEnd = as + 7 * ts;

  for (const idx of [1, 3, 5]) {
    const ry = as + idx * ts;        // row band start y
    const cx2 = as + idx * ts;       // col band start x

    // Left edge → push row right
    if (mx < as && my > ry && my < ry + ts) {
      emit_push('row', idx, 'right', gs);
      return;
    }
    // Right edge → push row left
    if (mx > boardEnd && my > ry && my < ry + ts) {
      emit_push('row', idx, 'left', gs);
      return;
    }
    // Top edge → push col down
    if (my < as && mx > cx2 && mx < cx2 + ts) {
      emit_push('col', idx, 'down', gs);
      return;
    }
    // Bottom edge → push col up
    if (my > boardEnd && mx > cx2 && mx < cx2 + ts) {
      emit_push('col', idx, 'up', gs);
      return;
    }
  }
}

function emit_push(type, index, dir, gs) {
  if (isForbidden(gs, type, index, dir)) return;
  socket.emit('push-tile', { roomCode: state.roomCode, type, index, dir });
}

function handleMoveClick(mx, my, gs) {
  const as = ARROW_SZ;
  const ts = TILE_SZ;
  const col = Math.floor((mx - as) / ts);
  const row = Math.floor((my - as) / ts);
  if (row < 0 || row >= 7 || col < 0 || col >= 7) return;
  if (!gs.reachable || !gs.reachable[row][col]) return;
  socket.emit('move-player', { roomCode: state.roomCode, row, col });
}

// ── Helpers ───────────────────────────────────────────────────────────
function isMyTurn(gs) {
  if (!gs || !gs.players) return false;
  return gs.players[gs.currentPlayerIndex]?.id === state.myId;
}

function showWinner(gs) {
  const winner = gs.players.find(p => p.id === gs.winner);
  const name = winner ? winner.name : 'Neznámý';
  const banner = document.getElementById('winner-banner');
  banner.innerHTML = `<h2>🏆 Vítěz!</h2><p style="font-size:1.5em;margin-top:8px">${name}</p>
    <button class="btn btn-primary" style="margin-top:20px" onclick="location.reload()">Hrát znovu</button>`;
  banner.classList.remove('hidden');
}

// ── Init ──────────────────────────────────────────────────────────────
showScreen('lobby-screen');

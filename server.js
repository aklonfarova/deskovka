const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ─── Game constants ────────────────────────────────────────────────────────────

// Tile openings: [N, E, S, W]
const TILE_TYPES = {
  I: [true, false, true, false],
  L: [true, true, false, false],
  T: [true, true, true, false]
};

// Rotate openings 90° clockwise: [N,E,S,W] → [W,N,E,S]
function rotateTile(openings, times = 1) {
  let o = [...openings];
  for (let i = 0; i < (times % 4); i++) {
    o = [o[3], o[0], o[1], o[2]];
  }
  return o;
}

// Fixed tile definitions: { row, col, type, rotation, treasure }
const FIXED_TILES = [
  { row: 0, col: 0, type: 'L', rotation: 1, treasure: null },  // player 1 start
  { row: 0, col: 6, type: 'L', rotation: 2, treasure: null },  // player 2 start
  { row: 6, col: 0, type: 'L', rotation: 0, treasure: null },  // player 3 start
  { row: 6, col: 6, type: 'L', rotation: 3, treasure: null },  // player 4 start
  { row: 0, col: 2, type: 'T', rotation: 1, treasure: 'strašidlo' },
  { row: 0, col: 4, type: 'T', rotation: 1, treasure: 'skřítek' },
  { row: 2, col: 0, type: 'T', rotation: 0, treasure: 'drak' },
  { row: 2, col: 6, type: 'T', rotation: 2, treasure: 'víla' },
  { row: 4, col: 0, type: 'T', rotation: 0, treasure: 'netopýr' },
  { row: 4, col: 6, type: 'T', rotation: 2, treasure: 'pavouk' },
  { row: 6, col: 2, type: 'T', rotation: 3, treasure: 'krysa' },
  { row: 6, col: 4, type: 'T', rotation: 3, treasure: 'kniha' },
  { row: 2, col: 2, type: 'T', rotation: 0, treasure: 'měšec' },
  { row: 2, col: 4, type: 'T', rotation: 2, treasure: 'prsten' },
  { row: 4, col: 2, type: 'T', rotation: 2, treasure: 'mapa' },
  { row: 4, col: 4, type: 'T', rotation: 0, treasure: 'koruna' },
];

const PLAYER_STARTS = [
  { row: 0, col: 0 },
  { row: 0, col: 6 },
  { row: 6, col: 0 },
  { row: 6, col: 6 },
];

// Movable tile pool: 12 I (no treasure) + 16 L (6 with treasure, 10 without) + 6 T (6 with treasure)
const MOVABLE_POOL = [
  // 12 I tiles
  ...Array(12).fill(null).map(() => ({ type: 'I', treasure: null })),
  // 6 L with treasures
  { type: 'L', treasure: 'klíče' },
  { type: 'L', treasure: 'meč' },
  { type: 'L', treasure: 'lebka' },
  { type: 'L', treasure: 'svícen' },
  { type: 'L', treasure: 'pohár' },
  { type: 'L', treasure: 'motýl' },
  // 10 L without treasures
  ...Array(10).fill(null).map(() => ({ type: 'L', treasure: null })),
  // 6 T with treasures
  { type: 'T', treasure: 'brouk' },
  { type: 'T', treasure: 'sova' },
  { type: 'T', treasure: 'salamandr' },
  { type: 'T', treasure: 'amfora' },
  { type: 'T', treasure: 'helma' },
  { type: 'T', treasure: 'truhla' },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createTile(type, rotation, treasure) {
  return {
    type,
    rotation,
    treasure: treasure || null,
    openings: rotateTile(TILE_TYPES[type], rotation)
  };
}

// ─── Board creation ────────────────────────────────────────────────────────────

function createBoard() {
  const board = Array(7).fill(null).map(() => Array(7).fill(null));

  // Place fixed tiles
  for (const ft of FIXED_TILES) {
    board[ft.row][ft.col] = createTile(ft.type, ft.rotation, ft.treasure);
  }

  // Determine movable positions (odd row OR odd col, excludes fixed even/even)
  const movablePositions = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (board[r][c] === null) {
        movablePositions.push([r, c]);
      }
    }
  }
  // Should be 33 positions

  const shuffledPool = shuffle(MOVABLE_POOL);
  // 34 tiles in pool, place 33, keep 1 as free tile
  let freeTile = null;

  for (let i = 0; i < shuffledPool.length; i++) {
    const rotation = Math.floor(Math.random() * 4);
    const tile = createTile(shuffledPool[i].type, rotation, shuffledPool[i].treasure);
    if (i < movablePositions.length) {
      const [r, c] = movablePositions[i];
      board[r][c] = tile;
    } else {
      freeTile = tile;
    }
  }

  return { board, freeTile };
}

// ─── Treasure distribution ──────────────────────────────────────────────────

function distributeTreasures(board, freeTile, playerCount) {
  // Collect all treasures from board + free tile
  const allTreasures = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (board[r][c] && board[r][c].treasure) {
        allTreasures.push(board[r][c].treasure);
      }
    }
  }
  if (freeTile && freeTile.treasure) {
    allTreasures.push(freeTile.treasure);
  }

  const shuffled = shuffle(allTreasures);
  // Cards per player
  const cardsPerPlayer = Math.floor(shuffled.length / playerCount);
  const hands = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(shuffled.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer));
  }
  return hands;
}

// ─── BFS pathfinding ────────────────────────────────────────────────────────

function getReachable(board, startRow, startCol) {
  const visited = Array(7).fill(null).map(() => Array(7).fill(false));
  const queue = [[startRow, startCol]];
  visited[startRow][startCol] = true;

  // Direction deltas: N=0, E=1, S=2, W=3
  const dirs = [
    [-1, 0, 0, 2], // N: row-1, col+0, from=0(N), to=2(S)
    [0, 1, 1, 3],  // E: row+0, col+1, from=1(E), to=3(W)
    [1, 0, 2, 0],  // S: row+1, col+0, from=2(S), to=0(N)
    [0, -1, 3, 1], // W: row+0, col-1, from=3(W), to=1(E)
  ];

  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const tile = board[r][c];
    if (!tile) continue;

    for (const [dr, dc, fromDir, toDir] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 7 || nc < 0 || nc >= 7) continue;
      if (visited[nr][nc]) continue;

      const neighbor = board[nr][nc];
      if (!neighbor) continue;

      // Check if current tile opens toward neighbor AND neighbor opens back
      if (tile.openings[fromDir] && neighbor.openings[toDir]) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }

  return visited;
}

// ─── Push logic ─────────────────────────────────────────────────────────────

// type: 'row'|'col', index: 1|3|5, dir: 'right'|'left' (row) or 'down'|'up' (col)
function pushTile(board, freeTile, players, type, index, dir) {
  const newBoard = board.map(row => [...row]);
  let pushedOut;
  let newFreeTile = { ...freeTile };

  if (type === 'row') {
    if (dir === 'right') {
      // Push free tile into left side (col 0), push out right side (col 6)
      pushedOut = newBoard[index][6];
      for (let c = 6; c > 0; c--) {
        newBoard[index][c] = newBoard[index][c - 1];
      }
      newBoard[index][0] = { ...freeTile };
      // Move players who were on that row
      for (const p of players) {
        if (p.row === index) {
          if (p.col === 6) {
            p.col = 0; // pushed out, appears on inserted side
          } else {
            p.col += 1;
          }
        }
      }
    } else {
      // dir === 'left': push free tile from right (col 6), push out left (col 0)
      pushedOut = newBoard[index][0];
      for (let c = 0; c < 6; c++) {
        newBoard[index][c] = newBoard[index][c + 1];
      }
      newBoard[index][6] = { ...freeTile };
      for (const p of players) {
        if (p.row === index) {
          if (p.col === 0) {
            p.col = 6;
          } else {
            p.col -= 1;
          }
        }
      }
    }
  } else {
    // type === 'col'
    if (dir === 'down') {
      // Push free tile from top (row 0), push out bottom (row 6)
      pushedOut = newBoard[6][index];
      for (let r = 6; r > 0; r--) {
        newBoard[r][index] = newBoard[r - 1][index];
      }
      newBoard[0][index] = { ...freeTile };
      for (const p of players) {
        if (p.col === index) {
          if (p.row === 6) {
            p.row = 0;
          } else {
            p.row += 1;
          }
        }
      }
    } else {
      // dir === 'up': push free tile from bottom (row 6), push out top (row 0)
      pushedOut = newBoard[0][index];
      for (let r = 0; r < 6; r++) {
        newBoard[r][index] = newBoard[r + 1][index];
      }
      newBoard[6][index] = { ...freeTile };
      for (const p of players) {
        if (p.col === index) {
          if (p.row === 0) {
            p.row = 6;
          } else {
            p.row -= 1;
          }
        }
      }
    }
  }

  return { board: newBoard, freeTile: pushedOut, players };
}

// Determine the "opposite" push to forbid
function oppositeMove(type, index, dir) {
  if (!type) return null;
  let oppDir;
  if (dir === 'right') oppDir = 'left';
  else if (dir === 'left') oppDir = 'right';
  else if (dir === 'down') oppDir = 'up';
  else oppDir = 'down';
  return { type, index, dir: oppDir };
}

// ─── Room/Game state management ─────────────────────────────────────────────

const rooms = {}; // roomCode → room object

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createGameState(players) {
  const { board, freeTile } = createBoard();
  const playerCount = players.length;
  const hands = distributeTreasures(board, freeTile, playerCount);

  const gamePlayers = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'][i],
    playerIndex: i,
    row: PLAYER_STARTS[i].row,
    col: PLAYER_STARTS[i].col,
    cards: hands[i],        // full hand
    cardIndex: 0,           // index into cards array
    collected: 0,           // how many collected
    finished: false,
  }));

  return {
    board,
    freeTile,
    players: gamePlayers,
    currentPlayerIndex: 0,
    phase: 'push',    // 'push' or 'move'
    lastPush: null,   // { type, index, dir }
    winner: null,
    reachable: null,  // computed after push phase
  };
}

// Build what each client should see (hide other players' card details)
function buildClientState(gameState, requestingPlayerId) {
  const state = {
    board: gameState.board,
    freeTile: gameState.freeTile,
    phase: gameState.phase,
    currentPlayerIndex: gameState.currentPlayerIndex,
    lastPush: gameState.lastPush,
    winner: gameState.winner,
    reachable: gameState.reachable,
    players: gameState.players.map(p => {
      const base = {
        id: p.id,
        name: p.name,
        color: p.color,
        playerIndex: p.playerIndex,
        row: p.row,
        col: p.col,
        collected: p.collected,
        totalCards: p.cards.length,
        finished: p.finished,
      };
      if (p.id === requestingPlayerId) {
        // Show current target
        base.currentTarget = p.cardIndex < p.cards.length ? p.cards[p.cardIndex] : null;
        base.isMe = true;
      }
      return base;
    }),
  };
  return state;
}

// ─── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Create room
  socket.on('create-room', (name) => {
    const roomCode = generateRoomCode();
    const playerId = socket.id;
    rooms[roomCode] = {
      code: roomCode,
      hostId: playerId,
      players: [{ id: playerId, name: name || 'Player 1' }],
      gameState: null,
      started: false,
    };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerId = playerId;
    socket.emit('room-created', { roomCode, playerId });
    console.log(`Room ${roomCode} created by ${name}`);
  });

  // Join room
  socket.on('join-room', ({ roomCode, name }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    if (room.started) {
      socket.emit('error', 'Game already started');
      return;
    }
    if (room.players.length >= 4) {
      socket.emit('error', 'Room is full');
      return;
    }
    const playerId = socket.id;
    room.players.push({ id: playerId, name: name || `Player ${room.players.length + 1}` });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerId = playerId;

    socket.emit('room-joined', { playerId, players: room.players });
    // Notify others
    io.to(roomCode).emit('player-joined', { players: room.players });
    console.log(`${name} joined room ${roomCode}`);
  });

  // Start game (host only)
  socket.on('start-game', (roomCode) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) {
      socket.emit('error', 'Only host can start');
      return;
    }
    if (room.players.length < 2) {
      socket.emit('error', 'Need at least 2 players');
      return;
    }
    room.gameState = createGameState(room.players);
    room.started = true;

    // Send each player their own view
    for (const p of room.gameState.players) {
      const clientSocket = io.sockets.sockets.get(p.id);
      if (clientSocket) {
        clientSocket.emit('game-started', buildClientState(room.gameState, p.id));
      }
    }
    console.log(`Game started in room ${roomCode}`);
  });

  // Rotate free tile
  socket.on('rotate-free-tile', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) return;
    if (gs.phase !== 'push') return;

    const ft = gs.freeTile;
    const newRotation = (ft.rotation + 1) % 4;
    gs.freeTile = {
      ...ft,
      rotation: newRotation,
      openings: rotateTile(TILE_TYPES[ft.type], newRotation)
    };

    broadcastGameState(room);
  });

  // Push tile
  socket.on('push-tile', ({ roomCode, type, index, dir }) => {
    const room = rooms[roomCode];
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', 'Not your turn');
      return;
    }
    if (gs.phase !== 'push') {
      socket.emit('error', 'Not push phase');
      return;
    }

    // Check no-undo rule
    if (gs.lastPush) {
      const opp = oppositeMove(gs.lastPush.type, gs.lastPush.index, gs.lastPush.dir);
      if (opp && opp.type === type && opp.index === index && opp.dir === dir) {
        socket.emit('error', 'Cannot reverse the previous push');
        return;
      }
    }

    // Validate
    if (![1, 3, 5].includes(index)) {
      socket.emit('error', 'Invalid push index');
      return;
    }

    // Do the push (mutates player positions in-place on copies)
    const playersCopy = gs.players.map(p => ({ ...p }));
    const result = pushTile(gs.board, gs.freeTile, playersCopy, type, index, dir);

    gs.board = result.board;
    gs.freeTile = result.freeTile;
    // Update player positions
    for (let i = 0; i < gs.players.length; i++) {
      gs.players[i].row = playersCopy[i].row;
      gs.players[i].col = playersCopy[i].col;
    }

    gs.lastPush = { type, index, dir };
    gs.phase = 'move';

    // Compute reachable tiles
    const cp = gs.players[gs.currentPlayerIndex];
    gs.reachable = getReachable(gs.board, cp.row, cp.col);

    broadcastGameState(room);
  });

  // Move player
  socket.on('move-player', ({ roomCode, row, col }) => {
    const room = rooms[roomCode];
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', 'Not your turn');
      return;
    }
    if (gs.phase !== 'move') {
      socket.emit('error', 'Not move phase');
      return;
    }

    // Validate reachable
    if (!gs.reachable || !gs.reachable[row][col]) {
      socket.emit('error', 'Tile not reachable');
      return;
    }

    currentPlayer.row = row;
    currentPlayer.col = col;

    // Check treasure collection
    const tile = gs.board[row][col];
    if (tile && tile.treasure && currentPlayer.cardIndex < currentPlayer.cards.length) {
      const target = currentPlayer.cards[currentPlayer.cardIndex];
      if (tile.treasure === target) {
        currentPlayer.collected += 1;
        currentPlayer.cardIndex += 1;
        // Remove treasure from tile
        tile.treasure = null;
      }
    }

    // Check win condition: all cards collected + back at start
    const start = PLAYER_STARTS[currentPlayer.playerIndex];
    if (currentPlayer.cardIndex >= currentPlayer.cards.length &&
        row === start.row && col === start.col) {
      gs.winner = currentPlayer.id;
      gs.phase = 'ended';
      broadcastGameState(room);
      return;
    }

    // Next player's turn
    gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.players.length;
    gs.phase = 'push';
    gs.reachable = null;

    broadcastGameState(room);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms[roomCode];
    if (!room) return;

    // Remove player from room
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      delete rooms[roomCode];
      return;
    }

    // Transfer host if needed
    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
    }

    if (room.gameState && room.started) {
      // Remove from game state
      const pIdx = room.gameState.players.findIndex(p => p.id === socket.id);
      if (pIdx !== -1) {
        room.gameState.players.splice(pIdx, 1);
        // Fix currentPlayerIndex
        if (room.gameState.players.length === 0) {
          delete rooms[roomCode];
          return;
        }
        if (room.gameState.currentPlayerIndex >= room.gameState.players.length) {
          room.gameState.currentPlayerIndex = 0;
        }
        // Reassign playerIndex
        room.gameState.players.forEach((p, i) => { p.playerIndex = i; });
      }
      broadcastGameState(room);
    } else {
      io.to(roomCode).emit('player-joined', { players: room.players });
    }
  });
});

function broadcastGameState(room) {
  for (const p of room.gameState.players) {
    const clientSocket = io.sockets.sockets.get(p.id);
    if (clientSocket) {
      clientSocket.emit('game-state', buildClientState(room.gameState, p.id));
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

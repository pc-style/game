const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 1000 / 60;

const TABLE_WIDTH = 960;
const TABLE_HEIGHT = 540;
const CENTER_X = TABLE_WIDTH / 2;
const CENTER_Y = TABLE_HEIGHT / 2;
const PADDLE_RADIUS = 40;
const PUCK_RADIUS = 18;
const PUCK_START_SPEED = 6.5;
const PUCK_FRICTION = 0.993;

const app = express();
app.use(cors());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'air hockey server is feeling speedy today' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

const rooms = new Map();

function createRoom(roomId) {
  const room = {
    id: roomId,
    players: {},
    puck: spawnPuck(),
    scores: { left: 0, right: 0 },
    goalFlash: null,
  };
  rooms.set(roomId, room);
  return room;
}

function spawnPuck(lastScorer) {
  const angle = Math.random() * Math.PI * 2;
  const speed = PUCK_START_SPEED;
  const direction = lastScorer === 'left' ? 1 : lastScorer === 'right' ? -1 : Math.sign(Math.cos(angle)) || 1;
  return {
    x: CENTER_X,
    y: CENTER_Y,
    vx: Math.abs(Math.cos(angle)) * speed * direction,
    vy: Math.sin(angle) * speed,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildState(room) {
  return {
    width: TABLE_WIDTH,
    height: TABLE_HEIGHT,
    paddles: {
      left: room.players.left ? serializePaddle(room.players.left) : null,
      right: room.players.right ? serializePaddle(room.players.right) : null,
    },
    puck: { ...room.puck },
    scores: { ...room.scores },
    waitingFor: 2 - Object.keys(room.players).length,
    goalFlash: room.goalFlash && room.goalFlash.until > Date.now() ? room.goalFlash.side : null,
  };
}

function serializePaddle(paddle) {
  return {
    x: paddle.x,
    y: paddle.y,
    vx: paddle.vx,
    vy: paddle.vy,
  };
}

io.on('connection', (socket) => {
  console.log('a curious socket connected');

  socket.on('join-room', ({ roomId }) => {
    if (!roomId) {
      socket.emit('error-message', 'Room id is required');
      return;
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = createRoom(roomId);
      console.log(`created room ${roomId}`);
    }

    if (room.players.left && room.players.right) {
      socket.emit('room-full');
      return;
    }

    const side = room.players.left ? 'right' : 'left';
    const startX = side === 'left' ? PADDLE_RADIUS * 2 : TABLE_WIDTH - PADDLE_RADIUS * 2;
    room.players[side] = {
      id: socket.id,
      x: startX,
      y: CENTER_Y,
      vx: 0,
      vy: 0,
      lastUpdate: Date.now(),
    };

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.side = side;

    socket.emit('joined', { side, state: buildState(room) });
    socket.to(roomId).emit('player-joined', { side });
    console.log(`player ${side} joined ${roomId}`);
  });

  socket.on('paddle-update', (payload = {}) => {
    const { roomId, side } = socket.data;
    if (!roomId || !side) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const paddle = room.players[side];
    if (!paddle) return;

    const { x, y, vx, vy } = payload;
    if (typeof x === 'number') {
      paddle.x = clamp(x, side === 'left' ? PADDLE_RADIUS : CENTER_X + PADDLE_RADIUS, side === 'left' ? CENTER_X - PADDLE_RADIUS : TABLE_WIDTH - PADDLE_RADIUS);
    }
    if (typeof y === 'number') {
      paddle.y = clamp(y, PADDLE_RADIUS, TABLE_HEIGHT - PADDLE_RADIUS);
    }
    if (typeof vx === 'number') paddle.vx = vx;
    if (typeof vy === 'number') paddle.vy = vy;
    paddle.lastUpdate = Date.now();
  });

  socket.on('disconnect', () => {
    const { roomId, side } = socket.data;
    if (!roomId || !side) {
      console.log('socket disconnected before joining a room');
      return;
    }
    const room = rooms.get(roomId);
    if (!room) return;

    delete room.players[side];
    socket.to(roomId).emit('player-left', { side });
    console.log(`player ${side} left ${roomId}`);

    if (!room.players.left && !room.players.right) {
      rooms.delete(roomId);
      console.log(`room ${roomId} retired`);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    updateRoom(room, now);
    io.to(roomId).emit('state', buildState(room));
  });
}, TICK_RATE);

function updateRoom(room) {
  const puck = room.puck;
  puck.x += puck.vx;
  puck.y += puck.vy;

  puck.vx *= PUCK_FRICTION;
  puck.vy *= PUCK_FRICTION;

  if (puck.y <= PUCK_RADIUS) {
    puck.y = PUCK_RADIUS;
    puck.vy = Math.abs(puck.vy);
  } else if (puck.y >= TABLE_HEIGHT - PUCK_RADIUS) {
    puck.y = TABLE_HEIGHT - PUCK_RADIUS;
    puck.vy = -Math.abs(puck.vy);
  }

  const leftPaddle = room.players.left;
  const rightPaddle = room.players.right;

  handlePaddle(leftPaddle, 'left');
  handlePaddle(rightPaddle, 'right');

  if (leftPaddle) collideWithPaddle(puck, leftPaddle);
  if (rightPaddle) collideWithPaddle(puck, rightPaddle);

  if (puck.x <= -PUCK_RADIUS) {
    scoreGoal(room, 'right');
  } else if (puck.x >= TABLE_WIDTH + PUCK_RADIUS) {
    scoreGoal(room, 'left');
  }
}

function handlePaddle(paddle, side) {
  if (!paddle) return;
  paddle.x = clamp(
    paddle.x,
    side === 'left' ? PADDLE_RADIUS : CENTER_X + PADDLE_RADIUS,
    side === 'left' ? CENTER_X - PADDLE_RADIUS : TABLE_WIDTH - PADDLE_RADIUS
  );
  paddle.y = clamp(paddle.y, PADDLE_RADIUS, TABLE_HEIGHT - PADDLE_RADIUS);

  paddle.vx *= 0.9;
  paddle.vy *= 0.9;
}

function collideWithPaddle(puck, paddle) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const distSq = dx * dx + dy * dy;
  const combined = PUCK_RADIUS + PADDLE_RADIUS;

  if (distSq >= combined * combined || distSq === 0) return;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;

  const relativeSpeed = puck.vx * nx + puck.vy * ny;
  if (relativeSpeed < 0) {
    puck.vx -= 2 * relativeSpeed * nx;
    puck.vy -= 2 * relativeSpeed * ny;
  }

  puck.vx += paddle.vx * 0.55;
  puck.vy += paddle.vy * 0.55;

  const overlap = combined - dist;
  puck.x += nx * overlap;
  puck.y += ny * overlap;
}

function scoreGoal(room, scorer) {
  room.scores[scorer] += 1;
  console.log(`goal scored for ${scorer} in ${room.id}`);
  room.goalFlash = { side: scorer, until: Date.now() + 800 };
  room.puck = spawnPuck(scorer);
}

httpServer.listen(PORT, () => {
  console.log(`Air hockey server ready on port ${PORT}`);
});

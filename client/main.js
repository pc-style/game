import { io } from 'socket.io-client';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');

canvas.style.touchAction = 'none';

const TABLE_WIDTH = canvas.width;
const TABLE_HEIGHT = canvas.height;
const CENTER_X = TABLE_WIDTH / 2;
const CENTER_Y = TABLE_HEIGHT / 2;
const PADDLE_RADIUS = 40;
const PUCK_RADIUS = 18;

const roomId = new URLSearchParams(window.location.search).get('room');

const defaultServer = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : `${window.location.protocol}//${window.location.hostname}:3000`;
const serverUrl = import.meta.env.VITE_SERVER_URL || defaultServer;

const socket = io(serverUrl, {
  transports: ['websocket'],
  autoConnect: false,
});

const paddles = {
  left: { x: PADDLE_RADIUS * 2, y: CENTER_Y, vx: 0, vy: 0 },
  right: { x: TABLE_WIDTH - PADDLE_RADIUS * 2, y: CENTER_Y, vx: 0, vy: 0 },
};

const serverPaddles = {
  left: { x: paddles.left.x, y: paddles.left.y, vx: 0, vy: 0, ready: false },
  right: { x: paddles.right.x, y: paddles.right.y, vx: 0, vy: 0, ready: false },
};

const puck = { x: CENTER_X, y: CENTER_Y, vx: 0, vy: 0 };
const scores = { left: 0, right: 0 };

let goalFlashSide = null;
let goalFlashTimer = 0;
let waitingFor = 1;

let playerSide = null;
let opponentSide = null;
let roomFull = false;

let canvasBounds = null;

const pointer = {
  active: false,
  x: CENTER_X,
  y: CENTER_Y,
};

function updateCanvasBounds() {
  canvasBounds = canvas.getBoundingClientRect();
}

updateCanvasBounds();
window.addEventListener('resize', updateCanvasBounds);

function setInfo(text) {
  info.textContent = text;
}

if (!roomId) {
  setInfo('Add ?room=my-cool-room to the URL and reload.');
} else {
  setInfo('Connecting to the rink...');
  socket.connect();
  socket.emit('join-room', { roomId });
}

socket.on('connect', () => {
  console.log('socket connected, time to play');
});

socket.on('disconnect', () => {
  console.log('socket left the building');
  setInfo('Connection lost. Refresh to try again.');
});

socket.on('room-full', () => {
  roomFull = true;
  setInfo('That room is already busy. Try another room id!');
});

socket.on('error-message', (message) => {
  setInfo(message || 'Something odd happened.');
});

socket.on('joined', ({ side, state }) => {
  playerSide = side;
  opponentSide = side === 'left' ? 'right' : 'left';
  console.log(`joined room as ${side}`);
  applyServerState(state);
  if (state?.paddles?.[side]) {
    pointer.x = state.paddles[side].x;
    pointer.y = state.paddles[side].y;
  } else if (paddles[side]) {
    pointer.x = paddles[side].x;
    pointer.y = paddles[side].y;
  }
  updateInfoBanner();
});

socket.on('player-joined', ({ side }) => {
  if (!roomFull) {
    console.log(`${side} player joined`);
    if (!playerSide) return;
    waitingFor = Math.max(0, waitingFor - 1);
    updateInfoBanner();
  }
});

socket.on('player-left', ({ side }) => {
  console.log(`${side} player took a break`);
  if (side === opponentSide) {
    waitingFor = 1;
    updateInfoBanner();
  }
});

socket.on('state', (state) => {
  applyServerState(state);
});

function canvasToTable(clientX, clientY) {
  if (!canvasBounds) updateCanvasBounds();
  const x = ((clientX - canvasBounds.left) / canvasBounds.width) * TABLE_WIDTH;
  const y = ((clientY - canvasBounds.top) / canvasBounds.height) * TABLE_HEIGHT;
  return { x, y };
}

function clampToSide(x, y, side) {
  const minX = side === 'left' ? PADDLE_RADIUS : CENTER_X + PADDLE_RADIUS;
  const maxX = side === 'left' ? CENTER_X - PADDLE_RADIUS : TABLE_WIDTH - PADDLE_RADIUS;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(PADDLE_RADIUS, Math.min(TABLE_HEIGHT - PADDLE_RADIUS, y)),
  };
}

function handlePointer(event) {
  const { x, y } = canvasToTable(event.clientX, event.clientY);
  pointer.x = x;
  pointer.y = y;
  pointer.active = true;
}

canvas.addEventListener('pointermove', handlePointer);
canvas.addEventListener('pointerdown', handlePointer);
canvas.addEventListener('pointerup', handlePointer);
canvas.addEventListener('pointerenter', handlePointer);
canvas.addEventListener('pointerleave', () => {
  pointer.active = false;
});
window.addEventListener('blur', () => {
  pointer.active = false;
});

function applyServerState(state) {
  if (!state) return;
  waitingFor = state.waitingFor;
  if (state.puck) {
    puck.x = state.puck.x;
    puck.y = state.puck.y;
    puck.vx = state.puck.vx;
    puck.vy = state.puck.vy;
  }
  if (state.scores) {
    scores.left = state.scores.left;
    scores.right = state.scores.right;
  }
  if (typeof state.goalFlash === 'string') {
    goalFlashSide = state.goalFlash;
    goalFlashTimer = 0.45;
  }
  ['left', 'right'].forEach((side) => {
    if (state.paddles && state.paddles[side]) {
      serverPaddles[side] = { ...state.paddles[side], ready: true };
      if (playerSide === side) {
        paddles[side].x = paddles[side].x * 0.5 + state.paddles[side].x * 0.5;
        paddles[side].y = paddles[side].y * 0.5 + state.paddles[side].y * 0.5;
      }
    }
  });
  updateInfoBanner();
}

function updateInfoBanner() {
  if (!roomId) return;
  if (!playerSide) {
    setInfo('Still figuring out which paddle is yours...');
    return;
  }
  if (roomFull) {
    setInfo('That room is full. Maybe spin up another one?');
    return;
  }
  if (waitingFor > 0) {
    setInfo('Waiting for opponent... send them this URL.');
    return;
  }
  setInfo(
    `Game on! Glide your mouse on the ${playerSide === 'left' ? 'left' : 'right'} half of the rink.`
  );
}

let lastSend = 0;
let lastTime = performance.now();

function gameLoop(now) {
  const delta = Math.min((now - lastTime) / 16.666, 1.5);
  lastTime = now;

  update(delta);
  draw();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

function update(delta) {
  goalFlashTimer = Math.max(0, goalFlashTimer - delta * 0.016);

  if (playerSide) {
    const paddle = paddles[playerSide];
    if (paddle) {
      const prevX = paddle.x;
      const prevY = paddle.y;

      const target = pointer.active
        ? clampToSide(pointer.x, pointer.y, playerSide)
        : clampToSide(paddle.x, paddle.y, playerSide);

      const blend = pointer.active ? 0.65 : 0.18;
      const factor = 1 - Math.pow(1 - blend, delta);
      paddle.x += (target.x - paddle.x) * factor;
      paddle.y += (target.y - paddle.y) * factor;

      clampPaddle(paddle, playerSide);

      const safeDelta = Math.max(delta, 0.0001);
      paddle.vx = (paddle.x - prevX) / safeDelta;
      paddle.vy = (paddle.y - prevY) / safeDelta;

      if (!pointer.active) {
        paddle.vx *= 0.8;
        paddle.vy *= 0.8;
      }

      maybeSendPaddle();
    }
  }

  const opponent = opponentSide && paddles[opponentSide];
  const opponentServer = opponentSide && serverPaddles[opponentSide];
  if (opponent && opponentServer && opponentServer.ready) {
    opponent.x += (opponentServer.x - opponent.x) * 0.28;
    opponent.y += (opponentServer.y - opponent.y) * 0.28;
    opponent.vx = opponentServer.vx;
    opponent.vy = opponentServer.vy;
  }
}

function maybeSendPaddle() {
  if (!playerSide) return;
  const now = performance.now();
  if (now - lastSend < 28) return;
  const paddle = paddles[playerSide];
  socket.emit('paddle-update', {
    x: paddle.x,
    y: paddle.y,
    vx: paddle.vx,
    vy: paddle.vy,
  });
  lastSend = now;
}

function clampPaddle(paddle, side) {
  const minX = side === 'left' ? PADDLE_RADIUS : CENTER_X + PADDLE_RADIUS;
  const maxX = side === 'left' ? CENTER_X - PADDLE_RADIUS : TABLE_WIDTH - PADDLE_RADIUS;
  paddle.x = Math.max(minX, Math.min(maxX, paddle.x));
  paddle.y = Math.max(PADDLE_RADIUS, Math.min(TABLE_HEIGHT - PADDLE_RADIUS, paddle.y));
}

function draw() {
  ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  ctx.fillStyle = '#050912';
  ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

  ctx.fillStyle = 'rgba(88, 180, 255, 0.06)';
  ctx.fillRect(0, 0, 80, TABLE_HEIGHT);
  ctx.fillStyle = 'rgba(255, 120, 160, 0.06)';
  ctx.fillRect(TABLE_WIDTH - 80, 0, 80, TABLE_HEIGHT);

  ctx.strokeStyle = 'rgba(240, 245, 255, 0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 16]);
  ctx.beginPath();
  ctx.moveTo(CENTER_X, 0);
  ctx.lineTo(CENTER_X, TABLE_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(240, 245, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CENTER_X, CENTER_Y, 90, 0, Math.PI * 2);
  ctx.stroke();

  drawScoreboard();

  drawPaddle(paddles.left, '#58b4ff');
  drawPaddle(paddles.right, '#ff7899');
  drawPuck();

  if (waitingFor > 0) {
    drawMessage('Waiting for opponent... give your mouse a twirl.');
  } else if (!playerSide) {
    drawMessage('Connecting...');
  }

  if (goalFlashTimer > 0 && goalFlashSide) {
    const alpha = goalFlashTimer * 0.9;
    ctx.fillStyle = goalFlashSide === 'left' ? `rgba(88, 180, 255, ${alpha})` : `rgba(255, 120, 160, ${alpha})`;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
  }
}

function drawScoreboard() {
  const text = `${scores.left} : ${scores.right}`;
  ctx.font = 'bold 36px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240, 245, 255, 0.95)';
  ctx.fillText(text, CENTER_X, 54);
}

function drawMessage(text) {
  ctx.font = '24px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240, 245, 255, 0.85)';
  ctx.fillText(text, CENTER_X, CENTER_Y);
}

function drawPaddle(paddle, color) {
  if (!paddle) return;
  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(paddle.x, paddle.y, PADDLE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPuck() {
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#fefefe';
  ctx.fillStyle = '#fefefe';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, PUCK_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

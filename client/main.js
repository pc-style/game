import { io } from 'socket.io-client';

// okay, let's grab our canvas and set up the rendering context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM elements for UI
const statusEl = document.getElementById('status');
const score1El = document.getElementById('score1');
const score2El = document.getElementById('score2');

// game dimensions
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PUCK_RADIUS = 15;
const PADDLE_RADIUS = 25;
const FRICTION = 0.99;
const MAX_SPEED = 8;
const PADDLE_SPEED = 5;
const GOAL_WIDTH = 100; // size of the goal zones

// connect to the server (change this for production)
const SERVER_URL = 'http://localhost:3000';
const socket = io(SERVER_URL);

// game state
let myPlayerNumber = null;
let gameStarted = false;
let roomId = null;

// player paddles
let myPaddle = { x: 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };
let opponentPaddle = { x: GAME_WIDTH - 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };

// the puck!
let puck = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT / 2,
  vx: 0,
  vy: 0,
  radius: PUCK_RADIUS
};

// scores
let scores = { player1: 0, player2: 0 };

// keyboard input tracking
const keys = {};

// interpolation for smooth opponent movement
let opponentTarget = { ...opponentPaddle };

// animation state for goal effects
let goalFlashAlpha = 0;

// helper: show a status message
function showStatus(message) {
  statusEl.textContent = message;
  statusEl.classList.add('show');
}

function hideStatus() {
  statusEl.classList.remove('show');
}

// extract room id from URL (?room=abc123)
function getRoomId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'default-room';
}

// okay, let's set up all our socket event listeners
socket.on('connect', () => {
  console.log('🔌 connected to server');
  roomId = getRoomId();
  socket.emit('join-room', roomId);
  showStatus('Waiting for opponent...');
});

socket.on('player-assigned', (data) => {
  myPlayerNumber = data.playerNumber;
  console.log(`🎮 I am player ${myPlayerNumber}`);

  // set up initial paddle positions based on player number
  if (myPlayerNumber === 1) {
    myPaddle = { x: 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };
    opponentPaddle = { x: GAME_WIDTH - 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };
  } else {
    myPaddle = { x: GAME_WIDTH - 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };
    opponentPaddle = { x: 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS };
  }

  // sync initial game state
  if (data.gameState) {
    puck = data.gameState.puck;
    scores = data.gameState.scores;
    updateScoreDisplay();
  }
});

socket.on('game-start', (gameState) => {
  console.log('🏁 game started!');
  gameStarted = true;
  hideStatus();

  // sync the initial game state
  puck = gameState.puck;
  scores = gameState.scores;
  updateScoreDisplay();
});

socket.on('opponent-move', (data) => {
  // smoothly interpolate to the opponent's position
  opponentTarget.x = data.x;
  opponentTarget.y = data.y;
});

socket.on('puck-sync', (puckData) => {
  // only player 1 is authoritative for puck physics
  // player 2 just receives updates
  if (myPlayerNumber === 2) {
    puck.x = puckData.x;
    puck.y = puckData.y;
    puck.vx = puckData.vx;
    puck.vy = puckData.vy;
  }
});

socket.on('goal', (data) => {
  console.log(`⚽ goal scored by ${data.scorer}!`);
  scores = data.scores;
  puck = data.puck;
  updateScoreDisplay();

  // flash effect!
  goalFlashAlpha = 1.0;

  // add pulse animation to the scoreboard
  const scoreboardEl = document.getElementById('scoreboard');
  scoreboardEl.classList.add('pulse');
  setTimeout(() => scoreboardEl.classList.remove('pulse'), 500);
});

socket.on('opponent-left', () => {
  console.log('👋 opponent left the game');
  showStatus('Opponent disconnected. Waiting for new player...');
  gameStarted = false;
});

socket.on('room-full', () => {
  showStatus('Room is full! Try a different room.');
});

// handle keyboard input
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// update paddle position based on input
function updateMyPaddle() {
  let dx = 0;
  let dy = 0;

  // player 1 uses WASD
  if (myPlayerNumber === 1) {
    if (keys['w']) dy -= PADDLE_SPEED;
    if (keys['s']) dy += PADDLE_SPEED;
    if (keys['a']) dx -= PADDLE_SPEED;
    if (keys['d']) dx += PADDLE_SPEED;
  }
  // player 2 uses arrow keys
  else if (myPlayerNumber === 2) {
    if (keys['arrowup']) dy -= PADDLE_SPEED;
    if (keys['arrowdown']) dy += PADDLE_SPEED;
    if (keys['arrowleft']) dx -= PADDLE_SPEED;
    if (keys['arrowright']) dx += PADDLE_SPEED;
  }

  // apply movement
  myPaddle.x += dx;
  myPaddle.y += dy;

  // clamp to valid area (keep paddles on their side)
  const halfWidth = GAME_WIDTH / 2;
  if (myPlayerNumber === 1) {
    // player 1 stays on left side
    myPaddle.x = Math.max(PADDLE_RADIUS, Math.min(halfWidth - PADDLE_RADIUS, myPaddle.x));
  } else {
    // player 2 stays on right side
    myPaddle.x = Math.max(halfWidth + PADDLE_RADIUS, Math.min(GAME_WIDTH - PADDLE_RADIUS, myPaddle.x));
  }

  myPaddle.y = Math.max(PADDLE_RADIUS, Math.min(GAME_HEIGHT - PADDLE_RADIUS, myPaddle.y));

  // send position to server if we moved
  if (dx !== 0 || dy !== 0) {
    socket.emit('paddle-move', { x: myPaddle.x, y: myPaddle.y });
  }
}

// smooth interpolation for opponent paddle
function updateOpponentPaddle() {
  const lerpFactor = 0.2; // smoothing factor
  opponentPaddle.x += (opponentTarget.x - opponentPaddle.x) * lerpFactor;
  opponentPaddle.y += (opponentTarget.y - opponentPaddle.y) * lerpFactor;
}

// physics time! only player 1 runs the authoritative puck simulation
function updatePuck() {
  if (!gameStarted || myPlayerNumber !== 1) return;

  // move the puck
  puck.x += puck.vx;
  puck.y += puck.vy;

  // apply friction
  puck.vx *= FRICTION;
  puck.vy *= FRICTION;

  // bounce off top and bottom walls
  if (puck.y - puck.radius < 0) {
    puck.y = puck.radius;
    puck.vy *= -1;
  }
  if (puck.y + puck.radius > GAME_HEIGHT) {
    puck.y = GAME_HEIGHT - puck.radius;
    puck.vy *= -1;
  }

  // check for goals on left and right
  if (puck.x - puck.radius < 0) {
    // player 2 scored!
    socket.emit('goal-scored', { scorer: 'player2' });
    return; // server will reset the puck
  }
  if (puck.x + puck.radius > GAME_WIDTH) {
    // player 1 scored!
    socket.emit('goal-scored', { scorer: 'player1' });
    return;
  }

  // collision with my paddle
  checkPaddleCollision(myPaddle);

  // collision with opponent paddle
  checkPaddleCollision(opponentPaddle);

  // cap max speed
  const speed = Math.sqrt(puck.vx * puck.vx + puck.vy * puck.vy);
  if (speed > MAX_SPEED) {
    puck.vx = (puck.vx / speed) * MAX_SPEED;
    puck.vy = (puck.vy / speed) * MAX_SPEED;
  }

  // send puck state to server
  socket.emit('puck-update', puck);
}

// check if puck hits a paddle and bounce it
function checkPaddleCollision(paddle) {
  const dx = puck.x - paddle.x;
  const dy = puck.y - paddle.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < puck.radius + paddle.radius) {
    // collision detected! let's bounce
    const angle = Math.atan2(dy, dx);
    const targetX = paddle.x + Math.cos(angle) * (puck.radius + paddle.radius);
    const targetY = paddle.y + Math.sin(angle) * (puck.radius + paddle.radius);

    // move puck to valid position
    puck.x = targetX;
    puck.y = targetY;

    // reflect velocity
    const normalX = dx / distance;
    const normalY = dy / distance;
    const relativeVelocity = puck.vx * normalX + puck.vy * normalY;

    // only bounce if moving toward the paddle
    if (relativeVelocity < 0) {
      puck.vx -= 2 * relativeVelocity * normalX;
      puck.vy -= 2 * relativeVelocity * normalY;

      // add a bit of extra energy on hit for fun
      puck.vx *= 1.1;
      puck.vy *= 1.1;
    }
  }
}

// update the score display
function updateScoreDisplay() {
  score1El.textContent = scores.player1;
  score2El.textContent = scores.player2;
}

// rendering time! let's make it pretty
function render() {
  // clear the canvas
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // draw goal flash effect
  if (goalFlashAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${goalFlashAlpha * 0.3})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    goalFlashAlpha -= 0.02; // fade out
  }

  // draw center line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(GAME_WIDTH / 2, 0);
  ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  // draw goal zones
  ctx.fillStyle = 'rgba(79, 172, 254, 0.05)';
  ctx.fillRect(0, 0, GOAL_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = 'rgba(240, 147, 251, 0.05)';
  ctx.fillRect(GAME_WIDTH - GOAL_WIDTH, 0, GOAL_WIDTH, GAME_HEIGHT);

  // draw player 1 paddle (blue with glow)
  const player1Paddle = myPlayerNumber === 1 ? myPaddle : opponentPaddle;
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#4facfe';
  ctx.fillStyle = '#4facfe';
  ctx.beginPath();
  ctx.arc(player1Paddle.x, player1Paddle.y, player1Paddle.radius, 0, Math.PI * 2);
  ctx.fill();

  // inner glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(player1Paddle.x, player1Paddle.y, player1Paddle.radius * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // draw player 2 paddle (pink with glow)
  const player2Paddle = myPlayerNumber === 2 ? myPaddle : opponentPaddle;
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#f093fb';
  ctx.fillStyle = '#f093fb';
  ctx.beginPath();
  ctx.arc(player2Paddle.x, player2Paddle.y, player2Paddle.radius, 0, Math.PI * 2);
  ctx.fill();

  // inner glow
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(player2Paddle.x, player2Paddle.y, player2Paddle.radius * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // draw the puck with a nice glow
  ctx.shadowBlur = 25;
  ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
  ctx.fill();

  // inner detail
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(200, 200, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // reset shadow
  ctx.shadowBlur = 0;
}

// main game loop
function gameLoop() {
  if (gameStarted) {
    updateMyPaddle();
    updateOpponentPaddle();
    updatePuck();
  }

  render();
  requestAnimationFrame(gameLoop);
}

// let's go!
console.log('🏒 Air Hockey starting...');
console.log(`   Room: ${getRoomId()}`);
gameLoop();

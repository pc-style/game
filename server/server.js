const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// okay, let's enable CORS so we can connect from localhost:5173
app.use(cors());

const io = new Server(server, {
  cors: {
    origin: '*', // wide open for local dev
    methods: ['GET', 'POST']
  }
});

// tracking all our game rooms
const rooms = new Map();

// game constants - these define our physics world
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PUCK_RADIUS = 15;
const PADDLE_RADIUS = 25;
const FRICTION = 0.99;
const MAX_SPEED = 8;

// helper: create a fresh game state
function createGameState() {
  return {
    puck: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      vx: (Math.random() - 0.5) * 4, // random start direction
      vy: (Math.random() - 0.5) * 4,
      radius: PUCK_RADIUS
    },
    players: {
      player1: { x: 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS },
      player2: { x: GAME_WIDTH - 100, y: GAME_HEIGHT / 2, radius: PADDLE_RADIUS }
    },
    scores: { player1: 0, player2: 0 }
  };
}

io.on('connection', (socket) => {
  console.log(`🎮 player connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    // get or create the room
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        players: [],
        gameState: createGameState()
      });
      console.log(`🆕 created room: ${roomId}`);
    }

    const room = rooms.get(roomId);

    // only allow 2 players per room
    if (room.players.length >= 2) {
      socket.emit('room-full');
      console.log(`❌ room ${roomId} is full`);
      return;
    }

    // assign player number based on who joined first
    const playerNumber = room.players.length === 0 ? 1 : 2;
    room.players.push({ id: socket.id, playerNumber });

    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerNumber = playerNumber;

    console.log(`✅ player ${socket.id} joined room ${roomId} as player ${playerNumber}`);

    // tell this player their number and current game state
    socket.emit('player-assigned', {
      playerNumber,
      gameState: room.gameState
    });

    // if we now have 2 players, let's start the game!
    if (room.players.length === 2) {
      console.log(`🏁 room ${roomId} is full, starting game!`);
      io.to(roomId).emit('game-start', room.gameState);
    }
  });

  // when a player moves their paddle
  socket.on('paddle-move', (data) => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    // update the paddle position in our state
    const playerKey = `player${socket.playerNumber}`;
    room.gameState.players[playerKey] = {
      ...room.gameState.players[playerKey],
      x: data.x,
      y: data.y
    };

    // broadcast to the other player in the room
    socket.to(socket.roomId).emit('opponent-move', {
      playerNumber: socket.playerNumber,
      x: data.x,
      y: data.y
    });
  });

  // server-side physics tick for the puck
  socket.on('puck-update', (puckData) => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.gameState.puck = puckData;

    // broadcast to everyone in the room
    io.to(socket.roomId).emit('puck-sync', puckData);
  });

  // when someone scores!
  socket.on('goal-scored', (data) => {
    if (!socket.roomId) return;

    const room = rooms.get(socket.roomId);
    if (!room) return;

    console.log(`⚽ goal scored in room ${socket.roomId}! ${data.scorer} scored`);

    // update the score
    room.gameState.scores[data.scorer]++;

    // reset puck to center with random velocity
    room.gameState.puck = {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      radius: PUCK_RADIUS
    };

    // tell everyone about the goal and new state
    io.to(socket.roomId).emit('goal', {
      scorer: data.scorer,
      scores: room.gameState.scores,
      puck: room.gameState.puck
    });
  });

  socket.on('disconnect', () => {
    console.log(`👋 player disconnected: ${socket.id}`);

    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        // remove the player from the room
        room.players = room.players.filter(p => p.id !== socket.id);

        // notify the other player
        socket.to(socket.roomId).emit('opponent-left');

        // if room is empty, clean it up
        if (room.players.length === 0) {
          rooms.delete(socket.roomId);
          console.log(`🗑️ deleted empty room: ${socket.roomId}`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Air Hockey server running on port ${PORT}`);
  console.log(`   Ready for players to connect!`);
});

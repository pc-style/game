# Air Hockey - Online Multiplayer Game

A real-time 2-player air hockey game built with Node.js, Express, Socket.io, and HTML5 Canvas.

## Features

- **Real-time multiplayer** using Socket.io
- **Room-based matchmaking** - share a room URL with a friend
- **Smooth physics** - elastic collisions, friction, and velocity
- **Beautiful visuals** - glowing paddles, puck trails, and scoring effects
- **Client-side prediction** with interpolation for smooth gameplay
- **Responsive controls** - WASD for Player 1, Arrow keys for Player 2

## Project Structure

```
/client - Frontend (Vite + Vanilla JS + Canvas)
/server - Backend (Node.js + Express + Socket.io)
```

## Quick Start

### 1. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Start the Server

```bash
cd server
node server.js
```

Server will run on `http://localhost:3000`

### 3. Start the Client

```bash
cd client
npm run dev
```

Client will run on `http://localhost:5173`

### 4. Play the Game

1. Open your browser to `http://localhost:5173/?room=test`
2. Open a second tab (or share the link with a friend) with the same room ID
3. Once both players connect, the game starts!

**Controls:**
- Player 1 (Blue): **W A S D** keys
- Player 2 (Pink): **Arrow keys**

## How It Works

### Physics
- Server-authoritative puck simulation (Player 1 runs physics, syncs to Player 2)
- Elastic collisions between puck and paddles
- Wall bounces with velocity reflection
- Friction applied each frame (~0.99)

### Networking
- Room-based matchmaking (max 2 players per room)
- Real-time position sync via Socket.io
- Client-side interpolation for smooth opponent movement
- Goal detection and score sync

### Scoring
- Puck crosses left boundary → Player 2 scores
- Puck crosses right boundary → Player 1 scores
- Puck resets to center after each goal

## Deployment

### Server (Render)
1. Push to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Set build command: `cd server && npm install`
5. Set start command: `cd server && node server.js`

### Client (Vercel)
1. Push to GitHub
2. Create new project on Vercel
3. Set root directory to `client`
4. Set build command: `npm run build`
5. Update `SERVER_URL` in `client/main.js` to your Render server URL

## Tech Stack

- **Frontend**: Vite, Vanilla JavaScript, HTML5 Canvas, Socket.io-client
- **Backend**: Node.js, Express, Socket.io, CORS
- **Real-time**: WebSocket (Socket.io)

## License

MIT - Have fun and happy hacking!

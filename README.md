# Labyrint - Multiplayer Board Game

A web-based multiplayer implementation of the classic Labyrinth board game for 2-4 players.

## Play Online

[https://deskovka-labyrint.onrender.com](https://deskovka-labyrint.onrender.com)

## How to Play

1. Open the game in your browser
2. Enter your name and create a room or join an existing one
3. Share the room code with friends (2-4 players)
4. The host starts the game

### Game Rules

**Goal:** Collect all your treasure cards, then return to your starting corner.

**Each turn has two phases:**

**Phase A - Push a tile:**
- Optionally rotate the free tile using the Rotate button
- Click a push arrow (→ ← ↑ ↓) around the board to slide the free tile in
- The tile pushed out becomes the new free tile
- You cannot reverse the previous push

**Phase B - Move your piece:**
- After pushing, blue highlights show where you can move
- Click any highlighted tile to move there
- If you land on your target treasure, you collect it and get the next one
- Click your current position to stay in place

**Win:** Collect all your treasures and return to your starting corner!

## Local Development

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

- **Backend:** Node.js + Express + Socket.io
- **Frontend:** HTML5 Canvas + Vanilla JavaScript
- **Deployment:** Render.com

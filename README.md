# ♠♥♣♦ Kamoted Blackjack ♦♣♥♠

Real-time multiplayer blackjack game with a premium casino UI. Play with your friends online!

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- 🃏 **Realistic Playing Cards** — Proper pip layouts, face card designs, 3D flip animations
- 🎰 **Casino Chips** — 3D chips with edge stripe markings, per-denomination colors
- ✨ **Suspenseful Dealing** — Cards deal face-down, then flip face-up one by one with golden glow
- 🎮 **Multiplayer** — Up to 5 players in real-time via WebSockets
- 🎯 **Full Blackjack Rules** — Hit, Stand, Double Down, Split, Insurance
- 🔊 **Sound Effects** — Procedural Web Audio API sounds (no audio files needed)
- 💬 **Table Chat** — Real-time chat between players
- ⌨️ **Keyboard Shortcuts** — H=Hit, S=Stand, D=Double, P=Split
- 📱 **Responsive** — Works on desktop, tablet, and mobile

## Quick Start

```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## How to Play

1. Enter your name and click **Create Table**
2. Share the **5-letter room code** with your friends
3. Friends enter the code and click **Join**
4. Host clicks **Deal Cards** → place bets → play your hand!

## Tech Stack

- **Server:** Node.js + Express + WebSocket (ws)
- **Client:** Vanilla HTML/CSS/JS with Web Audio API
- **Design:** Dark casino theme with glassmorphism, gold accents, 3D animations

## Deployment

This app requires a **WebSocket-capable** host. Recommended:
- [Railway](https://railway.app)
- [Render](https://render.com)
- [Fly.io](https://fly.io)

> ⚠️ **Note:** Vercel is serverless and does not support persistent WebSocket connections. Use one of the above hosts for the backend.

## License

MIT

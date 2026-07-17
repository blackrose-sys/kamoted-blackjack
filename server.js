const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Constants ───────────────────────────────────────────────────────
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const STARTING_CHIPS = 1000;
const MIN_BET = 10;
const MAX_BET = 500;
const MAX_PLAYERS = 5;

// ─── Utility ─────────────────────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createDeck(numDecks = 6) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  return shuffle(deck);
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardValue(card) {
  if (['J','Q','K'].includes(card.rank)) return 10;
  if (card.rank === 'A') return 11;
  return parseInt(card.rank);
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isSoft(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    total += cardValue(card);
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 1) {
    total -= 10;
    aces--;
  }
  return aces > 0 && total <= 21;
}

function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

function canSplit(hand, player) {
  return hand.length === 2 &&
    cardValue(hand[0]) === cardValue(hand[1]) &&
    player.hands.length < 4 &&
    player.chips >= player.bets[player.currentHandIndex];
}

function canDouble(hand, player) {
  return hand.length === 2 && player.chips >= player.bets[player.currentHandIndex];
}

// ─── Room Management ─────────────────────────────────────────────────
const rooms = new Map();

function createRoom(hostWs, playerName) {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();

  const room = {
    code,
    players: [],
    deck: [],
    dealer: { hand: [] },
    phase: 'waiting', // waiting, betting, dealing, playing, dealer_turn, results
    currentPlayerIndex: 0,
    roundNumber: 0,
  };

  addPlayerToRoom(room, hostWs, playerName, true);
  rooms.set(code, room);
  return room;
}

function addPlayerToRoom(room, ws, playerName, isHost = false) {
  const player = {
    ws,
    name: playerName,
    id: Math.random().toString(36).substr(2, 9),
    chips: STARTING_CHIPS,
    hands: [[]],
    bets: [0],
    currentHandIndex: 0,
    isHost,
    isReady: false,
    results: [],
    insurance: 0,
    hasInsurance: false,
  };
  room.players.push(player);
  ws._playerId = player.id;
  ws._roomCode = room.code;
  return player;
}

function removePlayerFromRoom(room, playerId) {
  const idx = room.players.findIndex(p => p.id === playerId);
  if (idx === -1) return;

  const wasHost = room.players[idx].isHost;
  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  if (wasHost) {
    room.players[0].isHost = true;
  }

  // If we're in a playing phase and this affects turn order
  if (room.phase === 'playing') {
    if (idx < room.currentPlayerIndex) {
      room.currentPlayerIndex--;
    } else if (idx === room.currentPlayerIndex) {
      if (room.currentPlayerIndex >= room.players.length) {
        room.currentPlayerIndex = 0;
      }
      advanceTurn(room);
    }
  }
}

// ─── Game Logic ──────────────────────────────────────────────────────
function startBettingPhase(room) {
  room.phase = 'betting';
  room.dealer = { hand: [] };

  for (const p of room.players) {
    p.hands = [[]];
    p.bets = [0];
    p.currentHandIndex = 0;
    p.isReady = false;
    p.results = [];
    p.insurance = 0;
    p.hasInsurance = false;
  }

  // Reshuffle if deck is running low
  if (!room.deck.length || room.deck.length < room.players.length * 10 + 20) {
    room.deck = createDeck(6);
  }

  broadcastState(room);
}

function placeBet(room, playerId, amount) {
  if (room.phase !== 'betting') return;
  const player = room.players.find(p => p.id === playerId);
  if (!player) return;

  const bet = Math.max(MIN_BET, Math.min(MAX_BET, Math.min(amount, player.chips)));
  player.bets[0] = bet;
  player.isReady = true;

  broadcastState(room);

  // Check if all players have bet
  if (room.players.every(p => p.isReady)) {
    startDealing(room);
  }
}

function startDealing(room) {
  room.phase = 'dealing';
  room.roundNumber++;

  // Deduct bets
  for (const p of room.players) {
    p.chips -= p.bets[0];
  }

  // Deal cards: 2 to each player, 2 to dealer
  for (let round = 0; round < 2; round++) {
    for (const p of room.players) {
      p.hands[0].push(room.deck.pop());
    }
    room.dealer.hand.push(room.deck.pop());
  }

  broadcastState(room);

  // Check for dealer blackjack showing ace
  const dealerUpCard = room.dealer.hand[0];

  // Small delay then move to playing phase
  setTimeout(() => {
    // Check for dealer natural blackjack
    if (isBlackjack(room.dealer.hand)) {
      room.phase = 'results';
      resolveResults(room);
      broadcastState(room);
      return;
    }

    // Check for player blackjacks
    for (const p of room.players) {
      if (isBlackjack(p.hands[0])) {
        p.results[0] = 'blackjack';
      }
    }

    room.phase = 'playing';
    room.currentPlayerIndex = 0;

    // Skip players who have blackjack
    skipBlackjackPlayers(room);

    broadcastState(room);
  }, 4500); // Allow time for client card dealing + flip animations
}

function skipBlackjackPlayers(room) {
  while (
    room.currentPlayerIndex < room.players.length &&
    room.players[room.currentPlayerIndex].results[0] === 'blackjack'
  ) {
    room.currentPlayerIndex++;
  }

  if (room.currentPlayerIndex >= room.players.length) {
    startDealerTurn(room);
  }
}

function playerAction(room, playerId, action) {
  if (room.phase !== 'playing') return;
  const playerIdx = room.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1 || playerIdx !== room.currentPlayerIndex) return;

  const player = room.players[playerIdx];
  const handIdx = player.currentHandIndex;
  const hand = player.hands[handIdx];

  switch (action) {
    case 'hit':
      hand.push(room.deck.pop());
      if (handValue(hand) > 21) {
        player.results[handIdx] = 'bust';
        advanceHand(room, player);
      } else if (handValue(hand) === 21) {
        player.results[handIdx] = 'stand';
        advanceHand(room, player);
      }
      break;

    case 'stand':
      player.results[handIdx] = 'stand';
      advanceHand(room, player);
      break;

    case 'double':
      if (canDouble(hand, player)) {
        player.chips -= player.bets[handIdx];
        player.bets[handIdx] *= 2;
        hand.push(room.deck.pop());
        if (handValue(hand) > 21) {
          player.results[handIdx] = 'bust';
        } else {
          player.results[handIdx] = 'stand';
        }
        advanceHand(room, player);
      }
      break;

    case 'split':
      if (canSplit(hand, player)) {
        const card1 = hand[0];
        const card2 = hand[1];
        player.hands[handIdx] = [card1, room.deck.pop()];
        player.hands.splice(handIdx + 1, 0, [card2, room.deck.pop()]);
        player.bets.splice(handIdx + 1, 0, player.bets[handIdx]);
        player.results.splice(handIdx + 1, 0, undefined);
        player.chips -= player.bets[handIdx];

        // Check for 21 on split hands
        if (handValue(player.hands[handIdx]) === 21) {
          player.results[handIdx] = 'stand';
          advanceHand(room, player);
        }
      }
      break;
  }

  broadcastState(room);
}

function advanceHand(room, player) {
  player.currentHandIndex++;
  if (player.currentHandIndex >= player.hands.length) {
    // This player is done, move to next player
    advanceTurn(room);
  } else {
    // Check if next hand already has 21
    const nextHand = player.hands[player.currentHandIndex];
    if (handValue(nextHand) === 21) {
      player.results[player.currentHandIndex] = 'stand';
      advanceHand(room, player);
    }
  }
}

function advanceTurn(room) {
  room.currentPlayerIndex++;

  // Skip players with blackjack
  while (
    room.currentPlayerIndex < room.players.length &&
    room.players[room.currentPlayerIndex].results[0] === 'blackjack'
  ) {
    room.currentPlayerIndex++;
  }

  if (room.currentPlayerIndex >= room.players.length) {
    startDealerTurn(room);
  } else {
    // Reset hand index for next player
    const nextPlayer = room.players[room.currentPlayerIndex];
    nextPlayer.currentHandIndex = 0;
  }

  broadcastState(room);
}

function startDealerTurn(room) {
  room.phase = 'dealer_turn';
  broadcastState(room);

  // Check if all players busted
  const allBusted = room.players.every(p =>
    p.hands.every((_, i) => p.results[i] === 'bust')
  );

  if (allBusted) {
    setTimeout(() => {
      room.phase = 'results';
      resolveResults(room);
      broadcastState(room);
    }, 2000); // Wait for hole card reveal animation
    return;
  }

  // Dealer draws — wait for hole card reveal first
  setTimeout(() => dealerDraw(room), 1800);
}

function dealerDraw(room) {
  const val = handValue(room.dealer.hand);
  const soft = isSoft(room.dealer.hand);

  // Dealer hits on soft 17, stands on hard 17+
  if (val < 17 || (val === 17 && soft)) {
    room.dealer.hand.push(room.deck.pop());
    broadcastState(room);
    setTimeout(() => dealerDraw(room), 1200); // Suspenseful pause between draws
  } else {
    setTimeout(() => {
      room.phase = 'results';
      resolveResults(room);
      broadcastState(room);
    }, 1000); // Pause before showing results
  }
}

function resolveResults(room) {
  const dealerVal = handValue(room.dealer.hand);
  const dealerBJ = isBlackjack(room.dealer.hand);
  const dealerBust = dealerVal > 21;

  for (const player of room.players) {
    for (let i = 0; i < player.hands.length; i++) {
      if (player.results[i] === 'bust') {
        player.results[i] = { outcome: 'lose', payout: 0 };
        continue;
      }

      const playerVal = handValue(player.hands[i]);
      const playerBJ = i === 0 && player.hands.length === 1 && isBlackjack(player.hands[i]);

      if (playerBJ && dealerBJ) {
        // Both blackjack — push
        player.results[i] = { outcome: 'push', payout: player.bets[i] };
        player.chips += player.bets[i];
      } else if (playerBJ) {
        // Player blackjack pays 3:2
        const payout = player.bets[i] + Math.floor(player.bets[i] * 1.5);
        player.results[i] = { outcome: 'blackjack', payout };
        player.chips += payout;
      } else if (dealerBJ) {
        player.results[i] = { outcome: 'lose', payout: 0 };
      } else if (dealerBust) {
        const payout = player.bets[i] * 2;
        player.results[i] = { outcome: 'win', payout };
        player.chips += payout;
      } else if (playerVal > dealerVal) {
        const payout = player.bets[i] * 2;
        player.results[i] = { outcome: 'win', payout };
        player.chips += payout;
      } else if (playerVal === dealerVal) {
        player.results[i] = { outcome: 'push', payout: player.bets[i] };
        player.chips += player.bets[i];
      } else {
        player.results[i] = { outcome: 'lose', payout: 0 };
      }
    }
  }
}

// ─── State Broadcasting ──────────────────────────────────────────────
function getPublicState(room, forPlayerId) {
  const state = {
    roomCode: room.code,
    phase: room.phase,
    roundNumber: room.roundNumber,
    currentPlayerIndex: room.currentPlayerIndex,
    dealer: {
      hand: room.dealer.hand.map((card, i) => {
        // Hide dealer hole card during playing phase
        if (i === 1 && (room.phase === 'playing' || room.phase === 'dealing' || room.phase === 'betting')) {
          return { hidden: true };
        }
        return card;
      }),
      value: (room.phase === 'dealer_turn' || room.phase === 'results')
        ? handValue(room.dealer.hand)
        : cardValue(room.dealer.hand[0] || { rank: '0' }),
      showAll: room.phase === 'dealer_turn' || room.phase === 'results',
    },
    players: room.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      hands: p.hands,
      bets: p.bets,
      currentHandIndex: p.currentHandIndex,
      isHost: p.isHost,
      isReady: p.isReady,
      isCurrentTurn: idx === room.currentPlayerIndex && room.phase === 'playing',
      results: p.results,
      handValues: p.hands.map(h => handValue(h)),
      canSplit: room.phase === 'playing' && idx === room.currentPlayerIndex
        ? p.hands.map((h, i) => i === p.currentHandIndex && canSplit(h, p))
        : p.hands.map(() => false),
      canDouble: room.phase === 'playing' && idx === room.currentPlayerIndex
        ? p.hands.map((h, i) => i === p.currentHandIndex && canDouble(h, p))
        : p.hands.map(() => false),
      isBusted: p.chips <= 0 && room.phase === 'results',
    })),
    you: forPlayerId,
  };

  return state;
}

function broadcastState(room) {
  for (const player of room.players) {
    if (player.ws.readyState === WebSocket.OPEN) {
      const state = getPublicState(room, player.id);
      player.ws.send(JSON.stringify({ type: 'state', data: state }));
    }
  }
}

function sendTo(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

// ─── WebSocket Handler ───────────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('Player connected');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const name = (msg.name || 'Player').substring(0, 20);
        const room = createRoom(ws, name);
        sendTo(ws, 'room_created', { code: room.code });
        broadcastState(room);
        console.log(`Room ${room.code} created by ${name}`);
        break;
      }

      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const name = (msg.name || 'Player').substring(0, 20);
        const room = rooms.get(code);

        if (!room) {
          sendTo(ws, 'error', { message: 'Room not found. Check the code and try again.' });
          return;
        }
        if (room.players.length >= MAX_PLAYERS) {
          sendTo(ws, 'error', { message: 'Room is full (max 5 players).' });
          return;
        }
        if (room.phase !== 'waiting' && room.phase !== 'results') {
          sendTo(ws, 'error', { message: 'A round is in progress. Wait for it to finish.' });
          return;
        }

        addPlayerToRoom(room, ws, name);
        sendTo(ws, 'room_joined', { code: room.code });
        broadcastState(room);
        broadcastMessage(room, `${name} joined the table`);
        console.log(`${name} joined room ${code}`);
        break;
      }

      case 'start_game': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === ws._playerId);
        if (!player || !player.isHost) return;
        if (room.players.length < 1) return;

        startBettingPhase(room);
        break;
      }

      case 'place_bet': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        placeBet(room, ws._playerId, msg.amount || MIN_BET);
        break;
      }

      case 'action': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        playerAction(room, ws._playerId, msg.action);
        break;
      }

      case 'new_round': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === ws._playerId);
        if (!player || !player.isHost) return;
        if (room.phase !== 'results') return;

        // Remove players with 0 chips
        room.players = room.players.filter(p => p.chips > 0);
        if (room.players.length === 0) {
          rooms.delete(room.code);
          return;
        }

        startBettingPhase(room);
        break;
      }

      case 'chat': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === ws._playerId);
        if (!player) return;
        const text = (msg.text || '').substring(0, 200);
        broadcastMessage(room, text, player.name);
        break;
      }

      case 'leave_room': {
        const room = rooms.get(ws._roomCode);
        if (!room) return;
        const player = room.players.find(p => p.id === ws._playerId);
        if (player) {
          broadcastMessage(room, `${player.name} left the table`);
          removePlayerFromRoom(room, ws._playerId);
          if (room.players.length > 0) {
            broadcastState(room);
          }
        }
        ws._roomCode = null;
        ws._playerId = null;
        sendTo(ws, 'left_room', {});
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws._roomCode);
    if (room) {
      const player = room.players.find(p => p.id === ws._playerId);
      if (player) {
        broadcastMessage(room, `${player.name} left the table`);
        removePlayerFromRoom(room, ws._playerId);
        if (room.players.length > 0) {
          broadcastState(room);
        }
      }
    }
    console.log('Player disconnected');
  });
});

function broadcastMessage(room, text, senderName = null) {
  for (const player of room.players) {
    sendTo(player.ws, 'message', { text, sender: senderName });
  }
}

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n♠♥♣♦  Kamoted Blackjack  ♦♣♥♠`);
  console.log(`Server running on http://localhost:${PORT}\n`);
});

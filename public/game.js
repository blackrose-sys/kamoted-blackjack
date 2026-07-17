/* ═══════════════════════════════════════════════════════════════════
   GAME — Client-side game logic & WebSocket communication
   Full animation orchestration with suspenseful card flipping
   ═══════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────
let ws = null;
let gameState = null;
let myId = null;
let currentBet = 0;
let chatOpen = false;
let unreadMessages = 0;
let previousPhase = null;

// Animation state tracking — prevents re-rendering animated elements
let renderedDealerCards = 0;
let renderedPlayerCards = {};  // { 'playerId-handIdx': count }
let dealerHoleRevealed = false;
let animationLock = false; // Prevents state updates during animations
let pendingState = null;

// ─── DOM Elements ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const views = {
  auth: $('authView'),
  lobby: $('lobbyView'),
  waiting: $('waitingView'),
  game: $('gameView'),
};

const els = {
  authUsername: $('authUsername'),
  authPassword: $('authPassword'),
  authForm: $('authForm'),
  tabLoginBtn: $('tabLoginBtn'),
  tabSignupBtn: $('tabSignupBtn'),
  signupNotice: $('signupNotice'),
  authSubmitBtn: $('authSubmitBtn'),
  lobbyUserName: $('lobbyUserName'),
  logoutBtn: $('logoutBtn'),
  
  dbSetupTrigger: $('dbSetupTrigger'),
  dbSetupPanel: $('dbSetupPanel'),
  dbSetupClose: $('dbSetupClose'),
  dbSetupForm: $('dbSetupForm'),
  dbUrl: $('dbUrl'),
  dbAnonKey: $('dbAnonKey'),

  createRoomBtn: $('createRoomBtn'),
  joinRoomBtn: $('joinRoomBtn'),
  roomCodeInput: $('roomCodeInput'),

  roomCodeDisplay: $('roomCodeDisplay'),
  copyCodeBtn: $('copyCodeBtn'),
  waitingPlayersList: $('waitingPlayersList'),
  startGameBtn: $('startGameBtn'),
  waitingHint: $('waitingHint'),

  chipDisplay: $('chipDisplay'),
  chipAmount: $('chipAmount'),

  dealerCards: $('dealerCards'),
  dealerValue: $('dealerValue'),
  gameStatus: $('gameStatus'),
  otherPlayers: $('otherPlayers'),
  yourArea: $('yourArea'),
  yourName: $('yourName'),
  yourBet: $('yourBet'),
  yourValue: $('yourValue'),
  yourHands: $('yourHands'),

  bettingPanel: $('bettingPanel'),
  betAmount: $('betAmount'),
  confirmBetBtn: $('confirmBetBtn'),
  clearBetBtn: $('clearBetBtn'),

  actionBar: $('actionBar'),
  hitBtn: $('hitBtn'),
  standBtn: $('standBtn'),
  doubleBtn: $('doubleBtn'),
  splitBtn: $('splitBtn'),

  resultsOverlay: $('resultsOverlay'),
  resultsTitle: $('resultsTitle'),
  resultsList: $('resultsList'),
  newRoundBtn: $('newRoundBtn'),
  resultsHint: $('resultsHint'),
  leaveTableBtn: $('leaveTableBtn'),

  bustedOverlay: $('bustedOverlay'),
  bustedLobbyBtn: $('bustedLobbyBtn'),

  soundToggle: $('soundToggle'),
  leaderboardBtn: $('leaderboardBtn'),
  settingsBtn: $('settingsBtn'),
  userProfileBadge: $('userProfileBadge'),
  headerAvatar: $('headerAvatar'),
  headerUsername: $('headerUsername'),
  headerRank: $('headerRank'),

  settingsModal: $('settingsModal'),
  closeSettingsBtn: $('closeSettingsBtn'),
  tabProfileSettingsBtn: $('tabProfileSettingsBtn'),
  tabSecuritySettingsBtn: $('tabSecuritySettingsBtn'),
  profileSettingsContent: $('profileSettingsContent'),
  securitySettingsContent: $('securitySettingsContent'),
  profileSettingsForm: $('profileSettingsForm'),
  securitySettingsForm: $('securitySettingsForm'),
  settingsBio: $('settingsBio'),
  settingsNewPassword: $('settingsNewPassword'),

  profileModal: $('profileModal'),
  closeProfileBtn: $('closeProfileBtn'),
  profileAvatar: $('profileAvatar'),
  profileUsername: $('profileUsername'),
  profileRankBadge: $('profileRankBadge'),
  profileBio: $('profileBio'),
  profileStatChips: $('profileStatChips'),
  profileStatRP: $('profileStatRP'),
  profileStatWins: $('profileStatWins'),
  profileStatWR: $('profileStatWR'),
  profileStatBJs: $('profileStatBJs'),

  leaderboardModal: $('leaderboardModal'),
  closeLeaderboardBtn: $('closeLeaderboardBtn'),
  leaderboardList: $('leaderboardList'),

  chatBubble: $('chatBubble'),
  chatBadge: $('chatBadge'),
  chatPanel: $('chatPanel'),
  chatClose: $('chatClose'),
  chatMessages: $('chatMessages'),
  chatInput: $('chatInput'),
  chatSend: $('chatSend'),

  toastContainer: $('toastContainer'),
};

// ─── View Management ─────────────────────────────────────────────
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
}

// ─── Toast ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── WebSocket ───────────────────────────────────────────────────
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    console.log('Disconnected');
    showToast('Connection lost. Reconnecting...', 'error');
    setTimeout(connect, 2000);
  };

  ws.onerror = () => {
    console.error('WebSocket error');
  };
}

function send(type, data = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

// ─── Message Handler ─────────────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {
    case 'room_created':
    case 'room_joined':
      showView('waiting');
      els.roomCodeDisplay.textContent = msg.data.code;
      break;

    case 'state':
      // If animations are running, queue the state update
      if (animationLock) {
        pendingState = msg.data;
        return;
      }
      handleStateUpdate(msg.data);
      break;

    case 'left_room':
      showView('auth');
      resetAnimationState();
      if (els.bustedOverlay) els.bustedOverlay.style.display = 'none';
      break;

    case 'error':
      showToast(msg.data.message, 'error');
      break;

    case 'message':
      addChatMessage(msg.data.text, msg.data.sender);
      break;
  }
}

// ─── State Update ────────────────────────────────────────────────
function handleStateUpdate(state) {
  const prevPhase = previousPhase;
  const prevState = gameState;
  gameState = state;
  myId = state.you;

  const me = state.players.find(p => p.id === myId);
  if (me) {
    els.chipDisplay.style.display = 'flex';
    els.chipAmount.textContent = me.chips.toLocaleString();
    
    // Check if player is busted (0 chips on results)
    if (me.isBusted) {
      els.bustedOverlay.style.display = 'flex';
    } else {
      els.bustedOverlay.style.display = 'none';
    }
  }

  if (state.phase === 'waiting') {
    showView('waiting');
    renderWaitingRoom(state);
    resetAnimationState();
  } else {
    showView('game');

    // Detect phase transitions for animation orchestration
    const isNewPhase = prevPhase !== state.phase;

    if (isNewPhase && state.phase === 'dealing') {
      // Cards just got dealt — orchestrate the full deal animation
      resetAnimationState();
      animateDealSequence(state);
    } else if (isNewPhase && state.phase === 'dealer_turn') {
      // Dealer's turn — reveal hole card dramatically
      animateDealerReveal(state);
    } else if (isNewPhase && state.phase === 'results') {
      // Show results
      renderGameUI(state);
      animateResults(state);
    } else if (state.phase === 'playing' || state.phase === 'dealer_turn') {
      // During play — incremental card updates (hits, dealer draws)
      renderIncrementalUpdate(state, prevState);
    } else {
      renderGameUI(state);
    }
  }

  previousPhase = state.phase;
}

function resetAnimationState() {
  renderedDealerCards = 0;
  renderedPlayerCards = {};
  dealerHoleRevealed = false;
  animationLock = false;
  pendingState = null;
}

function unlockAnimations() {
  animationLock = false;
  if (pendingState) {
    const state = pendingState;
    pendingState = null;
    handleStateUpdate(state);
  }
}

// ─── Animation: Deal Sequence ────────────────────────────────────
// Orchestrates the initial deal: cards slide in face-down, then flip one by one
function animateDealSequence(state) {
  animationLock = true;

  // Clear card areas
  els.dealerCards.innerHTML = '';
  els.yourHands.innerHTML = '';
  els.otherPlayers.innerHTML = '';

  // Gather all cards to deal
  const allPlayers = state.players;
  const me = allPlayers.find(p => p.id === myId);
  const others = allPlayers.filter(p => p.id !== myId);

  // Build the deal order: alternating player cards then dealer
  // Round 1: one card to each player, one to dealer
  // Round 2: one card to each player, one to dealer (hole card)
  const dealSequence = [];
  const dealInterval = 200; // ms between each card deal
  const flipStartDelay = (allPlayers.length * 2 + 2) * dealInterval + 400; // after all cards dealt
  const flipInterval = 250; // ms between each flip
  let flipIdx = 0;

  // Setup other players containers
  const otherContainers = {};
  others.forEach((p, idx) => {
    const slot = createOtherPlayerSlot(p, state, idx);
    els.otherPlayers.appendChild(slot);
    otherContainers[p.id] = slot.querySelector('.other-player-cards');
  });

  // Setup your hand container
  const myCardsDiv = document.createElement('div');
  myCardsDiv.className = 'hand-container';
  const myCards = document.createElement('div');
  myCards.className = 'hand-cards';
  myCardsDiv.appendChild(myCards);
  els.yourHands.appendChild(myCardsDiv);

  // Update player info
  if (me) {
    els.yourName.textContent = me.name;
    els.yourBet.textContent = '🪙 ' + me.bets[0];
    els.yourValue.textContent = '';
  }

  // Round 1: first card to each player, then dealer
  for (let round = 0; round < 2; round++) {
    // Players
    allPlayers.forEach((p) => {
      const card = p.hands[0][round];
      if (!card) return;

      const isMe = p.id === myId;
      const container = isMe ? myCards : otherContainers[p.id];
      const small = !isMe;
      const isHidden = false; // Player cards are always visible

      dealSequence.push({
        card,
        container,
        small,
        flipIdx: flipIdx++,
      });
    });

    // Dealer
    const dealerCard = state.dealer.hand[round];
    if (dealerCard) {
      const isDealerHole = round === 1;
      dealSequence.push({
        card: dealerCard,
        container: els.dealerCards,
        small: false,
        flipIdx: isDealerHole ? -1 : flipIdx++, // -1 = don't flip (hole card stays face-down)
        isDealerHole,
      });
    }
  }

  // Now animate the sequence
  dealSequence.forEach((item, i) => {
    const dealDelay = i * dealInterval;
    const shouldFlip = item.flipIdx >= 0;
    const flipDelay = shouldFlip
      ? flipStartDelay + item.flipIdx * flipInterval
      : 0;

    setTimeout(() => {
      const el = createCardElement(item.card, {
        small: item.small,
        startHidden: true, // All cards start face-down
        flipDelay: shouldFlip ? (flipDelay - dealDelay) : 0,
      });

      if (item.isDealerHole) {
        el.dataset.holeCard = 'true';
      }

      item.container.appendChild(el);
      sounds.cardDeal();
    }, dealDelay);
  });

  // After all flips complete, update values and unlock
  const totalTime = flipStartDelay + flipIdx * flipInterval + 700;

  // Show hand values progressively as cards flip
  setTimeout(() => {
    // Update dealer showing value (first card only)
    const dealerUpCard = state.dealer.hand[0];
    if (dealerUpCard) {
      const upVal = dealerUpCard.rank === 'A' ? 11
        : ['J','Q','K'].includes(dealerUpCard.rank) ? 10
        : parseInt(dealerUpCard.rank);
      els.dealerValue.textContent = upVal;
      els.dealerValue.style.color = '';
    }
  }, flipStartDelay + 300);

  setTimeout(() => {
    // Update player hand values
    if (me) {
      updateYourValueDisplay(me);
    }
    updateOtherPlayersValues(state);

    // Check for blackjack animations
    allPlayers.forEach(p => {
      if (p.results[0] === 'blackjack' || (typeof p.results[0] === 'object' && p.results[0]?.outcome === 'blackjack')) {
        if (p.id === myId) {
          myCards.querySelectorAll('.playing-card').forEach(c => c.classList.add('card-blackjack'));
        }
      }
    });

    renderedDealerCards = state.dealer.hand.length;
    state.players.forEach(p => {
      p.hands.forEach((h, hi) => {
        renderedPlayerCards[`${p.id}-${hi}`] = h.length;
      });
    });

    renderGameStatus(state);
    renderControls(state);
    unlockAnimations();
  }, totalTime);
}

// ─── Animation: Dealer Hole Card Reveal ──────────────────────────
function animateDealerReveal(state) {
  if (dealerHoleRevealed) {
    renderGameUI(state);
    return;
  }

  animationLock = true;
  dealerHoleRevealed = true;

  // Find the hole card element (second card in dealer area)
  const dealerCardEls = els.dealerCards.querySelectorAll('.playing-card');
  const holeCardEl = dealerCardEls[1]; // Second card is the hole card
  const actualCard = state.dealer.hand[1];

  if (holeCardEl && actualCard && !actualCard.hidden) {
    // Dramatic pause, then reveal
    holeCardEl.classList.add('dealer-reveal');

    revealCard(holeCardEl, actualCard, 300).then(() => {
      sounds.cardFlip();

      // Update dealer value
      els.dealerValue.textContent = state.dealer.value;
      els.dealerValue.style.color = '';

      // Small delay then unlock for dealer draws
      setTimeout(() => {
        renderGameStatus(state);
        renderedDealerCards = state.dealer.hand.length;
        unlockAnimations();
      }, 400);
    });
  } else {
    renderGameUI(state);
    unlockAnimations();
  }
}

// ─── Animation: Results ──────────────────────────────────────────
let lastSavedRound = -1;

function animateResults(state) {
  const me = state.players.find(p => p.id === myId);

  // Auto-save persistent profile stats to Supabase/MockDB
  if (me && me.results[0] && typeof me.results[0] === 'object' && state.roundNumber !== lastSavedRound) {
    lastSavedRound = state.roundNumber;
    const outcome = me.results[0].outcome;
    const isBJ = outcome === 'blackjack';
    
    DB.saveStats(me.chips, outcome, isBJ)
      .then(() => updateUserProfileUI())
      .catch(err => console.error('Error auto-saving persistent stats:', err));
  }

  // Play appropriate sound
  if (me && me.results[0] && typeof me.results[0] === 'object') {
    const outcome = me.results[0].outcome;
    setTimeout(() => {
      switch (outcome) {
        case 'blackjack': sounds.blackjack(); break;
        case 'win': sounds.win(); break;
        case 'lose': sounds.lose(); break;
        case 'push': sounds.push(); break;
      }
    }, 400);

    // Add visual effect to your cards
    if (outcome === 'win' || outcome === 'blackjack') {
      els.yourHands.querySelectorAll('.playing-card').forEach(c => {
        c.classList.add('card-blackjack');
      });
    } else if (outcome === 'lose') {
      els.yourHands.querySelectorAll('.playing-card').forEach(c => {
        c.classList.add('card-bust-shake');
      });
    }
  }

  // Show results overlay with delay for suspense
  setTimeout(() => {
    renderResults(state);
  }, 600);
}

// ─── Incremental Update (during play) ────────────────────────────
// Only adds new cards, doesn't re-render everything
function renderIncrementalUpdate(state, prevState) {
  const me = state.players.find(p => p.id === myId);
  const others = state.players.filter(p => p.id !== myId);

  // Check for new dealer cards (dealer drawing)
  if (state.dealer.hand.length > renderedDealerCards) {
    const newCards = state.dealer.hand.slice(renderedDealerCards);
    newCards.forEach((card, i) => {
      setTimeout(() => {
        const el = createCardElement(card, {
          startHidden: true,
          flipDelay: 300,
        });
        el.classList.add('card-highlight');
        els.dealerCards.appendChild(el);
        sounds.cardDeal();
      }, i * 400);
    });
    renderedDealerCards = state.dealer.hand.length;

    // Update dealer value after flip
    setTimeout(() => {
      const val = state.dealer.value;
      els.dealerValue.textContent = val;
      if (val > 21) {
        els.dealerValue.textContent = val + ' BUST';
        els.dealerValue.style.color = '#f87171';
        els.dealerCards.querySelectorAll('.playing-card').forEach(c => {
          c.classList.add('card-bust-shake');
        });
        sounds.bust();
      }
    }, newCards.length * 400 + 500);
  }

  // Check for new player cards (hits)
  if (me) {
    me.hands.forEach((hand, hi) => {
      const key = `${me.id}-${hi}`;
      const prevCount = renderedPlayerCards[key] || 0;

      if (hand.length > prevCount) {
        // New card was hit — find or create the hand container
        let handContainer = els.yourHands.querySelectorAll('.hand-cards')[hi];
        if (!handContainer) {
          // New hand (split) — create container
          rebuildYourHandContainers(me, state);
          handContainer = els.yourHands.querySelectorAll('.hand-cards')[hi];
        }

        if (handContainer) {
          const newCards = hand.slice(prevCount);
          newCards.forEach((card) => {
            const el = createCardElement(card, {
              startHidden: true,
              flipDelay: 300,
            });
            el.classList.add('card-highlight');
            handContainer.appendChild(el);
            sounds.cardDeal();
          });
        }

        renderedPlayerCards[key] = hand.length;

        // Update value display after flip
        setTimeout(() => {
          updateYourValueDisplay(me);

          // Check for bust
          const val = me.handValues[hi];
          if (val > 21) {
            const handCards = els.yourHands.querySelectorAll('.hand-cards')[hi];
            if (handCards) {
              handCards.querySelectorAll('.playing-card').forEach(c => {
                c.classList.add('card-bust-shake');
              });
            }
            sounds.bust();
          } else if (val === 21) {
            sounds.chipClink();
          }
        }, 500);
      }
    });

    // Handle split — rebuild if hand count changed
    const expectedHands = me.hands.length;
    const renderedHands = els.yourHands.querySelectorAll('.hand-container').length;
    if (expectedHands !== renderedHands) {
      rebuildYourHandContainers(me, state);
    }

    els.yourBet.textContent = '🪙 ' + me.bets.reduce((a, b) => a + b, 0);
  }

  // Update other players
  renderOtherPlayers(state);

  // Update status and controls
  renderGameStatus(state);
  renderControls(state);
}

// ─── Rebuild your hand containers (for split) ────────────────────
function rebuildYourHandContainers(me, state) {
  els.yourHands.innerHTML = '';

  me.hands.forEach((hand, hi) => {
    const container = document.createElement('div');
    container.className = 'hand-container';

    if (me.hands.length > 1) {
      const label = document.createElement('div');
      label.className = 'hand-label';
      label.textContent = `Hand ${hi + 1} (🪙 ${me.bets[hi]})`;
      container.appendChild(label);
    }

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'hand-cards';

    // Check if this is the active hand
    const myIdx = state.players.findIndex(p => p.id === myId);
    const isMyTurn = state.phase === 'playing' && myIdx === state.currentPlayerIndex;
    if (isMyTurn && hi === me.currentHandIndex) {
      cardsDiv.classList.add('hand-active');
    }

    // Render existing cards (no animation — they're already dealt)
    hand.forEach(card => {
      const el = createCardElement(card, { noAnimation: true });
      // Show face immediately
      el.querySelector('.card-inner').classList.add('flipped');
      cardsDiv.appendChild(el);
    });

    renderedPlayerCards[`${me.id}-${hi}`] = hand.length;

    container.appendChild(cardsDiv);

    // Result badge
    renderHandResult(container, me.results[hi]);

    els.yourHands.appendChild(container);
  });

  updateYourValueDisplay(me);
}

// ─── Full Game UI Render (non-animated, for phase catches) ───────
function renderGameUI(state) {
  renderDealerStatic(state);
  renderOtherPlayers(state);
  renderYourHandStatic(state);
  renderGameStatus(state);
  renderControls(state);
}

// ─── Static Renders (no animation) ──────────────────────────────
function renderDealerStatic(state) {
  const cards = state.dealer.hand || [];
  els.dealerCards.innerHTML = '';

  cards.forEach(card => {
    const el = createCardElement(card, { noAnimation: true });
    if (!card.hidden) {
      el.querySelector('.card-inner').classList.add('flipped');
    }
    els.dealerCards.appendChild(el);
  });

  renderedDealerCards = cards.length;

  if (cards.length > 0) {
    if (state.dealer.showAll) {
      const val = state.dealer.value;
      els.dealerValue.textContent = val;
      if (val > 21) {
        els.dealerValue.textContent = val + ' BUST';
        els.dealerValue.style.color = '#f87171';
      } else {
        els.dealerValue.style.color = '';
      }
    } else {
      // Show only up-card value
      const upCard = cards[0];
      if (upCard && !upCard.hidden) {
        const upVal = upCard.rank === 'A' ? 11
          : ['J','Q','K'].includes(upCard.rank) ? 10
          : parseInt(upCard.rank);
        els.dealerValue.textContent = upVal;
        els.dealerValue.style.color = '';
      }
    }
  } else {
    els.dealerValue.textContent = '';
  }
}

function renderYourHandStatic(state) {
  const me = state.players.find(p => p.id === myId);
  if (!me) return;

  els.yourName.textContent = me.name;
  els.yourBet.textContent = me.bets[0] > 0 ? '🪙 ' + me.bets.reduce((a, b) => a + b, 0) : '';
  els.yourHands.innerHTML = '';

  me.hands.forEach((hand, hi) => {
    const container = document.createElement('div');
    container.className = 'hand-container';

    if (me.hands.length > 1) {
      const label = document.createElement('div');
      label.className = 'hand-label';
      label.textContent = `Hand ${hi + 1} (🪙 ${me.bets[hi]})`;
      container.appendChild(label);
    }

    const cardsDiv = document.createElement('div');
    cardsDiv.className = 'hand-cards';

    const myIdx = state.players.findIndex(p => p.id === myId);
    const isMyTurn = state.phase === 'playing' && myIdx === state.currentPlayerIndex;
    if (isMyTurn && hi === me.currentHandIndex) {
      cardsDiv.classList.add('hand-active');
    }

    hand.forEach(card => {
      const el = createCardElement(card, { noAnimation: true });
      el.querySelector('.card-inner').classList.add('flipped');
      cardsDiv.appendChild(el);
    });

    renderedPlayerCards[`${me.id}-${hi}`] = hand.length;
    container.appendChild(cardsDiv);

    renderHandResult(container, me.results[hi]);

    els.yourHands.appendChild(container);
  });

  updateYourValueDisplay(me);
}

// ─── Render: Waiting Room ────────────────────────────────────────
function renderWaitingRoom(state) {
  els.roomCodeDisplay.textContent = state.roomCode;

  const me = state.players.find(p => p.id === myId);
  const isHost = me && me.isHost;

  // Players list
  els.waitingPlayersList.innerHTML = '';
  state.players.forEach((p, i) => {
    const slot = document.createElement('div');
    slot.className = 'player-slot';
    
    // Check if player has customized PFP class
    const avatarClass = p.pfp || `avatar-${(i % 5) + 1}`;
    
    slot.innerHTML = `
      <div class="player-avatar ${avatarClass}">${escapeHtml(p.name[0])}</div>
      <div class="player-info">
        <span class="player-name-text stalk-trigger" data-username="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="player-badge badge-host">Host</span>' : ''}
        ${p.id === myId ? '<span class="player-badge badge-you">You</span>' : ''}
        <div class="player-chips-text">🪙 ${p.chips.toLocaleString()} chips</div>
      </div>
    `;
    
    // Stalk trigger click binding
    slot.querySelector('.stalk-trigger').addEventListener('click', (e) => {
      stalkPlayer(e.target.dataset.username);
    });

    els.waitingPlayersList.appendChild(slot);
  });

  // Show/hide start button
  if (isHost) {
    els.startGameBtn.style.display = 'inline-flex';
    els.waitingHint.style.display = 'none';
  } else {
    els.startGameBtn.style.display = 'none';
    els.waitingHint.style.display = 'block';
  }
}

// ─── Other Players Rendering ─────────────────────────────────────
function createOtherPlayerSlot(p, state, idx) {
  const playerIdx = state.players.findIndex(pl => pl.id === p.id);
  const isActive = state.phase === 'playing' && playerIdx === state.currentPlayerIndex;

  const slot = document.createElement('div');
  slot.className = 'other-player-slot' + (isActive ? ' active-turn' : '');
  slot.dataset.playerId = p.id;

  const avatarClass = p.pfp || 'avatar-1';

  slot.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;">
      <div class="user-badge-avatar ${avatarClass}" style="width:20px;height:20px;font-size:0.6rem;">${p.name[0]}</div>
      <span class="other-player-name stalk-trigger" data-username="${escapeHtml(p.name)}">${escapeHtml(p.name)}${isActive ? ' ⏳' : ''}</span>
    </div>
    <div class="other-player-cards"></div>
    <div class="other-player-meta">
      <span class="other-player-value"></span>
      <span class="other-player-bet">🪙 ${p.bets[0]}</span>
    </div>
  `;

  slot.querySelector('.stalk-trigger').addEventListener('click', (e) => {
    stalkPlayer(e.target.dataset.username);
  });

  return slot;
}

function renderOtherPlayers(state) {
  const others = state.players.filter(p => p.id !== myId);
  els.otherPlayers.innerHTML = '';

  others.forEach((p, idx) => {
    const playerIdx = state.players.findIndex(pl => pl.id === p.id);
    const isActive = state.phase === 'playing' && playerIdx === state.currentPlayerIndex;

    const slot = document.createElement('div');
    slot.className = 'other-player-slot' + (isActive ? ' active-turn' : '');

    let handsHtml = '';
    p.hands.forEach((hand, hi) => {
      const cards = hand.map(c => {
        const el = createCardElement(c, { small: true, noAnimation: true });
        el.querySelector('.card-inner').classList.add('flipped');
        return el.outerHTML;
      }).join('');

      let resultHtml = '';
      if (p.results[hi] && typeof p.results[hi] === 'object') {
        const r = p.results[hi];
        resultHtml = `<span class="other-player-result result-${r.outcome}">${formatOutcome(r.outcome)}</span>`;
      } else if (p.results[hi] === 'bust') {
        resultHtml = `<span class="other-player-result result-bust">BUST</span>`;
      }

      handsHtml += `
        <div class="other-player-cards">${cards}</div>
        <div class="other-player-meta">
          <span class="other-player-value">${p.handValues[hi] > 0 ? p.handValues[hi] : ''}</span>
          <span class="other-player-bet">🪙 ${p.bets[hi]}</span>
        </div>
        ${resultHtml}
      `;
    });

    const avatarClass = p.pfp || 'avatar-1';

    slot.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;justify-content:center;">
        <div class="user-badge-avatar ${avatarClass}" style="width:20px;height:20px;font-size:0.6rem;">${p.name[0]}</div>
        <span class="other-player-name stalk-trigger" data-username="${escapeHtml(p.name)}">${escapeHtml(p.name)}${isActive ? ' ⏳' : ''}</span>
      </div>
      ${handsHtml}
    `;

    slot.querySelector('.stalk-trigger').addEventListener('click', (e) => {
      stalkPlayer(e.target.dataset.username);
    });

    els.otherPlayers.appendChild(slot);
  });
}

function updateOtherPlayersValues(state) {
  const others = state.players.filter(p => p.id !== myId);
  const slots = els.otherPlayers.querySelectorAll('.other-player-slot');

  slots.forEach((slot, i) => {
    if (others[i]) {
      const valEl = slot.querySelector('.other-player-value');
      if (valEl) {
        valEl.textContent = others[i].handValues[0] || '';
      }
    }
  });
}

// ─── Your Value Display ──────────────────────────────────────────
function updateYourValueDisplay(me) {
  if (!me || !me.hands.length) {
    els.yourValue.textContent = '';
    return;
  }

  const activeHand = Math.min(me.currentHandIndex, me.hands.length - 1);
  const val = me.handValues[activeHand];

  if (me.hands[activeHand] && me.hands[activeHand].length > 0) {
    els.yourValue.className = 'your-value';
    if (val > 21) {
      els.yourValue.textContent = val + ' BUST';
      els.yourValue.classList.add('bust');
    } else if (val === 21 && me.hands[activeHand].length === 2 && me.hands.length === 1) {
      els.yourValue.textContent = 'BLACKJACK!';
      els.yourValue.classList.add('blackjack');
    } else {
      els.yourValue.textContent = val;
    }
  } else {
    els.yourValue.textContent = '';
  }
}

// ─── Hand Result Badge ───────────────────────────────────────────
function renderHandResult(container, result) {
  if (result && typeof result === 'object') {
    const resultEl = document.createElement('span');
    resultEl.className = `other-player-result result-${result.outcome}`;
    resultEl.textContent = formatOutcome(result.outcome);
    container.appendChild(resultEl);
  } else if (result === 'bust') {
    const resultEl = document.createElement('span');
    resultEl.className = 'other-player-result result-bust';
    resultEl.textContent = 'BUST';
    container.appendChild(resultEl);
  }
}

// ─── Game Status ─────────────────────────────────────────────────
function renderGameStatus(state) {
  let html = '';

  switch (state.phase) {
    case 'betting':
      html = '<span class="status-text">Place your bets!</span>';
      break;
    case 'dealing':
      html = '<span class="status-text">Dealing cards...</span>';
      break;
    case 'playing': {
      const current = state.players[state.currentPlayerIndex];
      if (current) {
        if (current.id === myId) {
          html = '<span class="status-text turn-indicator">⭐ Your turn! Choose an action</span>';
        } else {
          html = `<span class="status-text">Waiting for <span class="turn-indicator">${escapeHtml(current.name)}</span>...</span>`;
        }
      }
      break;
    }
    case 'dealer_turn':
      html = '<span class="status-text">Dealer is revealing...</span>';
      break;
    case 'results':
      html = '<span class="status-text">Round complete!</span>';
      break;
  }

  els.gameStatus.innerHTML = html;
}

// ─── Controls ────────────────────────────────────────────────────
function renderControls(state) {
  const me = state.players.find(p => p.id === myId);
  if (!me) return;

  const myIdx = state.players.findIndex(p => p.id === myId);
  const isMyTurn = state.phase === 'playing' && myIdx === state.currentPlayerIndex;

  // Betting panel
  if (state.phase === 'betting' && !me.isReady) {
    els.bettingPanel.style.display = 'flex';
    els.actionBar.style.display = 'none';
    els.resultsOverlay.style.display = 'none';
  } else {
    els.bettingPanel.style.display = 'none';
  }

  // Action bar
  if (isMyTurn) {
    els.actionBar.style.display = 'flex';

    const handIdx = me.currentHandIndex;
    els.doubleBtn.style.display = me.canDouble[handIdx] ? 'inline-flex' : 'none';
    els.splitBtn.style.display = me.canSplit[handIdx] ? 'inline-flex' : 'none';

    // Update active hand indicator
    const handCards = els.yourHands.querySelectorAll('.hand-cards');
    handCards.forEach((hc, i) => {
      hc.classList.toggle('hand-active', i === handIdx);
    });
  } else {
    els.actionBar.style.display = 'none';
  }

  // Results overlay (rendered separately by animateResults)
  if (state.phase !== 'results') {
    els.resultsOverlay.style.display = 'none';
  }
}

// ─── Results ─────────────────────────────────────────────────────
function renderResults(state) {
  els.resultsOverlay.style.display = 'flex';

  const me = state.players.find(p => p.id === myId);
  const isHost = me && me.isHost;

  // Determine main title
  if (me && me.results[0] && typeof me.results[0] === 'object') {
    const r = me.results[0];
    switch (r.outcome) {
      case 'blackjack': els.resultsTitle.textContent = '🃏 BLACKJACK!'; break;
      case 'win': els.resultsTitle.textContent = '🎉 You Win!'; break;
      case 'lose': els.resultsTitle.textContent = '😞 You Lose'; break;
      case 'push': els.resultsTitle.textContent = '🤝 Push'; break;
      default: els.resultsTitle.textContent = 'Round Over';
    }
  } else {
    els.resultsTitle.textContent = 'Round Over';
  }

  // Results list
  els.resultsList.innerHTML = '';
  state.players.forEach(p => {
    p.results.forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      const row = document.createElement('div');
      row.className = 'result-row';
      row.style.animationDelay = `${i * 0.1}s`;

      const payout = r.payout - p.bets[i];
      let payoutClass = 'neutral';
      let payoutText = '±0';
      if (payout > 0) {
        payoutClass = 'positive';
        payoutText = '+' + payout;
      } else if (payout < 0) {
        payoutClass = 'negative';
        payoutText = payout.toString();
      }

      row.innerHTML = `
        <span class="result-player-name">${escapeHtml(p.name)}${p.hands.length > 1 ? ` (Hand ${i+1})` : ''}${p.id === myId ? ' ⭐' : ''}</span>
        <span class="result-outcome">
          <span class="result-outcome-text result-${r.outcome}">${formatOutcome(r.outcome)}</span>
          <span class="result-payout ${payoutClass}">${payoutText}</span>
        </span>
      `;
      els.resultsList.appendChild(row);
    });
  });

  // New round button
  if (isHost) {
    els.newRoundBtn.style.display = 'inline-flex';
    els.resultsHint.style.display = 'none';
  } else {
    els.newRoundBtn.style.display = 'none';
    els.resultsHint.style.display = 'block';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────
function formatOutcome(outcome) {
  switch (outcome) {
    case 'blackjack': return 'BLACKJACK';
    case 'win': return 'WIN';
    case 'lose': return 'LOSE';
    case 'push': return 'PUSH';
    case 'bust': return 'BUST';
    default: return String(outcome).toUpperCase();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Chat ────────────────────────────────────────────────────────
function addChatMessage(text, sender) {
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg' + (!sender ? ' system-msg' : '');

  if (sender) {
    msgEl.innerHTML = `<span class="chat-sender">${escapeHtml(sender)}:</span> ${escapeHtml(text)}`;
  } else {
    msgEl.textContent = text;
  }

  els.chatMessages.appendChild(msgEl);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

  if (!chatOpen) {
    unreadMessages++;
    els.chatBadge.textContent = unreadMessages;
    els.chatBadge.style.display = 'flex';
  }
}

function toggleChat() {
  chatOpen = !chatOpen;
  els.chatPanel.style.display = chatOpen ? 'flex' : 'none';
  if (chatOpen) {
    unreadMessages = 0;
    els.chatBadge.style.display = 'none';
    els.chatInput.focus();
  }
}

function sendChat() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  send('chat', { text });
  els.chatInput.value = '';
}

// ─── Update User Profile UI (Header badge) ──────────────────────
function updateUserProfileUI() {
  if (!DB.currentUser) return;
  const u = DB.currentUser;
  const rank = getRankInfo(u.rank_points || 0);

  // Show header badges
  els.userProfileBadge.style.display = 'flex';
  els.leaderboardBtn.style.display = 'inline-flex';
  els.settingsBtn.style.display = 'inline-flex';

  // Update header avatar
  els.headerAvatar.className = 'user-badge-avatar ' + (u.pfp || 'avatar-1');
  els.headerAvatar.textContent = u.username[0].toUpperCase();
  els.headerUsername.textContent = u.username;
  els.headerRank.textContent = rank.badge + ' ' + rank.name;
  els.headerRank.style.color = rank.color;

  // Update lobby username
  if (els.lobbyUserName) els.lobbyUserName.textContent = u.username;
}

// ─── Stalk Player (Profile Inspection) ───────────────────────────
async function stalkPlayer(username) {
  if (!username) return;
  try {
    const profile = await DB.getProfile(username);
    const rank = getRankInfo(profile.rank_points || 0);

    els.profileAvatar.className = 'profile-avatar ' + (profile.pfp || 'avatar-1');
    els.profileAvatar.textContent = profile.username[0].toUpperCase();
    els.profileUsername.textContent = profile.username;
    els.profileRankBadge.textContent = rank.badge + ' ' + rank.name;
    els.profileRankBadge.style.color = rank.color;
    els.profileBio.textContent = profile.bio || 'No bio yet...';
    els.profileStatChips.textContent = (profile.chips || 0).toLocaleString();
    els.profileStatRP.textContent = (profile.rank_points || 0).toLocaleString() + ' LP';

    const totalGames = (profile.wins || 0) + (profile.losses || 0) + (profile.draws || 0);
    const winRate = totalGames > 0 ? Math.round(((profile.wins || 0) / totalGames) * 100) : 0;

    els.profileStatWins.textContent = profile.wins || 0;
    els.profileStatWR.textContent = winRate + '%';
    els.profileStatBJs.textContent = profile.blackjacks || 0;

    els.profileModal.style.display = 'flex';
  } catch (err) {
    showToast('Could not load player profile', 'error');
  }
}

// ─── Load Leaderboard ────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const leaders = await DB.getLeaderboard();
    els.leaderboardList.innerHTML = '';

    if (leaders.length === 0) {
      els.leaderboardList.innerHTML = '<div style="text-align:center;padding:var(--space-lg);color:var(--text-muted);">No players yet</div>';
      return;
    }

    leaders.forEach((player, i) => {
      const rank = getRankInfo(player.rank_points || 0);
      const medals = ['🥇', '🥈', '🥉'];
      const medal = medals[i] || `#${i + 1}`;

      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      row.innerHTML = `
        <span class="lb-rank">${medal}</span>
        <div class="lb-player">
          <div class="user-badge-avatar ${player.pfp || 'avatar-1'}" style="width:28px;height:28px;font-size:0.7rem;">${(player.username || 'P')[0].toUpperCase()}</div>
          <span class="lb-name stalk-trigger" data-username="${player.username}">${player.username}</span>
        </div>
        <span class="lb-badge" style="color:${rank.color}">${rank.badge}</span>
        <span class="lb-chips">🪙 ${(player.chips || 0).toLocaleString()}</span>
      `;

      row.querySelector('.stalk-trigger').addEventListener('click', (e) => {
        stalkPlayer(e.target.dataset.username);
      });

      els.leaderboardList.appendChild(row);
    });
  } catch (err) {
    els.leaderboardList.innerHTML = '<div style="text-align:center;padding:var(--space-lg);color:var(--text-muted);">Failed to load leaderboard</div>';
  }
}

// ─── Event Listeners ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Initialize audio on first interaction
  const initAudio = () => {
    sounds.init();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  connect();

  // ── Database Configuration ──
  els.dbSetupTrigger.addEventListener('click', () => {
    sounds.click();
    els.dbUrl.value = localStorage.getItem('SB_URL') || '';
    els.dbAnonKey.value = localStorage.getItem('SB_KEY') || '';
    els.dbSetupPanel.style.display = 'flex';
  });

  els.dbSetupClose.addEventListener('click', () => {
    sounds.click();
    els.dbSetupPanel.style.display = 'none';
  });

  els.dbSetupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sounds.click();
    
    const url = els.dbUrl.value.trim();
    const key = els.dbAnonKey.value.trim();
    
    if (url) localStorage.setItem('SB_URL', url);
    else localStorage.removeItem('SB_URL');

    if (key) localStorage.setItem('SB_KEY', key);
    else localStorage.removeItem('SB_KEY');

    showToast('Database configured! Please refresh page to apply.', 'success');
    els.dbSetupPanel.style.display = 'none';
  });

  // ── Auth View: Tab Switcher ──
  let authMode = 'login'; // login or signup

  els.tabLoginBtn.addEventListener('click', () => {
    sounds.click();
    authMode = 'login';
    els.tabLoginBtn.classList.add('active');
    els.tabSignupBtn.classList.remove('active');
    els.signupNotice.style.display = 'none';
    els.authSubmitBtn.textContent = 'Login';
  });

  els.tabSignupBtn.addEventListener('click', () => {
    sounds.click();
    authMode = 'signup';
    els.tabSignupBtn.classList.add('active');
    els.tabLoginBtn.classList.remove('active');
    els.signupNotice.style.display = 'flex';
    els.authSubmitBtn.textContent = 'Sign Up';
  });

  // ── Auth Form: Sign Up / Sign In ──
  els.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    sounds.click();

    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;

    if (!username || !password) return;

    els.authSubmitBtn.disabled = true;
    els.authSubmitBtn.textContent = 'Please wait...';

    try {
      if (authMode === 'login') {
        const user = await DB.login(username, password);
        showToast(`Welcome back, ${user.username}!`, 'success');
      } else {
        const user = await DB.register(username, password);
        showToast('Account registered successfully!', 'success');
      }
      
      updateUserProfileUI();
      showView('lobby');
    } catch (err) {
      showToast(err.message || 'Authentication failed', 'error');
    } finally {
      els.authSubmitBtn.disabled = false;
      els.authSubmitBtn.textContent = authMode === 'login' ? 'Login' : 'Sign Up';
    }
  });

  // ── Logout ──
  els.logoutBtn.addEventListener('click', () => {
    sounds.click();
    DB.logout();
    
    // Hide headers
    els.userProfileBadge.style.display = 'none';
    els.leaderboardBtn.style.display = 'none';
    els.settingsBtn.style.display = 'none';
    els.chipDisplay.style.display = 'none';

    // Clear forms
    els.authUsername.value = '';
    els.authPassword.value = '';
    
    showView('auth');
    showToast('Logged out', 'info');
  });

  // ── Lobby Actions ──
  els.createRoomBtn.addEventListener('click', () => {
    if (!DB.currentUser) {
      showToast('Please log in first', 'warning');
      return;
    }
    sounds.click();
    send('create_room', {
      name: DB.currentUser.username,
      chips: DB.currentUser.chips,
      pfp: DB.currentUser.pfp,
      rankPoints: DB.currentUser.rank_points,
      bio: DB.currentUser.bio
    });
  });

  els.joinRoomBtn.addEventListener('click', () => {
    if (!DB.currentUser) {
      showToast('Please log in first', 'warning');
      return;
    }
    const code = els.roomCodeInput.value.trim().toUpperCase();
    if (!code) {
      showToast('Enter a room code to join', 'warning');
      return;
    }
    sounds.click();
    send('join_room', {
      name: DB.currentUser.username,
      code: code,
      chips: DB.currentUser.chips,
      pfp: DB.currentUser.pfp,
      rankPoints: DB.currentUser.rank_points,
      bio: DB.currentUser.bio
    });
  });

  // Enter key shortcuts
  els.roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.joinRoomBtn.click();
  });

  // Copy room code
  els.copyCodeBtn.addEventListener('click', () => {
    const code = els.roomCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(() => {
      showToast('Room code copied!', 'success');
      sounds.click();
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Room code copied!', 'success');
    });
  });

  // Start game
  els.startGameBtn.addEventListener('click', () => {
    sounds.click();
    send('start_game');
  });

  // Betting
  let selectedBet = 0;

  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.value);
      const me = gameState?.players.find(p => p.id === myId);
      const maxBet = me ? Math.min(500, me.chips) : 500;

      selectedBet = Math.min(selectedBet + val, maxBet);
      els.betAmount.textContent = selectedBet;
      sounds.chipClink();

      // Visual feedback — pop the chip
      btn.style.transform = 'translateY(-6px) scale(1.2)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 200);
    });
  });

  els.clearBetBtn.addEventListener('click', () => {
    selectedBet = 0;
    els.betAmount.textContent = '0';
    sounds.click();
  });

  els.confirmBetBtn.addEventListener('click', () => {
    if (selectedBet < 10) {
      showToast('Minimum bet is 10 chips', 'warning');
      return;
    }
    sounds.chipClink();
    send('place_bet', { amount: selectedBet });
    selectedBet = 0;
    els.betAmount.textContent = '0';
  });

  // Game actions
  els.hitBtn.addEventListener('click', () => {
    sounds.click();
    send('action', { action: 'hit' });
  });

  els.standBtn.addEventListener('click', () => {
    sounds.click();
    send('action', { action: 'stand' });
  });

  els.doubleBtn.addEventListener('click', () => {
    sounds.click();
    send('action', { action: 'double' });
  });

  els.splitBtn.addEventListener('click', () => {
    sounds.click();
    send('action', { action: 'split' });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (els.actionBar.style.display !== 'none') {
      switch (e.key.toLowerCase()) {
        case 'h': els.hitBtn.click(); break;
        case 's': els.standBtn.click(); break;
        case 'd':
          if (els.doubleBtn.style.display !== 'none') els.doubleBtn.click();
          break;
        case 'p':
          if (els.splitBtn.style.display !== 'none') els.splitBtn.click();
          break;
      }
    }
  });

  // New round
  els.newRoundBtn.addEventListener('click', () => {
    sounds.click();
    send('new_round');
    resetAnimationState();
  });

  // Leave Table
  els.leaveTableBtn.addEventListener('click', () => {
    sounds.click();
    send('leave_room');
  });

  // Busted Back to Lobby
  els.bustedLobbyBtn.addEventListener('click', () => {
    sounds.click();
    send('leave_room');
  });

  // Sound toggle
  els.soundToggle.addEventListener('click', () => {
    const enabled = sounds.toggle();
    els.soundToggle.style.opacity = enabled ? '1' : '0.4';
    showToast(enabled ? 'Sound on' : 'Sound off', 'info', 1500);
  });

  // ── Settings Modal ──
  els.settingsBtn.addEventListener('click', () => {
    sounds.click();
    if (DB.currentUser) {
      els.settingsBio.value = DB.currentUser.bio || '';
      // Highlight current avatar
      document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.avatar === (DB.currentUser.pfp || 'avatar-1'));
      });
    }
    els.settingsModal.style.display = 'flex';
  });

  els.closeSettingsBtn.addEventListener('click', () => {
    sounds.click();
    els.settingsModal.style.display = 'none';
  });

  // Settings tab switcher
  els.tabProfileSettingsBtn.addEventListener('click', () => {
    sounds.click();
    els.tabProfileSettingsBtn.classList.add('active');
    els.tabSecuritySettingsBtn.classList.remove('active');
    els.profileSettingsContent.style.display = 'block';
    els.securitySettingsContent.style.display = 'none';
  });

  els.tabSecuritySettingsBtn.addEventListener('click', () => {
    sounds.click();
    els.tabSecuritySettingsBtn.classList.add('active');
    els.tabProfileSettingsBtn.classList.remove('active');
    els.securitySettingsContent.style.display = 'block';
    els.profileSettingsContent.style.display = 'none';
  });

  // Avatar picker
  let selectedAvatar = DB.currentUser?.pfp || 'avatar-1';
  document.querySelectorAll('.avatar-option').forEach(opt => {
    opt.addEventListener('click', () => {
      sounds.click();
      selectedAvatar = opt.dataset.avatar;
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Profile settings save
  els.profileSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    sounds.click();
    try {
      await DB.updateProfile({
        bio: els.settingsBio.value.trim() || 'No bio yet...',
        pfp: selectedAvatar
      });
      updateUserProfileUI();
      showToast('Profile updated!', 'success');
      els.settingsModal.style.display = 'none';
    } catch (err) {
      showToast(err.message || 'Failed to save profile', 'error');
    }
  });

  // Security settings (password change)
  els.securitySettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    sounds.click();
    const newPw = els.settingsNewPassword.value;
    if (!newPw || newPw.length < 4) {
      showToast('Password must be at least 4 characters', 'warning');
      return;
    }
    try {
      await DB.changePassword(newPw);
      showToast('Password changed successfully!', 'success');
      els.settingsNewPassword.value = '';
      els.settingsModal.style.display = 'none';
    } catch (err) {
      showToast(err.message || 'Failed to change password', 'error');
    }
  });

  // ── Leaderboard Modal ──
  els.leaderboardBtn.addEventListener('click', () => {
    sounds.click();
    els.leaderboardModal.style.display = 'flex';
    loadLeaderboard();
  });

  els.closeLeaderboardBtn.addEventListener('click', () => {
    sounds.click();
    els.leaderboardModal.style.display = 'none';
  });

  // ── Profile Inspect Modal ──
  els.closeProfileBtn.addEventListener('click', () => {
    sounds.click();
    els.profileModal.style.display = 'none';
  });

  // Close modals by clicking overlay
  [els.settingsModal, els.leaderboardModal, els.profileModal].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          sounds.click();
          modal.style.display = 'none';
        }
      });
    }
  });

  // Chat
  els.chatBubble.addEventListener('click', toggleChat);
  els.chatClose.addEventListener('click', toggleChat);
  els.chatSend.addEventListener('click', sendChat);
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
});

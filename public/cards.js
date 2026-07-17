/* ═══════════════════════════════════════════════════════════════════
   CARDS — Ultra-Realistic Card Rendering
   Proper pip layouts for all 13 ranks, face card art,
   3D flip animations, and true-to-life card design
   ═══════════════════════════════════════════════════════════════════ */

const SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
};

const FACE_LABELS = {
  J: '𝐉',
  Q: '𝐐',
  K: '𝐊',
};

/* ─── Pip Layout Positions ───────────────────────────────────────
   Each position is [x%, y%] relative to the card's pip area
   (which is CSS-inset from edges to avoid corners). */
const PIP_LAYOUTS = {
  'A':  [[50, 50]],
  '2':  [[50, 8], [50, 92]],
  '3':  [[50, 8], [50, 50], [50, 92]],
  '4':  [[30, 8], [70, 8], [30, 92], [70, 92]],
  '5':  [[30, 8], [70, 8], [50, 50], [30, 92], [70, 92]],
  '6':  [[30, 8], [70, 8], [30, 50], [70, 50], [30, 92], [70, 92]],
  '7':  [[30, 8], [70, 8], [50, 29], [30, 50], [70, 50], [30, 92], [70, 92]],
  '8':  [[30, 8], [70, 8], [50, 29], [30, 50], [70, 50], [50, 71], [30, 92], [70, 92]],
  '9':  [[30, 6], [70, 6], [30, 31], [70, 31], [50, 50], [30, 69], [70, 69], [30, 94], [70, 94]],
  '10': [[30, 6], [70, 6], [50, 22], [30, 38], [70, 38], [30, 62], [70, 62], [50, 78], [30, 94], [70, 94]],
};

/**
 * Create a playing card DOM element with realistic design
 */
function createCardElement(card, opts = {}) {
  const {
    small = false,
    startHidden = false,
    dealDelay = 0,
    flipDelay = 0,
    noAnimation = false,
  } = opts;

  const cardEl = document.createElement('div');
  cardEl.className = 'playing-card' + (small ? ' card-small' : '');

  if (!noAnimation) {
    cardEl.classList.add('card-dealing');
    if (dealDelay > 0) {
      cardEl.style.animationDelay = dealDelay + 'ms';
    }
  }

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  if (!card.hidden && !startHidden) {
    inner.classList.add('flipped');
  }

  // ── Card Back ──
  const back = document.createElement('div');
  back.className = 'card-back';
  // Decorative inner frame
  const backInner = document.createElement('div');
  backInner.className = 'card-back-inner';
  const backPattern = document.createElement('div');
  backPattern.className = 'card-back-pattern';
  const backLogo = document.createElement('div');
  backLogo.className = 'card-back-logo';
  backLogo.textContent = '♠';
  backInner.append(backPattern, backLogo);
  back.appendChild(backInner);

  // ── Card Front ──
  const front = document.createElement('div');
  front.className = 'card-front';

  if (!card.hidden) {
    const suitSymbol = SUIT_SYMBOLS[card.suit] || '?';
    const color = SUIT_COLORS[card.suit] || 'black';
    front.classList.add(color);

    // Corner: top-left
    const cornerTL = document.createElement('div');
    cornerTL.className = 'card-corner card-corner-tl';
    cornerTL.innerHTML = `<span class="corner-rank">${card.rank}</span><span class="corner-suit">${suitSymbol}</span>`;

    // Corner: bottom-right (rotated)
    const cornerBR = document.createElement('div');
    cornerBR.className = 'card-corner card-corner-br';
    cornerBR.innerHTML = `<span class="corner-rank">${card.rank}</span><span class="corner-suit">${suitSymbol}</span>`;

    // Card body / center
    const body = document.createElement('div');
    body.className = 'card-body';

    if (['J', 'Q', 'K'].includes(card.rank)) {
      // Face card — decorative design
      body.classList.add('card-face');
      const faceDesign = createFaceCard(card.rank, card.suit, suitSymbol, small);
      body.appendChild(faceDesign);
    } else if (card.rank === 'A') {
      // Ace — large center suit
      body.classList.add('card-ace');
      const aceSuit = document.createElement('div');
      aceSuit.className = 'ace-suit';
      aceSuit.textContent = suitSymbol;
      body.appendChild(aceSuit);
    } else {
      // Number card — proper pip layout
      body.classList.add('card-pips');
      const layout = PIP_LAYOUTS[card.rank] || [];
      layout.forEach(([x, y]) => {
        const pip = document.createElement('span');
        pip.className = 'pip';
        pip.textContent = suitSymbol;
        pip.style.left = x + '%';
        pip.style.top = y + '%';
        // Flip pips in bottom half
        if (y > 60) {
          pip.classList.add('pip-inverted');
        }
        body.appendChild(pip);
      });
    }

    front.append(cornerTL, body, cornerBR);
  }

  inner.append(back, front);
  cardEl.appendChild(inner);

  // Schedule flip animation
  if (startHidden && !card.hidden && flipDelay > 0) {
    setTimeout(() => {
      inner.classList.add('flipped');
      cardEl.classList.add('card-flipping');
      if (typeof sounds !== 'undefined') sounds.cardFlip();
    }, flipDelay);
  }

  return cardEl;
}

/**
 * Create face card (J/Q/K) decorative element
 */
function createFaceCard(rank, suit, suitSymbol, small) {
  const wrapper = document.createElement('div');
  wrapper.className = 'face-card-design';

  // Crown/emblem for face cards
  const emblem = document.createElement('div');
  emblem.className = 'face-emblem';

  // The letter
  const letter = document.createElement('span');
  letter.className = 'face-letter';
  letter.textContent = rank;

  // Decorative suit symbols
  const topSuit = document.createElement('span');
  topSuit.className = 'face-suit face-suit-top';
  topSuit.textContent = suitSymbol;

  const bottomSuit = document.createElement('span');
  bottomSuit.className = 'face-suit face-suit-bottom';
  bottomSuit.textContent = suitSymbol;

  // Crown icon based on rank
  const crown = document.createElement('span');
  crown.className = 'face-crown';
  if (rank === 'K') crown.textContent = '♛';
  else if (rank === 'Q') crown.textContent = '♛';
  else crown.textContent = '⚔';

  emblem.append(crown, letter);
  wrapper.append(topSuit, emblem, bottomSuit);

  return wrapper;
}

/**
 * Orchestrate dealing cards with suspenseful timing
 */
function dealCards(container, cards, opts = {}) {
  const {
    small = false,
    stagger = true,
    flipCards = false,
    dealInterval = 150,
    flipStartDelay = 300,
    flipInterval = 200,
    onComplete = null,
    clearFirst = true,
    keepExisting = 0,
  } = opts;

  if (clearFirst && keepExisting === 0) {
    container.innerHTML = '';
  }

  const startIdx = keepExisting;
  const newCards = cards.slice(startIdx);

  newCards.forEach((card, i) => {
    const dealDelay = stagger ? i * dealInterval : 0;
    const flipDelay = flipCards
      ? (newCards.length * dealInterval) + flipStartDelay + (i * flipInterval)
      : 0;

    setTimeout(() => {
      const el = createCardElement(card, {
        small,
        startHidden: flipCards && !card.hidden,
        flipDelay: flipCards ? (flipDelay - dealDelay) : 0,
      });
      container.appendChild(el);
      if (typeof sounds !== 'undefined') sounds.cardDeal();
    }, dealDelay);
  });

  if (onComplete) {
    const totalDealTime = newCards.length * dealInterval;
    const totalFlipTime = flipCards ? flipStartDelay + (newCards.length * flipInterval) : 0;
    setTimeout(onComplete, totalDealTime + totalFlipTime + 300);
  }
}

/**
 * Dramatic card reveal (dealer hole card)
 */
function revealCard(cardEl, card, delay = 0) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const inner = cardEl.querySelector('.card-inner');
      const front = cardEl.querySelector('.card-front');

      if (front && card && !card.hidden) {
        const suitSymbol = SUIT_SYMBOLS[card.suit] || '?';
        const color = SUIT_COLORS[card.suit] || 'black';

        // Rebuild the front face
        front.className = 'card-front ' + color;
        front.innerHTML = '';

        const cornerTL = document.createElement('div');
        cornerTL.className = 'card-corner card-corner-tl';
        cornerTL.innerHTML = `<span class="corner-rank">${card.rank}</span><span class="corner-suit">${suitSymbol}</span>`;

        const cornerBR = document.createElement('div');
        cornerBR.className = 'card-corner card-corner-br';
        cornerBR.innerHTML = `<span class="corner-rank">${card.rank}</span><span class="corner-suit">${suitSymbol}</span>`;

        const body = document.createElement('div');
        body.className = 'card-body';

        if (['J', 'Q', 'K'].includes(card.rank)) {
          body.classList.add('card-face');
          const isSmall = cardEl.classList.contains('card-small');
          body.appendChild(createFaceCard(card.rank, card.suit, suitSymbol, isSmall));
        } else if (card.rank === 'A') {
          body.classList.add('card-ace');
          const aceSuit = document.createElement('div');
          aceSuit.className = 'ace-suit';
          aceSuit.textContent = suitSymbol;
          body.appendChild(aceSuit);
        } else {
          body.classList.add('card-pips');
          const layout = PIP_LAYOUTS[card.rank] || [];
          layout.forEach(([x, y]) => {
            const pip = document.createElement('span');
            pip.className = 'pip';
            pip.textContent = suitSymbol;
            pip.style.left = x + '%';
            pip.style.top = y + '%';
            if (y > 60) pip.classList.add('pip-inverted');
            body.appendChild(pip);
          });
        }

        front.append(cornerTL, body, cornerBR);
      }

      if (inner) {
        inner.classList.add('flipped');
        cardEl.classList.add('card-flipping');
        if (typeof sounds !== 'undefined') sounds.cardFlip();
      }

      setTimeout(resolve, 600);
    }, delay);
  });
}

/**
 * Deal a single card (hit)
 */
function dealSingleCard(container, card, opts = {}) {
  const { small = false, flipDelay = 250 } = opts;
  const el = createCardElement(card, { small, startHidden: true, flipDelay });
  container.appendChild(el);
  if (typeof sounds !== 'undefined') sounds.cardDeal();
  return el;
}

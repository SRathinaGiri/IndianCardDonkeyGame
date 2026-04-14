// Sound assets
const sounds = {
    click: new Audio('click.mp3'),
    discard: new Audio('discard.mp3'),
    draw: new Audio('draw.mp3'),
    error: new Audio('error.mp3'),
    meld: new Audio('meld.mp3'),
    shuffle: new Audio('shuffle.mp3'),
    win: new Audio('win.mp3')
};

// Game State
const state = {
    players: [], // Array of {id, name, hand: [], isBot, isSafe, order}
    numPlayers: 4,
    deck: [],
    centerPile: [], // Array of {card, playerId}
    currentTurnIndex: 0, // Index in players array
    roundSuit: null, // Suit led in the current round
    highestCardInRound: null, // Highest card of the led suit
    winnerOfTrick: null, // Player ID who currently holds the highest card
    isCut: false, // True if someone played a different suit
    gameStarted: false,
    gameOver: false,
    donkey: null,
    animationsPlaying: false,
    fastMode: false,
    showPileStock: false,
    voidSuits: {
        'Hearts': false,
        'Diamonds': false,
        'Clubs': false,
        'Spades': false
    }, // Track which suits have been cut by someone
    discardPile: [] // Cards that have been cleared from tricks
};

// Card definitions
const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Rank value for comparison
function getRankValue(rank) {
    return RANKS.indexOf(rank);
}

// Create a standard 52-card deck
function createDeck() {
    const deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    return deck;
}

// Shuffle deck using Fisher-Yates algorithm
function shuffleDeck(deck) {
    playSound('shuffle');
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Deal cards to players
function dealCards() {
    state.deck = shuffleDeck(createDeck());

    // Sort hands after dealing
    let currentPlayer = 0;
    while (state.deck.length > 0) {
        const card = state.deck.pop();
        state.players[currentPlayer].hand.push(card);
        currentPlayer = (currentPlayer + 1) % state.numPlayers;
    }

    // Sort each player's hand by suit and then by rank
    for (let player of state.players) {
        sortHand(player.hand);
    }
}

function sortHand(hand) {
    hand.sort((a, b) => {
        if (a.suit !== b.suit) {
            return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
        }
        return getRankValue(a.rank) - getRankValue(b.rank);
    });
}

function initGame() {
    const numPlayersSelect = document.getElementById('num-players');
    state.numPlayers = parseInt(numPlayersSelect.value);
    const fastModeCheckbox = document.getElementById('fast-mode');
    state.fastMode = fastModeCheckbox.checked;
    const showPileStockCheckbox = document.getElementById('show-pile-stock');
    state.showPileStock = showPileStockCheckbox.checked;

    state.players = [];
    // Player 0 is human
    state.players.push({
        id: 'player-0',
        name: 'You',
        hand: [],
        isBot: false,
        isSafe: false,
        order: 0
    });

    // Create bots
    for (let i = 1; i < state.numPlayers; i++) {
        state.players.push({
            id: `player-${i}`,
            name: `Bot ${i}`,
            hand: [],
            isBot: true,
            isSafe: false,
            order: i
        });
    }

    dealCards();

    // Find who has Ace of Spades
    for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].hand.some(c => c.suit === 'Spades' && c.rank === 'A')) {
            state.currentTurnIndex = i;
            break;
        }
    }

    state.centerPile = [];
    state.roundSuit = null;
    state.highestCardInRound = null;
    state.winnerOfTrick = null;
    state.isCut = false;
    state.gameStarted = true;
    state.gameOver = false;
    state.donkey = null;
    state.voidSuits = {
        'Hearts': false,
        'Diamonds': false,
        'Clubs': false,
        'Spades': false
    };
    state.discardPile = [];

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    renderGame();
    updateStatus(`${state.players[state.currentTurnIndex].name} starts (has A♠)`);

    if (state.players[state.currentTurnIndex].isBot) {
        setTimeout(playBotTurn, 1500);
    }
}

// Helpers
function playSound(name) {
    if (state.fastMode) return;
    try {
        if (sounds[name]) {
            sounds[name].currentTime = 0;
            sounds[name].play().catch(e => console.log('Audio play prevented:', e));
        }
    } catch (e) {}
}

function updateStatus(message) {
    document.getElementById('status-message').textContent = message;
}

// Game Logic
function isValidPlay(player, card) {
    // First turn of the game must be Ace of Spades
    if (state.centerPile.length === 0 && !state.roundSuit) {
        // If player has A♠, they must play it
        if (player.hand.some(c => c.suit === 'Spades' && c.rank === 'A')) {
            return card.suit === 'Spades' && card.rank === 'A';
        }
        return true; // Leader can play anything otherwise
    }

    // Not the leader
    if (state.roundSuit) {
        // If player has the led suit, they must follow suit
        const hasSuit = player.hand.some(c => c.suit === state.roundSuit);
        if (hasSuit) {
            return card.suit === state.roundSuit;
        }
    }

    // If no led suit or player doesn't have the led suit, can play anything
    return true;
}

function playCard(playerIndex, cardIndex) {
    if (state.animationsPlaying || state.gameOver) return;

    const player = state.players[playerIndex];
    const card = player.hand[cardIndex];

    if (!isValidPlay(player, card)) {
        if (!player.isBot) playSound('error');
        return;
    }

    // Remove card from hand
    player.hand.splice(cardIndex, 1);

    playSound('discard');

    // First card of the round
    if (state.centerPile.length === 0) {
        state.roundSuit = card.suit;
        state.highestCardInRound = card;
        state.winnerOfTrick = player.id;
        state.isCut = false;
    } else {
        // Check if cut
        if (card.suit !== state.roundSuit) {
            state.isCut = true;
            // Mark the led suit as voided (someone doesn't have it)
            state.voidSuits[state.roundSuit] = true;
        } else if (!state.isCut) {
            // Update highest card if follows suit and no cut yet
            if (getRankValue(card.rank) > getRankValue(state.highestCardInRound.rank)) {
                state.highestCardInRound = card;
                state.winnerOfTrick = player.id;
            }
        }
    }

    state.centerPile.push({ card, playerId: player.id });
    renderGame();

    // Check if player is safe
    if (player.hand.length === 0 && !player.isSafe) {
        player.isSafe = true;
        playSound('win');
        updateStatus(`${player.name} is safe!`);
        checkGameOver();
    }

    if (state.gameOver) return;

    if (state.fastMode) {
        resolveTurn();
    } else {
        state.animationsPlaying = true;

        setTimeout(() => {
            resolveTurn();
        }, 1500); // Increased from 1000 to give more time to see the played card
    }
}

function resolveTurn() {
    state.animationsPlaying = false;

    // Get active players count
    const activePlayersCount = state.players.filter(p => !p.isSafe).length;

    // If cut happened, or everyone has played
    if (state.isCut || state.centerPile.length === activePlayersCount) {
        prepareTrickResolution();
    } else {
        // Next player's turn
        advanceTurn();
    }
}

function prepareTrickResolution() {
    // Determine winner/taker
    if (state.isCut) {
        const takerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        updateStatus(`${state.players[takerIndex].name} takes the pile!`);
    } else {
        const winnerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        updateStatus(`${state.players[winnerIndex].name} won the trick`);
    }

    // Show continue button to pause before clearing the table
    if (state.fastMode) {
        executeTrickResolution();
    } else {
        document.getElementById('continue-btn').classList.remove('hidden');
    }
}

function executeTrickResolution() {
    if (state.isCut) {
        // Trick taken by winnerOfTrick
        const takerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        const taker = state.players[takerIndex];

        // Add all cards to taker's hand
        for (let item of state.centerPile) {
            taker.hand.push(item.card);
        }
        sortHand(taker.hand);

        if (taker.isSafe && taker.hand.length > 0) {
            taker.isSafe = false; // Re-enter game
        }

        playSound('draw');

        // Taker starts next round
        state.currentTurnIndex = takerIndex;
    } else {
        // Trick cleared - add to discard pile
        for (let item of state.centerPile) {
            state.discardPile.push(item.card);
        }
        playSound('meld');
        const winnerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);

        // Winner starts next round
        state.currentTurnIndex = winnerIndex;
    }

    // If the person who is supposed to start is safe, pass to next active player
    while (state.players[state.currentTurnIndex].isSafe) {
        state.currentTurnIndex = (state.currentTurnIndex + 1) % state.numPlayers;
    }

    // Reset round
    state.centerPile = [];
    state.roundSuit = null;
    state.highestCardInRound = null;
    state.winnerOfTrick = null;
    state.isCut = false;

    renderGame();

    if (!state.gameOver) {
        const currentPlayer = state.players[state.currentTurnIndex];
        const turnMessage = currentPlayer.id === 'player-0' ? 'Your Turn' : `${currentPlayer.name}'s turn`;
        updateStatus(turnMessage);
        if (currentPlayer.isBot) {
            if (state.fastMode) {
                playBotTurn();
            } else {
                setTimeout(playBotTurn, 1500); // Increased delay
            }
        }
    }
}

document.getElementById('continue-btn').addEventListener('click', () => {
    document.getElementById('continue-btn').classList.add('hidden');
    executeTrickResolution();
});

function advanceTurn() {
    do {
        state.currentTurnIndex = (state.currentTurnIndex + 1) % state.numPlayers;
    } while (state.players[state.currentTurnIndex].isSafe);

    updateActivePlayer();
    const currentPlayer = state.players[state.currentTurnIndex];
    const turnMessage = currentPlayer.id === 'player-0' ? 'Your Turn' : `${currentPlayer.name}'s turn`;
    updateStatus(turnMessage);

    if (currentPlayer.isBot) {
        if (state.fastMode) {
            playBotTurn();
        } else {
            setTimeout(playBotTurn, 1500); // Increased delay
        }
    }
}

function checkGameOver() {
    const activePlayers = state.players.filter(p => !p.isSafe);
    if (activePlayers.length === 1) {
        state.gameOver = true;
        state.donkey = activePlayers[0];

        setTimeout(() => {
            document.getElementById('game-screen').classList.add('hidden');
            const goScreen = document.getElementById('game-over-screen');
            goScreen.classList.remove('hidden');

            const goMessage = document.getElementById('game-over-message');
            if (state.donkey.isBot) {
                goMessage.textContent = `${state.donkey.name} is the Donkey! You survived.`;
                playSound('win');
            } else {
                goMessage.textContent = `You are the Donkey!`;
                playSound('error'); // Maybe another sound for losing
            }
        }, 1500);
    }
}

// UI Rendering
function renderGame() {
    renderOpponents();
    renderPlayerHand();
    renderCenterPile();
    renderDiscardPile();
    updateActivePlayer();
}

function renderDiscardPile() {
    const discardArea = document.getElementById('discard-area');
    const pileStock = document.getElementById('pile-stock');
    discardArea.innerHTML = '';

    // Pile stock summary
    if (state.showPileStock && state.discardPile.length > 0) {
        pileStock.classList.remove('hidden');

        let counts = { 'Spades': 0, 'Hearts': 0, 'Diamonds': 0, 'Clubs': 0 };
        for (let c of state.discardPile) {
            counts[c.suit]++;
        }

        pileStock.innerHTML = `
            <div><strong>Discarded</strong></div>
            <div style="color: #aaa;">♠ Spades: ${counts['Spades']}</div>
            <div style="color: #ff6b6b;">♥ Hearts: ${counts['Hearts']}</div>
            <div style="color: #ff6b6b;">♦ Diamonds: ${counts['Diamonds']}</div>
            <div style="color: #aaa;">♣ Clubs: ${counts['Clubs']}</div>
        `;
    } else {
        pileStock.classList.add('hidden');
    }

    // To prevent DOM overload, only render top few cards if there are many
    const maxRender = 10;
    const startIndex = Math.max(0, state.discardPile.length - maxRender);

    for (let i = startIndex; i < state.discardPile.length; i++) {
        const card = state.discardPile[i];
        const cardEl = createCardElement(card);

        // Random rotation and slight offset for messy pile look
        const rotation = (Math.random() * 30) - 15;
        const offsetX = (Math.random() * 10) - 5;
        const offsetY = (Math.random() * 10) - 5;

        cardEl.style.transform = `rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px)`;
        discardArea.appendChild(cardEl);
    }
}

function createCardElement(card, isHidden = false) {
    const cardDiv = document.createElement('div');
    if (isHidden) {
        cardDiv.className = 'card-back';
    } else {
        cardDiv.className = 'card';
        // Sprite positioning
        const suitIndex = SUITS.indexOf(card.suit);
        // Ranks mapping for sprite: A, 2, 3... K
        const spriteRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const rankIndex = spriteRanks.indexOf(card.rank);

        // Sprite size scaled 1.5x: 1384x576 (13 cols, 4 rows)
        // Card width: ~106.5px, height: 144px
        const xPos = -(rankIndex * 106.5);
        const yPos = -(suitIndex * 144);

        cardDiv.style.backgroundPosition = `${xPos}px ${yPos}px`;
    }
    return cardDiv;
}

function renderOpponents() {
    const container = document.getElementById('opponents-container');
    container.innerHTML = '';

    // Render bots (players 1 to N)
    for (let i = 1; i < state.numPlayers; i++) {
        const opponent = state.players[i];

        const oppDiv = document.createElement('div');
        oppDiv.className = 'opponent';
        oppDiv.id = `opp-${opponent.id}`;
        if (opponent.isSafe) oppDiv.classList.add('safe');
        if (i === state.currentTurnIndex) oppDiv.classList.add('active');

        const nameDiv = document.createElement('div');
        nameDiv.className = 'opponent-name';
        nameDiv.textContent = opponent.name;

        if (!opponent.isSafe) {
            const countBadge = document.createElement('div');
            countBadge.className = 'opponent-card-count';
            countBadge.textContent = opponent.hand.length;
            nameDiv.appendChild(countBadge);
        } else {
            const countBadge = document.createElement('div');
            countBadge.className = 'opponent-card-count';
            countBadge.style.backgroundColor = '#2ecc71';
            countBadge.style.fontSize = '0.6rem';
            countBadge.textContent = 'Safe';
            nameDiv.appendChild(countBadge);
        }

        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'opponent-cards';

        if (!opponent.isSafe && opponent.hand.length > 0) {
            const cardBack = createCardElement(null, true);
            cardsDiv.appendChild(cardBack);
        }

        oppDiv.appendChild(nameDiv);
        oppDiv.appendChild(cardsDiv);
        container.appendChild(oppDiv);
    }
}

function renderPlayerHand() {
    const playerArea = document.getElementById('player-area');
    const playerHand = document.getElementById('player-hand');
    const playerCount = document.getElementById('player-card-count');

    const player = state.players[0]; // Human

    if (state.currentTurnIndex === 0) {
        playerArea.classList.add('active');
    } else {
        playerArea.classList.remove('active');
    }

    playerCount.textContent = player.isSafe ? 'Safe' : `${player.hand.length} cards`;

    playerHand.innerHTML = '';

    // Dynamic overlap calculation to prevent scrolling
    const containerWidth = Math.min(window.innerWidth - 40, 1000); // Approximate usable width
    const cardWidth = 106;
    const numCards = player.hand.length;

    let overlapMargin = -50; // Default overlap

    if (numCards > 1) {
        // Required width if no overlap: numCards * cardWidth
        // Available width: containerWidth
        // Total overlap needed: (numCards * cardWidth) - containerWidth
        // Overlap per card (excluding first): Total overlap / (numCards - 1)
        const totalOverlapNeeded = (numCards * cardWidth) - containerWidth;
        if (totalOverlapNeeded > 0) {
            const calculatedOverlap = -(totalOverlapNeeded / (numCards - 1));
            // Cap the overlap so cards don't completely hide each other (e.g., max overlap 85px)
            overlapMargin = Math.max(calculatedOverlap, -85);
        } else {
            // Cards fit without overlap, or just use a nice default small overlap
            overlapMargin = -20;
        }
    }

    for (let i = 0; i < player.hand.length; i++) {
        const card = player.hand[i];
        const cardEl = createCardElement(card);

        if (i > 0) {
            cardEl.style.marginLeft = `${overlapMargin}px`;
        } else {
            cardEl.style.marginLeft = '0px';
        }

        const isWaitingForContinue = !document.getElementById('continue-btn').classList.contains('hidden');
        const valid = isValidPlay(player, card);
        if ((!valid && state.currentTurnIndex === 0) || isWaitingForContinue) {
            cardEl.classList.add('disabled');
        } else if (valid && state.currentTurnIndex === 0) {
            cardEl.classList.add('playable');
            cardEl.addEventListener('click', () => {
                if (state.currentTurnIndex === 0 && !state.animationsPlaying && document.getElementById('continue-btn').classList.contains('hidden')) {
                    playCard(0, i);
                }
            });
        }

        playerHand.appendChild(cardEl);
    }
}

function renderCenterPile() {
    const pile = document.getElementById('center-pile');
    pile.innerHTML = '';

    const numCards = state.centerPile.length;
    if (numCards === 0) return;

    // Spread cards across the container width
    const containerWidth = 600; // Match CSS
    const cardWidth = 106;

    // Calculate the spacing between cards
    // If only 1 card, put it in center.
    // If multiple, spread them so they are fully visible but maybe slightly overlapped if too many.
    let spacing = cardWidth + 10; // Default spacing: slightly more than card width

    // If they would exceed container, compress them slightly
    if ((numCards * cardWidth) + ((numCards - 1) * 10) > containerWidth) {
        spacing = (containerWidth - cardWidth) / (numCards - 1);
    }

    // Calculate total width used by the spread
    const totalWidth = cardWidth + ((numCards - 1) * spacing);

    // Start drawing from this offset to center the group in the container
    const startOffsetX = (containerWidth - totalWidth) / 2;

    for (let i = 0; i < numCards; i++) {
        const item = state.centerPile[i];
        const cardEl = createCardElement(item.card);
        cardEl.className = 'card played-card';

        // Base X position
        const baseX = startOffsetX + (i * spacing);

        // Add random "thrown" messiness
        const offsetX = (Math.random() * 16) - 8;
        const offsetY = (Math.random() * 20) - 10;
        const rotation = (Math.random() * 16) - 8;

        cardEl.style.left = `${baseX + offsetX}px`;
        cardEl.style.top = `${20 + offsetY}px`; // 20px base top offset
        cardEl.style.transform = `rotate(${rotation}deg)`;
        cardEl.style.zIndex = i + 1;

        const label = document.createElement('div');
        label.className = 'played-card-label';
        const player = state.players.find(p => p.id === item.playerId);
        label.textContent = player ? player.name : '';
        cardEl.appendChild(label);

        pile.appendChild(cardEl);
    }
}

function updateActivePlayer() {
    // Update visual indicators
    const opponents = document.querySelectorAll('.opponent');
    opponents.forEach(el => el.classList.remove('active'));

    document.getElementById('player-area').classList.remove('active');

    if (state.currentTurnIndex === 0) {
        document.getElementById('player-area').classList.add('active');
        // Re-render hand to update valid plays
        renderPlayerHand();
    } else {
        const oppEl = document.getElementById(`opp-player-${state.currentTurnIndex}`);
        if (oppEl) oppEl.classList.add('active');
    }
}

function playBotTurn() {
    if (state.gameOver || state.animationsPlaying) return;

    const botIndex = state.currentTurnIndex;
    const bot = state.players[botIndex];

    if (bot.isSafe) {
        advanceTurn();
        return;
    }

    // Find valid cards
    const validCards = [];
    for (let i = 0; i < bot.hand.length; i++) {
        if (isValidPlay(bot, bot.hand[i])) {
            validCards.push({ card: bot.hand[i], index: i });
        }
    }

    if (validCards.length === 0) {
        // Should not happen, but just in case
        advanceTurn();
        return;
    }

    let chosenIndex = validCards[0].index;

    // Bot Logic
    if (!state.roundSuit) {
        // LEADING
        // Sort from lowest to highest
        validCards.sort((a, b) => getRankValue(a.card.rank) - getRankValue(b.card.rank));

        const aSpades = validCards.find(c => c.card.suit === 'Spades' && c.card.rank === 'A');
        if (aSpades && state.centerPile.length === 0 && !state.winnerOfTrick && !state.isCut) {
            // First turn of the game
            chosenIndex = aSpades.index;
        } else {
            // Smart Leading:
            // 1. Avoid suits that have been cut (voidSuits)
            // 2. Play from a suit where we have the fewest cards to create a void for ourselves
            // 3. Play the lowest card of that chosen suit

            // Count suits in hand
            const suitCounts = {};
            for (let c of bot.hand) {
                suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
            }

            // Score each valid card for leading
            let bestScore = -1000;
            let bestIndex = validCards[0].index;

            for (let vc of validCards) {
                let score = 0;

                // Penalize heavily if this suit is known to be cut (someone is void)
                if (state.voidSuits[vc.card.suit]) {
                    score -= 100;
                }

                // Reward playing suits we have fewer of (try to create a void)
                score += (13 - suitCounts[vc.card.suit]) * 5;

                // Reward playing lower cards (safer)
                score += (14 - getRankValue(vc.card.rank));

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = vc.index;
                }
            }

            chosenIndex = bestIndex;
        }
    } else {
        // FOLLOWING
        if (validCards[0].card.suit === state.roundSuit) {
            // Must follow suit
            const highestRankVal = getRankValue(state.highestCardInRound.rank);
            const lowerCards = validCards.filter(c => getRankValue(c.card.rank) < highestRankVal);

            if (lowerCards.length > 0) {
                // Safe: play the HIGHEST card that is STILL LOWER than the current highest
                lowerCards.sort((a, b) => getRankValue(b.card.rank) - getRankValue(a.card.rank));
                chosenIndex = lowerCards[0].index;
            } else {
                // Danger: we have to play higher.
                // If we are the LAST player to play this trick, and we must go over,
                // we'll take the trick anyway. We should play our HIGHEST card to get rid of it.
                // If we are NOT the last player, someone else might still go higher than us.
                // Either way, playing highest is usually best to clear large cards.
                validCards.sort((a, b) => getRankValue(b.card.rank) - getRankValue(a.card.rank));
                chosenIndex = validCards[0].index;
            }
        } else {
            // CUTTING (playing a different suit)
            // We want to get rid of our highest card overall, OR
            // get rid of a high card in a suit we have few of (to create a void).

            let bestScore = -1000;
            let bestIndex = validCards[0].index;

            const suitCounts = {};
            for (let c of bot.hand) {
                suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
            }

            for (let vc of validCards) {
                let score = 0;

                // Reward high cards
                score += getRankValue(vc.card.rank) * 10;

                // Slight reward for suits we have fewer of
                score += (13 - suitCounts[vc.card.suit]);

                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = vc.index;
                }
            }
            chosenIndex = bestIndex;
        }
    }

    playCard(botIndex, chosenIndex);
}

// Event Listeners
document.getElementById('start-btn').addEventListener('click', () => {
    playSound('click');
    initGame();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    playSound('click');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
});

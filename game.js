// Sound assets
const APP_VERSION = 'v1.4.8';
const PLAYER_STATS_KEY = 'playerCareerStats';

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
    isFirstTurnOfGame: true,
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
    playerVoidSuits: {},
    playerSuitDanger: {},
    discardPile: [], // Cards that have been cleared from tricks
    pendingContinueAction: null,
    autoAdvanceTimeoutId: null,
    autoAdvanceIntervalId: null,
    autoAdvancePaused: false,
    botTurnTimeoutId: null
};

// Card definitions
const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const BOT_STYLES = [
    { id: 'cautious', label: 'Cautious' },
    { id: 'aggressive', label: 'Aggressive' },
    { id: 'void-builder', label: 'Void Builder' },
    { id: 'opportunist', label: 'Opportunist' }
];

function createSuitTracker() {
    return {
        Hearts: false,
        Diamonds: false,
        Clubs: false,
        Spades: false
    };
}

function createSuitWeights() {
    return {
        Hearts: 0,
        Diamonds: 0,
        Clubs: 0,
        Spades: 0
    };
}

function decayPlayerSuitDanger() {
    for (const playerId of Object.keys(state.playerSuitDanger)) {
        for (const suit of SUITS) {
            state.playerSuitDanger[playerId][suit] = Math.max(0, state.playerSuitDanger[playerId][suit] - 1);
        }
    }
}

function shuffleArray(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

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

    // Load donkey scores
    let savedScores = {};
    try {
        const stored = localStorage.getItem('donkeyScores');
        if (stored) savedScores = JSON.parse(stored);
    } catch(e) {}

    const shuffledBotStyles = shuffleArray(BOT_STYLES);

    // Create bots
    for (let i = 1; i < state.numPlayers; i++) {
        const style = shuffledBotStyles[(i - 1) % shuffledBotStyles.length];
        state.players.push({
            id: `player-${i}`,
            name: `Bot ${i}`,
            hand: [],
            isBot: true,
            isSafe: false,
            order: i,
            donkeyCount: savedScores[`player-${i}`] || 0,
            style: style.id,
            styleLabel: style.label
        });
    }

    state.players[0].donkeyCount = savedScores['player-0'] || 0;

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
    state.isFirstTurnOfGame = true;
    state.gameStarted = true;
    state.gameOver = false;
    state.donkey = null;
    state.voidSuits = {
        'Hearts': false,
        'Diamonds': false,
        'Clubs': false,
        'Spades': false
    };
    state.playerVoidSuits = {};
    state.playerSuitDanger = {};
    state.players.forEach(player => {
        state.playerVoidSuits[player.id] = createSuitTracker();
        state.playerSuitDanger[player.id] = createSuitWeights();
    });
    state.discardPile = [];
    state.pendingContinueAction = null;
    clearAutoAdvanceTimers();
    clearBotTurnTimeout();
    state.autoAdvancePaused = false;
    state.players.forEach(player => {
        player.finishPosition = null;
        player.safeOrder = null;
    });

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('continue-btn').classList.add('hidden');

    renderGame();
    updateStatus(`${state.players[state.currentTurnIndex].name} leads first with A♠`);

    if (state.players[state.currentTurnIndex].isBot) {
        scheduleBotTurn();
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

function loadPlayerStats() {
    const defaults = {
        gamesPlayed: 0,
        timesDonkey: 0,
        survivedGames: 0,
        totalFinish: 0,
        longestSurvivalStreak: 0,
        currentSurvivalStreak: 0
    };

    try {
        const raw = localStorage.getItem(PLAYER_STATS_KEY);
        if (!raw) return defaults;
        return { ...defaults, ...JSON.parse(raw) };
    } catch (e) {
        return defaults;
    }
}

function savePlayerStats(stats) {
    try {
        localStorage.setItem(PLAYER_STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
}

function renderStatsInto(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const stats = loadPlayerStats();
    const survivalRate = stats.gamesPlayed > 0 ? Math.round((stats.survivedGames / stats.gamesPlayed) * 100) : 0;
    const averageFinish = stats.gamesPlayed > 0 ? (stats.totalFinish / stats.gamesPlayed).toFixed(2) : '0.00';

    const items = [
        ['Games', stats.gamesPlayed],
        ['Donkey', stats.timesDonkey],
        ['Survival', `${survivalRate}%`],
        ['Avg Finish', averageFinish],
        ['Best Streak', stats.longestSurvivalStreak]
    ];

    el.innerHTML = '';
    for (let [label, value] of items) {
        const card = document.createElement('div');
        card.className = 'stat-card';

        const valueEl = document.createElement('strong');
        valueEl.textContent = `${value}`;

        const labelEl = document.createElement('span');
        labelEl.textContent = label;

        card.appendChild(valueEl);
        card.appendChild(labelEl);
        el.appendChild(card);
    }
}

function renderStatsPanels() {
    renderStatsInto('setup-stats');
    renderStatsInto('game-over-stats');
}

function updatePlayerCareerStats() {
    const you = state.players[0];
    if (!you || !you.finishPosition) return;

    const stats = loadPlayerStats();
    stats.gamesPlayed += 1;
    stats.totalFinish += you.finishPosition;

    if (state.donkey?.id === 'player-0') {
        stats.timesDonkey += 1;
        stats.currentSurvivalStreak = 0;
    } else {
        stats.survivedGames += 1;
        stats.currentSurvivalStreak += 1;
        stats.longestSurvivalStreak = Math.max(stats.longestSurvivalStreak, stats.currentSurvivalStreak);
    }

    savePlayerStats(stats);
    renderStatsPanels();
}

function showSafeCelebration(playerName) {
    const overlay = document.getElementById('safe-celebration');
    const nameEl = overlay.querySelector('.safe-celebration-name');
    nameEl.textContent = playerName;
    overlay.classList.remove('show', 'hidden');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    setTimeout(() => {
        overlay.classList.remove('show');
        overlay.classList.add('hidden');
    }, 1450);
}

function setDonkeyLossAnimation(visible) {
    const lossEl = document.getElementById('donkey-loss-animation');
    lossEl.classList.toggle('hidden', !visible);
    lossEl.classList.remove('show');
    if (visible) {
        void lossEl.offsetWidth;
        lossEl.classList.add('show');
    }
}

function clearAutoAdvanceTimers() {
    if (state.autoAdvanceTimeoutId) {
        clearTimeout(state.autoAdvanceTimeoutId);
        state.autoAdvanceTimeoutId = null;
    }
    if (state.autoAdvanceIntervalId) {
        clearInterval(state.autoAdvanceIntervalId);
        state.autoAdvanceIntervalId = null;
    }
}

function clearBotTurnTimeout() {
    if (state.botTurnTimeoutId) {
        clearTimeout(state.botTurnTimeoutId);
        state.botTurnTimeoutId = null;
    }
}

function scheduleBotTurn(delay = 1500) {
    clearBotTurnTimeout();
    if (state.gameOver || state.pendingContinueAction) {
        return;
    }
    state.botTurnTimeoutId = setTimeout(() => {
        state.botTurnTimeoutId = null;
        playBotTurn();
    }, state.fastMode ? 0 : delay);
}

function executePendingContinueAction() {
    clearAutoAdvanceTimers();
    hideContinueButton();
    if (typeof state.pendingContinueAction === 'function') {
        const action = state.pendingContinueAction;
        state.pendingContinueAction = null;
        state.autoAdvancePaused = false;
        action();
    }
}

function startAutoAdvancePause(seconds = 3) {
    clearAutoAdvanceTimers();
    state.autoAdvancePaused = false;

    let remainingSeconds = seconds;
    showContinueButton(`Pause (${remainingSeconds})`);

    state.autoAdvanceIntervalId = setInterval(() => {
        remainingSeconds -= 1;
        if (remainingSeconds > 0) {
            showContinueButton(`Pause (${remainingSeconds})`);
        }
    }, 1000);

    state.autoAdvanceTimeoutId = setTimeout(() => {
        executePendingContinueAction();
    }, seconds * 1000);
}

// Game Logic
function isValidPlay(player, card) {
    // First turn of the game must be Ace of Spades
    if (state.centerPile.length === 0 && !state.roundSuit && state.isFirstTurnOfGame) {
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

    // A player can only contribute one card to the current trick.
    if (state.centerPile.some(item => item.playerId === player.id)) {
        return;
    }

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
        state.isFirstTurnOfGame = false;
    } else {
        // Check if cut
        if (card.suit !== state.roundSuit) {
            state.isCut = true;
            // Mark the led suit as voided (someone doesn't have it)
            state.voidSuits[state.roundSuit] = true;
            if (state.playerVoidSuits[player.id]) {
                state.playerVoidSuits[player.id][state.roundSuit] = true;
            }
            if (state.playerSuitDanger[player.id]) {
                state.playerSuitDanger[player.id][state.roundSuit] = Math.min(6, state.playerSuitDanger[player.id][state.roundSuit] + 2);
            }
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

    if (state.gameOver) return;

    queueContinueAfterPlay(player);
}

function queueContinueAfterPlay(player) {
    state.animationsPlaying = false;
    const playedCard = cardLabelFromPile();

    const activePlayersCount = state.players.filter(p => !p.isSafe).length;
    const trickFinished = state.isCut || state.centerPile.length === activePlayersCount;

    if (trickFinished) {
        prepareTrickResolution();
        return;
    }

    const nextPlayerIndex = findNextActivePlayerIndex(player.id);
    const nextPlayer = state.players[nextPlayerIndex];
    updateStatus(`${player.name} played ${formatCard(playedCard)}. ${nextPlayer.id === 'player-0' ? 'Your turn.' : `${nextPlayer.name} to play.`}`);
    advanceTurn();
}

function prepareTrickResolution() {
    clearBotTurnTimeout();

    // Determine winner/taker
    if (state.isCut) {
        const takerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        updateStatus(`${state.players[takerIndex].name} takes the pile and leads next.`);
    } else {
        const winnerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        updateStatus(`${state.players[winnerIndex].name} leads the next round.`);
    }

    state.pendingContinueAction = () => {
        executeTrickResolution();
    };

    const humanPlayer = state.players.find(player => player.id === 'player-0');
    if (humanPlayer?.isSafe) {
        executePendingContinueAction();
        return;
    }

    // Show continue button to pause before clearing the table
    startAutoAdvancePause(3);
}

function executeTrickResolution() {
    if (state.isCut) {
        // Trick taken by winnerOfTrick
        const takerIndex = state.players.findIndex(p => p.id === state.winnerOfTrick);
        const taker = state.players[takerIndex];
        const suitsInPile = new Set(state.centerPile.map(item => item.card.suit));

        // Add all cards to taker's hand
        for (let item of state.centerPile) {
            taker.hand.push(item.card);
        }
        sortHand(taker.hand);

        if (state.playerVoidSuits[taker.id]) {
            for (const suit of suitsInPile) {
                state.playerVoidSuits[taker.id][suit] = false;
            }
        }
        if (state.playerSuitDanger[taker.id]) {
            for (const suit of suitsInPile) {
                state.playerSuitDanger[taker.id][suit] = Math.max(0, state.playerSuitDanger[taker.id][suit] - 2);
            }
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

    // Check if any active player is safe now (after taking or clearing tricks)
    state.players.forEach(player => {
        if (player.hand.length === 0 && !player.isSafe) {
            player.isSafe = true;
            player.safeOrder = state.players.filter(p => p.isSafe).length;
            playSound('win');
            updateStatus(`${player.name} is safe!`);
            showSafeCelebration(player.name);
            checkGameOver();
        }
    });

    if (state.gameOver) return;

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
    decayPlayerSuitDanger();

    renderGame();

    if (!state.gameOver) {
        const currentPlayer = state.players[state.currentTurnIndex];
        const turnMessage = currentPlayer.id === 'player-0' ? 'Your Turn' : `${currentPlayer.name}'s turn`;
        updateStatus(turnMessage);
        if (currentPlayer.isBot) {
            scheduleBotTurn();
        }
    }
}

document.getElementById('borrow-btn').addEventListener('click', () => {
    if (state.gameOver || state.animationsPlaying || state.currentTurnIndex !== 0) return;

    const humanPlayer = state.players[0];
    if (humanPlayer.isSafe) return;

    // Must be at the start of a trick (or allowed anytime on turn, but usually before playing)
    // Actually, user said "we can get their cards also and play with that cards".
    // We'll allow it anytime it's their turn and they haven't played yet.
    // If it's their turn, by definition they haven't played yet in this trick.

    const nextIndex = findNextActivePlayerIndex(humanPlayer.id);
    const nextPlayer = state.players[nextIndex];

    if (!nextPlayer || nextPlayer.isSafe || nextPlayer.hand.length === 0) return;

    // Transfer cards
    playSound('draw');
    humanPlayer.hand.push(...nextPlayer.hand);
    nextPlayer.hand = [];

    // Re-sort human hand
    sortHand(humanPlayer.hand);

    // Make next player safe immediately
    nextPlayer.isSafe = true;
    nextPlayer.safeOrder = state.players.filter(p => p.isSafe).length;
    playSound('win');
    updateStatus(`You borrowed all cards from ${nextPlayer.name}! ${nextPlayer.name} is safe!`);
    showSafeCelebration(nextPlayer.name);

    // Hide borrow button
    document.getElementById('borrow-btn').classList.add('hidden');

    checkGameOver();
    renderGame();
});

document.getElementById('continue-btn').addEventListener('click', () => {
    if (typeof state.pendingContinueAction !== 'function') {
        return;
    }

    if (!state.autoAdvancePaused) {
        clearAutoAdvanceTimers();
        state.autoAdvancePaused = true;
        showContinueButton('Continue');
        return;
    }

    executePendingContinueAction();
});

function advanceTurn() {
    state.currentTurnIndex = findNextActivePlayerIndex(state.players[state.currentTurnIndex].id);

    updateActivePlayer();
    const currentPlayer = state.players[state.currentTurnIndex];
    const turnMessage = currentPlayer.id === 'player-0' ? 'Your Turn' : `${currentPlayer.name}'s turn`;
    updateStatus(turnMessage);

    if (currentPlayer.isBot) {
        scheduleBotTurn();
    }
}

function findNextActivePlayerIndex(currentPlayerId) {
    let nextIndex = state.players.findIndex(player => player.id === currentPlayerId);

    do {
        nextIndex = (nextIndex + 1) % state.numPlayers;
    } while (state.players[nextIndex].isSafe);

    return nextIndex;
}

function showContinueButton(label = 'Continue') {
    const continueBtn = document.getElementById('continue-btn');
    continueBtn.textContent = label;
    continueBtn.classList.remove('hidden');
    document.getElementById('center-pile').classList.add('resolution-pending');
}

function hideContinueButton() {
    document.getElementById('continue-btn').classList.add('hidden');
    document.getElementById('center-pile').classList.remove('resolution-pending');
}

function cardLabelFromPile() {
    if (state.centerPile.length === 0) return null;
    return state.centerPile[state.centerPile.length - 1].card;
}

function formatCard(card) {
    if (!card) return 'a card';
    const suitSymbols = {
        Hearts: '♥',
        Diamonds: '♦',
        Clubs: '♣',
        Spades: '♠'
    };
    return `${card.rank}${suitSymbols[card.suit] || ''}`;
}

function getRemainingSuitCounts() {
    const counts = {
        Hearts: 13,
        Diamonds: 13,
        Clubs: 13,
        Spades: 13
    };

    for (let card of state.discardPile) {
        counts[card.suit]--;
    }

    for (let item of state.centerPile) {
        counts[item.card.suit]--;
    }

    for (let player of state.players) {
        for (let card of player.hand) {
            counts[card.suit]--;
        }
    }

    return counts;
}

function getSuitCounts(hand) {
    const counts = {
        Hearts: 0,
        Diamonds: 0,
        Clubs: 0,
        Spades: 0
    };
    for (let card of hand) {
        counts[card.suit]++;
    }
    return counts;
}

function getActivePlayersCount() {
    return state.players.filter(p => !p.isSafe).length;
}

function getBotStyleProfile(bot) {
    switch (bot.style) {
        case 'aggressive':
            return {
                dangerPenalty: 4,
                dumpHighBonus: 12,
                voidBonus: 6,
                trapLeadBonus: 10,
                preserveControlPenalty: 2
            };
        case 'void-builder':
            return {
                dangerPenalty: 8,
                dumpHighBonus: 8,
                voidBonus: 15,
                trapLeadBonus: 4,
                preserveControlPenalty: 6
            };
        case 'opportunist':
            return {
                dangerPenalty: 7,
                dumpHighBonus: 10,
                voidBonus: 8,
                trapLeadBonus: 14,
                preserveControlPenalty: 3
            };
        case 'cautious':
        default:
            return {
                dangerPenalty: 12,
                dumpHighBonus: 5,
                voidBonus: 9,
                trapLeadBonus: 3,
                preserveControlPenalty: 10
            };
    }
}

function hasPlayerAlreadyPlayed(playerId) {
    return state.centerPile.some(item => item.playerId === playerId);
}

function getPlayersRemainingToAct() {
    const activePlayers = getActivePlayersCount();
    return Math.max(0, activePlayers - state.centerPile.length - 1);
}

function getKnownVoidPlayersForSuit(suit) {
    let count = 0;
    for (const player of state.players) {
        if (!player.isSafe && state.playerVoidSuits[player.id]?.[suit]) {
            count += 1;
        }
    }
    return count;
}

function getSuitDangerForPlayer(playerId, suit) {
    return state.playerSuitDanger[playerId]?.[suit] || 0;
}

function getActiveTurnOrderFromPlayer(playerId) {
    const startIndex = state.players.findIndex(player => player.id === playerId);
    const order = [];

    for (let step = 1; step < state.players.length; step++) {
        const nextIndex = (startIndex + step) % state.players.length;
        const player = state.players[nextIndex];
        if (!player.isSafe) {
            order.push(player);
        }
    }

    return order;
}

function chooseSimulatedFollowCard(suitedCards, currentHighRank, playersLeftAfter) {
    const sortedByRank = [...suitedCards].sort((a, b) => getRankValue(a.rank) - getRankValue(b.rank));
    const losingCards = sortedByRank.filter(card => getRankValue(card.rank) <= currentHighRank);

    if (losingCards.length > 0) {
        return playersLeftAfter > 0 ? losingCards[losingCards.length - 1] : losingCards[0];
    }

    return playersLeftAfter > 0 ? sortedByRank[0] : sortedByRank[sortedByRank.length - 1];
}

function simulateLeadOutcome(bot, leadCard, context) {
    const turnOrder = getActiveTurnOrderFromPlayer(bot.id);
    let highestRank = getRankValue(leadCard.rank);
    let currentWinnerId = bot.id;
    let cardsInTrick = 1;
    let cutPlayer = null;

    for (let i = 0; i < turnOrder.length; i++) {
        const player = turnOrder[i];
        const suitedCards = player.hand.filter(card => card.suit === leadCard.suit);
        const playersLeftAfter = turnOrder.length - i - 1;

        if (suitedCards.length === 0) {
            cutPlayer = player;
            cardsInTrick += 1;
            break;
        }

        const simulatedCard = chooseSimulatedFollowCard(suitedCards, highestRank, playersLeftAfter);
        const simulatedRank = getRankValue(simulatedCard.rank);
        cardsInTrick += 1;

        if (simulatedRank > highestRank) {
            highestRank = simulatedRank;
            currentWinnerId = player.id;
        }
    }

    let score = 0;

    if (cutPlayer) {
        if (currentWinnerId === bot.id) {
            score -= cardsInTrick * 18;
            score -= Math.min(28, Math.max(0, bot.hand.length - cutPlayer.hand.length) * 4);
        } else {
            score += 14;
        }

        if (cutPlayer.id === context.nextPlayer?.id) {
            score -= 30;
        }

        if (cutPlayer.hand.length <= 3) {
            score += 10;
        } else if (cutPlayer.hand.length >= bot.hand.length - 1) {
            score -= 14;
        }
    } else if (currentWinnerId === bot.id) {
        score -= 12 + (turnOrder.length * 4);
    } else {
        score += 8;
    }

    return score;
}

function scoreLeadCard(bot, candidate, context) {
    const profile = context.profile;
    const suitCount = context.suitCounts[candidate.card.suit];
    const remainingInSuit = Math.max(0, context.remainingSuitCounts[candidate.card.suit]);
    const rankValue = getRankValue(candidate.card.rank);
    const nextPlayer = context.nextPlayer;
    const nextPlayerKnownVoid = Boolean(nextPlayer && state.playerVoidSuits[nextPlayer.id]?.[candidate.card.suit]);
    const knownVoidCount = getKnownVoidPlayersForSuit(candidate.card.suit);
    const nextPlayerSuitDanger = nextPlayer ? getSuitDangerForPlayer(nextPlayer.id, candidate.card.suit) : 0;
    let score = 0;

    score += (13 - suitCount) * profile.voidBonus;
    score += (12 - rankValue) * 3;
    score += remainingInSuit <= 3 ? profile.trapLeadBonus : 0;

    if (state.voidSuits[candidate.card.suit]) {
        score -= 200;
    }

    if (knownVoidCount > 0) {
        score -= knownVoidCount * 18;
    }

    if (state.voidSuits[candidate.card.suit] && context.activePlayers > 2 && nextPlayer && nextPlayer.hand.length > 3) {
        score -= 18;
    }

    if (nextPlayerSuitDanger > 0) {
        score -= nextPlayerSuitDanger * 16;
    }

    if (nextPlayerKnownVoid) {
        let avoidSuitPenalty = 44;

        if (nextPlayer.hand.length >= 5) {
            avoidSuitPenalty += 14;
        }

        if (Math.abs(bot.hand.length - nextPlayer.hand.length) <= 2 && bot.hand.length >= 5) {
            avoidSuitPenalty += 16;
        }

        if (context.activePlayers <= 2) {
            avoidSuitPenalty -= 26;
        } else if (nextPlayer.hand.length <= 3) {
            avoidSuitPenalty -= 18;
        }

        score -= avoidSuitPenalty;
    }

    if (rankValue >= getRankValue('Q')) {
        score -= profile.preserveControlPenalty * 2;
    }

    if (candidate.card.suit === 'Spades' && rankValue >= getRankValue('K')) {
        score -= 10;
    }

    if (knownVoidCount > 0 && bot.hand.length >= 5 && suitCount > 1 && nextPlayer && nextPlayer.hand.length >= bot.hand.length - 1) {
        score -= 18;
    }

    if (nextPlayerSuitDanger >= 3 && context.activePlayers > 2 && nextPlayer && nextPlayer.hand.length >= 4) {
        score -= 18;
    }

    score += simulateLeadOutcome(bot, candidate.card, context);

    return score;
}

function scoreFollowSuitCard(bot, candidate, context) {
    const profile = context.profile;
    const rankValue = getRankValue(candidate.card.rank);
    const currentHigh = getRankValue(state.highestCardInRound.rank);
    const playersLeft = context.playersLeft;
    const winning = rankValue > currentHigh;
    let score = 0;

    if (!winning) {
        score += 28;
        score += rankValue * 2;
        score -= playersLeft > 0 ? rankValue : 0;
    } else {
        score -= profile.dangerPenalty * (playersLeft + 1);
        score += playersLeft === 0 ? profile.dumpHighBonus * 1.5 : 0;
        score += rankValue * (playersLeft === 0 ? 2 : 0.5);
    }

    if (playersLeft === 0 && winning) {
        score += 20;
    }

    if (playersLeft > 0 && rankValue >= getRankValue('Q')) {
        score -= profile.preserveControlPenalty * 2;
    }

    return score;
}

function scoreCutCard(bot, candidate, context) {
    const profile = context.profile;
    const rankValue = getRankValue(candidate.card.rank);
    const suitCount = context.suitCounts[candidate.card.suit];
    const remainingInSuit = Math.max(0, context.remainingSuitCounts[candidate.card.suit]);
    let score = 0;

    score += rankValue * profile.dumpHighBonus;
    score += (13 - suitCount) * profile.voidBonus;
    score += remainingInSuit <= 3 ? 10 : 0;

    if (candidate.card.suit === 'Spades' && rankValue >= getRankValue('Q')) {
        score += 8;
    }

    if (rankValue <= getRankValue('5') && suitCount > 2) {
        score -= 10;
    }

    return score;
}

function chooseBotCardIndex(bot, validCards) {
    const nextPlayerIndex = findNextActivePlayerIndex(bot.id);
    const context = {
        suitCounts: getSuitCounts(bot.hand),
        remainingSuitCounts: getRemainingSuitCounts(),
        profile: getBotStyleProfile(bot),
        playersLeft: getPlayersRemainingToAct(),
        activePlayers: getActivePlayersCount(),
        nextPlayer: state.players[nextPlayerIndex]
    };

    let bestIndex = validCards[0].index;
    let bestScore = -Infinity;

    for (let candidate of validCards) {
        let score;

        if (!state.roundSuit) {
            score = scoreLeadCard(bot, candidate, context);
        } else if (candidate.card.suit === state.roundSuit) {
            score = scoreFollowSuitCard(bot, candidate, context);
        } else {
            score = scoreCutCard(bot, candidate, context);
        }

        score += (Math.random() * 4) - 2;

        if (score > bestScore) {
            bestScore = score;
            bestIndex = candidate.index;
        }
    }

    return bestIndex;
}

function checkGameOver() {
    if (state.gameOver) return;
    const activePlayers = state.players.filter(p => !p.isSafe);
    if (activePlayers.length <= 1) {
        state.gameOver = true;

        // If length is 0, the last two or more players became safe on the exact same trick.
        // We'll consider the one who played last (or has the highest order) as the donkey,
        // or just let the last person who became safe be the donkey.
        // But traditionally, if it clears, the person who had the highest card might be the donkey.
        // Let's just assign donkey to the last person who became safe (highest safeOrder).

        const safePlayers = state.players
            .filter(p => p.isSafe)
            .sort((a, b) => (a.safeOrder ?? Number.MAX_SAFE_INTEGER) - (b.safeOrder ?? Number.MAX_SAFE_INTEGER));

        if (activePlayers.length === 1) {
            state.donkey = activePlayers[0];
            state.donkey.finishPosition = state.players.length;
        } else {
            // Everyone is safe. The last person to become safe is the donkey.
            state.donkey = safePlayers[safePlayers.length - 1];
            // Remove them from safePlayers list for finish position assignment
            safePlayers.pop();
            state.donkey.finishPosition = state.players.length;
            // Un-safe them so UI knows they are the donkey
            state.donkey.isSafe = false;
        }

        safePlayers.forEach((player, index) => {
            player.finishPosition = index + 1;
        });

        // Update score
        state.donkey.donkeyCount++;
        let savedScores = {};
        try {
            const stored = localStorage.getItem('donkeyScores');
            if (stored) savedScores = JSON.parse(stored);
            savedScores[state.donkey.id] = state.donkey.donkeyCount;
            localStorage.setItem('donkeyScores', JSON.stringify(savedScores));
        } catch(e) {}

        setTimeout(() => {
            document.getElementById('game-screen').classList.add('hidden');
            const goScreen = document.getElementById('game-over-screen');
            goScreen.classList.remove('hidden');

            const goMessage = document.getElementById('game-over-message');
            renderFinalStandings();
            updatePlayerCareerStats();
            if (state.donkey.isBot) {
                goMessage.textContent = `${state.donkey.name} is the Donkey! You survived.`;
                setDonkeyLossAnimation(false);
                playSound('win');
            } else {
                goMessage.textContent = `You are the Donkey!`;
                setDonkeyLossAnimation(true);
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

        // Add Donkey Score
        const donkeyScore = document.createElement('div');
        donkeyScore.style.fontSize = '0.7rem';
        donkeyScore.style.color = '#ffd700';
        donkeyScore.textContent = `Donkey: ${opponent.donkeyCount}`;
        nameDiv.appendChild(donkeyScore);

        if (opponent.styleLabel) {
            const styleLabel = document.createElement('div');
            styleLabel.style.fontSize = '0.62rem';
            styleLabel.style.color = 'rgba(255,255,255,0.72)';
            styleLabel.textContent = opponent.styleLabel;
            nameDiv.appendChild(styleLabel);
        }

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
    const playerName = document.getElementById('player-name');

    const player = state.players[0]; // Human

    playerName.innerHTML = `You <span style="font-size: 0.8rem; color: #ffd700; margin-left: 10px;">(Donkey: ${player.donkeyCount})</span>`;

    if (state.currentTurnIndex === 0) {
        playerArea.classList.add('active');
    } else {
        playerArea.classList.remove('active');
    }

    playerCount.textContent = player.isSafe ? 'Safe' : `${player.hand.length} cards`;

    playerHand.innerHTML = '';

    // Dynamic overlap calculation to prevent scrolling
    const measuredWidth = playerHand.clientWidth || (window.innerWidth - 40);
    const containerWidth = Math.max(220, Math.min(measuredWidth, 1100));
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
            // Keep at least a slim visible slice so even very large hands still fit.
            overlapMargin = Math.max(calculatedOverlap, -94);
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

    for (let i = 0; i < numCards; i++) {
        const item = state.centerPile[i];
        const cardEl = createCardElement(item.card);
        cardEl.className = 'card played-card';

        const scatterSeed = `${item.playerId}-${item.card.suit}-${item.card.rank}-${i}`;
        const tilt = seededScatter(`${scatterSeed}-r`, 1.2);

        cardEl.style.zIndex = i + 1;
        cardEl.style.setProperty('--card-tilt', `${tilt}deg`);

        const label = document.createElement('div');
        label.className = 'played-card-label';
        const player = state.players.find(p => p.id === item.playerId);
        label.textContent = player ? player.name : '';
        cardEl.appendChild(label);

        pile.appendChild(cardEl);
    }
}

function getFinalStandings() {
    const safePlayers = state.players
        .filter(player => player.isSafe)
        .sort((a, b) => {
            const orderA = a.safeOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.safeOrder ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.order - b.order;
        });

    if (!state.donkey) {
        return safePlayers;
    }

    return [...safePlayers, state.donkey];
}

function renderFinalStandings() {
    const standingsEl = document.getElementById('final-standings');
    if (!standingsEl) return;

    const standings = getFinalStandings();
    standingsEl.innerHTML = '';

    standings.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = 'final-standing-row';
        if (player.id === 'player-0') row.classList.add('you');
        if (player.id === state.donkey?.id) row.classList.add('donkey');
        if (index === 0) row.classList.add('winner');

        const position = document.createElement('span');
        position.className = 'final-standing-position';
        position.textContent = `#${index + 1}`;

        const name = document.createElement('span');
        name.className = 'final-standing-name';
        name.textContent = player.id === 'player-0' ? 'You' : player.name;

        const result = document.createElement('span');
        result.className = 'final-standing-result';
        if (player.id === state.donkey?.id) {
            result.textContent = 'Donkey';
        } else {
            result.textContent = 'Safe';
        }

        row.appendChild(position);
        row.appendChild(name);
        row.appendChild(result);
        standingsEl.appendChild(row);
    });
}

function seededScatter(seed, amplitude) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    const normalized = ((hash >>> 0) % 1000) / 999;
    return (normalized * 2 * amplitude) - amplitude;
}

function updateActivePlayer() {
    // Update visual indicators
    const opponents = document.querySelectorAll('.opponent');
    opponents.forEach(el => el.classList.remove('active'));

    document.getElementById('player-area').classList.remove('active');

    const borrowBtn = document.getElementById('borrow-btn');
    if (state.currentTurnIndex === 0 && !state.players[0].isSafe) {
        document.getElementById('player-area').classList.add('active');
        // Check if there is an eligible next player to borrow from
        const nextIndex = findNextActivePlayerIndex(state.players[0].id);
        const nextPlayer = state.players[nextIndex];
        if (nextPlayer && !nextPlayer.isSafe && nextPlayer.hand.length > 0) {
            if (borrowBtn) borrowBtn.classList.remove('hidden');
        } else {
            if (borrowBtn) borrowBtn.classList.add('hidden');
        }
        // Re-render hand to update valid plays
        renderPlayerHand();
    } else {
        if (borrowBtn) borrowBtn.classList.add('hidden');
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

    if (hasPlayerAlreadyPlayed(bot.id)) {
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

    let chosenIndex = chooseBotCardIndex(bot, validCards);
    playCard(botIndex, chosenIndex);
}

// Event Listeners
// PWA logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    const installBtn = document.getElementById('install-btn');
    installBtn.classList.remove('hidden');

    installBtn.addEventListener('click', async () => {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installBtn.classList.add('hidden');
        }
        deferredPrompt = null;
    });
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            console.log('SW registered: ', registration);
        }).catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
        });
    });
}

document.getElementById('start-btn').addEventListener('click', () => {
    playSound('click');
    initGame();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    playSound('click');
    document.getElementById('game-over-screen').classList.add('hidden');
    setDonkeyLossAnimation(false);
    initGame();
});

document.getElementById('app-version').textContent = APP_VERSION;
renderStatsPanels();

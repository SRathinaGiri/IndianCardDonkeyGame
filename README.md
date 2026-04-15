# Indian Card Game Donkey (Bhabhi)

A browser-based implementation of the Indian card game **Donkey**, also known as **Bhabhi**. The game is built with plain HTML, CSS, and JavaScript, supports human vs bot play, and can be installed as a Progressive Web App (PWA).

## Overview

The goal is simple: **get rid of all your cards**. The last player left holding cards becomes the **Donkey**.

This project includes:
- 2 to 6 player support
- 1 human player and AI-controlled bots
- A full 52-card deck with no jokers
- Trick resolution and cut/thulla handling
- Persistent donkey counts using `localStorage`
- Optional fast mode
- Optional discard stock summary
- PWA install support with offline caching

## Game Rules

- The game uses a standard 52-card deck.
- The player holding **Ace of Spades (A♠)** starts the first round and must play it.
- The first card played in a round sets the **led suit**.
- Players must follow the led suit if they have a card of that suit.
- If all active players follow suit, the **highest card of the led suit** wins the trick.
- The winning player starts the next round.
- If a player cannot follow suit, they may play any other suit. This is a **cut** or **thulla**.
- When a cut happens, the round ends immediately.
- The player currently holding the highest card of the led suit takes the full center pile back into their hand.
- A player with no cards left becomes **safe** and is out of play.
- The last remaining player with cards is the **Donkey**.

## Current Gameplay Flow

- Players continue normally through each throw within a round.
- The game pauses with a **Continue** button only when a trick is complete or when a cut ends the round.
- That pause happens just before the table is cleared or the center pile is added back to a player's hand.
- Played cards are shown in a tighter horizontal spread in the center area so the round is easier to read.

## Getting Started

### Run locally

Because the project uses a service worker, it should be served over a local web server instead of opening `index.html` directly in the browser.

If you have Python installed:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Install dependencies

The project currently includes `puppeteer` in `package.json` for local testing or automation work.

```bash
npm install
```

## Project Structure

```text
.
├── index.html        # App shell and game screens
├── style.css         # Layout, cards, responsive styling
├── game.js           # Game state, rules, bot logic, rendering
├── sw.js             # Service worker for offline/PWA caching
├── manifest.json     # PWA manifest
├── cards.png         # Card sprite sheet
├── card-back.png     # Card back asset
├── *.mp3             # Sound effects
└── package.json      # Project metadata
```

## Features

- Plain JavaScript implementation with no framework dependency
- Responsive landscape-oriented card table layout
- Bot turn logic for leading, following, and cutting
- Donkey score tracking across sessions
- Installable PWA behavior
- Sound effects for shuffle, draw, discard, meld, error, click, and win

## Notes

- Mobile play is designed for **landscape mode**.
- Game data such as donkey counts is stored in the browser via `localStorage`.
- Cached assets are managed by the service worker, so after updates you may need a hard refresh if an older version is still open.

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

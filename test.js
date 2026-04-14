const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('PAGE ERROR:', msg.text());
        } else {
            console.log('PAGE LOG:', msg.text());
        }
    });

    page.on('pageerror', error => {
        console.error('PAGE UNCAUGHT EXCEPTION:', error.message);
    });

    try {
        console.log('Navigating to http://localhost:8000/index.html');
        await page.goto('http://localhost:8000/index.html', { waitUntil: 'networkidle0' });

        console.log('Checking setup screen...');
        const setupScreenVisible = await page.$eval('#setup-screen', el => !el.classList.contains('hidden'));
        console.log('Setup screen visible:', setupScreenVisible);

        if (setupScreenVisible) {
            console.log('Clicking start button...');
            await page.click('#start-btn');

            // Wait for game screen to become visible
            await page.waitForFunction(() => !document.querySelector('#game-screen').classList.contains('hidden'));
            console.log('Game started successfully!');

            // Give it some time to run the first bot turns
            await new Promise(r => setTimeout(r, 5000));

            // Check status message
            const statusMessage = await page.$eval('#status-message', el => el.textContent);
            console.log('Current status:', statusMessage);

            // Check if player has cards
            const playerCards = await page.$$eval('#player-hand .card', els => els.length);
            console.log('Player has', playerCards, 'cards in hand');
        } else {
            console.error('Setup screen was not visible on load.');
        }

    } catch (e) {
        console.error('Test failed:', e);
    } finally {
        await browser.close();
        console.log('Test finished.');
        process.exit(0);
    }
})();

const store = require('../services/marketStore');
const { fetchTop200Stocks } = require('../services/stockService');

async function debug() {
    try {
        await fetchTop200Stocks();
        console.log('Stocks in store:', store.stocks.length);
        console.log('NFO Scrips:', store.nfoMasterData.length);
        console.log('ABB Token:', store.symbolToTokenMaster['ABB']);
        
        const sym = 'ABB';
        const allOpts = store.nfoMasterData.filter(o => o.name === sym);
        console.log(`Options for ${sym}:`, allOpts.length);
        
        if (allOpts.length > 0) {
            const strikes = [...new Set(allOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
            console.log(`Strikes for ${sym}:`, strikes.slice(0, 10), '...');
        }
    } catch (e) {
        console.error(e);
    }
}

debug();

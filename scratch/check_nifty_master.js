const store = require('../services/marketStore');
const { fetchTop200Stocks } = require('../services/stockService');

async function checkNifty() {
    try {
        await fetchTop200Stocks();
        const niftyOpts = store.nfoMasterData.filter(o => o.name === 'NIFTY');
        console.log(`Found ${niftyOpts.length} NIFTY options.`);
        if (niftyOpts.length > 0) {
            console.log("Sample NIFTY option:", JSON.stringify(niftyOpts[0], null, 2));
        }
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkNifty();

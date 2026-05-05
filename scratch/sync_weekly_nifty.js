const store = require('../services/marketStore');
const { fetchTop200Stocks } = require('../services/stockService');
const { getCandlesWithCache } = require('../services/dbService');

async function syncWeekly() {
    try {
        await fetchTop200Stocks();
        
        // Find a NIFTY option expiring on 07MAY2026
        let weeklyOpt = store.nfoMasterData.find(o => 
            o.name === 'NIFTY' && 
            o.expiry === '07MAY2026' && 
            o.symbol.includes('24500CE')
        );

        if (!weeklyOpt) {
            console.log("No 07MAY2026 NIFTY 24500CE found!");
            // Try any NIFTY option from MAY
            const anyMay = store.nfoMasterData.find(o => o.name === 'NIFTY' && o.expiry.includes('MAY2026'));
            if (!anyMay) {
                console.log("No MAY NIFTY options found at all!");
                process.exit(1);
            }
            console.log("Found alternative:", anyMay.symbol);
            weeklyOpt = anyMay;
        }

        console.log(`Syncing ${weeklyOpt.symbol} (${weeklyOpt.token})...`);
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        
        const extraInfo = {
            underlying: weeklyOpt.name,
            strike: parseFloat(weeklyOpt.strike) / 100,
            expiry: weeklyOpt.expiry,
            optionType: weeklyOpt.symbol.endsWith("CE") ? "CE" : "PE"
        };

        const result = await getCandlesWithCache(
            weeklyOpt.symbol, 
            weeklyOpt.token, 
            "NFO", 
            "FIVE_MINUTE", 
            null, // uses default 30 days
            null,
            extraInfo
        );

        console.log("Result Source:", result.source);
        console.log("Data count:", result.data.length);
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

syncWeekly();

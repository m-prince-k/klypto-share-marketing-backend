const store = require('../services/marketStore');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
const { getCandlesWithCache, formatDate } = require('../services/dbService');
require('dotenv').config();

async function syncABBOptions() {
    console.log("Logging in...");
    await login();
    console.log("Fetching Master Scrips...");
    await fetchTop200Stocks();

    const uSym = "ABB";
    const interval = "FIVE_MINUTE";
    const allOptions = store.nfoMasterData.filter(o =>
        (o.name === uSym || o.symbol.startsWith(uSym)) && (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK")
    );

    console.log(`Found ${allOptions.length} options for ${uSym}. Starting 1-year history sync...`);

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const fromDate = formatDate(oneYearAgo, "09:15", interval);
    const toDate = formatDate(now, "15:30", interval);

    let successCount = 0;
    for (let i = 0; i < allOptions.length; i++) {
        const opt = allOptions[i];
        try {
            console.log(`[${i+1}/${allOptions.length}] Syncing ${opt.symbol} (${opt.token})...`);

            const rawExp = opt.expiry;
            let formattedExpiry = rawExp;
            if (rawExp && rawExp.length >= 9) {
                const day = rawExp.substring(0, 2);
                const monthStr = rawExp.substring(2, 5);
                const year = rawExp.substring(5);
                const monthMap = { 'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12' };
                const month = monthMap[monthStr.toUpperCase()] || '01';
                formattedExpiry = `${year}-${month}-${day}`;
            }

            const extraInfo = {
                underlying: uSym,
                strike: parseFloat(opt.strike) / 100,
                expiry: formattedExpiry,
                optionType: opt.symbol.endsWith("CE") ? "CE" : "PE"
            };

            await getCandlesWithCache(opt.symbol, opt.token, opt.exch_seg, interval, fromDate, toDate, extraInfo);
            successCount++;
            
            // Respect rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`Failed for ${opt.symbol}:`, err.message);
        }
    }

    console.log(`Sync completed. Successfully synced ${successCount}/${allOptions.length} contracts.`);
}

syncABBOptions().catch(console.error);

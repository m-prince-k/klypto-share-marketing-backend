const store = require('./marketStore');
const { getCandlesWithCache, formatDate } = require('./dbService');

/**
 * Bulk Sync Service
 * Responsible for deep historical data syncing of all tracked instruments
 */

async function syncAllUnderlyingsHistory(interval = "FIVE_MINUTE") {
    console.log(`[BulkSync] Starting 1-year history sync for all ${store.stocks.length} underlyings...`);
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    const fromDate = formatDate(oneYearAgo, "09:15", interval);
    const toDate = formatDate(now, "15:30", interval);

    for (const stock of store.stocks) {
        try {
            console.log(`[BulkSync-Underlying] Syncing ${stock.name} (${stock.segment})...`);
            await getCandlesWithCache(stock.name, stock.token, stock.segment, interval, fromDate, toDate);
            // Respect rate limits
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`[BulkSync-Underlying] Failed for ${stock.name}:`, err.message);
        }
    }
    console.log(`[BulkSync-Underlying] Completed successfully.`);
}

async function syncAllOptionsHistory(interval = "FIVE_MINUTE") {
    console.log(`[BulkSync] Starting 1-year history sync for ALL active option contracts (${store.nfoMasterData.length})...`);
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    
    const fromDate = formatDate(oneYearAgo, "09:15", interval);
    const toDate = formatDate(now, "15:30", interval);

    // Sync options ONLY for the symbols we are tracking in store.stocks
    const trackedSymbols = store.stocks.map(s => s.name);
    const allOptions = store.nfoMasterData.filter(o => 
        (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK") &&
        trackedSymbols.includes(o.name)
    );

    console.log(`[BulkSync-Options] Total tracked symbols: ${trackedSymbols.length}`);
    console.log(`[BulkSync-Options] Total contracts to sync for these symbols: ${allOptions.length}`);

    let count = 0;
    for (const opt of allOptions) {
        try {
            count++;
            if (count % 10 === 0) console.log(`[BulkSync-Options] Progress: ${count}/${allOptions.length}`);

            // Format expiry to YYYY-MM-DD for database DATEONLY field
            const rawExp = opt.expiry; // e.g. "07MAY2026"
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
                underlying: opt.name,
                strike: parseFloat(opt.strike) / 100,
                expiry: formattedExpiry,
                optionType: opt.symbol.endsWith("CE") ? "CE" : "PE"
            };

            await getCandlesWithCache(opt.symbol, opt.token, opt.exch_seg, interval, fromDate, toDate, extraInfo);
            // Higher delay for options to be safe
            await new Promise(r => setTimeout(r, 1200));
        } catch (err) {
            console.error(`[BulkSync-Options] Failed for ${opt.symbol}:`, err.message);
            // If we hit a critical error, wait longer
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    console.log(`[BulkSync-Options] Completed successfully.`);
}

module.exports = {
    syncAllUnderlyingsHistory,
    syncAllOptionsHistory
};

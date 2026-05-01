const store = require('./marketStore');
const smartApi = require('./smartApi');
const { Candle } = require('../models');
const { formatDate } = require('./dbService');

/**
 * Sync Futures Historical Data based on a list of expiry dates
 * @param {Array} stockList - List of symbols (e.g. ["ABB", "NIFTY"])
 * @param {Array} expiryDays - List of expiry strings (e.g. ["2024-03-28T...", ...])
 * @param {string} interval - e.g. "5minute" or "5m"
 */
async function syncFuturesHistory(stockList, expiryDays, interval = "5m") {
    const intervalMap = { "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY" };
    const apiInterval = intervalMap[interval.toLowerCase()] || interval;

    console.log(`[FuturesSync] Starting sync for ${stockList.length} stocks and ${expiryDays.length} periods...`);

    for (const userSym of stockList) {
        // Resolve symbol (some codes might differ in Angel One)
        const uSym = userSym.toUpperCase();
        
        for (let i = 0; i < expiryDays.length - 1; i++) {
            const startDateStr = expiryDays[i];
            const expiryDateStr = expiryDays[i + 1];
            
            const startDt = new Date(startDateStr);
            const expiryDt = new Date(expiryDateStr);
            
            // Format expiry for Angel One comparison (usually DDMMMYYYY like 25APR2024)
            // Actually, nfoMasterData has expiry in some format. Let's assume it's YYYY-MM-DD or similar.
            const targetExpiryStr = expiryDateStr.split('T')[0]; // "2024-04-25"

            // Find the correct contract token
            const contract = store.nfoMasterData.find(f => 
                f.name === uSym && 
                (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX") &&
                f.expiry.startsWith(targetExpiryStr)
            );

            if (!contract) {
                console.warn(`[FuturesSync] No contract found for ${uSym} expiring on ${targetExpiryStr}`);
                continue;
            }

            try {
                console.log(`[FuturesSync] Fetching ${uSym} (${contract.symbol}) for period ${targetExpiryStr}...`);
                
                const fDate = formatDate(startDt, "09:15");
                const tDate = formatDate(expiryDt, "15:30");

                const response = await smartApi.getCandleData({
                    exchange: "NFO",
                    symboltoken: contract.token,
                    interval: apiInterval,
                    fromdate: fDate,
                    todate: tDate
                });

                if (response && response.data && response.data.length > 0) {
                    const formatted = response.data.map(c => ({
                        symbol: contract.symbol, // Use the specific futures symbol e.g. NIFTY25APR24FUT
                        token: contract.token,
                        exchange: "NFO",
                        interval: apiInterval,
                        timestamp: new Date(c[0]),
                        open: c[1],
                        high: c[2],
                        low: c[3],
                        close: c[4],
                        volume: c[5]
                    }));

                    await Candle.bulkCreate(formatted, { ignoreDuplicates: true });
                    console.log(`[FuturesSync] Saved ${formatted.length} candles for ${contract.symbol}`);
                }

                // Respect rate limits
                await new Promise(r => setTimeout(r, 500));
            } catch (err) {
                console.error(`[FuturesSync] Error for ${uSym} during ${targetExpiryStr}:`, err.message);
            }
        }
    }
    console.log("[FuturesSync] Completed.");
}

module.exports = { syncFuturesHistory };

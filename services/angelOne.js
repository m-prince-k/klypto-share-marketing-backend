const smartApi = require('./smartApi');
const store = require('./marketStore');

/**
 * Fetch historical candles directly from Angel One API
 * @param {string} symbol - Stock symbol (e.g., RELIANCE)
 * @param {string} interval - ONE_MINUTE, FIVE_MINUTE, etc.
 * @param {string} fromDate - YYYY-MM-DD HH:mm
 * @param {string} toDate - YYYY-MM-DD HH:mm
 */
/**
 * Fetch historical candles directly from Angel One API with support for large date ranges (Auto-Chunking)
 * @param {string} symbol - Stock symbol (e.g., RELIANCE)
 * @param {string} interval - ONE_MINUTE, FIVE_MINUTE, etc.
 * @param {string} fromDate - YYYY-MM-DD HH:mm
 * @param {string} toDate - YYYY-MM-DD HH:mm
 */
async function getHistoricalCandle({symbol, interval, fromDate, toDate}) {
    try {
        if (!symbol || typeof symbol !== 'string') throw new Error("Invalid or missing symbol parameter.");
        if (!interval || typeof interval !== 'string') throw new Error("Invalid or missing interval parameter.");

        // 1. Find token for the symbol
        const stock = store.stocks.find(s => s.name && s.name.toUpperCase() === symbol.toUpperCase());
        if (!stock) throw new Error(`Symbol ${symbol} not found in master list.`);

        // 2. Map shorthand intervals if needed
        const intervalMap = {
            "1m": "ONE_MINUTE", "3m": "THREE_MINUTE", "5m": "FIVE_MINUTE",
            "10m": "TEN_MINUTE", "15m": "FIFTEEN_MINUTE", "30m": "THIRTY_MINUTE",
            "1h": "ONE_HOUR", "1d": "ONE_DAY"
        };
        const apiInterval = intervalMap[interval.toLowerCase()] || interval;

        // 3. Define Chunk Limits (Angel One limits per request)
        const maxDaysMap = {
            "ONE_MINUTE": 30,
            "THREE_MINUTE": 60,
            "FIVE_MINUTE": 100,
            "TEN_MINUTE": 100,
            "FIFTEEN_MINUTE": 200,
            "THIRTY_MINUTE": 200,
            "ONE_HOUR": 400,
            "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[apiInterval] || 30;

        // 4. Parse dates
        let currentStartDate = new Date(fromDate);
        const finalEndDate = new Date(toDate);
        let allCandles = [];

        console.log(`[AngelOne Service] Starting chunked fetch for ${symbol} (${apiInterval}) from ${fromDate} to ${toDate}`);

        const { formatDate } = require('./dbService');

        // 5. Iterative Fetching
        while (currentStartDate < finalEndDate) {
            let currentChunkEndDate = new Date(currentStartDate);
            currentChunkEndDate.setDate(currentChunkEndDate.getDate() + maxDaysPerChunk);
            
            // Don't exceed final toDate
            if (currentChunkEndDate > finalEndDate) {
                currentChunkEndDate = new Date(finalEndDate);
            }

            const fStr = formatDate(currentStartDate, currentStartDate.getHours() === 0 ? "09:15" : null);
            const tStr = formatDate(currentChunkEndDate, currentChunkEndDate.getHours() === 0 ? "15:30" : null);

            console.log(`[AngelOne API] Fetching chunk: ${fStr} to ${tStr}`);

            const response = await smartApi.getCandleData({
                exchange: "NSE",
                symboltoken: stock.token,
                interval: apiInterval,
                fromdate: fStr,
                todate: tStr
            });

            if (response && response.status && response.data) {
                allCandles.push(...response.data);
                console.log(`[AngelOne API] Received ${response.data.length} candles.`);
            } else {
                console.warn(`[AngelOne API] No data or error for chunk ${fStr} to ${tStr}:`, response ? response.message : "No response");
            }

            // Move to next chunk (add 1 minute to avoid overlap if needed, but API usually handles it)
            currentStartDate = new Date(currentChunkEndDate);
            currentStartDate.setMinutes(currentStartDate.getMinutes() + 1);

            // Rate limiting: 3 requests per second limit, so wait ~350ms
            if (currentStartDate < finalEndDate) {
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        }

        // 6. Format the combined response
        const formattedData = allCandles.map(candle => {
            const ts = new Date(candle[0]);
            return {
                symbol: symbol.toUpperCase(),
                token: stock.token,
                timestamp: ts,
                time: Math.floor(ts.getTime() / 1000),
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            };
        });

        // Deduplicate by timestamp (just in case of overlaps)
        const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());

        console.log(`[AngelOne Service] Completed. Total candles fetched: ${uniqueData.length}`);
        return uniqueData;

    } catch (err) {
        console.error("[AngelOne Service] Error:", err.message);
        throw err;
    }
}

module.exports = {
    getHistoricalCandle
};







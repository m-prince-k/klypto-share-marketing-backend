const smartApi = require('./smartApi');
const store = require('./marketStore');
const { Candle } = require('../models');

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
 * @param {string} exchange - NSE or NFO
 */
async function getHistoricalCandle({symbol, interval, fromDate, toDate, exchange, symboltoken}) {
    try {
        if (!symbol || typeof symbol !== 'string') throw new Error("Invalid or missing symbol parameter.");
        if (!interval || typeof interval !== 'string') throw new Error("Invalid or missing interval parameter.");

        // 1. Resolve Exchange
        let finalExchange = exchange;
        if (!finalExchange) {
            // Auto-detect exchange
            const uSym = symbol.toUpperCase();
            const isNfo = store.nfoMasterData.some(f => f.symbol === uSym);
            finalExchange = isNfo ? "NFO" : "NSE";
        }

        // 2. Find token for the symbol (skip if already provided)
        let token = symboltoken || null;
        if (!token) {
            if (finalExchange === "NSE") {
                token = store.symbolToTokenMaster[symbol.toUpperCase()];
            } else {
                const nfoStock = store.nfoMasterData.find(f => f.symbol === symbol.toUpperCase());
                token = nfoStock ? nfoStock.token : null;
            }

            if (!token) {
                // Fallback: look in store.stocks
                const stock = store.stocks.find(s => s.name && s.name.toUpperCase() === symbol.toUpperCase());
                token = stock ? stock.token : null;
            }
        }

        if (!token) throw new Error(`Symbol ${symbol} not found in master list for ${finalExchange}.`);

        // 3. Map shorthand intervals if needed
        const intervalMap = {
            "1": "ONE_MINUTE", "1m": "ONE_MINUTE", "one_minute": "ONE_MINUTE",
            "3": "THREE_MINUTE", "3m": "THREE_MINUTE", "three_minute": "THREE_MINUTE",
            "5": "FIVE_MINUTE", "5m": "FIVE_MINUTE", "five_minute": "FIVE_MINUTE",
            "10": "TEN_MINUTE", "10m": "TEN_MINUTE", "ten_minute": "TEN_MINUTE",
            "15": "FIFTEEN_MINUTE", "15m": "FIFTEEN_MINUTE", "fifteen_minute": "FIFTEEN_MINUTE",
            "30": "THIRTY_MINUTE", "30m": "THIRTY_MINUTE", "thirty_minute": "THIRTY_MINUTE",
            "60": "ONE_HOUR", "1h": "ONE_HOUR", "one_hour": "ONE_HOUR",
            "day": "ONE_DAY", "1d": "ONE_DAY", "d": "ONE_DAY", "one_day": "ONE_DAY"
        };
        const apiInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";

        // 4. Define Chunk Limits
        const maxDaysMap = {
            "ONE_MINUTE": 30, "THREE_MINUTE": 60, "FIVE_MINUTE": 100,
            "TEN_MINUTE": 100, "FIFTEEN_MINUTE": 200, "THIRTY_MINUTE": 200,
            "ONE_HOUR": 400, "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[apiInterval] || 30;

        // 5. Parse dates
        let currentStartDate = new Date(fromDate);
        const finalEndDate = new Date(toDate);
        let allCandles = [];

        console.log(`[AngelOne Service] Starting chunked fetch for ${symbol} (${apiInterval}) on ${finalExchange} from ${fromDate} to ${toDate}`);

        const { formatDate } = require('./dbService');

        // 6. Iterative Fetching
        while (currentStartDate < finalEndDate) {
            let currentChunkEndDate = new Date(currentStartDate);
            currentChunkEndDate.setDate(currentChunkEndDate.getDate() + maxDaysPerChunk);
            
            if (currentChunkEndDate > finalEndDate) {
                currentChunkEndDate = new Date(finalEndDate);
            }

            const fStr = formatDate(currentStartDate, currentStartDate.getHours() === 0 ? "09:15" : null);
            const tStr = formatDate(currentChunkEndDate, currentChunkEndDate.getHours() === 0 ? "15:30" : null);

            console.log(`[AngelOne API] Fetching ${finalExchange} chunk: ${fStr} to ${tStr}`);

            const response = await smartApi.getCandleData({
                exchange: finalExchange,
                symboltoken: token,
                interval: apiInterval,
                fromdate: fStr,
                todate: tStr
            });

            if (response && response.status && response.data) {
                allCandles.push(...response.data);
            }

            currentStartDate = new Date(currentChunkEndDate.getTime() + 60000);

            if (currentStartDate < finalEndDate) {
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        }

        // 7. Format the combined response
        const formattedData = allCandles.map(candle => {
            const ts = new Date(candle[0]);
            return {
                symbol: symbol.toUpperCase(),
                token: token,
                exchange: finalExchange,
                interval: apiInterval,
                timestamp: ts,
                time: Math.floor(ts.getTime() / 1000),
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            };
        });

        const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
        
        // Save to Database
        if (uniqueData.length > 0) {
            try {
                // Candle bulkCreate handles duplicates based on composite unique key
                await Candle.bulkCreate(uniqueData, { ignoreDuplicates: true });
                console.log(`[AngelOne Service] Saved ${uniqueData.length} candles to DB for ${symbol}`);
            } catch (dbErr) {
                console.error(`[AngelOne Service] Failed to save to DB for ${symbol}:`, dbErr.message);
            }
        }

        console.log(`[AngelOne Service] Completed. Total candles: ${uniqueData.length}`);
        return uniqueData;

    } catch (err) {
        console.error("[AngelOne Service] Error:", err.message);
        throw err;
    }
}

module.exports = {
    getHistoricalCandle
};







const smartApi = require('./smartApi');
const store = require('./marketStore');
const { Candle } = require('../models');
const { formatDate } = require('./dbService');

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
async function getHistoricalCandle({symbol, interval, fromDate, toDate, exchange, symboltoken, skipSave = false}) {
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
            const uSym = symbol.toUpperCase();
            if (finalExchange === "NSE") {
                token = store.symbolToTokenMaster[uSym];
            } else if (finalExchange === "BSE") {
                token = store.symbolToTokenMaster[`${uSym}_BSE`];
            } else {
                // Futures/Options (NFO/BFO)
                const nfoStock = store.nfoMasterData.find(f => f.symbol === uSym);
                token = nfoStock ? nfoStock.token : null;
            }

            if (!token) {
                // Final Fallback: look in store.stocks for a match on name and segment
                const stock = store.stocks.find(s => 
                    s.name && s.name.toUpperCase() === uSym && 
                    (s.segment === finalExchange || (finalExchange === "NFO" && s.segment === "NSE"))
                );
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




        // 4. Define Chunk Limits (Adhere to Angel One limits)
        const maxDaysMap = {
            "ONE_MINUTE": 7, 
            "THREE_MINUTE": 15, 
            "FIVE_MINUTE": 30,


            "TEN_MINUTE": 100, 
            "FIFTEEN_MINUTE": 200, 
            "THIRTY_MINUTE": 200,
            "ONE_HOUR": 200, 
            "ONE_DAY": 365
        };
        const maxDaysPerChunk = maxDaysMap[apiInterval] || 30;


        // 5. Setup Chunking
        const splitIntoChunks = (start, end, maxDays) => {
            const chunks = [];
            let curr = new Date(start);
            const target = new Date(end);
            
            const isMcx = finalExchange === "MCX";
            const startTime = isMcx ? "09:00" : "09:15";
            const endTime = isMcx ? "23:55" : "15:30";

            while (curr < target) {
                let chunkEnd = new Date(curr);
                chunkEnd.setDate(chunkEnd.getDate() + maxDays);
                if (chunkEnd > target) chunkEnd = new Date(target);
                

                // Format with specific times for first/last chunks if they are exactly at 00:00
                // For ONE_DAY interval, we prefer 00:00 to 23:59 range
                let fromStr, toStr;
                if (apiInterval === "ONE_DAY") {
                    fromStr = formatDate(curr, "00:00", apiInterval);
                    toStr = formatDate(chunkEnd, "23:59", apiInterval);
                } else {
                    fromStr = formatDate(curr, curr.getHours() === 0 && curr.getMinutes() === 0 ? startTime : null, apiInterval);
                    toStr = formatDate(chunkEnd, chunkEnd.getHours() === 0 && chunkEnd.getMinutes() === 0 ? endTime : null, apiInterval);
                }

                chunks.push({ from: fromStr, to: toStr });


                // Move curr forward and add 1 second to prevent overlap
                curr = new Date(chunkEnd);
                curr.setSeconds(curr.getSeconds() + 1);
            }
            return chunks;
        };

        const maxDays = (apiInterval === "ONE_MINUTE") ? 30 : 365;
        let chunks = splitIntoChunks(fromDate, toDate, maxDays);

        // Date formatting for ONE_DAY (Only Indices need strict YYYY-MM-DD, Equity usually needs 09:15 time)
        const isIndex = (token === "26000" || token === "26009" || token === "26037" || token === "26035" || (token && token.startsWith("999")));
        if (apiInterval === "ONE_DAY" && isIndex) {
            chunks = chunks.map(c => ({
                from: c.from.split(' ')[0],
                to: c.to.split(' ')[0]
            }));
        }

        console.log(`[AngelOne Service] Starting chunked fetch for ${symbol} on ${finalExchange}. Chunks: ${chunks.length}`);

        let allCandles = [];
        for (const chunk of chunks) {
            const apiParams = {
                exchange: finalExchange,
                symboltoken: token,
                interval: apiInterval,
                fromdate: chunk.from,
                todate: chunk.to
            };
            console.log(`[AngelOne API] Requesting:`, JSON.stringify(apiParams));
            const response = await smartApi.getCandleData(apiParams);

            if (response && response.status && response.data) {
                allCandles.push(...response.data);
            } else {
                console.log(`[AngelOne API] Error or empty response:`, JSON.stringify(response));
                
                // --- SELF HEALING: Token Expiry / 403 Recovery ---
                if (response && (String(response.status) === "403" || response.errorcode === "AB1004" || String(response.message).includes("Invalid Token"))) {
                    console.log(`[AngelOne Service] Token Expired/Invalid detected! Forcing Re-Login...`);
                    const { login } = require('./authService');
                    await login(true); // Force fetch new token and save to file
                    
                    // Retry the exact same chunk with the new token
                    console.log(`[AngelOne API] Retrying request after re-login...`);
                    const retryResponse = await smartApi.getCandleData(apiParams);
                    if (retryResponse && retryResponse.status && retryResponse.data) {
                        allCandles.push(...retryResponse.data);
                        console.log(`[AngelOne API] Retry Successful!`);
                    } else {
                        console.log(`[AngelOne API] Retry also failed:`, JSON.stringify(retryResponse));
                    }
                }
            }

            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 400));
            }
        }


        // 7. Format the combined response
        const formattedData = allCandles.map(candle => {
            let ts;
            const rawTs = candle[0];

            if (rawTs instanceof Date) {
                ts = rawTs;
            } else if (typeof rawTs === 'string') {
                // If it's a string like "2026-05-07 10:29", ensure IST parsing
                let tsStr = rawTs;
                if (!tsStr.includes('T') && !tsStr.includes('Z') && !tsStr.includes('+')) {
                    tsStr += " +05:30";
                }
                ts = new Date(tsStr);
            } else {
                ts = new Date(rawTs);
            }

            const timeSeconds = Math.floor(ts.getTime() / 1000);

            return {
                symbol: symbol.toUpperCase(),
                token: token,
                exchange: finalExchange,
                interval: apiInterval,
                timestamp: ts,
                time: isNaN(timeSeconds) ? null : timeSeconds,
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            };
        }).filter(c => c.time !== null);


        const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values());
        
        // Save to Database
        if (uniqueData.length > 0 && !skipSave) {
            try {
                // Candle bulkCreate handles duplicates based on composite unique key
                await Candle.bulkCreate(uniqueData, { 
                    updateOnDuplicate: ['open', 'high', 'low', 'close', 'volume'] 
                });
                console.log(`[AngelOne Service] Saved/Updated ${uniqueData.length} candles in DB for ${symbol}`);
            } catch (dbErr) {
                console.error(`[AngelOne Service] Failed to save to DB for ${symbol}:`, dbErr.message);
            }
        }

        console.log(`[AngelOne Service] Completed. Total candles: ${uniqueData.length} (Saved to DB: ${!skipSave})`);
        return uniqueData;

    } catch (err) {
        console.error("[AngelOne Service] Error:", err.message);
        throw err;
    }
}

module.exports = {
    getHistoricalCandle
};







const { Candle } = require('../models');
const { Op } = require('sequelize');
const smartApi = require('./smartApi');

const formatDate = (date, time, interval) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');


    if (time) {
        return `${year}-${month}-${day} ${time}`;
    }

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};


async function getCandlesWithCache(symbol, token, exchange, interval, fromDate, toDate, extraInfo = null) {
    try {
        const { Candle, OptionChain } = require('../models');
        // Distinguish between Options and Futures in NFO/BFO
        const isOption = (exchange === "NFO" || exchange === "BFO") && 
                         (symbol.endsWith("CE") || symbol.endsWith("PE") || (extraInfo && extraInfo.optionType));
        const ModelToUse = isOption ? OptionChain : Candle;
        
        console.log(`[dbService] Fetching ${symbol} | Exchange: ${exchange} | isOption: ${isOption} | Model: ${ModelToUse?.name}`);

        // Default to last 30 days if no dates provided
        if (!fromDate || !toDate) {
            const now = new Date();
            const past = new Date();
            past.setDate(now.getDate() - 30);
            fromDate = formatDate(past, "09:15");
            toDate = formatDate(now, "15:30");
        }

        // 1. Check local DB first
        const dbCandles = await ModelToUse.findAll({
            where: {
                symbol: symbol.toUpperCase(),
                exchange: exchange,
                interval: interval,
                timestamp: { [Op.between]: [new Date(fromDate), new Date(toDate)] }
            },
            order: [['timestamp', 'ASC']]
        });

        // Only serve from DB if we have enough data
        if (dbCandles.length > 0) {
            const diffMs = new Date(toDate) - new Date(fromDate);
            const rangeDays = diffMs / (1000 * 60 * 60 * 24);
            
            const intervalInMinutes = {
                "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                "ONE_HOUR": 60, "ONE_DAY": 1440 // 1 candle per day
            }[interval] || 1;

            const marketHoursPerDay = interval === "ONE_DAY" ? 24 : 6.25; 
            const expectedCandlesPerDay = interval === "ONE_DAY" ? (5/7) : (marketHoursPerDay * 60) / intervalInMinutes;
            const expectedCount = Math.max(1, Math.floor(rangeDays * expectedCandlesPerDay) * 0.7); // 70% threshold

            if (dbCandles.length >= expectedCount || (rangeDays < 0.1 && dbCandles.length > 0)) {
                console.log(`[DB Cache] Serving ${dbCandles.length} records from ${ModelToUse.name} for ${symbol} (Expected: ~${Math.floor(expectedCount)})`);
                return { 
                    source: "database", 
                    data: dbCandles.map(c => {
                        const d = c.toJSON ? c.toJSON() : c;
                        return { ...d, time: Math.floor(new Date(d.timestamp).getTime() / 1000) };
                    }), 
                    raw_response: null 
                };
            }
        }

        // 2. Fallback to Angel One API
        console.log(`[API Fallback] Fetching ${symbol} from Angel One (${exchange})... Threshold not met (Got ${dbCandles.length}, need ~${Math.floor(((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) * (interval === "ONE_DAY" ? 5/7 : 1) * 0.7)})`);
        
        const maxDaysMap = {
            "ONE_MINUTE": 30, "THREE_MINUTE": 45, "FIVE_MINUTE": 60,
            "TEN_MINUTE": 60, "FIFTEEN_MINUTE": 90, "THIRTY_MINUTE": 120,
            "ONE_HOUR": 200, "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[interval] || 30;

        let currentStartDate = new Date(fromDate);
        const finalEndDate = new Date(toDate);
        let allCandles = [];

        while (currentStartDate < finalEndDate) {
            let currentChunkEndDate = new Date(currentStartDate);
            currentChunkEndDate.setDate(currentChunkEndDate.getDate() + maxDaysPerChunk);
            if (currentChunkEndDate > finalEndDate) currentChunkEndDate = new Date(finalEndDate);

            const fStr = formatDate(currentStartDate, "09:15", interval);
            const tStr = formatDate(currentChunkEndDate, "15:30", interval);

            console.log(`[AngelOne API] Requesting ${symbol} (${token}) | Interval: ${interval} | From: ${fStr} | To: ${tStr}`);
            
            try {
                const response = await smartApi.getCandleData({
                    exchange,
                    symboltoken: token,
                    interval: interval,
                    fromdate: fStr,
                    todate: tStr
                });

                if (response && response.status && response.data) {
                    console.log(`[AngelOne API] Success for ${symbol}: Received ${response.data.length} candles.`);
                    allCandles.push(...response.data);
                } else {
                    console.log(`[API Chunk] ${symbol} Empty or Error response:`, JSON.stringify(response));
                    if (response && response.message && response.message.includes("exceeding access rate")) {
                        console.warn(`[API Fallback] Rate limited for ${symbol}. Stopping chunks.`);
                        break;
                    }
                }
            } catch (err) {
                console.error(`[API Chunk] Error fetching ${symbol}:`, err.message);
                break;
            }

            currentStartDate = currentChunkEndDate;
            if (currentStartDate >= finalEndDate) break;
            await new Promise(resolve => setTimeout(resolve, 1200)); 
        }

        // 3. Save to DB and Return
        if (allCandles.length > 0) {
            console.log(`[API Result] Returning ${allCandles.length} candles for ${symbol}`);
        } else if (dbCandles.length > 0) {
            console.log(`[DB Fallback] API returned nothing, returning existing ${dbCandles.length} DB records for ${symbol}`);
            return { 
                source: "database_fallback", 
                data: dbCandles.map(c => {
                    const d = c.toJSON ? c.toJSON() : c;
                    return { ...d, time: Math.floor(new Date(d.timestamp).getTime() / 1000) };
                })
            };
        }

        const formattedData = allCandles.map(candle => {
            const ts = new Date(candle[0]);
            const base = {
                symbol: symbol.toUpperCase(),
                token: token,
                exchange,
                interval,
                timestamp: ts,
                time: Math.floor(ts.getTime() / 1000),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseInt(candle[5])
            };

            if (isOption && extraInfo) {
                return {
                    ...base,
                    underlying: extraInfo.underlying,
                    strike: extraInfo.strike,
                    expiry: extraInfo.expiry,
                    optionType: extraInfo.optionType
                };
            }
            return base;
        });

        const uniqueData = Array.from(new Map(formattedData.map(item => [item.timestamp.getTime(), item])).values());
        
        if (uniqueData.length > 0) {
            await ModelToUse.bulkCreate(uniqueData, { ignoreDuplicates: true });
            console.log(`[API Fallback] Saved ${uniqueData.length} records to ${ModelToUse.name} for ${symbol}`);
        }

        return { source: "api_chunked", data: uniqueData, raw_response: null };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    getCandlesWithCache,
    formatDate
};

const { Candle } = require('../models');
const { Op } = require('sequelize');
const smartApi = require('./smartApi');

const formatDate = (date, time, interval) => {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    if (interval === "ONE_DAY") {
        return `${year}-${month}-${day}`;
    }

    if (!time) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }
    
    return `${year}-${month}-${day} ${time}`;
};

async function getCandlesWithCache(symbol, token, exchange, interval, fromDate, toDate) {
    try {
        // Default to last 30 days if no dates provided
        if (!fromDate || !toDate) {
            const now = new Date();
            const past = new Date();
            past.setDate(now.getDate() - 30);
            fromDate = formatDate(past, "09:15");
            toDate = formatDate(now, "15:30");
        }

        // 1. Check local DB first
        const dbCandles = await Candle.findAll({
            where: {
                symbol: symbol.toUpperCase(),
                exchange: exchange, // Now filtering by exchange too
                interval: interval,
                timestamp: { [Op.between]: [new Date(fromDate), new Date(toDate)] }
            },
            order: [['timestamp', 'ASC']]
        });

        // Only serve from DB if we have a significant amount of data
        if (dbCandles.length > 0) {
            const diffMs = new Date(toDate) - new Date(fromDate);
            const rangeDays = diffMs / (1000 * 60 * 60 * 24);
            
            // Calculate expected candles
            const intervalInMinutes = {
                "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                "ONE_HOUR": 60, "ONE_DAY": 375 // 6.25 hours * 60 min
            }[interval] || 1;

            const marketHoursPerDay = 6.25; // 09:15 to 15:30
            const expectedCandlesPerDay = (marketHoursPerDay * 60) / intervalInMinutes;
            const expectedCount = Math.max(1, Math.floor(rangeDays * expectedCandlesPerDay) * 0.8); // 80% threshold

            if (dbCandles.length >= expectedCount || (rangeDays < 0.1 && dbCandles.length > 0)) {
                console.log(`[DB Cache] Serving ${dbCandles.length} records for ${symbol} (Expected ~${Math.floor(expectedCount)})`);
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

        // 2. Fallback to Angel One API with Chunking
        console.log(`[API Fallback] Fetching ${symbol} from Angel One (${exchange})...`);
        
        const maxDaysMap = {
            "ONE_MINUTE": 30, "THREE_MINUTE": 60, "FIVE_MINUTE": 100,
            "TEN_MINUTE": 100, "FIFTEEN_MINUTE": 200, "THIRTY_MINUTE": 200,
            "ONE_HOUR": 400, "ONE_DAY": 2000
        };
        const maxDaysPerChunk = maxDaysMap[interval] || 30;

        let currentStartDate = new Date(fromDate);
        const finalEndDate = new Date(toDate);
        let allCandles = [];

        while (currentStartDate < finalEndDate) {
            let currentChunkEndDate = new Date(currentStartDate);
            currentChunkEndDate.setDate(currentChunkEndDate.getDate() + maxDaysPerChunk);
            
            if (currentChunkEndDate > finalEndDate) {
                currentChunkEndDate = new Date(finalEndDate);
            }

            const fStr = formatDate(currentStartDate, currentStartDate.getHours() === 0 ? "09:15" : null, interval);
            const tStr = formatDate(currentChunkEndDate, currentChunkEndDate.getHours() === 0 ? "15:30" : null, interval);

            console.log(`[API Chunk] ${symbol}: ${fStr} to ${tStr}`);

            const response = await smartApi.getCandleData({
                exchange,
                symboltoken: token,
                interval: interval,
                fromdate: fStr,
                todate: tStr
            });

            if (response && response.status && response.data) {
                allCandles.push(...response.data);
            }

            currentStartDate = currentChunkEndDate;
            if (currentStartDate >= finalEndDate) break;
            
            await new Promise(resolve => setTimeout(resolve, 350));
        }

        const formattedData = allCandles.map(candle => {
            const ts = new Date(candle[0]);
            return {
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
        });

        // Deduplicate and Save
        const uniqueData = Array.from(new Map(formattedData.map(item => [item.timestamp.getTime(), item])).values());
        
        if (uniqueData.length > 0) {
            await Candle.bulkCreate(uniqueData, { ignoreDuplicates: true });
            console.log(`[API Fallback] Saved ${uniqueData.length} candles for ${symbol}`);
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

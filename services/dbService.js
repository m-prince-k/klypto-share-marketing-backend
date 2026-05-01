const { Candle } = require('../models');
const { Op } = require('sequelize');
const smartApi = require('./smartApi');

const formatDate = (date, time) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    if (!time) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
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
                interval: interval,
                timestamp: { [Op.between]: [new Date(fromDate), new Date(toDate)] }
            },
            order: [['timestamp', 'ASC']]
        });

        // Only serve from DB if we have a significant amount of data
        // For very small ranges, hitting the API is fine to ensure we have the latest
        if (dbCandles.length > 0) {
            const rangeDays = (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24);
            // If we have at least 1 candle per day (roughly), assume it's cached
            if (dbCandles.length >= rangeDays || rangeDays < 1) {
                console.log(`[DB Cache] Serving ${dbCandles.length} records for ${symbol}`);
                return { source: "database", data: dbCandles, raw_response: null };
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

            const fStr = formatDate(currentStartDate, currentStartDate.getHours() === 0 ? "09:15" : null);
            const tStr = formatDate(currentChunkEndDate, currentChunkEndDate.getHours() === 0 ? "15:30" : null);

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

            currentStartDate = new Date(currentChunkEndDate.getTime() + 60000);
            if (currentStartDate < finalEndDate) {
                await new Promise(resolve => setTimeout(resolve, 350));
            }
        }

        const formattedData = allCandles.map(candle => ({
            symbol: symbol.toUpperCase(),
            token: token,
            exchange,
            interval,
            timestamp: new Date(candle[0]),
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5]
        }));

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

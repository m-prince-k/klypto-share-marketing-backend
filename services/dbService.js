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

        if (dbCandles.length > 0) {
            console.log(`[DB Cache] Serving ${dbCandles.length} records for ${symbol}`);
            return { source: "database", data: dbCandles, raw_response: null };
        }

        // 2. Fallback to Angel One API
        console.log(`[API Fallback] Fetching ${symbol} from Angel One...`);
        const response = await smartApi.getCandleData({
            exchange,
            symboltoken: token,
            interval,
            fromdate: fromDate,
            todate: toDate
        });

        let formattedData = [];
        if (response && response.data && Array.isArray(response.data)) {
            formattedData = response.data.map(candle => ({
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

            // Save to DB
            await Candle.bulkCreate(formattedData, { ignoreDuplicates: true });
        }
        return { source: "api", data: formattedData, raw_response: response };
    } catch (err) {
        throw err;
    }
}

module.exports = {
    getCandlesWithCache,
    formatDate
};

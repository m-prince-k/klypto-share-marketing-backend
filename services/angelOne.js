const smartApi = require('./smartApi');
const store = require('./marketStore');

/**
 * Fetch historical candles directly from Angel One API
 * @param {string} symbol - Stock symbol (e.g., RELIANCE)
 * @param {string} interval - ONE_MINUTE, FIVE_MINUTE, etc.
 * @param {string} fromDate - YYYY-MM-DD HH:mm
 * @param {string} toDate - YYYY-MM-DD HH:mm
 */
async function getHistoricalCandle({symbol, interval, fromDate, toDate}) {
    try {
    if (!symbol || typeof symbol !== 'string') {
            throw new Error("Invalid or missing symbol parameter.");
        }
        if (!interval || typeof interval !== 'string') {
            throw new Error("Invalid or missing interval parameter.");
        }

        // 1. Find token for the symbol
        const stock = store.stocks.find(s => s.name && s.name.toUpperCase() === symbol.toUpperCase());
        if (!stock) {
            throw new Error(`Symbol ${symbol} not found in master list.`);
        }

        // 2. Map shorthand intervals if needed (1m, 5m etc)
        const intervalMap = {
            "1m": "ONE_MINUTE",
            "3m": "THREE_MINUTE",
            "5m": "FIVE_MINUTE",
            "10m": "TEN_MINUTE",
            "15m": "FIFTEEN_MINUTE",
            "30m": "THIRTY_MINUTE",
            "1h": "ONE_HOUR",
            "1d": "ONE_DAY"
        };
        const apiInterval = intervalMap[interval.toLowerCase()] || interval;

        console.log(`[AngelOne Service] Fetching ${symbol} (${apiInterval}) from ${fromDate} to ${toDate}`);

        // 3. Call Angel One API
        const response = await smartApi.getCandleData({
            exchange: "NSE",
            symboltoken: stock.token,
            interval: apiInterval,
            fromdate: fromDate,
            todate: toDate
        });

        if (!response || !response.status || !response.data) {
            throw new Error(response ? response.message : "No response from Angel One API");
        }

        // 4. Format the response for lightweight charts and general use
        const formattedData = response.data.map(candle => {
            const ts = new Date(candle[0]);
            return {
                symbol: symbol.toUpperCase(),
                token: stock.token,
                timestamp: ts,
                time: Math.floor(ts.getTime() / 1000), // Unix timestamp in seconds
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            };
        });

        return formattedData;
    } catch (err) {
        console.error("[AngelOne Service] Error:", err.message);
        throw err;
    }
}

module.exports = {
    getHistoricalCandle
};







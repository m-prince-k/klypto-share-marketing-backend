const store = require('../services/marketStore');
const smartApi = require('../services/smartApi');
const { getCandlesWithCache, formatDate } = require('../services/dbService');
const { getHistoricalCandle } = require('../services/angelOne');
// const { syncFuturesHistory } = require('../services/futuresService');
// const { EXPIRY_DAYS, NIFTY_200 } = require('../services/futuresConstants');

const getHistoricalData = async (req, res) => {
    let { symbol, interval, fromDate, toDate, days } = req.query;

    const intervalMap = {
        "1": "ONE_MINUTE", "3": "THREE_MINUTE", "5": "FIVE_MINUTE", 
        "10": "TEN_MINUTE", "15": "FIFTEEN_MINUTE", "30": "THIRTY_MINUTE", 
        "60": "ONE_HOUR", "1h": "ONE_HOUR", "day": "ONE_DAY", "1d": "ONE_DAY"
    };
    const finalInterval = intervalMap[interval] || interval || "ONE_MINUTE";
    
    if (!smartApi.access_token) return res.status(503).json({ success: false, message: "Still authenticating..." });
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol required" });

    const token = store.symbolToTokenMaster[symbol.toUpperCase()];
    if (!token) return res.status(400).json({ success: false, message: "Invalid symbol" });

    // Auto-Add Tracking
    if (store.wsClient && !store.stocks.some(s => s.token === token)) {
        store.stocks.push({ name: symbol.toUpperCase(), token: token });
        store.wsClient.fetchData({ correlationID: `add_${symbol}`, action: 1, mode: 2, exchangeType: 1, tokens: [token] });
    }

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15");
        toDate = formatDate(now, "15:30");
    } else if (!fromDate || !toDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15");
        toDate = formatDate(now, "15:30");
    }

    try {
        const result = await getCandlesWithCache(symbol, token, "NSE", finalInterval, fromDate, toDate);
        res.json({
            success: true,
            symbol: symbol.toUpperCase(),
            source: result.source,
            count: result.data.length,
            data: result.data,
            raw_response: result.raw_response
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getOptionsHistoricalData = async (req, res) => {
    let { symbol, strike, type, interval, fromDate, toDate, days } = req.query;
    if (!symbol || !strike || !type) return res.status(400).json({ success: false, message: "Missing params" });
    if (!smartApi.access_token) return res.status(503).json({ success: false, message: "Still authenticating..." });

    const intervalMap = { "1": "ONE_MINUTE", "3": "THREE_MINUTE", "5": "FIVE_MINUTE", "10": "TEN_MINUTE", "15": "FIFTEEN_MINUTE", "30": "THIRTY_MINUTE", "60": "ONE_HOUR", "1h": "ONE_HOUR", "day": "ONE_DAY", "1d": "ONE_DAY" };
    const finalInterval = intervalMap[interval] || interval || "ONE_MINUTE";

    const options = store.nfoMasterData.filter(o => {
        const uName = symbol.toUpperCase().trim();
        return (o.name === uName || o.name.startsWith(uName)) && parseFloat(o.strike) === parseFloat(strike) && o.symbol.endsWith(type.toUpperCase());
    });

    if (options.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    const bestOption = options.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15");
        toDate = formatDate(now, "15:30");
    } else if (!fromDate || !toDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15");
        toDate = formatDate(now, "15:30");
    }

    try {
        const result = await getCandlesWithCache(bestOption.symbol, bestOption.token, "NFO", finalInterval, fromDate, toDate);
        
        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestOption.token] = bestOption.symbol;
            store.wsClient.fetchData({ correlationID: `opt_add_${bestOption.symbol}`, action: 1, mode: 2, exchangeType: 2, tokens: [bestOption.token] });
            if (!store.latestMarketData[bestOption.symbol]) {
                store.latestMarketData[bestOption.symbol] = { symbol: bestOption.symbol, token: bestOption.token, ltp: "0.00", status: "waiting..." };
            }
        }

        res.json({ success: true, symbol: bestOption.symbol, source: result.source, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getFuturesHistoricalData = async (req, res) => {
    let { symbol, interval, fromDate, toDate, days } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol required" });
    if (!smartApi.access_token) return res.status(503).json({ success: false, message: "Still authenticating..." });

    const intervalMap = { 
        "1": "ONE_MINUTE", "1m": "ONE_MINUTE",
        "3": "THREE_MINUTE", "3m": "THREE_MINUTE",
        "5": "FIVE_MINUTE", "5m": "FIVE_MINUTE",
        "10": "TEN_MINUTE", "10m": "TEN_MINUTE",
        "15": "FIFTEEN_MINUTE", "15m": "FIFTEEN_MINUTE",
        "30": "THIRTY_MINUTE", "30m": "THIRTY_MINUTE",
        "60": "ONE_HOUR", "1h": "ONE_HOUR", 
        "day": "ONE_DAY", "1d": "ONE_DAY" 
    };
    const finalInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";

    const futures = store.nfoMasterData.filter(f => f.name === symbol.toUpperCase() && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX"));
    if (futures.length === 0) return res.status(404).json({ success: false, message: "Not found" });
    const bestFuture = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15");
        toDate = formatDate(now, "15:30");
    } else if (!fromDate || !toDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15");
        toDate = formatDate(now, "15:30");
    }

    try {
        // Case-insensitive check for noStore
        const noStore = req.query.noStore === 'true' || req.query.nostore === 'true';
        let result;

        console.log(`[Historical] Request: ${symbol}, Interval: ${finalInterval}, noStore: ${noStore}`);
        console.log(`[Historical] Best Contract Found: ${bestFuture.symbol} (Expiry: ${bestFuture.expiry})`);
        console.log(`[Historical] Range: ${fromDate} to ${toDate}`);

        if (noStore) {
            console.log(`[Historical] Fetching DIRECTLY from Angel One API...`);
            const response = await smartApi.getCandleData({
                exchange: "NFO",
                symboltoken: bestFuture.token,
                interval: finalInterval,
                fromdate: fromDate,
                todate: toDate
            });
            
            // Format data if coming directly from API
            let formattedData = [];
            if (response && response.data && Array.isArray(response.data)) {
                formattedData = response.data.map(c => ({
                    timestamp: c[0],
                    open: c[1],
                    high: c[2],
                    low: c[3],
                    close: c[4],
                    volume: c[5]
                }));
            }

            result = { source: "api_direct", data: formattedData, raw_response: response };
        } else {
            result = await getCandlesWithCache(bestFuture.symbol, bestFuture.token, "NFO", finalInterval, fromDate, toDate);
        }
        
        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestFuture.token] = bestFuture.symbol;
            store.wsClient.fetchData({ correlationID: `fut_add_${bestFuture.symbol}`, action: 1, mode: 2, exchangeType: 2, tokens: [bestFuture.token] });
            if (!store.latestMarketData[bestFuture.symbol]) {
                store.latestMarketData[bestFuture.symbol] = { symbol: bestFuture.symbol, token: bestFuture.token, ltp: "0.00", status: "waiting..." };
            }
        }

        res.json({ success: true, symbol: bestFuture.symbol, source: result.source, data: result.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// const syncContinuousFutures = async (req, res) => {
//     try {
//         const { stocks, expiries, interval } = req.body;
        
//         if (!stocks || !expiries) {
//             return res.status(400).json({ success: false, message: "Stocks and Expiries arrays are required in body" });
//         }

//         // Run in background
//         syncFuturesHistory(stocks, expiries, interval || "5m")
//             .then(() => console.log("[FuturesSync] Background process finished."))
//             .catch(err => console.error("[FuturesSync] Background process failed:", err.message));

//         res.json({
//             success: true,
//             message: `Started background continuous sync for ${stocks.length} stocks across ${expiries.length} expiries.`
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };

// const syncAllFutures = async (req, res) => {
//     try {
//         const interval = req.query.interval || "5m";
        
//         // Start sync using the hardcoded lists
//         syncFuturesHistory(NIFTY_200, EXPIRY_DAYS, interval)
//             .then(() => console.log("[FuturesSync] Bulk sync finished."))
//             .catch(err => console.error("[FuturesSync] Bulk sync failed:", err.message));

//         res.json({
//             success: true,
//             message: `Bulk sync started for ${NIFTY_200.length} stocks and ${EXPIRY_DAYS.length} expiry dates in background.`
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };


const getManualHistoricalData = async (req, res) => {
    try {
        const { type, symbol, interval, period, fromdate,todate } = req.query;
        let params = { symbol: symbol, interval: interval ,
            fromDate: fromdate, toDate: todate}

        if (!symbol || !interval || !fromdate || !todate) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing parameters: symbol, interval, fromdate, and todate are required." 
            });
        }

        const data = await getHistoricalCandle(params);
        return await res.json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getManualHistoricalData,
    getHistoricalData,
    getOptionsHistoricalData,
    getFuturesHistoricalData,
    // syncContinuousFutures,
    // syncAllFutures
    
};

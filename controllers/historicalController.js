const store = require('../services/marketStore');
const smartApi = require('../services/smartApi');
const { getCandlesWithCache, formatDate } = require('../services/dbService');
const { getHistoricalCandle } = require('../services/angelOne');
// const { syncFuturesHistory } = require('../services/futuresService');
// const { EXPIRY_DAYS, NIFTY_200 } = require('../services/futuresConstants');

const getHistoricalData = async (req, res) => {
    let { symbol, interval, fromDate, toDate, days } = req.query;

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
    const finalInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";
    
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
    let { symbol, strike, type, interval, fromDate, toDate, days, expiry } = req.query;
    if (!symbol || !strike || !type) return res.status(400).json({ success: false, message: "Missing params" });
    if (!smartApi.access_token) return res.status(503).json({ success: false, message: "Still authenticating..." });

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
    const finalInterval = intervalMap[String(interval).toLowerCase()] || interval || "ONE_MINUTE";

    const options = store.nfoMasterData.filter(o => {
        const uName = symbol.toUpperCase().trim();
        // Angel One stores strike in paise (e.g. 48000 is stored as 4800000.000000)
        const nameMatch = o.name === uName; 
        const strikeMatch = (parseFloat(o.strike) / 100) === parseFloat(strike);
        const typeMatch = o.symbol.endsWith(type.toUpperCase());
        const expiryMatch = expiry ? o.expiry === expiry : true;

        return nameMatch && strikeMatch && typeMatch && expiryMatch;
    });

    if (options.length === 0) {
        return res.status(404).json({ 
            success: false, 
            message: `Contract not found for ${symbol} ${strike} ${type}${expiry ? ' with expiry ' + expiry : ''}.` 
        });
    }

    // Sort by expiry to pick the nearest one if multiple exist (and no expiry was provided)
    const bestOption = options.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15");
        toDate = formatDate(now, "15:30");
    } else if (fromDate && toDate) {
        // User provided both dates - format them properly if needed
        if (typeof fromDate === 'string' && fromDate.length === 10) {
            fromDate = formatDate(new Date(fromDate), "09:15");
        }
        if (typeof toDate === 'string' && toDate.length === 10) {
            toDate = formatDate(new Date(toDate), "15:30");
        }
    } else {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15");
        toDate = formatDate(now, "15:30");
    }

    console.log(`[Options Historical] Matched Contract: ${bestOption.symbol}, Token: ${bestOption.token}, Strike: ${bestOption.strike}, Expiry: ${bestOption.expiry}`);
    console.log(`[Options Historical] Date Range: ${fromDate} to ${toDate}, Interval: ${finalInterval}`);

    try {
        const result = await getCandlesWithCache(bestOption.symbol, bestOption.token, "NFO", finalInterval, fromDate, toDate);
        const data = result.data;
        
        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestOption.token] = bestOption.symbol;
            store.wsClient.fetchData({ correlationID: `opt_add_${bestOption.symbol}`, action: 1, mode: 2, exchangeType: 2, tokens: [bestOption.token] });
            if (!store.latestMarketData[bestOption.symbol]) {
                store.latestMarketData[bestOption.symbol] = { symbol: bestOption.symbol, token: bestOption.token, ltp: "0.00", status: "waiting..." };
            }
        }

        res.json({ success: true, symbol: bestOption.symbol, source: "api_chunked", count: data.length, data: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

const getFuturesHistoricalData = async (req, res) => {
    let { symbol, interval, fromDate, toDate, days } = req.query;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol required" });
    if (!smartApi.access_token) return res.status(503).json({ success: false, message: "Still authenticating..." });

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
        const result = await getCandlesWithCache(bestFuture.symbol, bestFuture.token, "NFO", finalInterval, fromDate, toDate);
        const data = result.data;
        
        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestFuture.token] = bestFuture.symbol;
            store.wsClient.fetchData({ correlationID: `fut_add_${bestFuture.symbol}`, action: 1, mode: 2, exchangeType: 2, tokens: [bestFuture.token] });
            if (!store.latestMarketData[bestFuture.symbol]) {
                store.latestMarketData[bestFuture.symbol] = { symbol: bestFuture.symbol, token: bestFuture.token, ltp: "0.00", status: "waiting..." };
            }
        }

        res.json({ success: true, symbol: bestFuture.symbol, source: "api_chunked", count: data.length, data: data });
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
        let { type, symbol, interval, period, fromdate, todate, fromDate, toDate } = req.query;
        
        // Normalize parameter names (handle both fromdate and fromDate)
        const finalFromDate = fromdate || fromDate;
        const finalToDate = todate || toDate;

        if (!symbol || !interval || !finalFromDate || !finalToDate) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing parameters: symbol, interval, fromDate/fromdate, and toDate/todate are required." 
            });
        }

        // Format dates to YYYY-MM-DD HH:mm if they are just YYYY-MM-DD
        let formattedFromDate = finalFromDate;
        let formattedToDate = finalToDate;

        // If it's just a date (YYYY-MM-DD), add the default market times
        if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
            formattedFromDate = formatDate(new Date(finalFromDate), "09:15");
        }
        if (typeof finalToDate === 'string' && finalToDate.length === 10) {
            formattedToDate = formatDate(new Date(finalToDate), "15:30");
        }

        console.log(`[Historical-V2] Request: ${symbol}, Interval: ${interval}, Range: ${formattedFromDate} to ${formattedToDate}`);

        let params = { 
            symbol: symbol, 
            interval: interval,
            fromDate: formattedFromDate, 
            toDate: formattedToDate
        }

        const data = await getHistoricalCandle(params);
        return res.json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (err) {
        console.error("[Historical-V2] Error:", err.message);
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

const store = require('../services/marketStore');
const smartApi = require('../services/smartApi');
const { getCandlesWithCache, formatDate } = require('../services/dbService');
const { getHistoricalCandle } = require('../services/angelOne');
// const { syncFuturesHistory } = require('../services/futuresService');
// const { EXPIRY_DAYS, NIFTY_200 } = require('../services/futuresConstants');

const getHistoricalData = async (req, res) => {
    let { symbol, interval, fromDate, toDate, days, exchange } = req.query;

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

    const finalExchange = (exchange || "NSE").toUpperCase();
    const tokenKey = finalExchange === "NSE" ? symbol.toUpperCase() : `${symbol.toUpperCase()}_${finalExchange}`;
    const token = store.symbolToTokenMaster[tokenKey];

    if (!token) return res.status(400).json({ success: false, message: `Invalid symbol or exchange: ${symbol} on ${finalExchange}` });

    // Auto-Add Tracking
    if (store.wsClient && !store.stocks.some(s => s.token === token)) {
        store.stocks.push({ name: symbol.toUpperCase(), token: token });
        store.wsClient.fetchData({ correlationID: `add_${symbol}`, action: 1, mode: 2, exchangeType: 1, tokens: [token] });
    }

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    } else if (!fromDate || !toDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    }

    try {
        const result = await getCandlesWithCache(symbol, token, finalExchange, finalInterval, fromDate, toDate);
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
    let { symbol, strike, type, interval, fromDate, toDate, days, expiry, exchange } = req.query;
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

    const parseExpiry = (exp) => {
        if (!exp) return null;
        const d = new Date(exp);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const finalExchange = (exchange || "NFO").toUpperCase();
    const options = store.nfoMasterData.filter(o => {
        const uName = symbol.toUpperCase().trim();

        const targetExpiry = expiry ? parseExpiry(expiry) : null;
        const currentExpiry = parseExpiry(o.expiry);

        const nameMatch = o.name === uName;
        const exchMatch = o.exch_seg === finalExchange;
        const strikeVal = parseFloat(o.strike);
        const targetStrike = parseFloat(strike);
        const strikeMatch = (strikeVal === targetStrike) || (strikeVal / 100 === targetStrike);

        const typeUpper = type.toUpperCase();
        const typeMatch = o.symbol.endsWith(typeUpper) || o.symbol.includes(typeUpper + " ");
        const isOption = o.instrumenttype.startsWith("OPT");

        const expiryMatch = targetExpiry ? currentExpiry === targetExpiry : true;

        return nameMatch && exchMatch && strikeMatch && typeMatch && expiryMatch && isOption;
    });

    console.log(`[Options Historical] Found ${options.length} total matches for ${symbol} ${strike} ${type}`);
    if (options.length > 0) {
        console.log(`[Options Historical] Available Expiries: ${[...new Set(options.map(o => o.expiry))].join(', ')}`);
    }

    if (options.length === 0) {
        return res.status(404).json({
            success: false,
            message: `Contract not found for ${symbol} ${strike} ${type}${expiry ? ' with expiry ' + expiry : ''}.`
        });
    }

    // Filter for expiries that were active at the end of the requested period
    let filteredOptions = options;
    if (!expiry) {
        // Use toDate as reference if available, otherwise use today
        const referenceDate = toDate ? new Date(toDate) : new Date();
        const referenceStr = parseExpiry(referenceDate);

        filteredOptions = options.filter(o => {
            const expStr = parseExpiry(o.expiry);
            return expStr >= referenceStr;
        });

        // Fallback: if no contract expires after the reference date, take the one with the latest expiry
        if (filteredOptions.length === 0) {
            filteredOptions = [options.sort((a, b) => new Date(b.expiry) - new Date(a.expiry))[0]];
        }
    }

    // Sort by expiry to pick the nearest one
    const bestOption = filteredOptions.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    } else if (fromDate && toDate) {
        // User provided both dates - format them properly if needed
        if (typeof fromDate === 'string' && fromDate.length === 10) {
            fromDate = formatDate(new Date(fromDate), "09:15", finalInterval);
        }
        if (typeof toDate === 'string' && toDate.length === 10) {
            toDate = formatDate(new Date(toDate), "15:30", finalInterval);
        }
    } else {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    }

    console.log(`[Options Historical] Matched Contract: ${bestOption.symbol}, Token: ${bestOption.token}, Strike: ${bestOption.strike}, Expiry: ${bestOption.expiry}`);
    console.log(`[Options Historical] Date Range: ${fromDate} to ${toDate}, Interval: ${finalInterval}`);

    try {
        const extraInfo = {
            underlying: bestOption.name,
            strike: parseFloat(bestOption.strike) / 100,
            expiry: parseExpiry(bestOption.expiry),
            optionType: bestOption.symbol.endsWith("CE") ? "CE" : "PE"
        };
        const result = await getCandlesWithCache(bestOption.symbol, bestOption.token, finalExchange, finalInterval, fromDate, toDate, extraInfo);
        const data = result.data;

        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestOption.token] = bestOption.symbol;
            store.tokenToExchange[bestOption.token] = finalExchange;
            const exchType = finalExchange === "BFO" ? 4 : 2;
            store.wsClient.fetchData({ correlationID: `opt_add_${bestOption.symbol}`, action: 1, mode: 2, exchangeType: exchType, tokens: [bestOption.token] });
            const key = `${bestOption.symbol}:${finalExchange}`;
            if (!store.latestMarketData[key]) {
                store.latestMarketData[key] = { symbol: bestOption.symbol, token: bestOption.token, ltp: "0.00", status: "waiting...", exchange: finalExchange };
            }
        }

        res.json({
            success: true,
            symbol: bestOption.symbol,
            source: result.source,
            count: data.length,
            data: data
        });
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

    const { expiry } = req.query;
    const finalExchange = (req.query.exchange || "NFO").toUpperCase();
    
    // Support NSE/BSE keywords
    const exchangeMap = { "NSE": "NFO", "BSE": "BFO" };
    const mappedExchange = exchangeMap[finalExchange] || finalExchange;

    const futures = store.nfoMasterData.filter(f =>
        f.name === symbol.toUpperCase() &&
        f.exch_seg === mappedExchange &&
        (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
    );

    if (futures.length === 0) return res.status(404).json({ success: false, message: `Futures not found for ${symbol} on ${mappedExchange}` });
    
    let bestFuture;
    if (expiry) {
        // Find matching expiry
        const targetExp = new Date(expiry).toISOString().split('T')[0];
        bestFuture = futures.find(f => {
            const fExp = new Date(f.expiry).toISOString().split('T')[0];
            return fExp === targetExp;
        });
        
        if (!bestFuture) {
            return res.status(404).json({ 
                success: false, 
                message: `Future with expiry ${expiry} not found. Available: ${futures.map(f => f.expiry).join(', ')}` 
            });
        }
    } else {
        // Default to Near Month
        bestFuture = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
    }

    const now = new Date();

    if (days && !fromDate) {
        const pastDate = new Date();
        pastDate.setDate(now.getDate() - parseInt(days));
        fromDate = formatDate(pastDate, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    } else if (!fromDate || !toDate) {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        fromDate = formatDate(oneMonthAgo, "09:15", finalInterval);
        toDate = formatDate(now, "15:30", finalInterval);
    }

    try {
        const result = await getCandlesWithCache(bestFuture.symbol, bestFuture.token, mappedExchange, finalInterval, fromDate, toDate);
        const data = result.data;
 
        // Auto-Add Live
        if (store.wsClient) {
            store.tokenToName[bestFuture.token] = bestFuture.symbol;
            store.tokenToExchange[bestFuture.token] = mappedExchange;
            const exchType = mappedExchange === "BFO" ? 4 : 2;
            store.wsClient.fetchData({ correlationID: `fut_add_${bestFuture.symbol}`, action: 1, mode: 2, exchangeType: exchType, tokens: [bestFuture.token] });
            const key = `${bestFuture.symbol}:${mappedExchange}`;
            if (!store.latestMarketData[key]) {
                store.latestMarketData[key] = { symbol: bestFuture.symbol, token: bestFuture.token, ltp: "0.00", status: "waiting...", exchange: mappedExchange };
            }
        }

        res.json({
            success: true,
            symbol: bestFuture.symbol,
            source: result.source,
            count: data.length,
            data: data
        });
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
        let { type, symbol, interval, period, fromdate, todate, fromDate, toDate, exchange } = req.query;

        // Normalize parameter names (handle both fromdate and fromDate)
        const finalFromDate = fromdate || fromDate;
        const finalToDate = todate || toDate;

        if (!symbol || !interval || !finalFromDate || !finalToDate) {
            return res.status(400).json({
                success: false,
                message: "Missing parameters: symbol, interval, fromDate/fromdate, and toDate/todate are required."
            });
        }

        // Clean up accidental formatting issues from frontend (e.g., "2024-01-01 :09:15" -> "2024-01-01 09:15")
        let cleanedFromDate = typeof finalFromDate === 'string' ? finalFromDate.replace(/\s+:/, ' ') : finalFromDate;
        let cleanedToDate = typeof finalToDate === 'string' ? finalToDate.replace(/\s+:/, ' ') : finalToDate;

        // Format dates to YYYY-MM-DD HH:mm if they are just YYYY-MM-DD
        let formattedFromDate = cleanedFromDate;
        let formattedToDate = cleanedToDate;

        // If it's just a date (YYYY-MM-DD), add the default market times
        if (typeof cleanedFromDate === 'string' && cleanedFromDate.length === 10) {
            formattedFromDate = formatDate(new Date(cleanedFromDate), "09:15", interval);
        }
        if (typeof cleanedToDate === 'string' && cleanedToDate.length === 10) {
            formattedToDate = formatDate(new Date(cleanedToDate), "15:30", interval);
        }

        // Validate that dates are actually valid dates
        if (isNaN(new Date(formattedFromDate).getTime()) || isNaN(new Date(formattedToDate).getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format provided. Please use YYYY-MM-DD or YYYY-MM-DD HH:mm"
            });
        }

        const finalExchange = (exchange || req.query.segment || "NSE").toUpperCase();
        const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);

        // Explicit Token Resolution
        const uSym = symbol.toUpperCase();
        let finalToken = store.symbolToTokenMaster[uSym] || store.symbolToTokenMaster[`${uSym}_${mappedExchange}`];
        
        // Manual fallback for Indices
        if (!finalToken) {
            if (uSym === "BANKNIFTY") finalToken = "26009";
            if (uSym === "NIFTY") finalToken = "26000";
            if (uSym === "FINNIFTY") finalToken = "26037";
        }

        // Strict Date Formatting for ONE_DAY (some indices require YYYY-MM-DD only)
        let fFrom = formattedFromDate;
        let fTo = formattedToDate;
        if (interval === "ONE_DAY" || interval === "day" || interval === "1d") {
            fFrom = formattedFromDate.split(' ')[0];
            fTo = formattedToDate.split(' ')[0];
        }

        console.log(`[Historical-V2] Request: ${symbol}, Token: ${finalToken}, Range: ${fFrom} to ${fTo}`);

        let params = {
            symbol: symbol,
            interval: interval,
            fromDate: fFrom,
            toDate: fTo,
            exchange: mappedExchange,
            symboltoken: finalToken
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

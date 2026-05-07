
const store = require('./marketStore');
const { getHistoricalCandle } = require('./angelOne');
const { formatDate, getCandlesWithCache } = require('./dbService');

async function fetchManualHistoricalData({ symbol, interval, fromDate, toDate, exchange, segment }) {
    try {
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

        // Normalize parameter names
        const finalFromDate = fromDate;
        const finalToDate = toDate;

        if (!symbol || !finalInterval || !finalFromDate || !finalToDate) {
            throw new Error("Missing parameters: symbol, interval, fromDate, and toDate are required.");
        }

        // Clean up accidental formatting issues
        let cleanedFromDate = typeof finalFromDate === 'string' ? finalFromDate.replace(/\s+:/, ' ') : finalFromDate;
        let cleanedToDate = typeof finalToDate === 'string' ? finalToDate.replace(/\s+:/, ' ') : finalToDate;

        // Format dates to YYYY-MM-DD HH:mm if they are just YYYY-MM-DD
        let formattedFromDate = cleanedFromDate;
        let formattedToDate = cleanedToDate;

        if (typeof cleanedFromDate === 'string' && cleanedFromDate.length === 10) {
            formattedFromDate = formatDate(new Date(cleanedFromDate), "09:15", finalInterval);
        }
        if (typeof cleanedToDate === 'string' && cleanedToDate.length === 10) {
            formattedToDate = formatDate(new Date(cleanedToDate), "15:30", finalInterval);
        }

        const finalExchange = (exchange || segment || "NSE").toUpperCase();
        const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);


        // Explicit Token Resolution with Hardcoded Map for Top Stocks
        const uSym = symbol.toUpperCase();
        
        const topStocksMap = {
            "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
            "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
            "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
            "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499"
        };

        let finalToken = topStocksMap[uSym] || 
                         store.symbolToTokenMaster[uSym] || 
                         store.symbolToTokenMaster[`${uSym}-EQ`] ||
                         store.symbolToTokenMaster[`${uSym}_${mappedExchange}`];
        
        // Manual fallback for Indices
        if (!finalToken) {
            if (uSym === "BANKNIFTY") finalToken = "26009";
            else if (uSym === "NIFTY") finalToken = "26000";
            else if (uSym === "FINNIFTY") finalToken = "26037";
        }



        // Resolve MCX base names (GOLD, GOLDM, etc.) to nearest active contract
        if (!finalToken && finalExchange === "MCX") {
            const mcxContracts = (store.mcxMasterData || []).filter(s =>
                s.name === uSym && s.instrumenttype === 'FUTCOM'
            );
            
            if (mcxContracts.length > 0) {
                const todayForExpiry = new Date();
                todayForExpiry.setHours(0, 0, 0, 0);
                
                const active = mcxContracts.filter(c => new Date(c.expiry) >= todayForExpiry);
                if (active.length > 0) {
                    const nearest = active.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
                    finalToken = nearest.token;
                    symbol = nearest.symbol; // Use the actual contract symbol (e.g. GOLD05JUN26FUT)
                }
            }
        }



        if (!finalToken) {
            throw new Error(`Token not found for symbol: ${symbol}`);
        }

        // Auto-Add Tracking for Live Updates
        if (store.wsClient && !store.stocks.some(s => s.token === finalToken)) {
            const exchangeTypeMap = { "NSE": 1, "NFO": 2, "BSE": 3, "BFO": 4, "MCX": 5 };
            const exchType = exchangeTypeMap[mappedExchange] || 1;
            
            // Register symbol/exchange for tick formatting
            store.tokenToName[finalToken] = uSym;
            store.tokenToExchange[finalToken] = mappedExchange;

            // Add to tracked stocks
            store.stocks.push({ name: uSym, token: finalToken, segment: mappedExchange });
            
            // Subscribe via Angel One WebSocket
            store.wsClient.fetchData({ 
                correlationID: `auto_add_${uSym}`, 
                action: 1, 
                mode: 2, 
                exchangeType: exchType, 
                tokens: [finalToken] 
            });
            console.log(`[HistoricalService] Auto-subscribed to ${uSym} (${finalToken}) on ${mappedExchange} for live updates.`);
        }

        const istOffset = 5.5 * 60 * 60; // 5 hours 30 mins
        const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, formattedFromDate, formattedToDate);
        
        // Apply IST Correction to all candles
        const correctedData = result.data.map(c => ({
            ...c,
            time: Number(c.time) + istOffset
        }));

        return {
            success: true,
            symbol: uSym,
            source: result.source,
            count: correctedData.length,
            data: correctedData
        };
    } catch (err) {
        console.error("[HistoricalService] Error:", err.message);
        throw err;
    }
}

module.exports = {
    fetchManualHistoricalData
};


const store = require('./marketStore');
const { getHistoricalCandle } = require('./angelOne');
const { formatDate, getCandlesWithCache } = require('./dbService');

async function fetchManualHistoricalData(payload) {
    let extraInfo = null;
    try {
        const symbol = payload.symbol;
        const interval = payload.interval;
        const fromDate = payload.fromDate || payload.fromdate;
        const toDate = payload.toDate || payload.todate;
        const exchange = payload.exchange;
        const segment = payload.segment;
        const forceApi = payload.forceApi === true;

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

        const uSym = symbol.toUpperCase();
        const isCommodity = uSym === "GOLD" || uSym === "SILVER" || uSym === "CRUDEOIL" || uSym === "NATURALGAS";

        let finalExchange = (exchange || segment || (isCommodity ? "MCX" : "NSE")).toUpperCase();
        
        // Auto-detect NFO for options if exchange is NSE but symbol is clearly an option
        if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
            finalExchange = "NFO";
        }
        
        const mappedExchange = finalExchange; 


        // Explicit Token Resolution with Hardcoded Map for Top Stocks (Only for Equity/Cash)
        const topStocksMap = {
            "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
            "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
            "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
            "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
            "GOLD": "234454", "SILVER": "234455"
        };

        let finalToken = null;
        
        // Use topStocksMap ONLY if it's not an NFO request
        if (mappedExchange !== "NFO" && mappedExchange !== "MCX") {
            finalToken = topStocksMap[uSym];
        }
        
        if (!finalToken) {
            finalToken = store.symbolToTokenMaster[uSym] || 
                         store.symbolToTokenMaster[`${uSym}-EQ`] ||
                         store.symbolToTokenMaster[`${uSym}_${mappedExchange}`];
        }
        
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

        // Auto-resolve base symbols to NFO near-month futures if requested exchange is NFO
        if (!finalToken && mappedExchange === "NFO" && !uSym.endsWith("CE") && !uSym.endsWith("PE") && !uSym.includes("FUT")) {
            const nfoFutures = (store.nfoMasterData || []).filter(s => 
                s.name === uSym && s.instrumenttype === 'FUTSTK'
            );
            if (nfoFutures.length > 0) {
                const todayForExpiry = new Date();
                todayForExpiry.setHours(0, 0, 0, 0);
                const active = nfoFutures.filter(c => new Date(c.expiry) >= todayForExpiry);
                if (active.length > 0) {
                    const nearest = active.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
                    finalToken = nearest.token;
                    symbol = nearest.symbol;
                }
            }
        }

        // Robust resolution for NFO contracts (even if token is cached, we need extraInfo for DB)
        const isNFO = mappedExchange === "NFO" || uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT");
        
        if (isNFO) {
            const noSpaceSym = uSym.replace(/\s+/g, '');
            const shortYearSym = noSpaceSym.replace(/20([2-3][0-9])/, '$1');
            const nfoMatch = (store.nfoMasterData || []).find(s => {
                const t = s.symbol.toUpperCase();
                const tr = s.tradingSymbol?.toUpperCase();
                return t === uSym || t === noSpaceSym || t === shortYearSym ||
                        tr === uSym || tr === noSpaceSym || tr === shortYearSym;
            });
            if (nfoMatch) {
                finalToken = nfoMatch.token;
                // Populate metadata for OptionChain table
                extraInfo = {
                    underlying: nfoMatch.name,
                    strike: parseFloat(nfoMatch.strike) / 100,
                    expiry: nfoMatch.expiry,
                    optionType: nfoMatch.symbol.endsWith("CE") ? "CE" : "PE"
                };
                // Cache for future use
                store.tokenToName[finalToken] = uSym;
                store.tokenToExchange[finalToken] = mappedExchange;
            }
        }

        if (!finalToken) {
            console.warn(`[HistoricalService] 🛑 Note: Token not found for symbol: ${symbol}. Master list might still be loading or symbol is invalid.`);
            return;
        }
            
            // Subscribe via Angel One WebSocket
        // Add to tracked stocks if not present
        if (!store.stocks.some(s => s.token === finalToken)) {
            store.stocks.push({ name: uSym, token: finalToken, segment: mappedExchange });
        }

        // Always attempt to subscribe/re-subscribe via Angel One WebSocket
        if (store.wsClient) {
            const exchangeTypeMap = { "NSE": 1, "NFO": 2, "BSE": 3, "BFO": 4, "MCX": 5 };
            const exchType = exchangeTypeMap[mappedExchange] || 1;
            
            // Register symbol/exchange for tick formatting
            store.tokenToName[finalToken] = uSym;
            store.tokenToExchange[finalToken] = mappedExchange;

            // Subscribe via Angel One WebSocket (Mode 3 for Full Data/OHLC)
            store.wsClient.fetchData({ 
                correlationID: `auto_add_${uSym}`, 
                action: 1, 
                mode: 3, 
                exchangeType: exchType, 
                tokens: [finalToken] 
            });
            console.log(`[HistoricalService] Force-subscribed ${uSym} (${finalToken}) on ${mappedExchange} (Mode: 3)`);
        }

        const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, formattedFromDate, formattedToDate, extraInfo, forceApi);
        // OPTIMIZATION: Map to lightweight objects. Stripping redundant strings (symbol, token, exchange, timestamp) 
        // reduces payload size by ~60%, making JSON encoding and WebSocket transfer much faster.
        const optimizedData = result.data.map(c => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume
        }));
        
        return {
            success: true,
            symbol: uSym,
            source: result.source,
            count: optimizedData.length,
            data: optimizedData
        };
    } catch (err) {
        console.error("[HistoricalService] Error:", err.message);
        throw err;
    }
}

module.exports = {
    fetchManualHistoricalData
};

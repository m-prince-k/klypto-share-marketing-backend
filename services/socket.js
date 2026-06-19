const { Server } = require("socket.io");
const fs = require('fs');
const path = require('path');
const EVENTS = require('../constants/socketEvents');
const optionChainService = require('./optionChainService');
const { formatDate, getCandlesWithCache } = require('./dbService');
const { prepareCandlesWithIndicators, withDateTime } = require('../helper');
const store = require('./marketStore');

let io;
const socketAlerts = new Map();

/**
 * Main Socket Connection Handler
 */
const connectSocket = (server) => {
    io = new Server(server, {
        cors: { origin: "*" },
        maxHttpBufferSize: 1e7, // 10MB for large historical data
        pingTimeout: 60000,     // 60 seconds ping timeout to prevent disconnects on slow connections
        pingInterval: 25000     // 25 seconds ping interval
    });

    optionChainService.init(io);

    io.on("connection", (socket) => {
        // Extract userId from frontend query or auth to join private room
        const userId = socket.handshake.query.userId || (socket.handshake.auth && socket.handshake.auth.userId) || "anonymous";
        socket.join(String(userId));
        console.log(`Client connected: ${socket.id} (User ID: ${userId})`);
        
        socketAlerts.set(socket.id, { threshold: null, interval: '5m' });

        // --- 1. INITIAL DATA EVENTS ---
        const getFormattedStocks = () => {
            return store.stocks.map(s => {
                const key = `${s.name}:${s.segment}`;
                const liveData = store.latestMarketData[key] || {};
                const ltp = parseFloat(liveData.last_traded_price || 0);
                const close = parseFloat(liveData.close_price || 0);
                const rawChange = ltp - close;
                const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
                const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";
                return {
                    ...s,
                    ltp: liveData.last_traded_price || "0.00",
                    change: changeStr,
                    percent_change: pChange,
                    sentiment: liveData.sentiment || "neutral"
                };
            });
        };

        socket.emit("msg", "this is klypto trading view");
        socket.emit("marketSnapshot", Object.values(require('./marketStore').latestMarketData));
        socket.emit(EVENTS.STOCKS_LIST, getFormattedStocks());

        socket.on(EVENTS.GET_ALL_STOCKS, () => {
            socket.emit(EVENTS.STOCKS_LIST, getFormattedStocks());
        });

        socket.on(EVENTS.GET_LIVE_TICK, async (payload) => {
            try {
                const symbol = payload?.symbol?.toUpperCase();
                console.log(`[Socket] GET_LIVE_TICK requested for symbol: ${symbol}`);
                if (!symbol) return;
                
                let cleanSymbol = symbol.endsWith('-EQ') ? symbol.replace('-EQ', '') : symbol;
                
                // Leave previous tick rooms to only subscribe to the newly selected symbol
                for (const room of socket.rooms) {
                    if (room.startsWith("tick_")) {
                        socket.leave(room);
                    }
                }
                socket.join("tick_" + cleanSymbol);
                
                const token = store.symbolToTokenMaster && (store.symbolToTokenMaster[cleanSymbol] || store.symbolToTokenMaster[`${cleanSymbol}:NSE`]);
                console.log(`[Socket] Resolved token for ${cleanSymbol}: ${token}`);
                
                // 1. FAST EMIT FROM CACHE IMMEDIATELY
                let rawTick = (store.latestMarketData && (store.latestMarketData[cleanSymbol] || store.latestMarketData[`${cleanSymbol}:NSE`])) || null;
                
                // If not in cache, we MUST fetch it from Angel One API so frontend gets at least the last known price!
                if (!rawTick && token) {
                    const smartApi = require('./smartApi');
                    try {
                        const exchange = store.tokenToExchange[token] || 'NSE';
                        const resp = await smartApi.marketData({ mode: 'FULL', exchangeTokens: { [exchange]: [token] } });
                        if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                            let apiTick = resp.data.fetched[0];
                            // Map API format to exactly match WebSocket format
                            rawTick = {
                                ...apiTick,
                                last_traded_price: apiTick.ltp || apiTick.last_traded_price || 0,
                                exchange_timestamp: apiTick.exchTradeTime || apiTick.exchange_timestamp || new Date().toISOString(),
                                last_update_time: apiTick.exchTradeTime || apiTick.last_update_time || new Date().toISOString(),
                                open: apiTick.open_price || apiTick.open || apiTick.ltp || 0,
                                high: apiTick.high_price || apiTick.high || apiTick.ltp || 0,
                                low: apiTick.low_price || apiTick.low || apiTick.ltp || 0,
                                close: apiTick.close_price || apiTick.close || apiTick.ltp || 0,
                                volume: apiTick.trade_volume || apiTick.volume || 0,
                                percent_change: apiTick.percent_change || apiTick.pChange || 0,
                                best_five_buy: (apiTick.depth && apiTick.depth.buy) ? apiTick.depth.buy : (apiTick.best5Buy || apiTick.best_five_buy || []),
                                best_five_sell: (apiTick.depth && apiTick.depth.sell) ? apiTick.depth.sell : (apiTick.best5Sell || apiTick.best_five_sell || []),
                                token: token,
                                symbol: symbol,
                                exchange: exchange
                            };
                            console.log(`[Socket] Fetched rawTick from API for ${symbol}`);
                        }
                    } catch (e) {
                        console.warn(`[Socket] GET_LIVE_TICK Angel One fetch failed for ${symbol}:`, e.message);
                    }
                }

                if (!rawTick) {
                    const fallbackExchange = store.tokenToExchange[token] || 'NSE';
                    rawTick = {
                        last_traded_price: 0,
                        open: 0, high: 0, low: 0, close: 0,
                        exchange_timestamp: new Date().toISOString(),
                        exchange: fallbackExchange,
                        best_five_buy: [],
                        best_five_sell: []
                    }; 
                }
                
                // Save to cache so webSocketService can preserve depth across Mode 2 ticks
                if (rawTick.exchange && cleanSymbol) {
                    store.latestMarketData[`${cleanSymbol}:${rawTick.exchange}`] = rawTick;
                }
                
                const candle = store.liveCandles[token] || {};
                const fallbackPrice = rawTick.last_traded_price || rawTick.close_price || rawTick.close || 0;
                
                const filterTick = {
                    "open": candle.open || rawTick.open || rawTick.open_price || fallbackPrice,
                    "high": candle.high || rawTick.high || rawTick.high_price || fallbackPrice,
                    "low": candle.low || rawTick.low || rawTick.low_price || fallbackPrice,
                    "close": candle.close || rawTick.close || rawTick.close_price || fallbackPrice,
                    "volume": candle.volume || rawTick.volume || rawTick.trade_volume || 0,
                    "datetime": rawTick.exchange_timestamp || rawTick.exchTradeTime || rawTick.last_update_time || new Date().toISOString()
                };

                const fullOverview = {
                    exchange_feed_time: rawTick.exchFeedTime || rawTick.exchange_timestamp || new Date().toISOString(),
                    exchange_trade_time: rawTick.exchTradeTime || rawTick.exchange_timestamp || new Date().toISOString(),
                    lower_circuit: rawTick.lowerCircuit || rawTick.lower_circuit || 0,
                    upper_circuit: rawTick.upperCircuit || rawTick.upper_circuit || 0,
                    fiftytwo_week_low: rawTick['52WeekLow'] || rawTick.fiftytwo_week_low || 0,
                    fiftytwo_week_high: rawTick['52WeekHigh'] || rawTick.fiftytwo_week_high || 0,
                    total_buy_quantity: rawTick.totBuyQuan || rawTick.total_buy_quantity || 0,
                    total_sell_quantity: rawTick.totSellQuan || rawTick.total_sell_quantity || 0,
                    best_five_buy: (rawTick.depth && rawTick.depth.buy) ? rawTick.depth.buy : (rawTick.best_five_buy || []),
                    best_five_sell: (rawTick.depth && rawTick.depth.sell) ? rawTick.depth.sell : (rawTick.best_five_sell || []),
                    last_trade_quantity: rawTick.lastTradeQty || rawTick.last_trade_quantity || 0,
                    volume: rawTick.tradeVolume || rawTick.volume || rawTick.total_traded_quantity || 0,
                    open_interest: rawTick.opnInterest || rawTick.open_interest || 0,
                    net_change: rawTick.netChange || rawTick.net_change || 0,
                    percent_change: rawTick.percentChange || rawTick.percent_change || 0,
                    last_traded_price: rawTick.ltp || rawTick.last_traded_price || fallbackPrice,
                    day_high: rawTick.high || rawTick.high_price_day || rawTick.high_price || fallbackPrice,
                    day_low: rawTick.low || rawTick.low_price_day || rawTick.low_price || fallbackPrice,
                    open: rawTick.open || rawTick.open_price_day || rawTick.open_price || fallbackPrice,
                    close: rawTick.close || rawTick.close_price || fallbackPrice
                };

                socket.emit(EVENTS.STRATEGY_LIVE_TICK, {
                    symbol: symbol,
                    tick: { ...filterTick, ...fullOverview },
                    raw: rawTick,
                    overview: fullOverview
                });
                console.log(`[Socket] Emitted INSTANT tick for ${symbol} with full overview.`);

                // 2. AVOID REDUNDANT WEBSOCKET SUBSCRIPTIONS
                // The global webSocketService already subscribes to equities, futures, and MCX.
                // Dynamic options/equities are handled in stockController.js
                // Sending redundant subscriptions here was causing Angel One to drop the WebSocket connection!
                if (token && store.wsClient) {
                    const actualExchange = store.tokenToExchange[token] || 'NSE';
                    const exchangeTypeMap = { "NSE": 1, "NFO": 2, "BSE": 3, "BFO": 4, "MCX": 5 };
                    const exchType = exchangeTypeMap[actualExchange] || 1;
                    
                    store.wsClient.fetchData({
                        correlationID: "live_tick_" + token,
                        action: 1, 
                        mode: 3, // FULL mode for all depth keys
                        exchangeType: exchType,
                        tokens: [token]
                    });
                    console.log(`[Socket] Added ${cleanSymbol} (${token}) to live WebSocket stream in FULL mode!`);
                }
            } catch (err) {
                console.error("[Socket] GET_LIVE_TICK Error:", err.message);
            }
        });

        socket.on(EVENTS.GET_MASTER_WATCHLIST, async () => {
            try {
                const { generateMasterWatchlistData } = require('../controllers/stockController');
                const data = await generateMasterWatchlistData();
                socket.emit(EVENTS.MASTER_WATCHLIST_RESPONSE, { success: true, data });
            } catch (err) {
                console.error("[Socket Master Watchlist] Error:", err.message);
                socket.emit(EVENTS.MASTER_WATCHLIST_RESPONSE, { success: false, error: err.message });
            }
        });

        // --- TEST ALERT TRIGGER (For USER Testing) ---
        setTimeout(() => {
            console.log(`[TestAlert] Emitting mock alert for TCS to ${socket.id}`);
            socket.emit(EVENTS.ALERT_TRIGGERED, {
                symbol: 'TCS',
                rsi: '71.20',
                ltp: '3850.40',
                type: 'CROSS_ABOVE',
                timestamp: new Date().toISOString(),
                isTest: true
            });
        }, 5000);

        // --- 2. HISTORICAL DATA EVENTS ---
        socket.on(EVENTS.GET_HISTORICAL_DATA, async (payload) => {
            try {
                const { fetchManualHistoricalData } = require('./historicalService');
                const result = await fetchManualHistoricalData(payload);
                console.log(`[Socket] Emitting HISTORICAL_DATA_RESPONSE for ${payload.symbol}: ${result.data?.length || 0} candles. Last: ${result.data?.length > 0 ? new Date(result.data[result.data.length - 1].timestamp).toLocaleString() : 'N/A'}`);
                socket.emit(EVENTS.HISTORICAL_DATA_RESPONSE, result);
            } catch (err) {
                socket.emit(EVENTS.HISTORICAL_DATA_ERROR, { success: false, error: err.message });
            }
        });

        // --- 3. TECHNICAL INDICATORS EVENTS ---
        const candleCache = new Map();

        socket.on(EVENTS.GET_INDICATOR_DETAILS, async (payload) => {
            const start = Date.now();
            try {
                const { type, symbol, interval, fromDate, toDate, fromdate, todate, exchange } = payload;
                // Normalize parameter names
                const finalFromDateInput = fromDate || fromdate;
                const finalToDateInput = toDate || todate;

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

                const uSym = symbol.toUpperCase();
                const isCommodity = uSym === "GOLD" || uSym === "SILVER";
                let finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();

                // Auto-detect NFO for options/futures
                if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
                    finalExchange = "NFO";
                }
                const mappedExchange = finalExchange;

                // Normalize dates
                let fD = finalFromDateInput, tD = finalToDateInput;
                if (typeof fD === 'string' && fD.length === 10) fD = formatDate(new Date(fD), isCommodity ? "09:00" : "09:15", finalInterval);
                if (typeof tD === 'string' && tD.length === 10) tD = formatDate(new Date(tD), isCommodity ? "23:55" : "15:30", finalInterval);

                // --- AUTOMATIC LOOKBACK FOR WARMUP (Accurate values like TradingView/AngelOne) ---
                let dynamicFrom = fD;
                if (fD) {
                    const warmupDate = new Date(fD);
                    // For minute intervals, look back 5-10 days
                    if (finalInterval.includes("MINUTE")) {
                        warmupDate.setDate(warmupDate.getDate() - 7);
                    } else if (finalInterval === "ONE_DAY") {
                        warmupDate.setDate(warmupDate.getDate() - 100);
                    } else {
                        warmupDate.setDate(warmupDate.getDate() - 30);
                    }
                    dynamicFrom = formatDate(warmupDate, isCommodity ? "09:00" : "09:15", finalInterval);
                }

                const userTopStocks = [
                    "ABB", "POWERINDIA", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIENSOL", "ABCAPITAL", "ALKEM", 
                    "AMBUJACEM", "AMBER", "ANGELONE", "APLAPOLLO", "APOLLOHOSP", "ASHOKLEY", "ASIANPAINT", "ASTRAL", 
                    "AUROPHARMA", "AUBANK", "DMART", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BAJAJHLDNG", 
                    "BANDHANBNK", "BANKBARODA", "BANKINDIA", "BHARTIARTL", "BDL", "BEL", "BHARATFORG", "INDUSTOWER", 
                    "BPCL", "BHEL", "BIOCON", "BLUESTARCO", "BOSCHLTD", "BRITANNIA", "BSE", "ZYDUSLIFE", "CANBK", "CDSL", 
                    "CHOLAFIN", "CIPLA", "COALINDIA", "COLPAL", "CAMS", "CONCOR", "CROMPTON", "CGPOWER", "CUMMINSIND", 
                    "DABUR", "DELHIVERY", "DIVISLAB", "DIXON", "DLF", "DRREDDY", "EICHERMOT", "EXIDEIND", "FEDERALBNK", 
                    "FORTIS", "NYKAA", "GAIL", "GLENMARK", "GMRAIRPORT", "GODREJCP", "GODREJPROP", "GRASIM", "HAVELLS", 
                    "HCLTECH", "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HAL", "HINDALCO", "HINDUNILVR", 
                    "HINDPETRO", "HINDZINC", "HUDCO", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDEA", "IDFCFIRSTB", 
                    "360ONE", "INDUSINDBK", "IEX", "SAMMAANCAP", "INDHOTEL", "INDIANB", "IOC", "IRFC", "IREDA", 
                    "NAUKRI", "INFY", "INOXWIND", "INDIGO", "ITC", "JINDALSTEL", "JIOFIN", "JSWENERGY", "JSWSTEEL", 
                    "JUBLFOOD", "KALYANKJIL", "KAYNES", "KEI", "KFINTECH", "KOTAKBANK", "KPITTECH", "LT", "LAURUSLABS", 
                    "LICI", "LICHSGFIN", "LTF", "LTM", "LUPIN", "LODHA", "M&M", "MANAPPURAM", "MANKIND", "MARICO", 
                    "MARUTI", "MFSL", "MAXHEALTH", "MAZDOCK", "MCX", "UNOMINDA", "MOTHERSON", "MPHASIS", "MUTHOOTFIN", 
                    "NATIONALUM", "NMDC", "NBCC", "NESTLEIND", "NHPC", "COFORGE", "NTPC", "NUVAMA", "OBEROIRLTY", 
                    "DALBHARAT", "OIL", "PAYTM", "ONGC", "OFSS", "PAGEIND", "POLICYBZR", "PERSISTENT", "PETRONET", 
                    "PGEL", "PHOENIXLTD", "PIDILITIND", "PIIND", "PPLPHARMA", "PNBHOUSING", "POLYCAB", "PFC", "POWERGRID", 
                    "PREMIERENE", "PRESTIGE", "PNB", "RVNL", "RBLBANK", "RELIANCE", "PATANJALI", "RECLTD", "SAIL", 
                    "SBICARD", "SBILIFE", "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SOLARINDS", "SONACOMS", "SRF", "SBIN", 
                    "SUNPHARMA", "SUPREMEIND", "SUZLON", "SWIGGY", "SYNGENE", "TATAELXSI", "TATACONSUM", "TMPV", 
                    "TATAPOWER", "TATASTEEL", "TATATECH", "TCS", "TECHM", "TITAN", "TORNTPHARM", "TORNTPOWER", "TRENT", 
                    "TIINDIA", "TVSMOTOR", "ULTRACEMCO", "UNIONBANK", "UPL", "UNITDSPR", "VBL", "VEDL", "VOLTAS", 
                    "WAAREEENER", "WIPRO", "YESBANK", "ETERNAL"
                ];

                let finalToken = store.symbolToTokenMaster[uSym];
                if (uSym === "GOLD") finalToken = "234454";
                if (uSym === "SILVER") finalToken = "234455";

                let extraInfo = null;

                if (!finalToken) {
                    // Try robust NFO resolution
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
                        if (nfoMatch.symbol.endsWith("CE") || nfoMatch.symbol.endsWith("PE")) {
                            extraInfo = {
                                underlying: nfoMatch.name,
                                strike: parseFloat(nfoMatch.strike) / 100,
                                expiry: nfoMatch.expiry,
                                optionType: nfoMatch.symbol.endsWith("CE") ? "CE" : "PE"
                            };
                        }
                    }
                }

                if (!finalToken) throw new Error(`Token not found for ${symbol}`);

                const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, dynamicFrom, tD, extraInfo);
                const candles = result?.data || [];

                const configPayload = { ...payload, ...(payload.body || {}) };
                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d }, configPayload);
                const finalResults = withDateTime(results);
                
                // If we had a warmup, slice the data back to user's requested fromDate
                let filteredResults = finalResults;
                if (fD && finalResults.length > 0) {
                    const startTs = new Date(fD).getTime();
                    filteredResults = finalResults.filter(r => {
                        let dtMs = typeof r.time === 'number' ? r.time : new Date(r.time).getTime();
                        if (dtMs < 100000000000) dtMs *= 1000;
                        return dtMs >= startTs;
                    });
                }

                socket.emit(EVENTS.INDICATOR_DETAILS_RESPONSE, { success: true, message: `fetched by ${type}`, data: filteredResults });
                console.log(`[Socket] ${type} calc with warmup: ${Date.now() - start}ms | Candles: ${candles.length} | Returned: ${filteredResults.length}`);
            } catch (err) {
                console.error("[Socket Indicator] Error:", err.message);
                socket.emit(EVENTS.INDICATOR_DETAILS_ERROR, { success: false, error: err.message });
            }
        });
        

        //THIS IS USED FOR LIVE EXACT CURRENT DATE INDICATGOR PLOTTING
        socket.on(EVENTS.GET_LIVE_INDICATOR, async (payload) => {
            console.log(`[Socket] Received GET_LIVE_INDICATOR request for:`, payload);
            try {
                const { type, symbol, interval, exchange } = payload; // Ignore dates for history

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

                const uSym = symbol.toUpperCase();
                const isCommodity = uSym === "GOLD" || uSym === "SILVER";
                let finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();

                // Auto-detect NFO for options/futures
                if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
                    finalExchange = "NFO";
                }
                const mappedExchange = finalExchange;

                const userTopStocks = [
                    "ABB", "POWERINDIA", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIENSOL", "ABCAPITAL", "ALKEM", 
                    "AMBUJACEM", "AMBER", "ANGELONE", "APLAPOLLO", "APOLLOHOSP", "ASHOKLEY", "ASIANPAINT", "ASTRAL", 
                    "AUROPHARMA", "AUBANK", "DMART", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BAJAJHLDNG", 
                    "BANDHANBNK", "BANKBARODA", "BANKINDIA", "BHARTIARTL", "BDL", "BEL", "BHARATFORG", "INDUSTOWER", 
                    "BPCL", "BHEL", "BIOCON", "BLUESTARCO", "BOSCHLTD", "BRITANNIA", "BSE", "ZYDUSLIFE", "CANBK", "CDSL", 
                    "CHOLAFIN", "CIPLA", "COALINDIA", "COLPAL", "CAMS", "CONCOR", "CROMPTON", "CGPOWER", "CUMMINSIND", 
                    "DABUR", "DELHIVERY", "DIVISLAB", "DIXON", "DLF", "DRREDDY", "EICHERMOT", "EXIDEIND", "FEDERALBNK", 
                    "FORTIS", "NYKAA", "GAIL", "GLENMARK", "GMRAIRPORT", "GODREJCP", "GODREJPROP", "GRASIM", "HAVELLS", 
                    "HCLTECH", "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HAL", "HINDALCO", "HINDUNILVR", 
                    "HINDPETRO", "HINDZINC", "HUDCO", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDEA", "IDFCFIRSTB", 
                    "360ONE", "INDUSINDBK", "IEX", "SAMMAANCAP", "INDHOTEL", "INDIANB", "IOC", "IRFC", "IREDA", 
                    "NAUKRI", "INFY", "INOXWIND", "INDIGO", "ITC", "JINDALSTEL", "JIOFIN", "JSWENERGY", "JSWSTEEL", 
                    "JUBLFOOD", "KALYANKJIL", "KAYNES", "KEI", "KFINTECH", "KOTAKBANK", "KPITTECH", "LT", "LAURUSLABS", 
                    "LICI", "LICHSGFIN", "LTF", "LTM", "LUPIN", "LODHA", "M&M", "MANAPPURAM", "MANKIND", "MARICO", 
                    "MARUTI", "MFSL", "MAXHEALTH", "MAZDOCK", "MCX", "UNOMINDA", "MOTHERSON", "MPHASIS", "MUTHOOTFIN", 
                    "NATIONALUM", "NMDC", "NBCC", "NESTLEIND", "NHPC", "COFORGE", "NTPC", "NUVAMA", "OBEROIRLTY", 
                    "DALBHARAT", "OIL", "PAYTM", "ONGC", "OFSS", "PAGEIND", "POLICYBZR", "PERSISTENT", "PETRONET", 
                    "PGEL", "PHOENIXLTD", "PIDILITIND", "PIIND", "PPLPHARMA", "PNBHOUSING", "POLYCAB", "PFC", "POWERGRID", 
                    "PREMIERENE", "PRESTIGE", "PNB", "RVNL", "RBLBANK", "RELIANCE", "PATANJALI", "RECLTD", "SAIL", 
                    "SBICARD", "SBILIFE", "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SOLARINDS", "SONACOMS", "SRF", "SBIN", 
                    "SUNPHARMA", "SUPREMEIND", "SUZLON", "SWIGGY", "SYNGENE", "TATAELXSI", "TATACONSUM", "TMPV", 
                    "TATAPOWER", "TATASTEEL", "TATATECH", "TCS", "TECHM", "TITAN", "TORNTPHARM", "TORNTPOWER", "TRENT", 
                    "TIINDIA", "TVSMOTOR", "ULTRACEMCO", "UNIONBANK", "UPL", "UNITDSPR", "VBL", "VEDL", "VOLTAS", 
                    "WAAREEENER", "WIPRO", "YESBANK", "ETERNAL"
                ];

                let finalToken = store.symbolToTokenMaster[uSym];
                if (uSym === "GOLD") finalToken = "234454";
                if (uSym === "SILVER") finalToken = "234455";

                let extraInfo = null;

                if (!finalToken) {
                    // Try robust NFO resolution
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
                        if (nfoMatch.symbol.endsWith("CE") || nfoMatch.symbol.endsWith("PE")) {
                            extraInfo = {
                                underlying: nfoMatch.name,
                                strike: parseFloat(nfoMatch.strike) / 100,
                                expiry: nfoMatch.expiry,
                                optionType: nfoMatch.symbol.endsWith("CE") ? "CE" : "PE"
                            };
                        }
                    }
                }

                if (!finalToken) throw new Error(`Token not found for ${symbol}`);
                
                // --- AUTO-SUBSCRIBE TO WEBSOCKET IF NOT ALREADY TRACKED ---
                if (store.wsClient && !store.liveCandles[finalToken]) {
                    console.log(`[LiveIndicator] Auto-subscribing WebSocket for ${uSym} (Token: ${finalToken}, Exchange: ${mappedExchange})`);
                    
                    // Add to mappings so formatter knows what it is
                    store.tokenToName[finalToken] = uSym;
                    store.tokenToExchange[finalToken] = mappedExchange;

                    // Action 1 = Subscribe, Mode 2 = Full (or 3 for Quote)
                    store.wsClient.fetchData({
                        correlationID: `live_ind_${uSym}_${Date.now()}`,
                        action: 1, 
                        mode: 2, 
                        exchangeType: mappedExchange === "NFO" ? 2 : (mappedExchange === "MCX" ? 5 : 1),
                        tokens: [finalToken]
                    });
                }
                // --- AUTOMATIC LOOKBACK FOR WARMUP (5 Days for 1m) ---
                let dynamicFrom = null;
                let dynamicTo = formatDate(new Date(), "15:30"); // End of current day

                if (finalInterval === "ONE_MINUTE" || finalInterval === "THREE_MINUTE" || finalInterval === "FIVE_MINUTE") {
                    const fiveDaysAgo = new Date();
                    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                    dynamicFrom = formatDate(fiveDaysAgo, "09:15");
                }

                const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, dynamicFrom, dynamicTo, extraInfo);
                let candles = result?.data || [];
                
                if (candles.length < 20) {
                    throw new Error(`Insufficient data for ${symbol}. Got ${candles.length} candles.`);
                }

                // --- MERGE LIVE CANDLE ---
                // This ensures the value matches TradingView's "forming" candle
                const live = store.liveCandles[finalToken] || store.liveCandles[uSym];
                if (live) {
                    const liveTs = new Date(live.minute || Date.now());
                    const lastCandle = candles[candles.length - 1];
                    const lastTs = new Date(lastCandle.timestamp);

                    // If live candle is newer, append it. If same minute, update the last one.
                    if (liveTs.getTime() > lastTs.getTime()) {
                        candles.push({
                            timestamp: liveTs.toISOString(),
                            time: Math.floor(liveTs.getTime() / 1000),
                            open: parseFloat(live.open),
                            high: parseFloat(live.high),
                            low: parseFloat(live.low),
                            close: parseFloat(live.close),
                            volume: parseFloat(live.volume || 0)
                        });
                    } else if (liveTs.getTime() === lastTs.getTime()) {
                        candles[candles.length - 1] = {
                            ...lastCandle,
                            close: parseFloat(live.close),
                            high: Math.max(lastCandle.high, parseFloat(live.high)),
                            low: Math.min(lastCandle.low, parseFloat(live.low)),
                        };
                    }
                }

                const configPayload = { ...payload, ...(payload.body || {}) };
                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d }, configPayload);

                if (results?.length > 0) {
                    const indKey = type.toLowerCase();
                    
                    // Search for the last record that actually has a calculated value
                    const validResult = [...results].reverse().find(r => 
                        (r[indKey] !== null && r[indKey] !== undefined) || 
                        (r[type] !== null && r[type] !== undefined) ||
                        (r.value !== null && r.value !== undefined) ||
                        (type.toUpperCase() === 'MA_RIBBON' && r.ma1 !== undefined && r.ma1 !== null) ||
                        (type.toUpperCase() === 'SSL_HYBRID' && r.baseline !== undefined && r.baseline !== null)
                    );

                    const latest = validResult || results[results.length - 1];
                    
                    let val = latest[indKey];
                    if (val === undefined || val === null) val = latest[type];
                    if (val === undefined || val === null) val = latest.value;
                    // SSL_HYBRID does not have a single scalar value — use ssl1 as representative value
                    if ((val === undefined || val === null) && type.toUpperCase() === 'SSL_HYBRID') {
                        val = latest.ssl1 ?? latest.baseline ?? 0;
                    }
                    
                    if ((val === undefined || val === null) && type.toUpperCase() !== 'MA_RIBBON') {
                        console.warn(`[LiveIndicator] ${uSym} ${type} is null even after searching history.`);
                        val = 0;
                    }

                    if (type.toUpperCase() !== 'MA_RIBBON') {
                        console.log(`[LiveIndicator] ${uSym} ${type} final value: ${parseFloat(val).toFixed(2)} (IST: ${new Date(latest.time * 1000).toLocaleTimeString()})`);
                    } else {
                        console.log(`[LiveIndicator] ${uSym} ${type} final value: ma1=${latest.ma1}, ma2=${latest.ma2} (IST: ${new Date(latest.time * 1000).toLocaleTimeString()})`);
                    }

                    const responseData = { 
                        time: Number(latest.time), 
                        receivedAt: new Date().toISOString(),
                        tickTime: latest.tickTime || (latest.time * 1000),
                        readableTickTime: latest.readableTickTime || new Date(latest.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                        value: parseFloat(val || 0),
                        [indKey]: parseFloat(val || 0),
                        [type]: parseFloat(val || 0),
                        last_traded_price: latest.close || latest.last_traded_price || 0,
                        datetime: new Date(latest.time * 1000).toLocaleString('en-IN', { 
                            timeZone: 'Asia/Kolkata', 
                            hour12: false,
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            day: '2-digit', month: '2-digit', year: 'numeric'
                        })
                    };

                    if (type.toUpperCase() === 'MA_RIBBON') {
                        responseData.ma1 = latest.ma1;
                        responseData.ma2 = latest.ma2;
                        responseData.ma3 = latest.ma3;
                        responseData.ma4 = latest.ma4;
                    }

                    // SSL_HYBRID: send all sub-fields so frontend gets full data
                    if (type.toUpperCase() === 'SSL_HYBRID') {
                        responseData.ssl1 = latest.ssl1;
                        responseData.ssl2 = latest.ssl2;
                        responseData.sslExit = latest.sslExit;
                        responseData.baseline = latest.baseline;
                        responseData.upperChannel = latest.upperChannel;
                        responseData.lowerChannel = latest.lowerChannel;
                        responseData.buySignal = latest.buySignal;
                        responseData.sellSignal = latest.sellSignal;
                        responseData.atr = latest.atr;
                        responseData.riskLevel = latest.riskLevel;
                    }

                    socket.emit(EVENTS.LIVE_INDICATOR_RESPONSE, {
                        success: true,
                        symbol: uSym,
                        type,
                        data: [responseData]
                    });

                    // --- TRACK SUBSCRIPTION FOR LIVE UPDATES ---
                    if (!store.indicatorSubscriptions.has(socket.id)) {
                        store.indicatorSubscriptions.set(socket.id, new Map());
                    }
                    const socketSubs = store.indicatorSubscriptions.get(socket.id);
                    const reqId = payload.id || JSON.stringify(payload.body || payload.length || 'default');
                    socketSubs.set(`${uSym}_${type}_${finalInterval}_${reqId}`, {
                        ...payload, // Preserve all parameters (length, source, etc.)
                        symbol: uSym,
                        token: finalToken,
                        type,
                        interval: finalInterval,
                        exchange: mappedExchange,
                        extraInfo
                    });
                } else {
                    throw new Error(`Calculation failed for ${type} on ${symbol}`);
                }
            } catch (err) {
                console.error("[Socket Live Indicator] Error:", err.message);
                socket.emit(EVENTS.INDICATOR_DETAILS_ERROR, { success: false, error: err.message });
            }
        });

        // --- 3.5 DYNAMIC INDICATOR UPDATE ---
        socket.on(EVENTS.UPDATE_INDICATOR, async (payload) => {
            const start = Date.now();
            try {
                const { symbol, type, interval, exchange } = payload;
                if (!symbol || !type) throw new Error("Symbol and type are required");

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

                const uSym = symbol.toUpperCase();
                const isCommodity = uSym === "GOLD" || uSym === "SILVER";
                let finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();

                if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
                    finalExchange = "NFO";
                }

                const userTopStocks = [
                    "ABB", "POWERINDIA", "ADANIENT", "ADANIGREEN", "ADANIPORTS", "ADANIENSOL", "ABCAPITAL", "ALKEM", 
                    "AMBUJACEM", "AMBER", "ANGELONE", "APLAPOLLO", "APOLLOHOSP", "ASHOKLEY", "ASIANPAINT", "ASTRAL", 
                    "AUROPHARMA", "AUBANK", "DMART", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BAJAJHLDNG", 
                    "BANDHANBNK", "BANKBARODA", "BANKINDIA", "BHARTIARTL", "BDL", "BEL", "BHARATFORG", "INDUSTOWER", 
                    "BPCL", "BHEL", "BIOCON", "BLUESTARCO", "BOSCHLTD", "BRITANNIA", "BSE", "ZYDUSLIFE", "CANBK", "CDSL", 
                    "CHOLAFIN", "CIPLA", "COALINDIA", "COLPAL", "CAMS", "CONCOR", "CROMPTON", "CGPOWER", "CUMMINSIND", 
                    "DABUR", "DELHIVERY", "DIVISLAB", "DIXON", "DLF", "DRREDDY", "EICHERMOT", "EXIDEIND", "FEDERALBNK", 
                    "FORTIS", "NYKAA", "GAIL", "GLENMARK", "GMRAIRPORT", "GODREJCP", "GODREJPROP", "GRASIM", "HAVELLS", 
                    "HCLTECH", "HDFCAMC", "HDFCBANK", "HDFCLIFE", "HEROMOTOCO", "HAL", "HINDALCO", "HINDUNILVR", 
                    "HINDPETRO", "HINDZINC", "HUDCO", "ICICIBANK", "ICICIGI", "ICICIPRULI", "IDEA", "IDFCFIRSTB", 
                    "360ONE", "INDUSINDBK", "IEX", "SAMMAANCAP", "INDHOTEL", "INDIANB", "IOC", "IRFC", "IREDA", 
                    "NAUKRI", "INFY", "INOXWIND", "INDIGO", "ITC", "JINDALSTEL", "JIOFIN", "JSWENERGY", "JSWSTEEL", 
                    "JUBLFOOD", "KALYANKJIL", "KAYNES", "KEI", "KFINTECH", "KOTAKBANK", "KPITTECH", "LT", "LAURUSLABS", 
                    "LICI", "LICHSGFIN", "LTF", "LTM", "LUPIN", "LODHA", "M&M", "MANAPPURAM", "MANKIND", "MARICO", 
                    "MARUTI", "MFSL", "MAXHEALTH", "MAZDOCK", "MCX", "UNOMINDA", "MOTHERSON", "MPHASIS", "MUTHOOTFIN", 
                    "NATIONALUM", "NMDC", "NBCC", "NESTLEIND", "NHPC", "COFORGE", "NTPC", "NUVAMA", "OBEROIRLTY", 
                    "DALBHARAT", "OIL", "PAYTM", "ONGC", "OFSS", "PAGEIND", "POLICYBZR", "PERSISTENT", "PETRONET", 
                    "PGEL", "PHOENIXLTD", "PIDILITIND", "PIIND", "PPLPHARMA", "PNBHOUSING", "POLYCAB", "PFC", "POWERGRID", 
                    "PREMIERENE", "PRESTIGE", "PNB", "RVNL", "RBLBANK", "RELIANCE", "PATANJALI", "RECLTD", "SAIL", 
                    "SBICARD", "SBILIFE", "SHREECEM", "SHRIRAMFIN", "SIEMENS", "SOLARINDS", "SONACOMS", "SRF", "SBIN", 
                    "SUNPHARMA", "SUPREMEIND", "SUZLON", "SWIGGY", "SYNGENE", "TATAELXSI", "TATACONSUM", "TMPV", 
                    "TATAPOWER", "TATASTEEL", "TATATECH", "TCS", "TECHM", "TITAN", "TORNTPHARM", "TORNTPOWER", "TRENT", 
                    "TIINDIA", "TVSMOTOR", "ULTRACEMCO", "UNIONBANK", "UPL", "UNITDSPR", "VBL", "VEDL", "VOLTAS", 
                    "WAAREEENER", "WIPRO", "YESBANK", "ETERNAL"
                ];

                let finalToken = store.symbolToTokenMaster[uSym];
                if (uSym === "GOLD") finalToken = "234454";
                if (uSym === "SILVER") finalToken = "234455";
                let extraInfo = null;

                if (!finalToken) {
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
                        if (nfoMatch.symbol.endsWith("CE") || nfoMatch.symbol.endsWith("PE")) {
                            extraInfo = {
                                underlying: nfoMatch.name,
                                strike: parseFloat(nfoMatch.strike) / 100,
                                expiry: nfoMatch.expiry,
                                optionType: nfoMatch.symbol.endsWith("CE") ? "CE" : "PE"
                            };
                        }
                    }
                }

                if (!finalToken) throw new Error(`Token not found for ${symbol}`);

                // --- SMART DATE HANDLING (User Dates + Warmup) ---
                const fD = payload.fromDate || payload.fromdate;
                const tD = payload.toDate || payload.todate;

                let formattedFromDate = fD;
                let formattedToDate = tD;

                if (fD && fD.length === 10) {
                    formattedFromDate = formatDate(new Date(fD), isCommodity ? "09:00" : "09:15", finalInterval);
                }
                if (tD && tD.length === 10) {
                    formattedToDate = formatDate(new Date(tD), isCommodity ? "23:55" : "15:30", finalInterval);
                }

                // If no dates provided, fallback to last 5 days
                if (!formattedFromDate) {
                    const fiveDaysAgo = new Date();
                    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                    formattedFromDate = formatDate(fiveDaysAgo, "09:15", finalInterval);
                }
                if (!formattedToDate) {
                    formattedToDate = formatDate(new Date(), isCommodity ? "23:55" : "15:30", finalInterval);
                }

                // --- AUTOMATIC LOOKBACK FOR WARMUP ---
                let dynamicFrom = formattedFromDate;
                if (formattedFromDate) {
                    const warmupDate = new Date(formattedFromDate);
                    if (finalInterval.includes("MINUTE")) warmupDate.setDate(warmupDate.getDate() - 7);
                    else if (finalInterval === "ONE_DAY") warmupDate.setDate(warmupDate.getDate() - 100);
                    else warmupDate.setDate(warmupDate.getDate() - 30);
                    dynamicFrom = formatDate(warmupDate, isCommodity ? "09:00" : "09:15", finalInterval);
                }

                const result = await getCandlesWithCache(uSym, finalToken, finalExchange, finalInterval, dynamicFrom, formattedToDate, extraInfo);
                const candles = result?.data || [];
                
                if (candles.length < 2) throw new Error("Insufficient data");
                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d }, payload);

                // Update the subscription so the live broadcast loop uses these NEW parameters
                if (!store.indicatorSubscriptions.has(socket.id)) {
                    store.indicatorSubscriptions.set(socket.id, new Map());
                }
                const socketSubs = store.indicatorSubscriptions.get(socket.id);
                const subKey = payload.id || `${uSym}_${type}_${finalInterval}`;
                
                socketSubs.set(subKey, {
                    ...payload,
                    symbol: uSym,
                    token: finalToken,
                    type: type,
                    interval: finalInterval,
                    exchange: finalExchange,
                    lastEmit: Date.now()
                });

                const finalResults = withDateTime(results);

                const latest = finalResults[finalResults.length - 1] || {};
                const indKey = type.toLowerCase();
                const val = latest[indKey] ?? latest[type] ?? latest.value ?? 0;

                // Slice result back to requested range (remove warmup data)
                let filteredResults = finalResults;
                if (formattedFromDate && Array.isArray(finalResults) && finalResults.length > 0) {
                    const startTs = new Date(formattedFromDate).getTime();
                    filteredResults = finalResults.filter(r => {
                        let dtMs = typeof r.time === 'number' ? r.time : new Date(r.time).getTime();
                        if (dtMs < 100000000000) dtMs *= 1000;
                        return dtMs >= startTs;
                    });
                }

                console.log(`[Socket] ${type} update success: ${Date.now() - start}ms | Val: ${val} | Returned: ${filteredResults.length}`);

                const responseData = {
                    success: true,
                    symbol: uSym,
                    type: type,
                    message: "Indicator parameters updated",
                    value: parseFloat(val || 0),
                    [indKey]: parseFloat(val || 0),
                    [type]: parseFloat(val || 0),
                    time: latest.time,
                    data: filteredResults
                };

                if (type.toUpperCase() === 'MA_RIBBON') {
                    responseData.ma1 = latest.ma1;
                    responseData.ma2 = latest.ma2;
                    responseData.ma3 = latest.ma3;
                    responseData.ma4 = latest.ma4;
                }

                socket.emit(EVENTS.UPDATE_INDICATOR_RESPONSE, responseData);

            } catch (err) {
                console.error("[Socket Update Indicator] Error:", err.message);
                socket.emit(EVENTS.UPDATE_INDICATOR_RESPONSE, { success: false, error: err.message });
            }
        });


        // --- 4. SCANNER & ALERT EVENTS ---
        socket.on(EVENTS.GET_RSI_SCANNER, async (payload) => {
            try {
                const { rsi_threshold = 60, interval = '5m' } = payload;
                const { calculateRSIIndicator } = require('../Indicators/rsi-indicator');
                const { Candle } = require('../models');
                const store = require('./marketStore');

                const intervalMap = { "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY" };
                const dbInterval = intervalMap[interval] || "FIVE_MINUTE";
                const results = [];

                for (const stock of store.stocks.slice(0, 50)) {
                    const dbCandles = await Candle.findAll({
                        where: { symbol: stock.name, interval: dbInterval },
                        order: [['timestamp', 'DESC']],
                        limit: 30
                    });

                    let candles = dbCandles.map(c => c.toJSON()).reverse();

                    // Merge live candle for real-time scanner accuracy
                    const live = store.liveCandles[stock.token];
                    if (live && interval === "5m") { // Scanner mostly uses 5m, adjust if needed
                        const liveTs = new Date(live.minute);
                        const lastCandle = candles[candles.length - 1];
                        if (!lastCandle || liveTs.getTime() > new Date(lastCandle.timestamp).getTime()) {
                            candles.push({
                                ...live,
                                timestamp: liveTs,
                                close: parseFloat(live.close)
                            });
                        } else if (liveTs.getTime() === new Date(lastCandle.timestamp).getTime()) {
                            candles[candles.length - 1] = { ...lastCandle, ...live, close: parseFloat(live.close) };
                        }
                    }

                    if (candles.length >= 15) {
                        const rsiVals = await calculateRSIIndicator(candles.map(c => ({ close: parseFloat(c.close) })), 14);
                        if (rsiVals.length >= 2) {
                            const currentRSI = rsiVals[rsiVals.length - 1]?.rsi;
                            const prevRSI = rsiVals[rsiVals.length - 2]?.rsi;
                            const threshold = parseFloat(rsi_threshold);

                            if (currentRSI > threshold && prevRSI <= threshold) {
                                results.push({
                                    symbol: stock.name,
                                    rsi: currentRSI.toFixed(2),
                                    ltp: parseFloat(candles[0].close).toFixed(2),
                                    type: 'CROSS_ABOVE'
                                });
                            }
                        }
                    }
                }
                socket.emit(EVENTS.RSI_SCANNER_RESPONSE, { success: true, data: results });
            } catch (err) {
                socket.emit(EVENTS.RSI_SCANNER_ERROR, { success: false });
            }
        });

        socket.on(EVENTS.SET_RSI_ALERT, (payload) => {
            socketAlerts.set(socket.id, { threshold: parseFloat(payload.rsi_threshold), interval: payload.interval || '5m' });
            console.log(`[Alert] Active for ${socket.id}`);
        });

        // --- 5. OPTION CHAIN EVENTS ---
        socket.on(EVENTS.SUBSCRIBE_OPTION_CHAIN, (payload) => {
            optionChainService.subscribe(socket, payload);
        });

        socket.on(EVENTS.UNSUBSCRIBE_OPTION_CHAIN, () => {
            optionChainService.unsubscribe(socket.id);
        });

        // --- 6. BACKTEST DASHBOARD EVENTS ---
        socket.on(EVENTS.GET_BACKTEST_DASHBOARD, async (payload) => {
            try {
                const backtestService = require('./backtestService');
                let trades = await backtestService.getTradesFromDB();
                
                const { symbol, initialCapital = 10000, riskFreeRate = 0.05 } = payload || {};
                
                if (symbol) {
                    const symbolTarget = symbol.toUpperCase();
                    trades = trades.filter(t => t.symbol.toUpperCase() === symbolTarget);
                }

                const metrics = backtestService.calculateBacktestMetrics(trades, Number(initialCapital), Number(riskFreeRate));

                socket.emit(EVENTS.BACKTEST_DASHBOARD_RESPONSE, {
                    success: true,
                    data: metrics
                });
            } catch (err) {
                console.error("[Socket Backtest Dashboard] Error:", err.message);
                socket.emit(EVENTS.BACKTEST_DASHBOARD_RESPONSE, { success: false, error: err.message });
            }
        });

        // --- 7. CLEANUP ---
        socket.on("disconnect", () => {
            const store = require('./marketStore');
            console.log(`[Socket] Client disconnected: ${socket.id}`);
            store.indicatorSubscriptions.delete(socket.id);
            socketAlerts.delete(socket.id);
            optionChainService.unsubscribe(socket.id);
        });
    });
};

/**
 * Background Auto-Scanner (Runs every 10 seconds)
 */
setInterval(async () => {
    if (socketAlerts.size === 0) return;
    const { calculateRSIIndicator } = require('../Indicators/rsi-indicator');
    const { Candle } = require('../models');
    const store = require('./marketStore');

    for (const [socketId, config] of socketAlerts.entries()) {
        if (!config.threshold) continue;
        try {
            const socket = io.sockets.sockets.get(socketId);
            if (!socket) { socketAlerts.delete(socketId); continue; }

            const results = [];
            const dbInt = { "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY" }[config.interval] || "FIVE_MINUTE";

            for (const stock of store.stocks.slice(0, 50)) {
                const dbCandles = await Candle.findAll({
                    where: { symbol: stock.name, interval: dbInt },
                    order: [['timestamp', 'DESC']],
                    limit: 25
                });

                let candles = dbCandles.map(c => c.toJSON()).reverse();

                // Merge live candle for real-time alert accuracy
                const live = store.liveCandles[stock.token];
                if (live && (config.interval === "1m" || config.interval === "5m")) {
                    const liveTs = new Date(live.minute);
                    const lastCandle = candles[candles.length - 1];
                    if (!lastCandle || liveTs.getTime() > new Date(lastCandle.timestamp).getTime()) {
                        candles.push({
                            ...live,
                            timestamp: liveTs,
                            close: parseFloat(live.close)
                        });
                    } else if (liveTs.getTime() === new Date(lastCandle.timestamp).getTime()) {
                        candles[candles.length - 1] = { ...lastCandle, ...live, close: parseFloat(live.close) };
                    }
                }

                if (candles.length >= 15) {
                    const rsiVals = await calculateRSIIndicator(candles.map(c => ({ close: parseFloat(c.close) })), 14);
                    if (rsiVals.length >= 2) {
                        const currentRSI = rsiVals[rsiVals.length - 1]?.rsi;
                        const prevRSI = rsiVals[rsiVals.length - 2]?.rsi;
                        const threshold = config.threshold;

                        if (currentRSI > threshold && prevRSI <= threshold) {
                            results.push({
                                symbol: stock.name,
                                rsi: currentRSI.toFixed(2),
                                ltp: parseFloat(candles[candles.length - 1].close).toFixed(2),
                                type: 'CROSS_ABOVE',
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }
            if (results.length > 0) {
                results.forEach(alert => {
                    socket.emit(EVENTS.ALERT_TRIGGERED, alert);
                });
                socket.emit(EVENTS.RSI_SCANNER_RESPONSE, { success: true, data: results, isAuto: true });
            }
        } catch (err) { }
    }
}, 10000);

const startGoldBroadcast = () => {
    const { fetchGoldHistory } = require('./commodityService');
    const broadcast = async () => {
        if (!io) return;
        
        // MCX Market Hours Check (9:00 AM to 11:30 PM/23:30)
        const now = new Date();
        const hr = now.getHours();
        const min = now.getMinutes();
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const timeVal = hr + min / 60;
        if (isWeekend || timeVal < 9.0 || timeVal > 15.5) {
            return; // Skip polling when MCX is closed to prevent 403 errors
        }

        try {
            // Fetch last 1 day of 1m data for Gold
            const results = await fetchGoldHistory("1m", 1);
            if (results?.length > 0) {
                const goldData = results.find(r => r.name === 'GOLD');
                if (goldData && goldData.data.length > 0) {
                    const lastCandle = goldData.data[goldData.data.length - 1];
                    // Format for chart: { time, open, high, low, close }
                    const formattedTickForChart = {
                        symbol: "GOLD",
                        data: {
                            time: Math.floor(new Date(lastCandle.timestamp).getTime() / 1000),
                            open: parseFloat(lastCandle.open),
                            high: parseFloat(lastCandle.high),
                            low: parseFloat(lastCandle.low),
                            close: parseFloat(lastCandle.close),
                        }
                    };
                    io.emit(EVENTS.GOLD_UPDATE, formattedTickForChart);
 
                    // Update store so AlertService and dbService can see the live candle
                    const goldToken = goldData.token;
                    const liveData = {
                        open: parseFloat(lastCandle.open),
                        high: parseFloat(lastCandle.high),
                        low: parseFloat(lastCandle.low),
                        close: parseFloat(lastCandle.close),
                        volume: 0,
                        minute: lastCandle.timestamp
                    };
                    store.liveCandles["GOLD"] = liveData;
                    store.liveCandles[goldToken] = liveData;

                    // Trigger Alert Scanner with real numeric token
                    const alertService = require('./alertService');
                    alertService.checkAlerts({
                        token: goldToken,
                        symbol: "GOLD",
                        last_traded_price: Number(lastCandle.close)
                    });

                    // Persistent Save to DB is DISABLED for GOLD/MCX as per user request
                }
            }
        } catch (err) {
            console.error("[GoldBroadcast] Error:", err.message);
        }
    };
    setInterval(broadcast, 5000);
};

const indicatorCandleCache = new Map(); // Map<subKey, { candles, lastFetch }>

const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

const handleIndicatorBroadcast = async (tick) => {
    const store = require('./marketStore');
    if (!io || !store.indicatorSubscriptions || store.indicatorSubscriptions.size === 0) return;

    const { prepareCandlesWithIndicators } = require('../helper');
    const { getCandlesWithCache, formatDate } = require('./dbService');

    const cleanToken = String(tick.token).replace(/\"/g, "").trim();
    const tickSymbol = tick.symbol;

    for (const [socketId, subs] of store.indicatorSubscriptions.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
            store.indicatorSubscriptions.delete(socketId);
            continue;
        }

        for (const [subKey, sub] of subs.entries()) {
            // Match by token or symbol
            if (sub.token === cleanToken || sub.symbol === tickSymbol) {
                try {
                    const now = Date.now();

                    // --- INTERVAL-BASED THROTTLING ---
                    // Only emit when a new candle would have started for the subscribed interval
                    const intervalMinutesMap = {
                        "ONE_MINUTE": 1, "THREE_MINUTE": 3, "FIVE_MINUTE": 5,
                        "TEN_MINUTE": 10, "FIFTEEN_MINUTE": 15, "THIRTY_MINUTE": 30,
                        "ONE_HOUR": 60, "ONE_DAY": 1440
                    };
                    const intervalMs = (intervalMinutesMap[sub.interval] || 1) * 60 * 1000;
                    const currentIntervalBucket = Math.floor(now / intervalMs);
                    
                    // Skip if we already emitted for this interval bucket
                    if (sub.lastIntervalBucket === currentIntervalBucket) continue;
                    sub.lastIntervalBucket = currentIntervalBucket;
                    sub.lastEmit = now;
                    
                    console.log(`[IndicatorMatch] New interval tick for ${tickSymbol} (${sub.interval}) - Socket: ${socketId}`);

                    // --- AUTOMATIC LOOKBACK FOR WARMUP ---
                    let dynamicFrom = null;
                    let dynamicTo = formatDate(new Date(), "15:30");
                    if (sub.interval === "ONE_MINUTE" || sub.interval === "THREE_MINUTE" || sub.interval === "FIVE_MINUTE") {
                        const fiveDaysAgo = new Date();
                        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                        dynamicFrom = formatDate(fiveDaysAgo, "09:15");
                    }

                    let candles = [];
                    const candleCacheKey = `${sub.symbol}_${sub.interval}`;
                    const cacheEntry = indicatorCandleCache.get(candleCacheKey);
                    const nowTs = Date.now();

                    if (cacheEntry && (nowTs - cacheEntry.lastFetch < 30000)) {
                        candles = [...cacheEntry.candles];
                    } else {
                        // Mark as fetching immediately to prevent promise explosion on rapid ticks
                        indicatorCandleCache.set(candleCacheKey, { candles: cacheEntry ? cacheEntry.candles : [], lastFetch: nowTs });
                        
                        const result = await getCandlesWithCache(sub.symbol, sub.token, sub.exchange, sub.interval, dynamicFrom, dynamicTo, sub.extraInfo);
                        candles = result?.data || [];
                        indicatorCandleCache.set(candleCacheKey, { candles: [...candles], lastFetch: Date.now() });
                    }

                    
                    if (candles.length < 15) {
                        console.warn(`[LivePush] ${sub.symbol} has only ${candles.length} candles. Indicator ${sub.type} might be 0/null.`);
                    }
                    
                    // Note: Live merge is now handled internally by getCandlesWithCache in dbService.js

                    const indType = (sub.type || "RSI").toUpperCase();
                    const configSub = { ...sub, ...(sub.body || {}) };
                    const indResults = await prepareCandlesWithIndicators(indType, candles, { json: d => d, send: d => d }, configSub);
                    if (indResults && indResults.length > 0) {
                        const latest = indResults[indResults.length - 1];
                        const indKey = sub.type.toLowerCase();
                        let val = latest[indKey] ?? latest[sub.type] ?? latest.value;
                        // SSL_HYBRID fix: use ssl1 as the scalar representative value
                        if ((val === undefined || val === null) && indType === 'SSL_HYBRID') {
                            val = latest.ssl1 ?? latest.baseline ?? 0;
                        }
                        val = val ?? 0;

                        const livePushData = { 
                            ...latest, // Send all calculated keys (macd, histogram, upper, lower, ssl1, baseline, etc.)
                            time: Number(latest.time), 
                            receivedAt: new Date().toISOString(),
                            tickTime: latest.tickTime || (latest.time * 1000),
                            readableTickTime: latest.readableTickTime || new Date(latest.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                            value: parseFloat(val),
                            [indKey]: parseFloat(val),
                            [sub.type]: parseFloat(val),
                            last_traded_price: latest.close || 0,
                            datetime: latest.datetime
                        };

                        socket.emit(EVENTS.LIVE_INDICATOR_RESPONSE, {
                            success: true,
                            symbol: sub.symbol,
                            type: sub.type,
                            isLivePush: true,
                            isLive: true,
                            data: [livePushData]
                        });
                    }
                } catch (err) {
                    // Silently fail for live push to avoid log flooding
                }
            }
        }
    }
};

module.exports = { connectSocket, getIO, startGoldBroadcast, handleIndicatorBroadcast };
const { Server } = require("socket.io");
const EVENTS = require('../constants/socketEvents');
const optionChainService = require('./optionChainService');

let io;
const socketAlerts = new Map();

/**
 * Main Socket Connection Handler
 */
const connectSocket = (server) => {
    io = new Server(server, {
        cors: { origin: "*" },
        maxHttpBufferSize: 1e7 // 10MB for large historical data
    });

    optionChainService.init(io);

    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);
        socketAlerts.set(socket.id, { threshold: null, interval: '5m' });

        // --- 1. INITIAL DATA EVENTS ---
        const getFormattedStocks = () => {
            const store = require('./marketStore');
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
                const { type, symbol, interval, fromDate, toDate, exchange } = payload;
                const { prepareCandlesWithIndicators, withDateTime } = require('../helper');
                const { formatDate, getCandlesWithCache } = require('./dbService');
                const store = require('./marketStore');

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

                // Normalize dates
                let fD = fromDate, tD = toDate;
                if (typeof fD === 'string' && fD.length === 10) fD = formatDate(new Date(fD), isCommodity ? "09:00" : "09:15", finalInterval);
                if (typeof tD === 'string' && tD.length === 10) tD = formatDate(new Date(tD), isCommodity ? "23:55" : "15:30", finalInterval);

                const uSym = symbol.toUpperCase();
                const isCommodity = uSym === "GOLD" || uSym === "SILVER";
                let finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();

                // Auto-detect NFO for options/futures
                if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
                    finalExchange = "NFO";
                }
                const mappedExchange = finalExchange;

                const topStocksMap = {
                    "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
                    "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
                    "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
                    "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
                    "GOLD": "234454", "SILVER": "234455"
                };

                let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
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

                const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, fD, tD, extraInfo);
                const candles = result?.data;

                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d });
                const finalResults = withDateTime(results);
                socket.emit(EVENTS.INDICATOR_DETAILS_RESPONSE, { success: true, message: `fetched by ${type}`, data: finalResults });
                console.log(`[Socket] ${type} calc: ${Date.now() - start}ms`);
            } catch (err) {
                console.error("[Socket Indicator] Error:", err.message);
                socket.emit(EVENTS.INDICATOR_DETAILS_ERROR, { success: false, error: err.message });
            }
        });
        
        socket.on(EVENTS.UPDATE_INDICATOR, async (payloadData) => {
            const start = Date.now();
            try {
                const { symbol, interval, fromDate, fromdate, toDate, todate, exchange, body } = payloadData;
                const { indicatorEngine } = require('../helper');
                const { formatDate, getCandlesWithCache } = require('./dbService');
                const store = require('./marketStore');

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

                const finalFromDate = fromdate || fromDate;
                const finalToDate = todate || toDate;

                const uSym = symbol.toUpperCase();
                const isCommodity = uSym === "GOLD" || uSym === "SILVER";
                let finalExchange = (exchange || (isCommodity ? "MCX" : "NSE")).toUpperCase();
                
                // Auto-detect NFO for options/futures
                if (finalExchange === "NSE" && (uSym.endsWith("CE") || uSym.endsWith("PE") || uSym.includes("FUT"))) {
                    finalExchange = "NFO";
                }
                const mappedExchange = finalExchange;

                let formattedFromDate = finalFromDate;
                let formattedToDate = finalToDate;
                if (typeof finalFromDate === 'string' && finalFromDate.length === 10) {
                    formattedFromDate = formatDate(new Date(finalFromDate), isCommodity ? "09:00" : "09:15", finalInterval);
                }
                if (typeof finalToDate === 'string' && finalToDate.length === 10) {
                    formattedToDate = formatDate(new Date(finalToDate), isCommodity ? "23:55" : "15:30", finalInterval);
                }

                const topStocksMap = {
                    "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
                    "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
                    "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
                    "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
                    "GOLD": "234454", "SILVER": "234455"
                };
                
                let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
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

                const candleResult = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, formattedFromDate, formattedToDate, extraInfo);
                const candles = candleResult?.data || [];

                const configBody = body || {};
                const type = configBody.type || "RSI";
                let enginePayload = { type };

                switch (type) {
                    case "RSI":
                        enginePayload = {
                            type,
                            source: configBody.source || "close",
                            length: configBody.length || 14,
                            maType: configBody.maType || "SMA",
                            maLength: configBody.maLength || 14,
                            bbStdDev: configBody.bbStdDev || 2
                        };
                        break;
                    case "VWMA":
                        enginePayload = {
                            type,
                            period: configBody.period || 20,
                            priceKey: configBody.priceKey || "close",
                            volumeKey: configBody.volumeKey || "volume"
                        };
                        break;
                    case "EMA":
                        enginePayload = {
                            type,
                            source: configBody.source || "close",
                            length: configBody.length || 9,
                            offset: configBody.offset || 0,
                            maLength: configBody.maLength || 14,
                            maType: configBody.maType || "none"
                        };
                        break;
                    case "SMA":
                        enginePayload = {
                            type,
                            source: configBody.source || "close",
                            length: configBody.length || 9,
                            offset: configBody.offset || 0,
                            maType: configBody.maType || "none",
                            maLength: configBody.maLength || "none",
                            bbStdDev: configBody.bbStdDev || 2
                        };
                        break;
                    case "BB":
                        enginePayload = {
                            type,
                            source: configBody.source || "close",
                            length: configBody.length || 20,
                            maType: configBody.maType || "SMA",
                            stdDev: configBody.stdDev || 2,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "BBW":
                        enginePayload = {
                            type,
                            length: configBody.length || 20,
                            bbMult: configBody.bbMult || 2,
                            maType: configBody.maType || "SMA"
                        };
                        break;
                    case "VWAP":
                        enginePayload = {
                            type,
                            source: configBody.source || "close",
                            anchor: configBody.anchor || "Session",
                            offset: configBody.offset || 0
                        };
                        break;
                    case "ATR":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            smoothing: configBody.smoothing || "RMA"
                        };
                        break;
                    case "TR":
                    case "MACD":
                        enginePayload = {
                            type,
                            fastLength: configBody.fastLength || 12,
                            slowLength: configBody.slowLength || 26,
                            source: configBody.source || "close",
                            signalSmoothing: configBody.signalSmoothing || 9,
                            oscillatorMaType: configBody.oscillatorMaType || "EMA",
                            signalLineMaType: configBody.signalLineMaType || "EMA"
                        };
                        break;
                    case "SUPERTREND":
                        enginePayload = {
                            type,
                            atrPeriod: configBody.atrPeriod || 10,
                            atrMultiplier: configBody.atrMultiplier || 3
                        };
                        break;
                    case "CHOP":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "DONCHIAN":
                        enginePayload = {
                            type,
                            length: configBody.length || 20,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "KDJ":
                        enginePayload = {
                            type,
                            length: configBody.length || 9,
                            signal1: configBody.signal1 || 3,
                            signal2: configBody.signal2 || 3
                        };
                        break;
                    case "STOCH":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            k: configBody.k || 1,
                            d: configBody.d || 3
                        };
                        break;
                    case "ADX":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            smoothing: configBody.smoothing || 14
                        };
                        break;
                    case "BOP":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "OBV":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "CCI":
                        enginePayload = {
                            type,
                            length: configBody.length || 20,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "TRIX":
                        enginePayload = {
                            type,
                            length: configBody.length || 18,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "UO":
                        enginePayload = {
                            type,
                            short: configBody.short || 7,
                            medium: configBody.medium || 14,
                            long: configBody.long || 28
                        };
                        break;
                    case "MFI":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "Aroon":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "ZLSMA":
                        enginePayload = {
                            type,
                            length: configBody.length || 50,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "HMA":
                        enginePayload = {
                            type,
                            length: configBody.length || 9,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "DPO":
                        enginePayload = {
                            type,
                            length: configBody.length || 21,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "Keltner":
                        enginePayload = {
                            type,
                            length: configBody.length || 20,
                            multiplier: configBody.multiplier || 1,
                            source: configBody.source || "close",
                            useTrueRange: configBody.useTrueRange || true
                        };
                        break;
                    case "PPO":
                        enginePayload = {
                            type,
                            fastLength: configBody.fastLength || 12,
                            slowLength: configBody.slowLength || 26,
                            signalSmoothing: configBody.signalSmoothing || 9,
                            source: configBody.source || "close",
                            maType: configBody.maType || "EMA"
                        };
                        break;
                    case "WilliamsR":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "RVI":
                        enginePayload = {
                            type,
                            length: configBody.length || 10,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "StochRSI":
                        enginePayload = {
                            type,
                            lengthRSI: configBody.lengthRSI || 14,
                            lengthStoch: configBody.lengthStoch || 14,
                            smoothK: configBody.smoothK || 3,
                            smoothD: configBody.smoothD || 3,
                            source: configBody.source || "close"
                        };
                        break;
                    case "ChandeMO":
                        enginePayload = {
                            type,
                            length: configBody.length || 9,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "CoppockCurve":
                        enginePayload = {
                            type,
                            wmaLength: configBody.wmaLength || 10,
                            rocLongLength: configBody.rocLongLength || 14,
                            rocShortLength: configBody.rocShortLength || 11,
                            source: configBody.source || "close"
                        };
                        break;
                    case "ROC":
                        enginePayload = {
                            type,
                            length: configBody.length || 9,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "SSL_Hybrid":
                        enginePayload = {
                            type,
                            showBaseline: configBody.showBaseline !== undefined ? configBody.showBaseline : true,
                            showSSL1: configBody.showSSL1 !== undefined ? configBody.showSSL1 : false,
                            showATR: configBody.showATR !== undefined ? configBody.showATR : false,
                            maType: configBody.maType || "HMA",
                            len: configBody.len || 60,
                            ssl1Type: configBody.ssl1Type || "EMA",
                            ssl1Len: configBody.ssl1Len || 5,
                            ssl2Type: configBody.ssl2Type || "JMA",
                            ssl2Len: configBody.ssl2Len || 5,
                            atrLen: configBody.atrLen || 14,
                            atrMult: configBody.atrMult || 0.2
                        };
                        break;
                    case "WAVE_TREND":
                        enginePayload = {
                            type,
                            channelLen: configBody.channelLen || 10,
                            averageLen: configBody.averageLen || 21,
                            maLength: configBody.maLength || 4
                        };
                        break;
                    case "SQUEEZE":
                        enginePayload = {
                            type,
                            bbLength: configBody.bbLength || 20,
                            bbMult: configBody.bbMult || 2.0,
                            kcLength: configBody.kcLength || 20,
                            kcMult: configBody.kcMult || 1.5,
                            useTrueRange: configBody.useTrueRange !== undefined ? configBody.useTrueRange : true
                        };
                        break;
                    case "SMI":
                        enginePayload = {
                            type,
                            percentDLength: configBody.percentDLength || 3,
                            percentKLength: configBody.percentKLength || 5,
                            ema1Length: configBody.ema1Length || 5,
                            ema2Length: configBody.ema2Length || 5
                        };
                        break;
                    case "MOM":
                        enginePayload = {
                            type,
                            length: configBody.length || 10,
                            offset: configBody.offset || 0,
                            source: configBody.source || "close"
                        };
                        break;
                    case "ICHI":
                        enginePayload = {
                            type,
                            conversionLinePeriods: configBody.conversionLinePeriods || 9,
                            baseLinePeriods: configBody.baseLinePeriods || 26,
                            laggingSpan2Periods: configBody.laggingSpan2Periods || 52,
                            displacement: configBody.displacement || 26
                        };
                        break;
                    case "EFI":
                        enginePayload = {
                            type,
                            length: configBody.length || 13,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "Cmf":
                        enginePayload = {
                            type,
                            length: configBody.length || 20,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "EOM":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            divisor: configBody.divisor || 10000,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "Vortex":
                        enginePayload = {
                            type,
                            length: configBody.length || 14,
                            offset: configBody.offset || 0
                        };
                        break;
                    case "Market_Profile":
                        enginePayload = {
                            type,
                            deviation: configBody.deviation || 5,
                            depth: configBody.depth || 10
                        };
                        break;
                    default:
                        return socket.emit(EVENTS.UPDATE_INDICATOR_RESPONSE, { success: false, message: "Indicator not supported" });
                }

                const result = await indicatorEngine(candles, enginePayload);

                socket.emit(EVENTS.UPDATE_INDICATOR_RESPONSE, { 
                    success: true, 
                    message: `Indicator has been updated by ${type}`, 
                    statusCode: 200, 
                    data: result 
                });
                console.log(`[Socket] ${type} calc via UPDATE_INDICATOR: ${Date.now() - start}ms`);
            } catch (err) {
                console.error("[Socket UpdateIndicator] Error:", err.message);
                socket.emit(EVENTS.UPDATE_INDICATOR_RESPONSE, { success: false, statusCode: 500, message: err.message });
            }
        });

        //THIS IS USED FOR LIVE EXACT CURRENT DATE INDICATGOR PLOTTING
        socket.on(EVENTS.GET_LIVE_INDICATOR, async (payload) => {
            console.log(`[Socket] Received GET_LIVE_INDICATOR request for:`, payload);
            try {
                const { type, symbol, interval, exchange } = payload; // Ignore dates for history
                const { prepareCandlesWithIndicators } = require('../helper');
                const { getCandlesWithCache, formatDate } = require('./dbService');
                const store = require('./marketStore');

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

                const topStocksMap = {
                    "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
                    "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
                    "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
                    "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499",
                    "GOLD": "234454", "SILVER": "234455"
                };

                let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
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

                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d });

                if (results?.length > 0) {
                    const indKey = type.toLowerCase();
                    
                    // Search for the last record that actually has a calculated value
                    const validResult = [...results].reverse().find(r => 
                        (r[indKey] !== null && r[indKey] !== undefined) || 
                        (r[type] !== null && r[type] !== undefined) ||
                        (r.value !== null && r.value !== undefined)
                    );

                    const latest = validResult || results[results.length - 1];
                    
                    let val = latest[indKey];
                    if (val === undefined || val === null) val = latest[type];
                    if (val === undefined || val === null) val = latest.value;
                    
                    if (val === undefined || val === null) {
                        console.warn(`[LiveIndicator] ${uSym} ${type} is null even after searching history.`);
                        val = 0;
                    }

                    console.log(`[LiveIndicator] ${uSym} ${type} final value: ${val.toFixed(2)} (IST: ${new Date(latest.time * 1000).toLocaleTimeString()})`);

                    socket.emit(EVENTS.LIVE_INDICATOR_RESPONSE, {
                        success: true,
                        symbol: uSym,
                        type,
                        data: [{ 
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
                        }]
                    });

                    // --- TRACK SUBSCRIPTION FOR LIVE UPDATES ---
                    if (!store.indicatorSubscriptions.has(socket.id)) {
                        store.indicatorSubscriptions.set(socket.id, new Map());
                    }
                    const socketSubs = store.indicatorSubscriptions.get(socket.id);
                    socketSubs.set(`${uSym}_${type}_${finalInterval}`, {
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

        // --- 6. CLEANUP ---
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

                    // Persistent Save to DB so Indicator Engine can see it
                    try {
                        const { Candle } = require('../models');
                        await Candle.upsert({
                            symbol: "GOLD",
                            token: goldToken,
                            exchange: "MCX",
                            interval: "ONE_MINUTE",
                            timestamp: new Date(lastCandle.timestamp),
                            open: parseFloat(lastCandle.open),
                            high: parseFloat(lastCandle.high),
                            low: parseFloat(lastCandle.low),
                            close: parseFloat(lastCandle.close),
                            volume: 0
                        });
                    } catch (dbErr) { }
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
                console.log(`[IndicatorMatch] Found match for ${tickSymbol} (Token: ${cleanToken}) - Socket: ${socketId}`);
                try {
                    // To keep it efficient, we only calculate if it's been at least 500ms since last update for this socket
                    const now = Date.now();
                    if (sub.lastEmit && now - sub.lastEmit < 800) continue; 
                    sub.lastEmit = now;

                    // --- AUTOMATIC LOOKBACK FOR WARMUP ---
                    let dynamicFrom = null;
                    let dynamicTo = formatDate(new Date(), "15:30");
                    if (sub.interval === "ONE_MINUTE" || sub.interval === "THREE_MINUTE" || sub.interval === "FIVE_MINUTE") {
                        const fiveDaysAgo = new Date();
                        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
                        dynamicFrom = formatDate(fiveDaysAgo, "09:15");
                    }

                    let candles = [];
                    const cacheEntry = indicatorCandleCache.get(subKey);
                    const nowTs = Date.now();

                    if (cacheEntry && (nowTs - cacheEntry.lastFetch < 30000)) {
                        candles = [...cacheEntry.candles];
                    } else {
                        const result = await getCandlesWithCache(sub.symbol, sub.token, sub.exchange, sub.interval, dynamicFrom, dynamicTo, sub.extraInfo);
                        candles = result?.data || [];
                        indicatorCandleCache.set(subKey, { candles: [...candles], lastFetch: nowTs });
                    }
                    
                    if (candles.length < 15) {
                        console.warn(`[LivePush] ${sub.symbol} has only ${candles.length} candles. Indicator ${sub.type} might be 0/null.`);
                    }
                    
                    const live = store.liveCandles[sub.token] || store.liveCandles[sub.symbol];
                    if (sub.interval === "ONE_MINUTE" && live) {
                        const lastCandle = candles[candles.length - 1];
                        const lastTs = lastCandle ? new Date(lastCandle.timestamp).getTime() : 0;
                        const liveTs = new Date(live.minute).getTime();

                        if (liveTs === lastTs) {
                            candles[candles.length - 1] = { ...lastCandle, ...live };
                        } else if (liveTs > lastTs) {
                            candles.push({
                                timestamp: live.minute,
                                time: Math.floor(liveTs / 1000),
                                open: parseFloat(live.open),
                                high: parseFloat(live.high),
                                low: parseFloat(live.low),
                                close: parseFloat(live.close),
                                volume: parseInt(live.volume)
                            });
                        }
                    }

                    const indType = (sub.type || "RSI").toUpperCase();
                    const indResults = await prepareCandlesWithIndicators(indType, candles, { json: d => d, send: d => d });
                    if (indResults && indResults.length > 0) {
                        const latest = indResults[indResults.length - 1];
                        const indKey = sub.type.toLowerCase();
                        let val = latest[indKey] ?? latest[sub.type] ?? latest.value ?? 0;

                        console.log(`[LivePush] Emitting ${sub.type} for ${sub.symbol} | Value: ${val.toFixed(2)} | Time: ${latest.time} | readable: ${latest.readableTickTime}`);
                        socket.emit(EVENTS.LIVE_INDICATOR_RESPONSE, {
                            success: true,
                            symbol: sub.symbol,
                            type: sub.type,
                            isLivePush: true,
                            isLive: true,
                            data: [{ 
                                ...latest, // Send all calculated keys (macd, histogram, upper, lower, etc.)
                                time: Number(latest.time), 
                                receivedAt: new Date().toISOString(),
                                tickTime: latest.tickTime || (latest.time * 1000),
                                readableTickTime: latest.readableTickTime || new Date(latest.time * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                                value: parseFloat(val),
                                [indKey]: parseFloat(val),
                                [sub.type]: parseFloat(val),
                                last_traded_price: latest.close || 0,
                                datetime: latest.datetime
                            }]
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
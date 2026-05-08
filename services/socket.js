const { Server } = require("socket.io");
const EVENTS = require('../constants/socketEvents');

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

        // --- 2. HISTORICAL DATA EVENTS ---
        socket.on(EVENTS.GET_HISTORICAL_DATA, async (payload) => {
            try {
                const { fetchManualHistoricalData } = require('./historicalService');
                const result = await fetchManualHistoricalData(payload);
                console.log(`[Socket] Emitting HISTORICAL_DATA_RESPONSE for ${payload.symbol}: ${result.data?.length || 0} candles. Last: ${result.data?.length > 0 ? new Date(result.data[result.data.length-1].timestamp).toLocaleString() : 'N/A'}`);
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
                const { prepareCandlesWithIndicators } = require('../helper');
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
                if (typeof fD === 'string' && fD.length === 10) fD = formatDate(new Date(fD), "09:15", finalInterval);
                if (typeof tD === 'string' && tD.length === 10) tD = formatDate(new Date(tD), "15:30", finalInterval);

                const uSym = symbol.toUpperCase();
                const topStocksMap = {
                    "TCS": "11536", "RELIANCE": "2885", "HDFCBANK": "1333", "ICICIBANK": "4963", "INFY": "1594",
                    "SBIN": "3045", "BHARTIARTL": "10604", "HINDUNILVR": "1330", "ITC": "1660", "AXISBANK": "5900",
                    "KOTAKBANK": "1922", "LT": "11483", "BAJFINANCE": "317", "MARUTI": "10999", "SUNPHARMA": "3351",
                    "TITAN": "3506", "ADANIENT": "25", "ADANIPORTS": "15083", "TATAMOTORS": "3456", "TATASTEEL": "3499"
                };

                const finalExchange = (exchange || "NSE").toUpperCase();
                const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);

                let finalToken = topStocksMap[uSym] || store.symbolToTokenMaster[uSym];
                if (!finalToken) throw new Error(`Token not found for ${symbol}`);

                const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, finalInterval, fD, tD);
                const candles = result.data;

                const results = await prepareCandlesWithIndicators(type, candles, { json: d => d, send: d => d });
                socket.emit(EVENTS.INDICATOR_DETAILS_RESPONSE, { success: true, message: `fetched by ${type}`, data: results });
                console.log(`[Socket] ${type} calc: ${Date.now() - start}ms`);
            } catch (err) {
                console.error("[Socket Indicator] Error:", err.message);
                socket.emit(EVENTS.INDICATOR_DETAILS_ERROR, { success: false, error: err.message });
            }
        });

        socket.on(EVENTS.GET_LIVE_INDICATOR, async (payload) => {
            try {
                const { type, symbol, interval, fromDate, toDate, exchange } = payload;
                const { prepareCandlesWithIndicators } = require('../helper');
                const { getCandlesWithCache } = require('./dbService');
                const store = require('./marketStore');

                const uSym = symbol.toUpperCase();
                const finalExchange = (exchange || "NSE").toUpperCase();
                const mappedExchange = (finalExchange === "NSE" || finalExchange === "NFO") ? "NSE" : (finalExchange === "BSE" || finalExchange === "BFO" ? "BSE" : finalExchange);
                const finalToken = store.symbolToTokenMaster[uSym];

                if (!finalToken) throw new Error(`Token not found for ${symbol}`);

                const result = await getCandlesWithCache(uSym, finalToken, mappedExchange, interval, fromDate, toDate);
                const results = await prepareCandlesWithIndicators(type, result.data, { json: d => d, send: d => d });
                
                if (results?.length > 0) {
                    const latest = results[results.length - 1];
                    socket.emit(EVENTS.LIVE_INDICATOR_RESPONSE, { 
                        success: true, 
                        symbol: uSym, 
                        type, 
                        data: { time: Number(latest.time), value: parseFloat(latest[type.toLowerCase()] || latest.value || 0) } 
                    });
                }
            } catch (err) {
                console.error("[Socket Live Indicator] Error:", err.message);
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

        // --- 5. CLEANUP ---
        socket.on("disconnect", () => {
            socketAlerts.delete(socket.id);
            console.log("Client disconnected:", socket.id);
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
                                ltp: parseFloat(candles[candles.length-1].close).toFixed(2),
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
        } catch (err) {}
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

                    // Update store so AlertService can see the live candle
                    store.liveCandles["GOLD"] = {
                        open: parseFloat(lastCandle.open),
                        high: parseFloat(lastCandle.high),
                        low: parseFloat(lastCandle.low),
                        close: parseFloat(lastCandle.close),
                        volume: 0
                    };

                    // Trigger Alert Scanner with real numeric token
                    const alertService = require('./alertService');
                    const goldStock = store.stocks.find(s => s.name === "GOLD");
                    alertService.checkAlerts({
                        token: goldStock ? goldStock.token : "GOLD",
                        symbol: "GOLD",
                        last_traded_price: Number(lastCandle.close)
                    });
                }
            }
        } catch (err) {
            console.error("[GoldBroadcast] Error:", err.message);
        }
    };
    setInterval(broadcast, 5000);
};

const getIO = () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
};

module.exports = { connectSocket, startGoldBroadcast, getIO };
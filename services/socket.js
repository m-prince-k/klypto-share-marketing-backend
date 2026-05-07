// socket.js
let io;

const connectSocket = (server) => {
    const { Server } = require("socket.io");


    io = new Server(server, {
        cors: {
            origin: "*"
        },
        maxHttpBufferSize: 1e7 // Increase to 10MB for large historical data
    });



    io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);


        // Historical Data via Socket
        socket.on("getManualHistoricalData", async (payload) => {
            try {
                const { fetchManualHistoricalData } = require('./historicalService');
                console.log(`[Socket] Historical request for ${payload.symbol}`);
                const result = await fetchManualHistoricalData(payload);
                socket.emit("historicalDataResponse", result);
            } catch (err) {
                console.error("[Socket] Historical Error:", err.message);
                socket.emit("historicalDataError", { success: false, error: err.message });
            }
        });


        // Simple cache to prevent duplicate fetches for multiple indicators
        const candleCache = new Map();

        // Indicator Details via Socket
        socket.on("getIndicatorDetails", async (payload) => {
            const start = Date.now();
            try {
                const { type, symbol, interval, fromDate, toDate } = payload;
                const { getHistoricalCandle } = require('./angelOne');
                const { prepareCandlesWithIndicators } = require('../helper');
                const { formatDate } = require('./dbService');

                console.log(`[Socket] Indicator Request: ${type} for ${symbol}`);

                // Normalize dates
                let formattedFromDate = fromDate;
                let formattedToDate = toDate;

                if (typeof fromDate === 'string' && fromDate.length === 10) {
                    formattedFromDate = formatDate(new Date(fromDate), "09:15");
                }
                if (typeof toDate === 'string' && toDate.length === 10) {
                    formattedToDate = formatDate(new Date(toDate), "15:30");
                }


                const cacheKey = `${symbol}_${interval}_${formattedFromDate}_${formattedToDate}`;
                let candles;

                if (candleCache.has(cacheKey)) {
                    console.log(`[Socket] Using cached candles for ${symbol}`);
                    candles = candleCache.get(cacheKey);
                } else {
                    const data = {
                        symbol, interval,
                        fromDate: formattedFromDate, toDate: formattedToDate
                    };
                    candles = await getHistoricalCandle(data);
                    
                    // Cache it for 30 minutes to keep live updates flowing
                    candleCache.set(cacheKey, candles);
                    setTimeout(() => candleCache.delete(cacheKey), 1800000); 
                }
                
                const dummyRes = {
                    json: (data) => data,
                    send: (data) => data
                };

                const values = await prepareCandlesWithIndicators(type, candles, dummyRes);
                
                socket.emit("indicatorDetailsResponse", { 
                    success: true, 
                    message: `Indicator fetched by ${type}`, 
                    data: values 
                });

                console.log(`[Socket] ${type} for ${symbol} completed in ${Date.now() - start}ms`);
            } catch (err) {
                console.error("[Socket] Indicator Error:", err.message);
                socket.emit("indicatorDetailsError", { success: false, error: err.message });
            }
        });

        // LIVE Indicator Update (for single tick)
        socket.on("getLiveIndicatorUpdate", async (payload) => {
            try {
                const { type, symbol, interval, latestTick, fromDate, toDate } = payload;
                const { prepareCandlesWithIndicators } = require('../helper');
                const { formatDate } = require('./dbService');
                const { getHistoricalCandle } = require('./angelOne');

                // Normalize dates
                let formattedFromDate = fromDate;
                let formattedToDate = toDate;
                if (typeof fromDate === 'string' && fromDate.length === 10) formattedFromDate = formatDate(new Date(fromDate), "09:15");
                if (typeof toDate === 'string' && toDate.length === 10) formattedToDate = formatDate(new Date(toDate), "15:30");

                const cacheKey = `${symbol}_${interval}_${formattedFromDate}_${formattedToDate}`;
                let candles = candleCache.get(cacheKey);

                // If cache is missing, re-fetch historical data (don't stop)
                if (!candles || candles.length === 0) {
                    const data = { symbol, interval, fromDate: formattedFromDate, toDate: formattedToDate };
                    candles = await getHistoricalCandle(data);
                    candleCache.set(cacheKey, candles);
                }

                if (candles && candles.length > 0) {
                    const calculationSet = [...candles.slice(-200), latestTick];
                    const dummyRes = { json: (data) => data, send: (data) => data };
                    const results = await prepareCandlesWithIndicators(type, calculationSet, dummyRes);
                    
                    if (results && results.length > 0) {
                        const latestResult = results[results.length - 1];
                        const indicatorValue = latestResult[type.toLowerCase()] || latestResult.value || latestResult.sma || latestResult.ema || latestResult.rsi || latestResult.macd || latestResult.vwap || latestResult.atr || latestResult.supertrend || 0;
                        
                        socket.emit("liveIndicatorResponse", {
                            type, symbol,
                            data: {
                                time: Number(latestResult.time),
                                value: parseFloat(indicatorValue)
                            }
                        });
                    }
                }
            } catch (err) {
                console.error("[Socket] Live Indicator Error:", err.message);
            }
        });





        // RSI Scanner via Socket
        socket.on("getRsiScanner", async (payload) => {
            try {
                const { rsi_threshold = 60, interval = '5m', fromDate, toDate } = payload;
                const { calculateRSIIndicator } = require('../Indicators/rsi-indicator');
                const { Candle, Op } = require('../models');
                const store = require('../marketStore');

                const intervalMap = {
                    "1m": "ONE_MINUTE", "3m": "THREE_MINUTE", "5m": "FIVE_MINUTE",
                    "15m": "FIFTEEN_MINUTE", "30m": "THIRTY_MINUTE", "1h": "ONE_HOUR", "1d": "ONE_DAY"
                };
                const dbInterval = intervalMap[interval.toLowerCase()] || "FIVE_MINUTE";
                const threshold = parseFloat(rsi_threshold);

                console.log(`[Socket Scanner] Running RSI > ${threshold} scan on ${dbInterval}...`);
                const results = [];

                for (const stock of store.stocks) {
                    try {
                        const whereClause = { symbol: stock.name, interval: dbInterval };
                        if (fromDate && toDate) {
                            whereClause.timestamp = { [Op.between]: [new Date(fromDate), new Date(toDate)] };
                        }

                        const candles = await Candle.findAll({
                            where: whereClause,
                            order: [['timestamp', 'DESC']],
                            limit: 30 // 14 for RSI + some buffer
                        });

                        if (candles.length >= 14) {
                            const candleData = [...candles].reverse().map(c => ({
                                time: c.timestamp,
                                open: parseFloat(c.open),
                                high: parseFloat(c.high),
                                low: parseFloat(c.low),
                                close: parseFloat(c.close),
                                volume: parseInt(c.volume)
                            }));

                            const rsiValues = await calculateRSIIndicator(candleData, 14);
                            const latestRsi = rsiValues[rsiValues.length - 1]?.rsi;

                            if (latestRsi && latestRsi > threshold) {
                                results.push({
                                    symbol: stock.name,
                                    rsi: parseFloat(latestRsi).toFixed(2),
                                    ltp: candleData[candleData.length - 1].close.toFixed(2)
                                });
                            }
                        }
                    } catch (e) { /* skip */ }
                }

                socket.emit("rsiScannerResponse", { success: true, data: results });
                console.log(`[Socket Scanner] Found ${results.length} stocks.`);
            } catch (err) {
                console.error("[Socket Scanner] Error:", err.message);
                socket.emit("rsiScannerError", { success: false, error: err.message });
            }
        });

        socket.on("disconnect", () => {

            console.log("Client disconnected:", socket.id);
        });
    });

};

const startGoldBroadcast = () => {
    const { fetchGoldHistory } = require('./commodityService');

    console.log("[Socket] Initializing Gold Real-time Broadcast...");

    const broadcast = async () => {
        if (!io) {
            console.log("[Socket] io not initialized yet, skipping broadcast.");
            return;
        }

        try {
            console.log("[Socket] Fetching fresh Gold data for broadcast...");
            const data = await fetchGoldHistory("1m", 1); // Just last 1 day for broadcast efficiency
            if (data && data.length > 0) {
                io.emit("goldUpdate", {
                    success: true,
                    timestamp: new Date().toISOString(),
                    data: data
                });
                console.log(`[Socket] Broadcasted Gold Update (${data.length} contracts) to all clients.`);
            } else {
                console.log("[Socket] No Gold data found to broadcast.");
            }
        } catch (err) {
            console.error("[Socket] Gold Broadcast Error:", err.message);
        }
    };

    // Run immediately on start
    broadcast();

    // Then run every 60 seconds
    setInterval(broadcast, 10000);
};

// export io getter
const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { connectSocket, getIO, startGoldBroadcast };
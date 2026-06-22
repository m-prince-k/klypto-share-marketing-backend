const fs = require('fs');
const path = require('path');
const { runStrategy } = require('../strategy');

const axios = require('axios');
const marketStore = require('../services/marketStore');
const smartApi = require('../services/smartApi');

// Simple in-memory cache — 5 minute TTL
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/strategy/markers?symbol=BOSCHLTD&months=6&type=BUY|SELL|ALL
 *
 * Reads the CSV for the given symbol, runs the SSL Hybrid strategy,
 * and returns BUY/SELL markers as JSON.
 */
const getMarkers = async (req, res) => {
    try {
        const symbol = (req.query.symbol || 'BOSCHLTD').toUpperCase();
        const months = parseInt(req.query.months) || 6;
        const typeFilter = (req.query.type || 'ALL').toUpperCase();

        // ── Cache check ──────────────────────────────────────────────────
        const cacheKey = `${symbol}_${months}`;
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
            // Cache hit — filter by type and return instantly
            let markers = cached.markers;
            if (typeFilter !== 'ALL') markers = markers.filter(m => m.type === typeFilter);
            return res.json({ ...cached.meta, cached: true, typeFilter, totalMarkers: markers.length, markers });
        }

        // ── Load CSV ─────────────────────────────────────────────────────
        const csvPath = path.join(__dirname, '..', 'historical_csv', `${symbol}.csv`);
        if (!fs.existsSync(csvPath)) {
            return res.status(404).json({ success: false, message: `CSV not found for symbol: ${symbol}` });
        }

        const csvLines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
        if (csvLines.length < 2) {
            return res.status(400).json({ success: false, message: 'CSV is empty.' });
        }

        // Parse candles
        const allCandles = csvLines.slice(1).map(line => {
            const [datetime, open, high, low, close, volume] = line.split(',');
            return {
                datetime: datetime?.trim(),
                open: parseFloat(open),
                high: parseFloat(high),
                low: parseFloat(low),
                close: parseFloat(close),
                volume: parseFloat(volume) || 0
            };
        }).filter(c => !isNaN(c.close) && c.datetime);

        // Filter to requested months
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        const candles = allCandles.filter(c => new Date(c.datetime) >= cutoff);

        if (candles.length < 202) {
            return res.status(400).json({
                success: false,
                message: `Not enough candles (need ≥202, got ${candles.length}).`
            });
        }

        // ── Heavy computation — yield to event loop first ─────────────
        await new Promise(resolve => setImmediate(resolve));

        const result = runStrategy(candles);

        // Enrich markers with IST datetime + UTC Unix timestamp
        const allMarkers = result.markers.map(m => {
            const datetimeIST = candles[m.index]?.datetime || null;
            let datetimeUTC = null;
            if (datetimeIST) {
                datetimeUTC = Math.floor(
                    new Date(datetimeIST.replace(' ', 'T') + '+05:30').getTime() / 1000
                );
            }
            return {
                index: m.index,
                datetime: datetimeIST,
                datetimeUTC: datetimeUTC,
                type: m.type
            };
        });

        // ── Store in cache ────────────────────────────────────────────
        const meta = {
            success: true,
            symbol,
            interval: 'FIVE_MINUTE',
            months,
            totalCandles: candles.length,
            dataFrom: candles[0].datetime,
            dataTo: candles[candles.length - 1].datetime,
            buyCount: allMarkers.filter(m => m.type === 'BUY').length,
            sellCount: allMarkers.filter(m => m.type === 'SELL').length,
        };
        cache.set(cacheKey, { ts: Date.now(), markers: allMarkers, meta });

        // Apply type filter for response
        let markers = allMarkers;
        if (typeFilter !== 'ALL') markers = markers.filter(m => m.type === typeFilter);

        return res.json({ ...meta, cached: false, typeFilter, totalMarkers: markers.length, markers });

    } catch (err) {
        console.error('[Strategy] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = { getMarkers };


// GET /api/strategy/internal-sync
const generateInternalBoslimCache = async (req, res) => {
    try {
        const interval = 'FIVE_MINUTE';
        const limit = 100;

        // Ensure we have stocks
        if (!marketStore.stocks || marketStore.stocks.length === 0) {
            return res ? res.status(400).json({ success: false, error: "No stocks found in marketStore." }) : null;
        }

        const payload = [];

        const toDateObj = new Date();
        const fromDateObj = new Date();
        fromDateObj.setDate(fromDateObj.getDate() - 40); // 40 days back

        const pad = (n) => String(n).padStart(2, '0');
        const formatAngel = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const fromDateStr = formatAngel(fromDateObj);
        const toDateStr = formatAngel(toDateObj);

        console.log(`[CacheBuilder] Starting batch scan for ${marketStore.stocks.length} stocks...`);

        // Loop through all stocks
        for (const stock of marketStore.stocks) {
            const symbol = stock.name ? stock.name.toUpperCase() : null;
            const token = stock.token;

            if (!symbol || !token) continue;

            try {
                // 1. Fetch historical data
                const apiRes = await smartApi.getCandleData({
                    exchange: "NSE",
                    symboltoken: token,
                    interval: interval,
                    fromdate: fromDateStr,
                    todate: toDateStr
                });

                let angelData = [];
                if (apiRes && apiRes.status && apiRes.data) {
                    angelData = apiRes.data;
                }

                let boslim = [];
                if (angelData.length > 0) {
                    const formattedHistorical = angelData.map(c => {
                        return {
                            datetime: c[0].replace('T', ' ').substring(0, 19),
                            exchange_code: "NSE",
                            stock_code: symbol,
                            open: c[1],
                            high: c[2],
                            low: c[3],
                            close: c[4],
                            volume: c[5]
                        };
                    });

                    // Generate indicators using the dynamically fetched data
                    boslim = await generateBoslim(formattedHistorical);
                    if (boslim.length > limit) {
                        boslim = boslim.slice(-limit);
                    }
                }

                // Add this stock's historic data to the payload array
                payload.push({
                    symbol: symbol,
                    historic_data: boslim
                });

            } catch (err) {
                console.error(`[CacheBuilder] Failed for ${symbol}:`, err.message);
            }

            // Delay to avoid Angel One rate limits
            await new Promise(resolve => setTimeout(resolve, 400));
        }

        const fs = require('fs');
        const path = require('path');
        const dirPath = path.join(__dirname, '..', 'historical_csv');
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const cachePath = path.join(dirPath, 'latest_boslim_cache.json');
        fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');

        console.log(`[CacheBuilder] Saved historic cache for ${payload.length} stocks to ${cachePath}`);
        if (res) return res.json({ success: true, count: payload.length, path: cachePath });
    } catch (error) {
        console.error('[CacheBuilder] Error:', error.message);
        if (res) return res.status(500).json({ success: false, error: error.message });
    }
};

const forwardToPredict = async (req, res) => {
    try {
        const targetUrl = req.query.url || 'http://43.205.133.183:8000/predict';
        const fs = require('fs');
        const path = require('path');
        const axios = require('axios');
        const cachePath = path.join(__dirname, '..', 'historical_csv', 'latest_boslim_cache.json');

        if (!fs.existsSync(cachePath)) {
            return res.status(404).json({ success: false, error: "Cache file not found. Please wait for the daily cron job to finish." });
        }

        const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        // Inject live tick instantly
        const payload = cachedData.map(item => {
            const symbol = item.symbol;
            let tick = (marketStore.latestMarketData && (marketStore.latestMarketData[symbol] || marketStore.latestMarketData[`${symbol}:NSE`]));

            let filterTick;
            if (tick && (tick.low || tick.low_price)) {
                filterTick = {
                    "low": tick.low || tick.low_price || 0,
                    "high": tick.high || tick.high_price || 0,
                    "open": tick.open || tick.open_price || 0,
                    "close": tick.close || tick.close_price || 0,
                    "datetime": tick.exchTradeTime || new Date().toISOString()
                };
            } else if (item.historic_data && item.historic_data.length > 0) {
                const lastCandle = item.historic_data[item.historic_data.length - 1];
                filterTick = {
                    "low": lastCandle.low || 0,
                    "high": lastCandle.high || 0,
                    "open": lastCandle.open || 0,
                    "close": lastCandle.close || 0,
                    "datetime": lastCandle.datetime || new Date().toISOString()
                };
            } else {
                filterTick = { "low": 0, "high": 0, "open": 0, "close": 0, "datetime": new Date().toISOString() };
            }

            return {
                symbol: item.symbol,
                historic_data: item.historic_data,
                tick: filterTick
            };
        });

        console.log(`[Predict] Forwarding INSTANT cache payload for ${payload.length} stocks to Python...`);

        const response = await axios.post(targetUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000
        });

        console.log("[Predict] Python API response received.");
        return res.json({ success: true, processed_count: payload.length, data: response?.data });
    } catch (error) {
        const pythonError = error.response ? error.response.data : error.message;
        console.error("Error from Python API:", pythonError);
        return res.status(error.response ? error.response.status : 500).json({ success: false, error: pythonError });
    }
};

module.exports.generateInternalBoslimCache = generateInternalBoslimCache;
module.exports.forwardToPredict = forwardToPredict;

// POST /api/strategy/evaluate-python
// Forwards fetched historical data to the local Python FastAPI server for strategy evaluation
const evaluatePythonStrategy = async (req, res) => {
    try {
        const symbol = (req.query.symbol || req.body.symbol || 'BOSLIM').toUpperCase();
        const interval = (req.query.interval || req.body.interval || 'FIVE_MINUTE').toUpperCase();

        // Accept dynamic strategy name, parameters, OR full python code from frontend
        const strategy = req.body.strategy || 'MACD_RSI';
        const params = req.body.params || {};
        const strategy_code = req.body.strategy_code || null;

        const token = marketStore.symbolToTokenMaster && (marketStore.symbolToTokenMaster[symbol] || marketStore.symbolToTokenMaster[`${symbol}:NSE`]);
        if (!token) {
            return res.status(400).json({ success: false, error: `Symbol ${symbol} not found in master` });
        }

        // Fetch historical data from Angel One API
        let angelData = [];
        try {
            const toDateObj = new Date();
            const fromDateObj = new Date();
            // Angel One API restricts intraday data to max 30 days per request
            fromDateObj.setDate(fromDateObj.getDate() - 30);

            const pad = (n) => String(n).padStart(2, '0');
            const formatAngel = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

            const apiRes = await smartApi.getCandleData({
                exchange: "NSE",
                symboltoken: token,
                interval: interval,
                fromdate: formatAngel(fromDateObj),
                todate: formatAngel(toDateObj)
            });

            if (apiRes && apiRes.status && apiRes.data) {
                angelData = apiRes.data;
            }
        } catch (err) {
            console.error("Angel One getCandleData failed:", err.message);
            return res.status(500).json({ success: false, error: "Angel One historical fetch failed: " + err.message });
        }

        if (angelData.length === 0) {
            return res.status(404).json({ success: false, error: "No historical data found for symbol " + symbol });
        }

        const formattedHistorical = angelData.map(c => {
            return {
                datetime: c[0].replace('T', ' ').substring(0, 19),
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5]
            };
        });

        // Send to Python FastAPI
        const payload = {
            symbol: symbol,
            interval: interval,
            strategy: strategy,
            params: params,
            strategy_code: strategy_code,
            historical_data: formattedHistorical
        };

        const targetUrl = 'http://127.0.0.1:8000/api/evaluate-strategy';

        try {
            const response = await axios.post(targetUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000 // Strategy evaluation might take a few seconds
            });

            let finalData = response.data;

            // Map utc_datetime (Unix) and ist_datetime into each object in the data array
            if (Array.isArray(finalData)) {
                finalData = finalData.map(item => {
                    // Get candle time from the item's datetime or via its index mapping
                    let candleTimeStr = item.datetime;
                    if (!candleTimeStr && item.index !== undefined && formattedHistorical[item.index]) {
                        candleTimeStr = formattedHistorical[item.index].datetime;
                    }

                    if (candleTimeStr) {
                        // candleTimeStr is IST (e.g. "2026-06-11 09:15:00"). Parse it correctly.
                        const d = new Date(candleTimeStr.replace(' ', 'T') + "+05:30");
                        item.utc_datetime = Math.floor(d.getTime() / 1000); // Unix timestamp in seconds
                        item.ist_datetime = candleTimeStr;
                    } else {
                        // Fallback if no candle mapping is found
                        const now = new Date();
                        item.utc_datetime = Math.floor(now.getTime() / 1000);
                        const istDate = new Date(now.getTime() + (330 * 60 * 1000));
                        item.ist_datetime = istDate.toISOString().replace('Z', '+05:30');
                    }
                    return item;
                });
            }

            return res.json({
                success: true,
                symbol: symbol,
                total_candles_processed: formattedHistorical.length,
                data: finalData,
                message: strategy_code ? "Executed custom python code successfully." : "Built-in strategy applied"
            });

        } catch (error) {
            const pythonError = error.response ? error.response.data : error.message;
            console.error("Error from Python API:", pythonError);

            // Clean up the error message for the frontend
            let errorMessage = pythonError;
            if (pythonError && pythonError.detail) {
                errorMessage = pythonError.detail;
            } else if (typeof pythonError === 'object') {
                errorMessage = JSON.stringify(pythonError);
            }

            const statusCode = error.response ? error.response.status : 500;
            return res.status(statusCode).json({ success: false, error: errorMessage });
        }

    } catch (err) {
        console.error('[Strategy.evaluatePythonStrategy] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// GET /api/strategy/scanner-dashboard
const getScannerDashboard = async (req, res) => {
    try {
        const { StrategySignal } = require('../models');
        const { Op } = require('sequelize');
        const userId = req.user ? String(req.user.id) : "anonymous";
        const signals = await StrategySignal.findAll({
            where: {
                userId: userId,
                signalType: {
                    [Op.in]: ['BUY', 'SELL']
                }
            },
            order: [['timestamp', 'DESC']],
            raw: true
        });

        const enhancedSignals = signals.map(signal => {
            let unix_timestamp = null;
            let ist_timestamp = null;
            if (signal.timestamp) {
                const ts = new Date(signal.timestamp);
                unix_timestamp = Math.floor(ts.getTime() / 1000);
                const istDate = new Date(ts.getTime() + (330 * 60 * 1000));
                ist_timestamp = istDate.toISOString().replace('Z', '+05:30');
            }
            return {
                ...signal,
                unix_timestamp,
                ist_timestamp
            };
        });

        return res.json({
            success: true,
            data: enhancedSignals
        });
    } catch (err) {
        console.error('[Strategy.getScannerDashboard] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports.evaluatePythonStrategy = evaluatePythonStrategy;
module.exports.getScannerDashboard = getScannerDashboard;

// POST /api/strategy/run-scanner
const runDynamicScanner = async (req, res) => {
    try {
        const strategy_code = req.body.strategy_code;
        const use_historical_only = req.body.use_historical_only === 'true' || req.body.use_historical_only === true;
        const userId = req.user ? String(req.user.id) : "anonymous";

        if (!strategy_code) {
            return res.status(400).json({ success: false, message: "strategy_code is required in body" });
        }

        // 1. Dry run validation with python backend before starting background process
        try {
            const axios = require('axios');
            await axios.post('http://127.0.0.1:8000/api/evaluate-strategy', {
                symbol: "DUMMY",
                interval: "FIVE_MINUTE",
                strategy: "CUSTOM",
                params: {},
                strategy_code: strategy_code,
                historical_data: []
            }, { timeout: 5000 });
        } catch (error) {
            const pythonError = error.response ? error.response.data : error.message;
            let errorMessage = pythonError;
            if (pythonError && pythonError.detail) errorMessage = pythonError.detail;
            else if (typeof pythonError === 'object') errorMessage = JSON.stringify(pythonError);

            const statusCode = error.response ? error.response.status : 500;
            return res.status(statusCode).json({ success: false, error: errorMessage });
        }

        // Return immediately to frontend so UI doesn't block
        res.json({ success: true, message: "Scanner started in background" });

        console.log(`[Dynamic Scanner] Background scan initiated by API (User: ${userId})`);

        // Dynamically require services
        const { login } = require('../services/authService');
        const { fetchTop200Stocks } = require('../services/stockService');
        const { getScannerSymbols } = require('../services/scannerService');
        const { StrategySignal } = require('../models');
        const io = require('../services/socket').getIO();
        const EVENTS = require('../constants/socketEvents');

        // Helper: format date
        const formatAngelDate = (d) => {
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        // Helper: read local CSV
        const readHistoricalCsv = (symbol) => {
            const filePath = path.join(__dirname, '../historical_csv', `${symbol}.csv`);
            if (!fs.existsSync(filePath)) return [];
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const data = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const [datetime, open, high, low, close, volume] = line.split(',');
                data.push({ datetime, open, high, low, close, volume });
            }

            // Limit to 1 month of 5-minute candles to speed up processing
            // 75 candles per day * 22 trading days = approx 1650 candles
            return data.slice(-1650);
        };

        // 1. Authenticate
        const loginData = await login();
        if (!loginData || !loginData.status) {
            console.error('[Dynamic Scanner] Angel One login failed.');
            return;
        }

        // 2. Fetch Master list
        await fetchTop200Stocks();
        const symbols = getScannerSymbols();
        console.log(`[Dynamic Scanner] Scanning ${symbols.length} symbols...`);

        let processedCount = 0;
        const totalCount = symbols.length;

        for (const symbol of symbols) {
            try {
                processedCount++;
                if (io) {
                    io.to(userId).emit(EVENTS.SCANNER_PROGRESS, {
                        processed: processedCount,
                        total: totalCount,
                        current_stock: symbol
                    });
                }
                console.log(`  - Processing ${symbol}...`);
                const token = marketStore.symbolToTokenMaster[symbol] || marketStore.symbolToTokenMaster[`${symbol}:NSE`];
                if (!token) continue;

                let historicalData = readHistoricalCsv(symbol);

                // Load latest data ONLY if use_historical_only is false
                let latestData = [];
                if (!use_historical_only) {
                    try {
                        const toDate = new Date();
                        const fromDate = new Date();
                        fromDate.setDate(fromDate.getDate() - 2);

                        let timeoutId;
                        const timeoutPromise = new Promise((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error('Angel One API timeout after 10s')), 10000);
                        });

                        const resApi = await Promise.race([
                            smartApi.getCandleData({
                                exchange: "NSE",
                                symboltoken: token,
                                interval: "FIVE_MINUTE",
                                fromdate: formatAngelDate(fromDate),
                                todate: formatAngelDate(toDate)
                            }),
                            timeoutPromise
                        ]);
                        clearTimeout(timeoutId);

                        if (resApi && resApi.status && resApi.data) {
                            latestData = resApi.data.map(c => ({
                                datetime: c[0].replace('T', ' ').substring(0, 19),
                                open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
                            }));
                        }
                    } catch (e) {
                        if (typeof timeoutId !== 'undefined') clearTimeout(timeoutId);
                        console.error(`Error fetching latest data for token ${token}:`, e.message);
                    }

                    await new Promise(resolve => setTimeout(resolve, 500)); // Throttling for Angel API
                }

                const existingTimes = new Set(historicalData.map(d => d.datetime));
                for (const c of latestData) {
                    if (!existingTimes.has(c.datetime)) historicalData.push(c);
                }
                historicalData.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

                const payload = {
                    symbol: symbol,
                    interval: "FIVE_MINUTE",
                    strategy: "CUSTOM",
                    params: {},
                    strategy_code: strategy_code,
                    historical_data: historicalData
                };

                if (historicalData.length === 0) {
                    console.log(`[Dynamic Scanner] Skipping ${symbol} as historical data is empty.`);
                    continue;
                }

                const pythonRes = await axios.post('http://127.0.0.1:8000/api/evaluate-strategy', payload, { timeout: 120000 });

                const resultData = pythonRes.data;
                if (Array.isArray(resultData) && resultData.length > 0) {
                    const signals = resultData.filter(d =>
                        d.type === 'BUY' || d.type === 'SELL' ||
                        d.text === 'BUY' || d.text === 'SELL'
                    );
                    if (signals.length > 0) {
                        // Limit to last 5 signals to prevent frontend from freezing! 
                        const recentSignals = signals.slice(-5);

                        // Emit ALL recent signals to frontend
                        for (const sig of recentSignals) {
                            const sigType = sig.type || sig.text;
                            let cTimeStr = sig.datetime || sig.time;
                            if (!cTimeStr && sig.index !== undefined && historicalData[sig.index]) {
                                cTimeStr = historicalData[sig.index].datetime;
                            }
                            let sigTs = new Date();
                            if (cTimeStr && typeof cTimeStr === 'string') {
                                sigTs = new Date(cTimeStr.replace(' ', 'T') + "+05:30");
                            }
                            const sigData = {
                                symbol: symbol,
                                userId: userId,
                                signalType: sigType,
                                indicatorValues: sig,
                                timestamp: sigTs
                            };
                            if (io) {
                                io.to(userId).emit(EVENTS.NEW_SCANNER_SIGNAL, sigData);
                            }
                        }

                        // Save only the LAST signal to DB to respect unique constraints
                        const latestSignal = signals[signals.length - 1];
                        const sType = latestSignal.type || latestSignal.text;

                        let candleTimeStr = latestSignal.datetime || latestSignal.time;
                        if (!candleTimeStr && latestSignal.index !== undefined && historicalData[latestSignal.index]) {
                            candleTimeStr = historicalData[latestSignal.index].datetime;
                        }

                        let signalTimestamp = new Date();
                        if (candleTimeStr) {
                            signalTimestamp = new Date(candleTimeStr.replace(' ', 'T') + "+05:30");
                        }

                        let existingSignal = await StrategySignal.findOne({
                            where: { symbol: symbol, userId: userId }
                        });

                        const dbSignalData = {
                            symbol: symbol,
                            userId: userId,
                            signalType: sType,
                            indicatorValues: latestSignal,
                            timestamp: signalTimestamp
                        };

                        if (existingSignal) {
                            await existingSignal.update(dbSignalData);
                        } else {
                            await StrategySignal.create(dbSignalData);
                        }

                        console.log(`    => Stored ${sType} signal for ${symbol} at ${candleTimeStr}`);
                    } else {
                        console.log(`    => No BUY/SELL signals generated for ${symbol}`);
                    }
                }
            } catch (err) {
                const pythonError = err.response ? err.response.data : err.message;
                const errString = typeof pythonError === 'object' ? JSON.stringify(pythonError) : String(pythonError);
                console.error(`[Dynamic Scanner] Error processing ${symbol}:`, errString);
                if (io) {
                    io.to(userId).emit(EVENTS.SCANNER_ERROR, {
                        symbol: symbol,
                        error: errString
                    });
                }
            }
        }
        console.log(`[Dynamic Scanner] Scan cycle complete for user ${userId}.`);

        if (io) {
            io.to(userId).emit(EVENTS.SCANNER_COMPLETE, { success: true, message: "Scan Complete" });
        }

        // Notify Python console that scan is complete
        try {
            await axios.post('http://127.0.0.1:8000/api/scan-complete');
        } catch (e) {
            // Ignore error if python is down
        }

    } catch (err) {
        console.error('[Strategy.runDynamicScanner] Fatal Error:', err.message);
        try {
            const io = require('../services/socket').getIO();
            const EVENTS = require('../constants/socketEvents');
            const userId = req.user ? String(req.user.id) : "anonymous";
            if (io) {
                io.to(userId).emit(EVENTS.SCANNER_ERROR, { symbol: "GLOBAL", error: "Fatal error: " + err.message });
            }
        } catch (e) { }
    }
};









module.exports.runDynamicScanner = runDynamicScanner;

const fs = require('fs');
const path = require('path');
const { runStrategy } = require('../strategy');
const { generateBoslim } = require('../shubam/testing');
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

// POST /api/strategy/save-testing-csv
// Generates the testing data (from `shubam/testing.js`) and writes a CSV
// into the `shubam` folder. Returns the saved file path.
const saveTestingCsv = async (req, res) => {
    try {
        const boslim = await generateBoslim();

        if (!Array.isArray(boslim) || boslim.length === 0) {
            return res.status(500).json({ success: false, message: 'No data generated.' });
        }

        // Derive headers from first object
        const headers = Object.keys(boslim[0]);

        // Helper to stringify cell values (dates -> ISO)
        const cell = v => {
            if (v instanceof Date) return v.toISOString();
            if (v === null || v === undefined) return '';
            if (Number.isNaN(v)) return '';
            // escape double quotes
            const s = String(v).replace(/"/g, '""');
            return s;
        };

        const rows = boslim.map(row => headers.map(h => `"${cell(row[h])}"`).join(','));
        const csvContent = [headers.join(','), ...rows].join('\n');

        const outDir = path.join(__dirname, '..', 'shubam');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        const filename = `testing_${Date.now()}.csv`;
        const outPath = path.join(outDir, filename);

        fs.writeFileSync(outPath, csvContent, 'utf8');

        return res.json({ success: true, path: outPath, filename });
    } catch (err) {
        console.error('[Strategy.saveTestingCsv] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports.saveTestingCsv = saveTestingCsv;

// POST /api/strategy/predict
// Forwards generated historic_data (from testing.js) and a tick to a target predict endpoint.
// Body may include `tick` to override. Query param `url` can override target URL.
const forwardToPredict = async (req, res) => {
    try {


        const targetUrl = req.query.url || 'http://43.205.133.183:8000/predict';
        const symbol = (req.query.symbol || 'BOSLIM').toUpperCase();

        const boslim = await generateBoslim();

        // Always fetch live tick for BOSCHLTD from Angel One (ignore any tick in request)
        let tick = null;
        const tickSymbol = 'BOSCHLTD';
        try {
            const token = marketStore.symbolToTokenMaster && (marketStore.symbolToTokenMaster[tickSymbol] || marketStore.symbolToTokenMaster[`${tickSymbol}:NSE`]);
            if (token) {
                const resp = await smartApi.marketData({ mode: 'LTP', exchangeTokens: { 'NSE': [token] } });
                if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                    tick = resp.data.fetched[0];
                }
            }
        } catch (e) {
            console.warn('[Strategy.forwardToPredict] Angel One LTP fetch failed for BOSCHLTD:', e.message);
        }



        if (!tick) {
            // fallback to store (try both key styles)
            tick = (marketStore.latestMarketData && (marketStore.latestMarketData[tickSymbol] || marketStore.latestMarketData[`${tickSymbol}:NSE`])) || {};
        }

        const payload = {
            historic_data: boslim,
            tick: tick
        };

        try {
            const response = await axios.post(targetUrl, JSON.stringify(payload), {
                headers: { 'Content-Type': 'application/json' },
                timeout: 25000
            });

            return res.json({ success: true, forwardedTo: targetUrl, status: response.status, data: response.data });
        } catch (error) {
            console.log(error, "____________--89089")
            return res.status(500).json({ success: false, error: error });
        }

    } catch (err) {
        console.error('[Strategy.forwardToPredict] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

module.exports.forwardToPredict = forwardToPredict;

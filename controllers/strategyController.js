const fs   = require('fs');
const path = require('path');
const { runStrategy } = require('../strategy');

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
        const symbol     = (req.query.symbol || 'BOSCHLTD').toUpperCase();
        const months     = parseInt(req.query.months) || 6;
        const typeFilter = (req.query.type || 'ALL').toUpperCase();

        // ── Cache check ──────────────────────────────────────────────────
        const cacheKey = `${symbol}_${months}`;
        const cached   = cache.get(cacheKey);
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
                open:     parseFloat(open),
                high:     parseFloat(high),
                low:      parseFloat(low),
                close:    parseFloat(close),
                volume:   parseFloat(volume) || 0
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
                index:       m.index,
                datetime:    datetimeIST,
                datetimeUTC: datetimeUTC,
                type:        m.type
            };
        });

        // ── Store in cache ────────────────────────────────────────────
        const meta = {
            success:      true,
            symbol,
            interval:     'FIVE_MINUTE',
            months,
            totalCandles: candles.length,
            dataFrom:     candles[0].datetime,
            dataTo:       candles[candles.length - 1].datetime,
            buyCount:     allMarkers.filter(m => m.type === 'BUY').length,
            sellCount:    allMarkers.filter(m => m.type === 'SELL').length,
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

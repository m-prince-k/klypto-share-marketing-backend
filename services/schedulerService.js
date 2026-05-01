const { Candle } = require('../models');
const store = require('./marketStore');
const smartApi = require('./smartApi');
const { getCandlesWithCache, formatDate } = require('./dbService');

function startSchedulers() {
    // 1. Save Aggregated Candles to DB every 60 seconds
    setInterval(async () => {
        const tokens = Object.keys(store.liveCandles);
        if (tokens.length === 0) return;

        const candleData = tokens.map(token => {
            const c = store.liveCandles[token];
            const symbol = store.tokenToName[token] || token;
            return {
                symbol: symbol,
                token: token,
                exchange: symbol.includes("-") ? "NFO" : "NSE",
                interval: "ONE_MINUTE",
                timestamp: new Date(c.minute),
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume
            };
        });

        try {
            await Candle.bulkCreate(candleData, { ignoreDuplicates: true });
        } catch (err) {
            console.error("[Aggregator] DB Save Error:", err.message);
        }
    }, 60000);

    // 2. Background Sync for 1-minute Gaps (Every 5 minutes)
    setInterval(async () => {
        if (!smartApi.access_token || store.stocks.length === 0) return;
        const sample = store.stocks.sort(() => 0.5 - Math.random()).slice(0, 5);
        for (const stock of sample) {
            try {
                await getCandlesWithCache(stock.name, stock.token, "NSE", "ONE_MINUTE", null, null);
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error(`[Sync-1m] Failed for ${stock.name}:`, err.message);
            }
        }
    }, 300000);

    // 3. Background Sync for 5-minute Candles (Every 10 minutes)
    setInterval(async () => {
        if (!smartApi.access_token || store.stocks.length === 0) return;
        console.log("[Scheduler] Syncing 5-minute candles for random stocks...");
        const sample = store.stocks.sort(() => 0.5 - Math.random()).slice(0, 10);
        for (const stock of sample) {
            try {
                await getCandlesWithCache(stock.name, stock.token, "NSE", "FIVE_MINUTE", null, null);
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error(`[Sync-5m] Failed for ${stock.name}:`, err.message);
            }
        }
    }, 600000);
}

async function runInitialHistoricalLoad() {
    const intervals = ['FIVE_MINUTE', 'ONE_DAY'];
    console.log(`\n[Initial Load] Starting background 1-year sync for ${store.stocks.length} stocks...`);
    
    for (const stock of store.stocks) {
        for (const interval of intervals) {
            try {
                // Check if we already have enough data for this interval
                const count = await Candle.count({ where: { symbol: stock.name, interval: interval } });
                if (count > 20000) {
                    console.log(`[Initial Load] Skipping ${stock.name} (${interval}) - already has ${count} records.`);
                    continue;
                }

                console.log(`[Initial Load] Syncing ${stock.name} for ${interval} (Last 1 Year)...`);
                
                // Fetch in 30-day chunks for 12 months
                for (let i = 0; i < 12; i++) {
                    const now = new Date();
                    const toDateObj = new Date();
                    toDateObj.setDate(now.getDate() - (i * 30));
                    const fromDateObj = new Date();
                    fromDateObj.setDate(now.getDate() - ((i + 1) * 30));

                    const fDate = formatDate(fromDateObj, "09:15");
                    const tDate = formatDate(toDateObj, "15:30");

                    await getCandlesWithCache(stock.name, stock.token, "NSE", interval, fDate, tDate);
                    
                    // Small delay to respect rate limits
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (err) {
                console.error(`[Initial Load] Failed for ${stock.name} (${interval}):`, err.message);
            }
        }
    }
    console.log("\n[Initial Load] All historical sync tasks completed.");
}

module.exports = { startSchedulers, runInitialHistoricalLoad };

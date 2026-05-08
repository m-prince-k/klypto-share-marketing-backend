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
            const exchange = store.tokenToExchange[token] || "NSE";
            return {
                symbol: symbol,
                token: token,
                exchange: exchange,
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
                await getCandlesWithCache(stock.name, stock.token, stock.segment || "NSE", "ONE_MINUTE", null, null);
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
                await getCandlesWithCache(stock.name, stock.token, stock.segment || "NSE", "FIVE_MINUTE", null, null);
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                console.error(`[Sync-5m] Failed for ${stock.name}:`, err.message);
            }
        }
    }, 600000);

    // 4. Background Sync for Futures (Every 15 minutes)
    setInterval(async () => {
        if (!smartApi.access_token || store.stocks.length === 0) return;
        console.log("[Scheduler] Syncing Futures data for random stocks (5m & 1d)...");
        const sample = store.stocks.sort(() => 0.5 - Math.random()).slice(0, 5);
        for (const stock of sample) {
            try {
                // Find best near-month future
                const futures = store.nfoMasterData.filter(f => f.name === stock.name && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX"));
                if (futures.length > 0) {
                    const bestFuture = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
                    for (const interval of ['FIVE_MINUTE', 'ONE_DAY']) {
                        await getCandlesWithCache(bestFuture.symbol, bestFuture.token, "NFO", interval, null, null);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            } catch (err) {
                console.error(`[Sync-Futures] Failed for ${stock.name}:`, err.message);
            }
        }
    }, 900000);

    // 5. Background Sync for Options ATM (Every 20 minutes)
    setInterval(async () => {
        if (!smartApi.access_token || store.nfoMasterData.length === 0) return;
        console.log("[Scheduler] Syncing ATM Options data for Indices...");
        const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY"];
        
        for (const index of indices) {
            try {
                const ltpData = store.latestMarketData[`${index}:NSE`];
                if (!ltpData || !ltpData.ltp || ltpData.ltp === "0.00") continue;

                const ltp = parseFloat(ltpData.ltp);
                const strikeGap = (index === "BANKNIFTY" || index === "BANKEX") ? 100 : 50;
                const atmStrike = Math.round(ltp / strikeGap) * strikeGap;

                // Find nearest expiry ATM CE and PE
                const options = store.nfoMasterData.filter(o => 
                    o.name === index && 
                    (parseFloat(o.strike) / 100) === atmStrike &&
                    (o.instrumenttype === "OPTIDX")
                );

                if (options.length > 0) {
                    const nearestExpiry = [...new Set(options.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b))[0];
                    const atmOptions = options.filter(o => o.expiry === nearestExpiry);

                    for (const opt of atmOptions) {
                        // Format expiry to YYYY-MM-DD for database DATEONLY field
                        const rawExp = opt.expiry; // e.g. "07MAY2026"
                        let formattedExpiry = rawExp;
                        if (rawExp && rawExp.length >= 9) {
                            const day = rawExp.substring(0, 2);
                            const monthStr = rawExp.substring(2, 5);
                            const year = rawExp.substring(5);
                            const monthMap = { 'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12' };
                            const month = monthMap[monthStr.toUpperCase()] || '01';
                            formattedExpiry = `${year}-${month}-${day}`;
                        }

                        const extraInfo = {
                            underlying: index,
                            strike: parseFloat(opt.strike) / 100,
                            expiry: formattedExpiry,
                            optionType: opt.symbol.endsWith("CE") ? "CE" : "PE"
                        };

                        for (const interval of ['FIVE_MINUTE', 'ONE_DAY']) {
                            await getCandlesWithCache(opt.symbol, opt.token, "NFO", interval, null, null, extraInfo);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }
            } catch (err) {
                console.error(`[Sync-Options] Failed for ${index}:`, err.message);
            }
        }
    }, 1200000);
    
    // 6. Background Sync for Priority Options (ABB, etc.) - Every 15 minutes
    setInterval(async () => {
        if (!smartApi.access_token || store.nfoMasterData.length === 0) return;
        
        const prioritySymbols = ["ABB", "ABBPOW", "ADAENT", "ADAGRE", "ADAPOR", "ADATRA", "ADICAP", "ALKLAB", "AMBCE", "AMBEN"];
        console.log(`[Scheduler] Continuing sync for priority options: ${prioritySymbols.join(', ')}...`);
        
        for (const userSym of prioritySymbols) {
            try {
                const stockObj = store.stocks.find(s => s.userCode === userSym);
                const sym = stockObj ? stockObj.name : userSym;
                const ltpData = store.latestMarketData[`${sym}:NSE`];
                if (!ltpData || !ltpData.ltp || ltpData.ltp === "0.00") continue;

                const ltp = parseFloat(ltpData.ltp);
                const allOpts = store.nfoMasterData.filter(o => o.name === sym && (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX"));
                if (allOpts.length === 0) continue;

                const uniqueStrikes = [...new Set(allOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
                const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
                const atmIdx = uniqueStrikes.indexOf(atmStrike);
                
                // Get +/- 2 strikes for continuous updates
                const targetStrikes = uniqueStrikes.slice(Math.max(0, atmIdx - 2), Math.min(uniqueStrikes.length, atmIdx + 3));
                const targetExpiry = allOpts.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0].expiry;

                for (const strike of targetStrikes) {
                    for (const type of ['CE', 'PE']) {
                        const opt = allOpts.find(o => parseFloat(o.strike) / 100 === strike && o.symbol.endsWith(type) && o.expiry === targetExpiry);
                        if (!opt) continue;

                        const extraInfo = { underlying: sym, strike, expiry: targetExpiry, optionType: type };
                        await getCandlesWithCache(opt.symbol, opt.token, "NFO", "FIVE_MINUTE", null, null, extraInfo);
                        await new Promise(r => setTimeout(r, 500));
                    }
                }

                // Count current records for this symbol
                const optCount = await OptionChain.count({ where: { underlying: sym } });
                const eqCount = await Candle.count({ where: { symbol: sym } });
                
                getIO().emit("syncStatus", {
                    symbol: userSym,
                    optionRecords: optCount,
                    equityRecords: eqCount,
                    timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }),
                    message: `[Sync Alert] ${userSym} is running. Options: ${optCount}, Equity: ${eqCount}`
                });

            } catch (err) {
                console.error(`[Sync-Priority-Options] Failed for ${userSym}:`, err.message);
            }
        }
    }, 900000);
}

const { syncPriorityOptionsHistory } = require('./optionSyncService');

async function runInitialHistoricalLoad() {
    console.log("[Initial Load] Starting Priority Options Sync (ABB, etc.)...");
    syncPriorityOptionsHistory().catch(err => console.error("[Initial Load] Priority Sync Error:", err.message));

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

                    const fDate = formatDate(fromDateObj, "09:15", interval);
                    const tDate = formatDate(toDateObj, "15:30", interval);

                    await getCandlesWithCache(stock.name, stock.token, stock.segment || "NSE", interval, fDate, tDate);
                    
                    // Small delay to respect rate limits
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (err) {
                console.error(`[Initial Load] Failed for ${stock.name} (${interval}):`, err.message);
            }
        }
    }

    console.log(`\n[Initial Load] Starting background 1-year sync for Futures...`);
    for (const stock of store.stocks) {
        const futures = store.nfoMasterData.filter(f => f.name === stock.name && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX"));
        if (futures.length > 0) {
            const bestFuture = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
            for (const interval of intervals) {
                try {
                    const count = await Candle.count({ where: { symbol: bestFuture.symbol, interval: interval } });
                    if (count > 5000) {
                        console.log(`[Initial Load] Skipping Future ${bestFuture.symbol} (${interval}) - already has ${count} records.`);
                        continue;
                    }

                    console.log(`[Initial Load] Syncing Future ${bestFuture.symbol} for ${interval} (Last 1 Year)...`);
                    for (let i = 0; i < 12; i++) {
                        const now = new Date();
                        const toDateObj = new Date();
                        toDateObj.setDate(now.getDate() - (i * 30));
                        const fromDateObj = new Date();
                        fromDateObj.setDate(now.getDate() - ((i + 1) * 30));

                        const fDate = formatDate(fromDateObj, "09:15", interval);
                        const tDate = formatDate(toDateObj, "15:30", interval);

                        await getCandlesWithCache(bestFuture.symbol, bestFuture.token, "NFO", interval, fDate, tDate);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (err) {
                    console.error(`[Initial Load] Failed for Future ${bestFuture.symbol} (${interval}):`, err.message);
                }
            }
        }
    }

    console.log("\n[Initial Load] All historical sync tasks completed.");
}

module.exports = { startSchedulers, runInitialHistoricalLoad };

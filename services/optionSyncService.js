const store = require('./marketStore');
const { getHistoricalCandle } = require('./angelOne');
const { OptionChain } = require('../models');
const smartApi = require('./smartApi');

async function syncPriorityOptionsHistory() {
    const symbols = [
        "ABB", "ABBPOW", "ADAENT", "ADAGRE", "ADAPOR", "ADATRA", "ADICAP", "ALKLAB", "AMBCE", "AMBEN",
        "ANGBRO", "APLAPO", "APOHOS", "ASHLEY", "ASIPAI", "ASTPOL", "AURPHA", "AUSMA", "AVESUP", "AXIBAN"
    ];

    const interval = "5m";
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(toDate.getDate() - 90);

    console.log(`[PrioritySync] Starting sync for 20 symbols, 90 days, 5m interval...`);

    for (const userSym of symbols) {
        try {
            // Find actual NSE symbol from store
            const stockObj = store.stocks.find(s => s.userCode === userSym && s.segment === "NSE");
            const sym = stockObj ? stockObj.name : userSym;

            console.log(`[PrioritySync] Processing ${userSym} (Actual: ${sym})...`);

            // 1. Get LTP for ATM calculation
            let ltp = 0;
            const key = `${sym}:NSE`;
            if (store.latestMarketData[key]) {
                ltp = parseFloat(store.latestMarketData[key].last_traded_price || 0);
            }

            if (ltp === 0) {
                console.log(`[PrioritySync] LTP for ${sym} not in store. Fetching via API...`);
                const token = store.symbolToTokenMaster[sym];
                if (token) {
                    const resp = await smartApi.marketData({ 
                        mode: "LTP", 
                        exchangeTokens: { "NSE": [token] } 
                    });
                    if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                        ltp = parseFloat(resp.data.fetched[0].ltp);
                    }
                }
            }

            if (ltp === 0) {
                console.log(`[PrioritySync] Could not resolve LTP for ${sym}. Using a default strike search.`);
                // If we can't get LTP, we can't reliably find ATM. Skip for now.
                continue;
            }

            console.log(`[PrioritySync] ${sym} Current LTP: ${ltp}`);

            // 2. Identify Strikes
            const allOpts = store.nfoMasterData.filter(o => o.name === sym && (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX"));
            if (allOpts.length === 0) {
                console.log(`[PrioritySync] No options found for ${sym} in NFO master.`);
                continue;
            }

            const uniqueStrikes = [...new Set(allOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
            if (uniqueStrikes.length === 0) continue;

            // Find closest strike (ATM)
            const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
            const atmIdx = uniqueStrikes.indexOf(atmStrike);
            
            // Get +/- 5 strikes
            const startIdx = Math.max(0, atmIdx - 5);
            const endIdx = Math.min(uniqueStrikes.length, atmIdx + 6);
            const targetStrikes = uniqueStrikes.slice(startIdx, endIdx);

            // Get current monthly expiry
            const sortedByExpiry = allOpts.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
            const targetExpiry = sortedByExpiry[0].expiry;

            console.log(`[PrioritySync] Symbol: ${sym}, ATM: ${atmStrike}, Expiry: ${targetExpiry}, Strikes: ${targetStrikes.join(', ')}`);

            for (const strike of targetStrikes) {
                for (const type of ['CE', 'PE']) {
                    const opt = allOpts.find(o => 
                        parseFloat(o.strike) / 100 === strike && 
                        o.symbol.endsWith(type) && 
                        o.expiry === targetExpiry
                    );

                    if (!opt) continue;

                    console.log(`[PrioritySync] Fetching ${opt.symbol} (${opt.token}) - 3 Chunks...`);
                    
                    // Fetch in 30-day chunks for 90 days total
                    for (let i = 0; i < 3; i++) {
                        const chunkToDate = new Date();
                        chunkToDate.setDate(toDate.getDate() - (i * 30));
                        const chunkFromDate = new Date();
                        chunkFromDate.setDate(toDate.getDate() - ((i + 1) * 30));

                        const fDateStr = chunkFromDate.toISOString().split('T')[0] + " 09:15";
                        const tDateStr = chunkToDate.toISOString().split('T')[0] + " 15:30";

                        const candles = await getHistoricalCandle({
                            symbol: opt.symbol,
                            interval: "5m",
                            fromDate: fDateStr,
                            toDate: tDateStr,
                            exchange: opt.exch_seg,
                            symboltoken: opt.token
                        });

                        if (candles && candles.length > 0) {
                            const dbData = candles.map(c => ({
                                underlying: sym,
                                symbol: opt.symbol,
                                token: opt.token,
                                exchange: opt.exch_seg,
                                interval: "5m",
                                timestamp: c.timestamp,
                                strike: strike,
                                expiry: opt.expiry,
                                optionType: type,
                                open: c.open,
                                high: c.high,
                                low: c.low,
                                close: c.close,
                                volume: c.volume
                            }));

                            await OptionChain.bulkCreate(dbData, { ignoreDuplicates: true });
                            console.log(`[PrioritySync] Saved ${dbData.length} candles for ${opt.symbol} (Chunk ${i+1})`);
                        }
                        
                        // Small delay to respect rate limits
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            }

        } catch (err) {
            console.error(`[PrioritySync] Failed for ${sym}:`, err.message);
        }
    }

    console.log(`[PrioritySync] Completed Priority Sync.`);
}

module.exports = { syncPriorityOptionsHistory };

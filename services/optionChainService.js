const store = require('./marketStore');
const EVENTS = require('../constants/socketEvents');
const { DailyOptionData } = require('../models');
const smartApi = require('./smartApi');

/**
 * OptionChainService
 * Manages live option chain subscriptions and updates
 */
class OptionChainService {
    constructor() {
        this.activeSubscriptions = new Map(); // socketId -> { symbol, expiry, tokens: [] }
        this.io = null;
    }

    init(io) {
        this.io = io;
    }

    /**
     * Subscribe a socket to a live option chain
     */
    async subscribe(socket, payload) {
        const { symbol, expiry } = payload;
        if (!symbol) return socket.emit(EVENTS.OPTION_CHAIN_ERROR, { message: "Symbol is required" });

        console.log(`[OptionChain] Socket ${socket.id} subscribing to ${symbol} (Expiry: ${expiry || 'Near'})`);

        try {
            // 1. Get Underlying LTP for ATM calculation
            const uSym = symbol.toUpperCase();
            const isMCX = uSym === "GOLD" || uSym === "SILVER";
            const exchangeType = isMCX ? "MCX" : "NSE";
            const apiExchangeType = isMCX ? 5 : 2;

            const key = `${uSym}:${exchangeType}`;
            let ltp = store.latestMarketData[key]?.last_traded_price || 0;

            // 1.5 - REST FETCH for Spot Price if missing
            if (ltp === 0) {
                try {
                    const token = isMCX ? (uSym === "GOLD" ? "234454" : "234455") : ""; // Fallback tokens if we can't find them
                    console.log(`[OptionChain] Fetching spot price for ${uSym} via REST...`);
                    const resp = await smartApi.marketData({
                        mode: "LTP",
                        exchangeTokens: { [exchangeType]: isMCX ? [uSym] : [uSym] }
                    });
                    if (resp?.data?.fetched?.[0]) {
                        ltp = resp.data.fetched[0].ltp;
                    }
                } catch (e) {
                    console.warn(`[OptionChain] REST Spot Fetch failed for ${uSym}:`, e.message);
                }
            }

            if (ltp === 0) {
                const anyKey = Object.keys(store.latestMarketData).find(k => k.startsWith(`${uSym}:`));
                if (anyKey) ltp = store.latestMarketData[anyKey].last_traded_price;
            }

            ltp = parseFloat(ltp);
            if (isNaN(ltp) || ltp === 0) {
                return socket.emit(EVENTS.OPTION_CHAIN_ERROR, { message: `Current price for ${symbol} not available. Select another symbol or try later.` });
            }

            // 2. Filter Master Data (MCX vs NFO)
            const masterData = isMCX ? (store.mcxMasterData || []) : (store.nfoMasterData || []);
            const allOpts = masterData.filter(o => 
                (o.name === uSym || o.symbol.startsWith(uSym)) && 
                (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTCOM")
            );

            if (allOpts.length === 0) {
                return socket.emit(EVENTS.OPTION_CHAIN_ERROR, { message: `No options found for ${symbol} in ${isMCX ? 'MCX' : 'NFO'} master.` });
            }

            // 3. Resolve Expiry
            const availableExpiries = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
            const targetExpiry = expiry || availableExpiries[0];

            const expiryOpts = allOpts.filter(o => o.expiry === targetExpiry);
            if (expiryOpts.length === 0) {
                return socket.emit(EVENTS.OPTION_CHAIN_ERROR, { message: `No options found for ${symbol} with expiry ${targetExpiry}` });
            }

            // 4. Identify Strikes around ATM
            const uniqueStrikes = [...new Set(expiryOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
            const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
            const atmIdx = uniqueStrikes.indexOf(atmStrike);

            // +/- 5 strikes
            const startIdx = Math.max(0, atmIdx - 5);
            const endIdx = Math.min(uniqueStrikes.length, atmIdx + 6);
            const targetStrikes = uniqueStrikes.slice(startIdx, endIdx);

            // 5. Collect Tokens and Build Initial Chain
            const selectedContracts = [];
            const tokensToSubscribe = [];
            const exchangeTokens = { "NFO": [] };

            targetStrikes.forEach(strike => {
                const ce = expiryOpts.find(o => parseFloat(o.strike) / 100 === strike && o.symbol.endsWith("CE"));
                const pe = expiryOpts.find(o => parseFloat(o.strike) / 100 === strike && o.symbol.endsWith("PE"));

                const row = { strike };
                if (ce) {
                    row.ce = { 
                        token: ce.token, 
                        symbol: ce.symbol, 
                        ltp: store.latestMarketData[`${ce.symbol}:NFO`]?.last_traded_price || 0,
                        oi: store.latestMarketData[`${ce.symbol}:NFO`]?.oi || store.latestMarketData[`${ce.symbol}:NFO`]?.open_interest || 0
                    };
                    tokensToSubscribe.push(ce.token);
                    exchangeTokens["NFO"].push(ce.token);
                    store.tokenToName[ce.token] = ce.symbol;
                    store.tokenToExchange[ce.token] = "NFO";
                }
                if (pe) {
                    row.pe = { 
                        token: pe.token, 
                        symbol: pe.symbol, 
                        ltp: store.latestMarketData[`${pe.symbol}:NFO`]?.last_traded_price || 0,
                        oi: store.latestMarketData[`${pe.symbol}:NFO`]?.oi || store.latestMarketData[`${pe.symbol}:NFO`]?.open_interest || 0
                    };
                    tokensToSubscribe.push(pe.token);
                    exchangeTokens["NFO"].push(pe.token);
                    store.tokenToName[pe.token] = pe.symbol;
                    store.tokenToExchange[pe.token] = "NFO";
                }
                selectedContracts.push(row);
            });

            // 5.9 - Track Subscription
            this.activeSubscriptions.set(socket.id, { 
                symbol: uSym, 
                expiry: targetExpiry, 
                tokens: tokensToSubscribe,
                strikes: selectedContracts
            });

            const roomName = `option_chain_${uSym}_${targetExpiry}`.trim();
            socket.join(roomName);

            // 7. Emit Initial Data
            socket.emit(EVENTS.OPTION_CHAIN_UPDATE, {
                symbol: uSym,
                expiry: targetExpiry,
                spotPrice: ltp,
                atmStrike,
                chain: selectedContracts
            });

            // 8. Background REST FETCH
            (async () => {
                try {
                    const marketResp = await smartApi.marketData({
                        mode: "FULL",
                        exchangeTokens: exchangeTokens
                    });

                    if (marketResp?.data?.fetched) {
                        marketResp.data.fetched.forEach(item => {
                            const row = selectedContracts.find(r => r.ce?.token === String(item.token) || r.pe?.token === String(item.token));
                            if (row) {
                                const side = row.ce?.token === String(item.token) ? 'ce' : 'pe';
                                row[side].ltp = item.ltp || item.last_traded_price || 0;
                                row[side].oi = item.oi || item.open_interest || 0;
                                
                                const key = `${row[side].symbol}:NFO`;
                                store.latestMarketData[key] = { ...store.latestMarketData[key], ...item, last_traded_price: item.ltp };
                                
                                this.io.to(roomName).emit(EVENTS.OPTION_CHAIN_UPDATE, {
                                    symbol: uSym,
                                    token: String(item.token),
                                    ltp: item.ltp || 0,
                                    oi: item.oi || 0
                                });
                            }
                        });
                    }
                } catch (apiErr) {
                    console.warn("[OptionChain] Background fetch failed:", apiErr.message);
                }
            })();

            // 9. Subscribe WebSocket
            if (store.wsClient && tokensToSubscribe.length > 0) {
                store.wsClient.fetchData({
                    correlationID: `oc_${uSym}_${Date.now()}`,
                    action: 1, mode: 3, exchangeType: 2,
                    tokens: tokensToSubscribe.map(t => String(t).trim())
                });
            }

        } catch (err) {
            console.error("[OptionChain] Subscription error:", err.message);
            socket.emit(EVENTS.OPTION_CHAIN_ERROR, { message: err.message });
        }
    }

    unsubscribe(socketId) {
        const sub = this.activeSubscriptions.get(socketId);
        if (sub) {
            console.log(`[OptionChain] Socket ${socketId} unsubscribed from ${sub.symbol}`);
            this.activeSubscriptions.delete(socketId);
        }
    }

    /**
     * Broadcast live tick to relevant option chain rooms
     */
    handleTick(tick) {
        if (!this.io) return;
        
        const cleanTickToken = String(tick.token).trim();

        for (const [socketId, sub] of this.activeSubscriptions.entries()) {
            const roomName = `option_chain_${sub.symbol}_${sub.expiry}`.trim();

            // Case A: This tick is for the underlying asset (Spot Price)
            if (tick.symbol === sub.symbol && (tick.exchange === "NSE" || tick.exchange === "BSE")) {
                const spotPrice = tick.last_traded_price || tick.lp || tick.ltp || 0;
                this.io.to(roomName).emit(EVENTS.OPTION_CHAIN_UPDATE, {
                    symbol: sub.symbol,
                    spotPrice: spotPrice
                });
            }

            // Case B: This tick is for an option contract in the chain
            if (tick.exchange === "NFO" && sub.tokens.some(t => String(t).trim() === cleanTickToken)) {
                const ltpValue = tick.last_traded_price || tick.lp || tick.ltp || 0;
                const oiValue = tick.oi || tick.open_interest || tick.openinterest || 0;

                this.io.to(roomName).emit(EVENTS.OPTION_CHAIN_UPDATE, {
                    symbol: sub.symbol,
                    token: cleanTickToken,
                    ltp: ltpValue,
                    oi: oiValue,
                    net_change: tick.net_change || 0
                });
            }
        }
    }

    /**
     * Save EOD snapshot of option chains for specified symbols
     */
    async saveDailySnapshot(symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "TCS", "RELIANCE", "ABB"]) {
        console.log(`[Snapshot] Starting snapshot. NFO Master Count: ${store.nfoMasterData.length}`);
        const today = new Date().toISOString().split('T')[0];

        if (store.nfoMasterData.length === 0) {
            console.log("[Snapshot] FATAL: NFO Master Data is empty! Snapshot aborted.");
            return;
        }

        for (const symbol of symbols) {
            try {
                const uSym = symbol.toUpperCase();
                const token = store.symbolToTokenMaster[uSym] || store.symbolToTokenMaster[`${uSym}:NSE`];
                const tokenExchange = store.tokenToExchange[token] || "NSE";
                
                let ltp = 0;
                const liveStore = store.latestMarketData[`${uSym}:${tokenExchange}`];
                if (liveStore) {
                    ltp = parseFloat(liveStore.ltp || liveStore.last_traded_price || 0);
                }

                if (ltp === 0) {
                    console.log(`[Snapshot] No LTP in store for ${uSym} (${tokenExchange}). Fetching from API...`);
                    if (token) {
                        const resp = await smartApi.marketData({ 
                            mode: "LTP", 
                            exchangeTokens: { [tokenExchange]: [token] } 
                        });
                        if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                            ltp = parseFloat(resp.data.fetched[0].ltp);
                        }
                    }
                }

                if (ltp === 0) {
                    console.log(`[Snapshot] Skipping ${uSym} - LTP still 0.`);
                    continue;
                }

                // Get near-month expiry
                const allOpts = store.nfoMasterData.filter(o => 
                    (o.name === uSym || o.symbol.startsWith(uSym)) && 
                    (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTCOM")
                );
                console.log(`[Snapshot] ${uSym} - Found ${allOpts.length} contracts in NFO master.`);
                if (allOpts.length === 0) continue;

                const targetExpiry = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b))[0];
                const expiryOpts = allOpts.filter(o => o.expiry === targetExpiry);
                console.log(`[Snapshot] ${uSym} - Target Expiry: ${targetExpiry}. Total contracts for this expiry: ${expiryOpts.length}`);

                // Get +/- 10 strikes for saving
                const uniqueStrikes = [...new Set(expiryOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
                const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - ltp) < Math.abs(prev - ltp) ? curr : prev);
                const atmIdx = uniqueStrikes.indexOf(atmStrike);
                const targetStrikes = uniqueStrikes.slice(Math.max(0, atmIdx - 10), Math.min(uniqueStrikes.length, atmIdx + 11));

                const dbData = [];
                const tokensToFetch = expiryOpts
                    .filter(o => targetStrikes.includes(parseFloat(o.strike) / 100))
                    .map(o => o.token);

                // Fetch full market data for these tokens in chunks of 50
                const batchSize = 50;
                const marketDataMap = {};
                
                for (let i = 0; i < tokensToFetch.length; i += batchSize) {
                    const batch = tokensToFetch.slice(i, i + batchSize);
                    const resp = await smartApi.marketData({
                        mode: "FULL",
                        exchangeTokens: { "NFO": batch }
                    });
                    if (resp && resp.data && resp.data.fetched) {
                        resp.data.fetched.forEach(d => {
                            // API returns symbolToken, not token
                            const tkn = d.symbolToken || d.token;
                            if (tkn) marketDataMap[tkn] = d;
                        });
                    }
                    await new Promise(r => setTimeout(r, 200)); // Respect rate limits
                }

                targetStrikes.forEach(strike => {
                    ['CE', 'PE'].forEach(type => {
                        const opt = expiryOpts.find(o => parseFloat(o.strike) / 100 === strike && o.symbol.endsWith(type));
                        if (opt) {
                            const live = marketDataMap[opt.token] || store.latestMarketData[`${opt.symbol}:NFO`] || {};
                            dbData.push({
                                underlying: uSym,
                                symbol: opt.symbol,
                                token: opt.token,
                                exchange: "NFO",
                                strike: strike,
                                expiry: targetExpiry,
                                optionType: type,
                                ltp: parseFloat(live.ltp || 0),
                                open: parseFloat(live.open || 0),
                                high: parseFloat(live.high || 0),
                                low: parseFloat(live.low || 0),
                                close: parseFloat(live.close || 0),
                                oi: parseInt(live.opnInterest || live.oi || 0),
                                oiChange: parseInt(live.net_change_oi || 0),
                                iv: parseFloat(live.iv || 0),
                                netChange: parseFloat(live.netChange || live.net_change || 0),
                                bidPrice: parseFloat(live.depth?.buy?.[0]?.price || 0),
                                bidQty: parseInt(live.depth?.buy?.[0]?.quantity || 0),
                                askPrice: parseFloat(live.depth?.sell?.[0]?.price || 0),
                                askQty: parseInt(live.depth?.sell?.[0]?.quantity || 0),
                                volume: parseInt(live.tradeVolume || live.v || 0),
                                timestamp: today
                            });
                        }
                    });
                });

                if (dbData.length > 0) {
                    console.log(`[Snapshot] Saving ${dbData.length} records for ${uSym} to DB...`);
                    try {
                        await DailyOptionData.bulkCreate(dbData, { ignoreDuplicates: true });
                        console.log(`[Snapshot] SUCCESS: Saved data for ${uSym}.`);
                    } catch (dbErr) {
                        console.error(`[Snapshot] DB ERROR for ${uSym}:`, dbErr.message);
                    }
                } else {
                    console.log(`[Snapshot] No data prepared for ${uSym} (dbData is empty). Check if marketDataMap is empty or tokensToFetch was empty.`);
                }

            } catch (err) {
                console.error(`[OptionChain] Snapshot failed for ${symbol}:`, err.message);
            }
        }
    }
    async getFormattedOptionChain(symbol, expiry) {
        try {
            const uSym = symbol.toUpperCase();
            
            // 1. Get underlying LTP
            const token = store.symbolToTokenMaster[uSym] || store.symbolToTokenMaster[`${uSym}:NSE`];
            const tokenExchange = store.tokenToExchange[token] || "NSE";
            let underlyingLTP = 0;
            const liveStore = store.latestMarketData[`${uSym}:${tokenExchange}`];
            if (liveStore) {
                underlyingLTP = parseFloat(liveStore.ltp || liveStore.last_traded_price || 0);
            }

            // 2. Fetch all options for this symbol
            const allOpts = store.nfoMasterData.filter(o => 
                (o.name === uSym) && 
                (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX")
            );

            if (allOpts.length === 0) return { success: false, message: `No options found for symbol ${uSym}` };

            // Get unique expiries to help user if match fails
            const uniqueExpiries = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));

            // 3. Match expiry (Flexible matching)
            const targetExpiry = expiry ? expiry.toUpperCase().trim() : uniqueExpiries[0];
            const matchedOpts = allOpts.filter(o => o.expiry.toUpperCase().trim() === targetExpiry);

            if (matchedOpts.length === 0) {
                return { 
                    success: false, 
                    message: `Expiry ${targetExpiry} not found.`,
                    availableExpiries: uniqueExpiries
                };
            }

            // 4. Group by strike
            const strikeMap = {};
            matchedOpts.forEach(o => {
                const strike = parseFloat(o.strike) / 100;
                if (!strikeMap[strike]) strikeMap[strike] = { strike, call: null, put: null };
                
                const live = store.latestMarketData[`${o.symbol}:NFO`] || {};
                const data = {
                    token: o.token,
                    symbol: o.symbol,
                    ltp: parseFloat(live.ltp || live.last_traded_price || 0),
                    oi: parseInt(live.oi || live.opnInterest || 0),
                    oiChange: parseInt(live.net_change_oi || 0),
                    netChange: parseFloat(live.netChange || live.net_change || 0),
                    volume: parseInt(live.volume || live.tradeVolume || 0),
                    iv: parseFloat(live.iv || 0),
                    bid: parseFloat(live.depth?.buy?.[0]?.price || 0),
                    bidQty: parseInt(live.depth?.buy?.[0]?.quantity || 0),
                    ask: parseFloat(live.depth?.sell?.[0]?.price || 0),
                    askQty: parseInt(live.depth?.sell?.[0]?.quantity || 0)
                };

                if (o.symbol.endsWith("CE")) strikeMap[strike].call = data;
                else if (o.symbol.endsWith("PE")) strikeMap[strike].put = data;
            });

            const sortedStrikes = Object.values(strikeMap).sort((a, b) => a.strike - b.strike);

            return {
                success: true,
                underlying: uSym,
                underlyingLTP,
                expiry: targetExpiry,
                availableExpiries: uniqueExpiries,
                data: sortedStrikes
            };

        } catch (error) {
            console.error("[getFormattedOptionChain] Error:", error.message);
            throw error;
        }
    }
}

module.exports = new OptionChainService();

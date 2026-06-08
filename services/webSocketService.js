const { WebSocketV2 } = require("smartapi-javascript");
const store = require("./marketStore");
const EVENTS = require("../constants/socketEvents");
const alertService = require("./alertService");
const optionChainService = require("./optionChainService");
const { handleIndicatorBroadcast } = require('./socket');
function isNSEOpen() {
    const now = new Date();
    const day = now.getDay();
    const currentMinute = now.getHours() * 100 + now.getMinutes();
    // Monday to Friday, 09:15 AM to 03:30 PM (NSE/BSE)
    return day >= 1 && day <= 5 && currentMinute >= 915 && currentMinute <= 1530;
}

function isMCXOpen() {
    const now = new Date();
    const day = now.getDay();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    // Monday to Friday, 09:00 AM to 03:30 PM (Restricted by user)
    return day >= 1 && day <= 5 && currentTime >= 900 && currentTime <= 1530;
}

function isAnyMarketOpen() {
    return isNSEOpen() || isMCXOpen();
}


function formatTickData(data) {
    if (!data || data === "pong") return null;

    let formatted = { ...data };
    let cleanToken = data.token ? data.token.replace(/\"/g, "").trim() : null;
    formatted.exchange = store.tokenToExchange[cleanToken] || "NSE";
    formatted.symbol = store.tokenToName[cleanToken] || cleanToken || "Unknown";

    const priceFields = [
        'last_traded_price', 'open_price_day', 'high_price_day', 'low_price_day', 
        'close_price', 'avg_traded_price', 'avg_price', 'net_change', 
        'upper_circuit', 'lower_circuit', 'fiftytwo_week_high', 'fiftytwo_week_low'
    ];
    priceFields.forEach(field => {
        if (formatted[field]) {
            formatted[field] = (parseFloat(formatted[field]) / 100).toFixed(2);
        }
    });

    formatted.sentiment = (data.last_traded_price > data.close_price) ? "bullish" : "bearish";
    formatted.fetchedAt = new Date().toISOString();



    const ltp = parseFloat(formatted.last_traded_price || 0);
    // Use multiple keys to ensure volume is captured (v, vol, volume, total_traded_quantity)
    const volume = parseInt(data.v || data.vol || data.volume || data.total_traded_quantity || formatted.v || 0);
    const ts = parseInt(data.exchange_timestamp || 0);
    const ms = ts > 10000000000 ? ts : ts * 1000;
    const currentMinute = Math.floor(ms / 60000) * 60000;


    if (!store.liveCandles[cleanToken]) {
        store.liveCandles[cleanToken] = {
            open: ltp, high: ltp, low: ltp, close: ltp, 
            volume: 0, // Reset for new candle
            startVolume: volume, // Store cumulative volume at start
            minute: currentMinute,
            tickTime: formatted.exchange_timestamp,
            readableTickTime: formatted.readable_timestamp
        };
    } else {
        const candle = store.liveCandles[cleanToken];
        if (currentMinute === candle.minute) {
            candle.high = Math.max(candle.high, ltp);
            candle.low = Math.min(candle.low, ltp);
            candle.close = ltp;
            // Calculate incremental volume for this minute
            candle.volume = volume - candle.startVolume;
            candle.tickTime = formatted.exchange_timestamp;
            candle.readableTickTime = formatted.readable_timestamp;
        } else {
            // Minute changed: New candle
            store.liveCandles[cleanToken] = {
                open: ltp, high: ltp, low: ltp, close: ltp, 
                volume: 0, 
                startVolume: volume, 
                minute: currentMinute,
                tickTime: formatted.exchange_timestamp,
                readableTickTime: formatted.readable_timestamp
            };
        }
    }


    if (formatted.exchange_timestamp) {
        const ts = parseInt(formatted.exchange_timestamp);
        const ms = ts > 10000000000 ? ts : ts * 1000;
        formatted.readable_timestamp = new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    }

    return formatted;
}

function subscribeNSE(wsClient) {
    if (!wsClient) return;
    console.log(`[WebSocket] Subscribing to NSE & BSE Equity and NFO/BFO Near-Month Futures...`);

    // 1. Subscribe to Equity & Indices (NSE)
    const nseTokens = [
        ...store.stocks.filter(s => s.segment === "NSE").map(s => s.token),
        ...store.indices.filter(i => i.segment === "NSE").map(i => i.token)
    ];
    if (nseTokens.length > 0) {
        console.log(`Subscribing to ${nseTokens.length} NSE tokens...`);
        wsClient.fetchData({
            correlationID: "nse_subscription",
            action: 1, mode: 2, exchangeType: 1,
            tokens: nseTokens
        });
    }

    // 1.1 Subscribe to Equity (BSE)
    const bseTokens = store.stocks.filter(s => s.segment === "BSE").map(s => s.token);
    if (bseTokens.length > 0) {
        console.log(`Subscribing to ${bseTokens.length} BSE tokens...`);
        wsClient.fetchData({
            correlationID: "bse_subscription",
            action: 1, mode: 2, exchangeType: 3, // 3 is BSE
            tokens: bseTokens
        });
    }

    // 2. Subscribe to Near-Month Futures (NFO)
    const nearMonthFutures = [];
    const stockNames = store.stocks.map(s => s.name);
    
    stockNames.forEach(name => {
        const futures = store.nfoMasterData.filter(f => 
            f.name === name && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
        );
        if (futures.length > 0) {
            const bestFut = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
            nearMonthFutures.push(bestFut);
            store.tokenToName[bestFut.token] = bestFut.symbol;
        }
    });

    if (nearMonthFutures.length > 0) {
        console.log(`Subscribing to ${nearMonthFutures.length} Near-Month Futures...`);
        
        const nfoFuts = nearMonthFutures.filter(f => f.exch_seg === "NFO").map(f => f.token);
        const bfoFuts = nearMonthFutures.filter(f => f.exch_seg === "BFO").map(f => f.token);

        // NFO Sub
        for (let i = 0; i < nfoFuts.length; i += 50) {
            const batch = nfoFuts.slice(i, i + 50);
            wsClient.fetchData({
                correlationID: `nfo_futures_batch_${i}`,
                action: 1, mode: 2, exchangeType: 2,
                tokens: batch
            });
        }

        // BFO Sub
        for (let i = 0; i < bfoFuts.length; i += 50) {
            const batch = bfoFuts.slice(i, i + 50);
            wsClient.fetchData({
                correlationID: `bfo_futures_batch_${i}`,
                action: 1, mode: 2, exchangeType: 4, // 4 is BFO
                tokens: batch
            });
        }
    }
}

function subscribeMCX(wsClient) {
    if (!wsClient) return;
    console.log(`[WebSocket] Subscribing to MCX Gold Futures...`);

    const goldContracts = (store.mcxMasterData || []).filter(s => 
        (s.name === 'GOLD' || s.name === 'GOLDM' || s.name === 'GOLDPETAL' || s.name === 'GOLDGUINEA') &&
        s.instrumenttype === 'FUTCOM'
    );
    const nearestGold = {};
    for (const contract of goldContracts) {
        if (!nearestGold[contract.name]) nearestGold[contract.name] = contract;
        else if (new Date(contract.expiry) < new Date(nearestGold[contract.name].expiry)) nearestGold[contract.name] = contract;
    }
    const mcxTokens = [];
    Object.values(nearestGold).forEach(c => {
        mcxTokens.push(c.token);
        store.tokenToName[c.token] = c.name; // e.g. "GOLD"
        store.tokenToExchange[c.token] = "MCX";
    });

    if (mcxTokens.length > 0) {
        console.log(`Subscribing to ${mcxTokens.length} MCX Gold Futures...`);
        wsClient.fetchData({
            correlationID: "mcx_gold_subscription",
            action: 1, mode: 2, exchangeType: 5, // 5 is MCX
            tokens: mcxTokens
        });
    }
}

async function startWebSocketConnection(loginData, io) {
    if (!loginData || !loginData.data) return;

    if (!isAnyMarketOpen()) {
        console.log(`[WebSocket] All markets are currently CLOSED. Connection deferred.`);
        return;
    }

    if (store.wsClient) return;

    store.wsClient = new WebSocketV2({
        jwttoken: loginData.data.jwtToken,
        apikey: "AsZssQ9i",
        clientcode: "AAAP423969",
        feedtype: loginData.data.feedToken
    });

    await store.wsClient.connect();
    console.log(`WebSocket Connected. Subscribing based on open markets...`);

    // Reset subscription state
    store.subscriptions = { nse: false, mcx: false };

    // 1. Subscribe to Equity & Indices (NSE/BSE/NFO/BFO)
    if (isNSEOpen()) {
        subscribeNSE(store.wsClient);
        store.subscriptions.nse = true;
    }

    // 2. Subscribe to MCX Gold Futures
    if (isMCXOpen()) {
        subscribeMCX(store.wsClient);
        store.subscriptions.mcx = true;
    }

    store.wsClient.on("tick", (data) => {
        const formatted = formatTickData(data);
        if (!formatted) return;

        // DIAGNOSTIC LOG FOR TCS
        if (formatted.symbol === 'TCS') {
            console.log(`[TCS-DEBUG] Price: ${formatted.last_traded_price} | Raw V: ${data.v} | Formatted V: ${formatted.v}`);
        }

        // 🛡️ BLOCK TICKS FOR CLOSED EXCHANGES
        const exchange = formatted.exchange;
        if ((exchange === "NSE" || exchange === "BSE" || exchange === "NFO" || exchange === "BFO") && !isNSEOpen()) {
            // Post-market tick, ignore
            return;
        }
        if (exchange === "MCX" && !isMCXOpen()) {
            // Late night tick, ignore
            return;
        }

        // Log raw tokens to see what's arriving
        if (Math.random() < 0.05) {
            const cleanToken = data.token ? data.token.replace(/\"/g, "").trim() : null;
            const sym = store.tokenToName[cleanToken] || cleanToken;
            console.log(`[WS Tick] Received tick for ${sym} (${exchange})`);
        }
            // Trigger Live Indicator Broadcast if anyone is listening
            try {
                handleIndicatorBroadcast(formatted);
            } catch (e) {}

            // Handle Option Chain Logic
            // Update live option chain subscribers
            optionChainService.handleTick(formatted);

            // Process alerts in real-time
            alertService.checkAlerts(formatted);
            
            // Key by Symbol:Exchange to avoid collisions
            const key = `${formatted.symbol}:${formatted.exchange}`;
            store.latestMarketData[key] = formatted;
            
            // Format for frontend '/stocks' equivalent
            const s = store.stocks.find(st => st.name === formatted.symbol && st.segment === formatted.exchange) || 
                      store.stocks.find(st => st.name === formatted.symbol);
                      

            if (s) {
                const ltp = parseFloat(formatted.last_traded_price || 0);
                const close = parseFloat(formatted.close_price || 0);
                const rawChange = ltp - close;
                const changeStr = close > 0 ? (rawChange > 0 ? "+" : "") + rawChange.toFixed(2) : "0.00";
                const pChange = close > 0 ? ((rawChange / close) * 100).toFixed(2) : "0.00";

                const stockUpdate = {
                    ...s,
                    ltp: formatted.last_traded_price || "0.00",
                    change: changeStr,
                    percent_change: pChange,
                    sentiment: formatted.sentiment || "neutral"
                };

                // Emit individual stock update (Sidebar)
                io.emit(EVENTS.STOCK_UPDATE, stockUpdate);
            }

            // --- GLOBAL LIVE TICK BROADCAST FOR CHARTS ---
            const cleanToken = (formatted.token || "").replace(/\"/g, "").trim();
            const candle = store.liveCandles[cleanToken];
            if (candle) {


                // Log only for options or every 100th tick to avoid spam
                if (formatted.symbol.length > 10 || Math.random() < 0.01) {
                    console.log(`[WebSocket] Emitting LIVE_TICK for ${formatted.symbol} (${cleanToken}) | Close: ${candle.close}`);
                }
                const tickPayload = {
                    token: cleanToken,
                    symbol: formatted.symbol,
                    exchange: formatted.exchange,
                    receivedAt: new Date().toISOString(),
                    data: {
                        time: Math.floor(candle.minute / 1000),
                        tickTime: formatted.exchange_timestamp,
                        readableTickTime: formatted.readable_timestamp,
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        last_traded_price: formatted.last_traded_price,
                        volume: candle.volume
                    }
                };

                // BROADCAST to 'liveTick'
                io.emit(EVENTS.LIVE_TICK, tickPayload);

                // BROADCAST to 'liveticks' for plural event support
                io.emit('liveticks', tickPayload);

                // BROADCAST to 'live-options-list' globally as requested by user
                io.emit('live-options-list', tickPayload);

                // Console log for confirmation
                // if (formatted.symbol === "NIFTY 19MAY2026 23450 CE") {
                //     console.log(`[SocketEmit] Emitted tick for ${formatted.symbol} | LTP: ${candle.close} | Time: ${tickPayload.receivedAt}`);
                // }
            }

            if (formatted.exchange === "MCX") {
                const cleanToken = formatted.token ? formatted.token.replace(/\"/g, "").trim() : null;
                const candle = store.liveCandles[cleanToken];
                const contract = (store.mcxMasterData || []).find(c => c.token === cleanToken);
                
                if (candle && contract) {
                    io.emit(EVENTS.LIVE_TICK, {
                        token: cleanToken,
                        symbol: contract.name, // e.g. "GOLD"
                        fullSymbol: contract.symbol, // e.g. "GOLD05JUN26FUT"
                        exchange: "MCX",
                        data: {
                            time: Math.floor(candle.minute / 1000),
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close,
                            volume: candle.volume
                        }
                    });
                }
            }


            io.emit("marketUpdate", formatted);
    });

    store.wsClient.on("error", (err) => console.log("WS Error:", err));
}

/**
 * Periodically monitor market hours and manage connection
 */
async function manageWebSocket(loginData, io) {
    if (!loginData || !loginData.data) return;

    // Start monitor loop
    setInterval(async () => {
        const open = isAnyMarketOpen();
        const hasClient = store.wsClient !== null;

        if (open && !hasClient) {
            console.log("[MarketMonitor] Market is OPEN. Reconnecting WebSocket...");
            await startWebSocketConnection(loginData, io);
        } else if (!open && hasClient) {
            console.log("[MarketMonitor] All Markets are CLOSED. Disconnecting WebSocket...");
            try {
                // Terminate connection during off-hours
                if (store.wsClient.terminate) store.wsClient.terminate();
                else if (store.wsClient.close) store.wsClient.close();
                store.wsClient = null;
                store.subscriptions = { nse: false, mcx: false };
            } catch (e) {
                console.log("[MarketMonitor] Disconnect Error:", e.message);
                store.wsClient = null;
                store.subscriptions = { nse: false, mcx: false };
            }
        } else if (open && hasClient) {
            // WebSocket is active. Check if any market segment has recently opened and needs subscription.
            if (!store.subscriptions) {
                store.subscriptions = { nse: false, mcx: false };
            }

            if (isNSEOpen() && !store.subscriptions.nse) {
                console.log("[MarketMonitor] NSE Market has OPENED. Subscribing to NSE/BSE and Futures...");
                subscribeNSE(store.wsClient);
                store.subscriptions.nse = true;
            }
            if (isMCXOpen() && !store.subscriptions.mcx) {
                console.log("[MarketMonitor] MCX Market has OPENED. Subscribing to MCX...");
                subscribeMCX(store.wsClient);
                store.subscriptions.mcx = true;
            }
        }
    }, 15000); // Check every 15 seconds for snappy market-open reaction

    // Initial check
    await startWebSocketConnection(loginData, io);
}

module.exports = { startWebSocketConnection, manageWebSocket, isNSEOpen, isMCXOpen, isAnyMarketOpen };
const { WebSocketV2 } = require("smartapi-javascript");
const store = require("./marketStore");
const EVENTS = require("../constants/socketEvents");
const alertService = require("./alertService");


function formatTickData(data) {
    if (!data || data === "pong") return null;

    let formatted = { ...data };
    let cleanToken = data.token ? data.token.replace(/\"/g, "").trim() : null;
    formatted.exchange = store.tokenToExchange[cleanToken] || "NSE";
    formatted.symbol = store.tokenToName[cleanToken] || cleanToken || "Unknown";

    const priceFields = ['last_traded_price', 'open_price_day', 'high_price_day', 'low_price_day', 'close_price', 'avg_price', 'net_change'];
    priceFields.forEach(field => {
        if (formatted[field]) formatted[field] = (formatted[field] / 100).toFixed(2);
    });

    formatted.sentiment = (data.last_traded_price > data.close_price) ? "bullish" : "bearish";
    formatted.fetchedAt = new Date().toISOString();



    const ltp = parseFloat(formatted.last_traded_price || 0);
    const volume = parseInt(formatted.v || 0);
    const ts = parseInt(data.exchange_timestamp || 0);
    const ms = ts > 10000000000 ? ts : ts * 1000;
    const currentMinute = Math.floor(ms / 60000) * 60000;


    if (!store.liveCandles[cleanToken]) {
        store.liveCandles[cleanToken] = {
            open: ltp, high: ltp, low: ltp, close: ltp, volume: volume, minute: currentMinute
        };
    } else {
        const candle = store.liveCandles[cleanToken];
        if (currentMinute === candle.minute) {
            candle.high = Math.max(candle.high, ltp);
            candle.low = Math.min(candle.low, ltp);
            candle.close = ltp;
            candle.volume = volume;
        } else {
            store.liveCandles[cleanToken] = {
                open: ltp, high: ltp, low: ltp, close: ltp, volume: volume, minute: currentMinute
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

async function startWebSocketConnection(loginData, io) {
    if (!loginData || !loginData.data) return;

    store.wsClient = new WebSocketV2({
        jwttoken: loginData.data.jwtToken,
        apikey: "AsZssQ9i",
        clientcode: "AAAP423969",
        feedtype: loginData.data.feedToken
    });

    await store.wsClient.connect();
    console.log(`WebSocket Connected. Subscribing to Equity and Futures...`);

    // 1. Subscribe to Equity (NSE)
    const nseTokens = store.stocks.filter(s => s.segment === "NSE").map(s => s.token);
    if (nseTokens.length > 0) {
        store.wsClient.fetchData({
            correlationID: "nse_subscription",
            action: 1, mode: 2, exchangeType: 1,
            tokens: nseTokens
        });
    }

    // 1.1 Subscribe to Equity (BSE)
    const bseTokens = store.stocks.filter(s => s.segment === "BSE").map(s => s.token);
    if (bseTokens.length > 0) {
        console.log(`Subscribing to ${bseTokens.length} BSE tokens...`);
        store.wsClient.fetchData({
            correlationID: "bse_subscription",
            action: 1, mode: 2, exchangeType: 3, // 3 is BSE
            tokens: bseTokens
        });
    }

    // 2. Subscribe to Near-Month Futures (NFO)
    // Filter nfoMasterData for Current Expiry Futures of our tracked stocks
    const nearMonthFutures = [];
    const stockNames = store.stocks.map(s => s.name);
    
    stockNames.forEach(name => {
        const futures = store.nfoMasterData.filter(f => 
            f.name === name && (f.instrumenttype === "FUTSTK" || f.instrumenttype === "FUTIDX")
        );
        if (futures.length > 0) {
            // Pick the earliest expiry (Near Month)
            const bestFut = futures.sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
            nearMonthFutures.push(bestFut);
            store.tokenToName[bestFut.token] = bestFut.symbol;
        }
    });

    if (nearMonthFutures.length > 0) {
        console.log(`Subscribing to ${nearMonthFutures.length} Near-Month Futures...`);
        
        // Split by exchange
        const nfoFuts = nearMonthFutures.filter(f => f.exch_seg === "NFO").map(f => f.token);
        const bfoFuts = nearMonthFutures.filter(f => f.exch_seg === "BFO").map(f => f.token);

        // NFO Sub
        for (let i = 0; i < nfoFuts.length; i += 50) {
            const batch = nfoFuts.slice(i, i + 50);
            store.wsClient.fetchData({
                correlationID: `nfo_futures_batch_${i}`,
                action: 1, mode: 2, exchangeType: 2,
                tokens: batch
            });
        }

        // BFO Sub
        for (let i = 0; i < bfoFuts.length; i += 50) {
            const batch = bfoFuts.slice(i, i + 50);
            store.wsClient.fetchData({
                correlationID: `bfo_futures_batch_${i}`,
                action: 1, mode: 2, exchangeType: 4, // 4 is BFO
                tokens: batch
            });
        }
    }

    // 3. Subscribe to MCX Gold Futures
    const goldContracts = (store.mcxMasterData || []).filter(s => 
        (s.name === 'GOLD' || s.name === 'GOLDM' || s.name === 'GOLDPETAL' || s.name === 'GOLDGUINEA') &&
        s.instrumenttype === 'FUTCOM'
    );
    const nearestGold = {};
    for (const contract of goldContracts) {
        if (!nearestGold[contract.name]) nearestGold[contract.name] = contract;
        else if (new Date(contract.expiry) < new Date(nearestGold[contract.name].expiry)) nearestGold[contract.name] = contract;
    }
    const mcxTokens = Object.values(nearestGold).map(c => c.token);
    if (mcxTokens.length > 0) {
        console.log(`Subscribing to ${mcxTokens.length} MCX Gold Futures...`);
        store.wsClient.fetchData({
            correlationID: "mcx_gold_subscription",
            action: 1, mode: 2, exchangeType: 5, // 5 is MCX
            tokens: mcxTokens
        });
    }

    store.wsClient.on("tick", (data) => {
        const formatted = formatTickData(data);
        if (formatted) {
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

                // Emit individual stock update
                io.emit(EVENTS.STOCK_UPDATE, stockUpdate);

                // Add Live Tick for Chart (NSE)
                const cleanToken = formatted.token ? formatted.token.replace(/\"/g, "").trim() : null;
                const candle = store.liveCandles[cleanToken];
                if (candle) {
                    io.emit(EVENTS.LIVE_TICK, {
                        token: cleanToken,
                        symbol: formatted.symbol,
                        exchange: formatted.exchange,
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
        }
    });

    store.wsClient.on("error", (err) => console.log("WS Error:", err));
}

module.exports = { startWebSocketConnection };
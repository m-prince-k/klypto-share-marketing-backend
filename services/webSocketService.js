const { WebSocketV2 } = require("smartapi-javascript");
const store = require("./marketStore");

function formatTickData(data) {
    if (!data || data === "pong") return null;

    let formatted = { ...data };
    let cleanToken = data.token ? data.token.replace(/\"/g, "").trim() : null;
    formatted.symbol = store.tokenToName[cleanToken] || cleanToken || "Unknown";

    const priceFields = ['last_traded_price', 'open_price_day', 'high_price_day', 'low_price_day', 'close_price', 'avg_price', 'net_change'];
    priceFields.forEach(field => {
        if (formatted[field]) formatted[field] = (formatted[field] / 100).toFixed(2);
    });

    formatted.sentiment = (data.last_traded_price > data.close_price) ? "bullish" : "bearish";
    formatted.fetchedAt = new Date().toISOString();

    const ltp = parseFloat(formatted.last_traded_price);
    const volume = parseInt(formatted.v) || 0;
    const now = new Date();
    const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes()).getTime();

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
    const equityTokens = store.stocks.map(s => s.token);
    store.wsClient.fetchData({
        correlationID: "equity_subscription",
        action: 1, mode: 2, exchangeType: 1,
        tokens: equityTokens
    });

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
        const futTokens = nearMonthFutures.map(f => f.token);
        
        // Batch futures subscription (max 50 per call to be safe)
        for (let i = 0; i < futTokens.length; i += 50) {
            const batch = futTokens.slice(i, i + 50);
            store.wsClient.fetchData({
                correlationID: `futures_batch_${i}`,
                action: 1, mode: 2, exchangeType: 2,
                tokens: batch
            });
        }
    }

    store.wsClient.on("tick", (data) => {
        const formatted = formatTickData(data);
        if (formatted) {
            store.latestMarketData[formatted.symbol] = formatted;
            io.emit("marketUpdate", formatted);
        }
    });

    store.wsClient.on("error", (err) => console.log("WS Error:", err));
}

module.exports = { startWebSocketConnection };
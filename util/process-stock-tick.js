const MAX_ROWS = 1000;
// =========================================================
// PROCESS STOCK
// =========================================================

const { calculateSma, calculateRsi, calculateSsl, candleFilter, checkSmaConditions } = require("./function");

//historicalData => historical data pass
async function processStockTick(stock, tick, historicalData) {

    /*
    Live engine version aligned with backtest logic.
    Uses latest appended row as evaluation point.
    */

    console.log(`[ENTER] ${stock}`);

    try {

        // ---------------------------------
        // CHECK INITIALIZED
        // ---------------------------------

        if (!historicalData[stock]) {

            console.log(`[SKIP] ${stock} not initialized`);
            return;
        }

        const stockObj = historicalData[stock];

        let df = stockObj.df;

        // ---------------------------------
        // BUILD NEW ROW
        // ---------------------------------

        // Truncate to minute to ensure uniqueMap merges ticks into the same minute candle
        const dt = new Date(tick.datetime || Date.now());
        if (isNaN(dt.getTime())) {
            console.error(`[TIME ERROR] Received invalid tick datetime: ${tick.datetime}`);
            return;
        }
        dt.setSeconds(0, 0);
        dt.setMilliseconds(0);

        const newRow = {
            datetime: dt.toISOString(),

            stock_code: stock,

            open: parseFloat(tick.open || tick.last_traded_price || 0),
            high: parseFloat(tick.high || tick.last_traded_price || 0),
            low: parseFloat(tick.low || tick.last_traded_price || 0),
            close: parseFloat(tick.close || tick.last_traded_price || 0),

            volume: parseInt(tick.volume || tick.v || 0)
        };

        // ---------------------------------
        // APPEND + CLEAN
        // ---------------------------------

        df.push(newRow);

        // remove duplicate datetime
        const uniqueMap = new Map();

        for (const row of df) {
            try {
                const rawTime = row.datetime || row.timestamp;
                if (!rawTime) continue;

                const rowDt = new Date(rawTime);
                if (isNaN(rowDt.getTime())) {
                    // console.error(`[TIME ERROR] Invalid date found: ${rawTime}`);
                    continue;
                }

                rowDt.setSeconds(0, 0);
                rowDt.setMilliseconds(0);
                const key = rowDt.toISOString();

                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, { ...row, datetime: key });
                } else {
                    const existing = uniqueMap.get(key);
                    existing.high = Math.max(existing.high, parseFloat(row.high || 0));
                    existing.low = Math.min(existing.low, parseFloat(row.low || 0));
                    existing.close = parseFloat(row.close || 0);
                    existing.volume = parseInt(row.volume || 0);
                }
            } catch (e) {
                // Silently skip if single row parsing fails
                continue;
            }
        }

        df = Array.from(uniqueMap.values());

        // sort ascending
        df.sort((a, b) =>
            new Date(a.datetime) - new Date(b.datetime)
        );

        // keep latest MAX_ROWS
        if (df.length > MAX_ROWS) {
            df = df.slice(-MAX_ROWS);
        }

        // ---------------------------------
        // MINIMUM DATA CHECK
        // ---------------------------------

        if (df.length < 30) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            return;
        }

        // ---------------------------------
        // UPDATE INDICATORS
        // ---------------------------------

        df = calculateSma(df); //sma 

        df = calculateRsi(df); ////rsi 

        df = calculateSsl(df); //ssl

        // ---------------------------------
        // VOLUME & ADDITIONAL KEYS
        // ---------------------------------

        for (let i = 0; i < df.length; i++) {
            const row = df[i];
            const prev = i > 0 ? df[i - 1] : null;

            // Volume Changes
            if (prev) {
                row.Vol_chng = (row.volume || 0) - (prev.volume || 0);
                row.Vol_pct_chng = prev.volume !== 0 ? (row.Vol_chng / prev.volume) : 0;
            } else {
                row.Vol_chng = 0;
                row.Vol_pct_chng = 0;
            }

            // Ensure SSL_Exit_Trend (Example logic based on exit price)
            if (row.SSL_Exit) {
                row.SSL_Exit_Trend = row.close > row.SSL_Exit ? "UP" : "DOWN";
            }

            // Fill Avg Gain/Loss if available from RSI calculation (already in RMA_Gain/Loss)
            row["Avg Gain"] = row.RMA_Gain;
            row["Avg Loss"] = row.RMA_Loss;

            // Meta
            row.exchange_code = tick.exchange || "NSE";
            row.stock_code = stock;
        }

        // ---------------------------------
        // SAVE LIVE DATA (BUFFER FOR INDICATORS)
        // ---------------------------------

        const liveBuffer = df.slice(-300).map(row => {
            const dt = new Date(row.datetime);
            const dateStr = dt.getFullYear() + '-' + 
                String(dt.getMonth() + 1).padStart(2, '0') + '-' + 
                String(dt.getDate()).padStart(2, '0') + ' ' + 
                String(dt.getHours()).padStart(2, '0') + ':' + 
                String(dt.getMinutes()).padStart(2, '0') + ':' + 
                String(dt.getSeconds()).padStart(2, '0');

            return {
                datetime: dateStr,
                exchange_code: row.exchange_code,
                stock_code: row.stock_code,
                high: row.high,
                low: row.low,
                open: row.open,
                close: row.close,
                volume: row.volume,
                SMA_20: row.SMA_20,
                SMA_50: row.SMA_50,
                SMA_100: row.SMA_100,
                SMA_200: row.SMA_200,
                Price_change: row.Price_change,
                Gain: row.Gain,
                Loss: row.Loss,
                "Avg Gain": row["Avg Gain"],
                "Avg Loss": row["Avg Loss"],
                RMA_Gain: row.RMA_Gain,
                RMA_Loss: row.RMA_Loss,
                RS: row.RS,
                RSI: row.RSI,
                Baseline: row.Baseline,
                SSL_Line: row.SSL_Line,
                SSL_Trend: row.SSL_Trend,
                SSL2_Line: row.SSL2_Line,
                SSL2_Trend: row.SSL2_Trend,
                SSL_Exit: row.SSL_Exit,
                SSL_Exit_Trend: row.SSL_Exit_Trend,
                ATR: row.ATR,
                ATR_Upper: row.ATR_Upper,
                ATR_Lower: row.ATR_Lower,
                Vol_chng: row.Vol_chng,
                Vol_pct_chng: row.Vol_pct_chng
            };
        });

        const fs = require('fs');
        const liveFilePath = require('path').join(process.cwd(), 'live-data.json');
        fs.writeFileSync(liveFilePath, JSON.stringify(liveBuffer, null, 4));

        // ---------------------------------
        // EVALUATE TREND
        // ---------------------------------
        
        stockObj.df = df;
        stockObj.last_seen = tick.datetime;

        if (df.length < 30) {
            console.log(`[WAIT] ${stock} collecting data (${df.length}/30)`);
            return;
        }

        const latestRow = df[df.length - 1];
        const row = latestRow; // Alias for compatibility with below logic
        const sslTrend = latestRow.SSL_Trend;
        const rsiValue = latestRow.RSI;

        console.log(`[INDICATORS] ${stock} RSI=${rsiValue} SSL=${sslTrend}`);

        // ---------------------------------
        // SMA CONDITIONS
        // ---------------------------------

        const smaResult =
            checkSmaConditions(df); //import karna function

        const trend = smaResult?.trend;
        const signal = smaResult?.type;

        if (trend == null) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} no trend`
            );

            return;
        }

        // ---------------------------------
        // RSI FILTER
        // ---------------------------------

        const rsi = row.RSI;

        if (
            rsi === null ||
            rsi === undefined ||
            Number.isNaN(rsi)
        ) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} RSI NaN`
            );

            return;
        }

        // CALL FILTER
        if (trend === "UP" && rsi <= 70) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} RSI weak for CALL`
            );

            return;
        }

        // PUT FILTER
        if (trend === "DOWN" && rsi > 30) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} RSI weak for PUT`
            );

            return;
        }

        // ---------------------------------
        // CANDLE FILTER
        // ---------------------------------

        const candleResult =
            candleFilter(df, i);

        const validCandle =
            !candleResult.reject;

        const candleInfo =
            candleResult;

        if (!validCandle) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} candle fail ->`,
                candleInfo
            );

            return;
        }

        // ---------------------------------
        // SSL FILTER
        // ---------------------------------

        const entryOpen = row.open;
        const entryClose = row.close;

        const sslLine = row.SSL_Line;

        const sslBetween =
            (
                Math.min(entryOpen, entryClose)
                <= sslLine
            ) &&
            (
                sslLine
                <= Math.max(entryOpen, entryClose)
            );

        const sslDistance =
            Math.abs(entryOpen - sslLine);

        const sslPct =
            sslDistance / entryOpen;

        if (
            !(
                sslBetween ||
                sslPct <= 0.005
            )
        ) {

            stockObj.df = df;
            stockObj.last_seen = tick.datetime;

            console.log(
                `[REJECT] ${stock} SSL fail`
            );

            return;
        }

        // ---------------------------------
        // TRADE SIGNAL
        // ---------------------------------

        const tradeType =
            trend === "UP"
                ? "CALL"
                : "PUT";

        const tradeSignal = {

            Stock: stock,

            Date:
                new Date(row.datetime)
                    .toISOString()
                    .split("T")[0],

            Status: "TRADED",

            Type: tradeType,

            Entry_Time: row.datetime,

            Entry_Price: entryClose,

            RSI: rsi,

            Trend: trend,

            Signal: signal,

            SSL_Line: sslLine,

            SSL_Trend_Entry:
                row.SSL_Trend,

            SSL_Between:
                sslBetween,

            SSL_Distance_Pct:
                sslPct,

            Gap_Pct:
                candleInfo.gap_pct,

            Body_Pct:
                candleInfo.body_pct,

            Upper_Wick:
                candleInfo.upper_wick,

            Lower_Wick:
                candleInfo.lower_wick,

            SMA_20:
                row.SMA_20,

            SMA_50:
                row.SMA_50,

            SMA_100:
                row.SMA_100,

            SMA_200:
                row.SMA_200,

            // open_interest:
            // row.open_interest || null

            volume:
                row.volume || null
        };

        // ---------------------------------
        // SAVE TRADE
        // ---------------------------------


        return { stock, tradeSignal };

        // ---------------------------------
        // SAVE STATE
        // ---------------------------------

        stockObj.df = df;

        stockObj.last_seen =
            tick.datetime;

        console.log(
            `[TRADE] ${stock} -> ${tradeType}`
        );

    }
    catch (e) {

        console.log(
            `[PROCESS ERROR] ${stock}: ${e.message}`
        );
    }
}

module.exports = { processStockTick };

// =========================================================
// USAGE EXAMPLE
// =========================================================

/*

await processStockTick(
    "RELIANCE",
    {
        datetime: "2026-05-14 09:15:00",
        open: 2500,
        high: 2510,
        low: 2495,
        close: 2508,
        volume: 120000
    }
);

*/
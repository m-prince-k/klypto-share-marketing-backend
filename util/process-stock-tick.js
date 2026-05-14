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

        const newRow = {
            datetime: new Date(tick.datetime),

            stock_code: stock,

            open: parseFloat(tick.open),
            high: parseFloat(tick.high),
            low: parseFloat(tick.low),
            close: parseFloat(tick.close),

            volume: parseInt(tick.volume)

            // open_interest: parseInt(tick.open_interest)
            // only works for futures data
        };

        // ---------------------------------
        // APPEND + CLEAN
        // ---------------------------------

        df.push(newRow);

        // remove duplicate datetime
        const uniqueMap = new Map();

        for (const row of df) {

            uniqueMap.set(
                new Date(row.datetime).getTime(),
                row
            );
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

        if (df.length < 200) {

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

        const row = df[df.length - 1];

        const i = df.length - 1;

        console.log(
            `[INDICATORS] ${stock} RSI=${row.RSI} SSL=${row.SSL_Trend}`
        );

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
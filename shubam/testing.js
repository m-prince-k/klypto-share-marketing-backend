const fs = require("fs");
const path = require('path');
const csv = require("csv-parser");

async function loadBOSLIM() {
    return new Promise((resolve, reject) => {
        const candles = [];
        // resolve boslim.csv relative to this file so requires from elsewhere still work
        const boslimPath = path.join(__dirname, '..', 'boslim.csv');

       

        fs.createReadStream(boslimPath)
            .pipe(csv())
            .on("data", (row) => {
                candles.push({
                    datetime: row.datetime,

                    exchange_code: row.exchange_code,
                    stock_code: row.stock_code,

                    open: Number(row.open),
                    high: Number(row.high),
                    low: Number(row.low),
                    close: Number(row.close),

                    volume: Number(row.volume || 0)
                });
            })
            .on("end", () => {
                resolve(candles);
            })
            .on("error", reject);
    });
}

// ======================================
// SMA
// ======================================

function rollingMean(arr, period, minPeriods = period) {
    const result = new Array(arr.length).fill(NaN);

    for (let i = 0; i < arr.length; i++) {
        const start = Math.max(0, i - period + 1);
        const slice = arr.slice(start, i + 1);
        const valid = slice.filter(x => !Number.isNaN(x));

        if (valid.length === 0) continue;

        if (valid.length >= minPeriods) {
            const sum = valid.reduce((a, b) => a + b, 0);
            result[i] = sum / valid.length;
        }
    }

    return result;
}

function computeSMA(df) {
    const closes = df.map(x => x.close);

    const sma20 = rollingMean(closes, 20);
    const sma50 = rollingMean(closes, 50);
    // allow SMA_100 and SMA_200 to be calculated using available data
    // (so early rows won't remain NaN)
    const sma100 = rollingMean(closes, 100, 1);
    const sma200 = rollingMean(closes, 200, 1);

    for (let i = 0; i < df.length; i++) {
        df[i].SMA_20 = sma20[i];
        df[i].SMA_50 = sma50[i];
        df[i].SMA_100 = sma100[i];
        df[i].SMA_200 = sma200[i];
    }

    return df;
}

// ======================================
// RSI HELPERS
// ======================================

function rollingMeanMin(arr, period, minPeriods) {
    const result = new Array(arr.length).fill(NaN);

    for (let i = 0; i < arr.length; i++) {

        const count = i + 1;

        if (count < minPeriods) {
            continue;
        }

        const start =
            Math.max(0, i - period + 1);

        const slice =
            arr.slice(start, i + 1);

        const valid =
            slice.filter(
                x => !Number.isNaN(x)
            );

        if (valid.length === 0) {
            continue;
        }

        result[i] =
            valid.reduce((a, b) => a + b, 0) /
            valid.length;
    }

    return result;
}

// ======================================
// RSI (WILDER)
// ======================================

function computeRSI(df) {

    // Price Change
    for (let i = 0; i < df.length; i++) {

        if (i === 0) {
            df[i].Price_change = NaN;
            continue;
        }

        df[i].Price_change =
            df[i].close -
            df[i - 1].close;
    }

    // Gain / Loss
    for (let i = 0; i < df.length; i++) {

        const pc = df[i].Price_change;

        if (Number.isNaN(pc)) {

            df[i].Gain = NaN;
            df[i].Loss = NaN;

            continue;
        }

        df[i].Gain =
            Math.max(pc, 0);

        df[i].Loss =
            Math.max(-pc, 0);
    }

    const gains =
        df.map(x => x.Gain);

    const losses =
        df.map(x => x.Loss);

    // Initial Avg Gain/Loss
    const avgGain =
        rollingMeanMin(
            gains,
            14,
            13
        );

    const avgLoss =
        rollingMeanMin(
            losses,
            14,
            13
        );

    for (let i = 0; i < df.length; i++) {

        df[i].Avg_Gain =
            avgGain[i];

        df[i].Avg_Loss =
            avgLoss[i];

        df[i].RMA_Gain = NaN;
        df[i].RMA_Loss = NaN;
    }

    // Wilder RMA
    if (df.length > 14) {

        df[14].RMA_Gain =
            (
                (avgGain[13] * 13) +
                df[14].Gain
            ) / 14;

        df[14].RMA_Loss =
            (
                (avgLoss[13] * 13) +
                df[14].Loss
            ) / 14;

        for (let i = 15; i < df.length; i++) {

            df[i].RMA_Gain =
                (
                    df[i - 1].RMA_Gain * 13 +
                    df[i].Gain
                ) / 14;

            df[i].RMA_Loss =
                (
                    df[i - 1].RMA_Loss * 13 +
                    df[i].Loss
                ) / 14;
        }
    }

    // RS + RSI
    for (let i = 0; i < df.length; i++) {

        df[i].RS =
            df[i].RMA_Gain /
            df[i].RMA_Loss;

        df[i].RSI =
            Number.isNaN(df[i].RS)
                ? NaN
                : 100 -
                (
                    100 /
                    (1 + df[i].RS)
                );
    }

    return df;
}



// ======================================
// EMA
// ======================================

function EMA(series, period) {
    const result = new Array(series.length).fill(NaN);

    if (series.length === 0) {
        return result;
    }

    const alpha = 2 / (period + 1);

    result[0] = series[0];

    for (let i = 1; i < series.length; i++) {
        result[i] =
            alpha * series[i] +
            (1 - alpha) * result[i - 1];
    }

    return result;
}

// ======================================
// WMA
// ======================================

function WMA(series, period) {
    const result = new Array(series.length).fill(NaN);

    const weightSum =
        (period * (period + 1)) / 2;

    for (let i = period - 1; i < series.length; i++) {

        let weighted = 0;
        let weight = 1;

        for (
            let j = i - period + 1;
            j <= i;
            j++
        ) {
            weighted +=
                series[j] * weight;

            weight++;
        }

        result[i] =
            weighted / weightSum;
    }

    return result;
}

// ======================================
// SMA SERIES
// ======================================

function SMA(series, period) {
    return rollingMean(
        series,
        period
    );
}

// ======================================
// HMA
// Python:
//
// half = int(period / 2)
// sqrt_len = int(np.sqrt(period))
//
// wma1 = WMA(series, half)
// wma2 = WMA(series, period)
//
// return WMA(
//      2*wma1 - wma2,
//      sqrt_len
// )
// ======================================

function HMA(series, period) {

    const half =
        Math.floor(period / 2);

    const sqrtLen =
        Math.floor(
            Math.sqrt(period)
        );

    const wma1 =
        WMA(series, half);

    const wma2 =
        WMA(series, period);

    const diff =
        new Array(series.length)
            .fill(NaN);

    for (let i = 0; i < series.length; i++) {

        if (
            Number.isNaN(wma1[i]) ||
            Number.isNaN(wma2[i])
        ) {
            continue;
        }

        diff[i] =
            (2 * wma1[i]) -
            wma2[i];
    }

    return WMA(
        diff,
        sqrtLen
    );
}

// ======================================
// GENERIC MA
// ======================================

function computeMA(
    series,
    maType,
    length
) {

    switch (maType) {

        case "SMA":
            return SMA(
                series,
                length
            );

        case "EMA":
            return EMA(
                series,
                length
            );

        case "WMA":
            return WMA(
                series,
                length
            );

        case "HMA":
            return HMA(
                series,
                length
            );

        default:
            throw new Error(
                `Unsupported MA Type: ${maType}`
            );
    }
}



function computeATR(df, period = 14, multiplier = 2) {
    const tr = new Array(df.length).fill(NaN);

    for (let i = 0; i < df.length; i++) {
        if (i === 0) continue;

        const highLow = df[i].high - df[i].low;
        const highClose = Math.abs(df[i].high - df[i - 1].close);
        const lowClose = Math.abs(df[i].low - df[i - 1].close);

        tr[i] = Math.max(highLow, highClose, lowClose);
    }

    const atr = new Array(df.length).fill(NaN);

    for (let i = 0; i < df.length; i++) {
        // consider TRs in the current window (start from 1 since tr[0] is undefined)
        const start = Math.max(1, i - period + 1);
        const window = tr.slice(start, i + 1).filter(x => !Number.isNaN(x));

        if (window.length === 0) {
            atr[i] = NaN;
            continue;
        }

        const sum = window.reduce((a, b) => a + b, 0);

        // use available average when fewer than `period` TR values exist
        atr[i] = sum / window.length;
    }

    for (let i = 0; i < df.length; i++) {
        df[i].ATR = atr[i];

        // ATR CHANNELS
        if (Number.isFinite(df[i].ATR) && df[i].close != null) {
            df[i].ATR_Upper = df[i].close + (df[i].ATR * multiplier);
            df[i].ATR_Lower = df[i].close - (df[i].ATR * multiplier);
        } else {
            df[i].ATR_Upper = NaN;
            df[i].ATR_Lower = NaN;
        }
    }

    return df;
}

function computeHLV(df, period = 10) {
    for (let i = 0; i < df.length; i++) {
        const slice = df.slice(Math.max(0, i - period + 1), i + 1);

        const avgHigh =
            slice.reduce((a, b) => a + b.high, 0) / slice.length;

        const avgLow =
            slice.reduce((a, b) => a + b.low, 0) / slice.length;

        df[i].Baseline = (avgHigh + avgLow) / 2;
    }

    return df;
}



function computeSSLHybrid(df, period = 10) {
    const sslUp = [];
    const sslDown = [];
    const trend = [];

    for (let i = 0; i < df.length; i++) {
        const slice = df.slice(Math.max(0, i - period + 1), i + 1);

        const smaHigh =
            slice.reduce((a, b) => a + b.high, 0) / slice.length;

        const smaLow =
            slice.reduce((a, b) => a + b.low, 0) / slice.length;

        sslUp[i] = smaHigh;
        sslDown[i] = smaLow;

        if (i === 0) {
            trend[i] = 1;
        } else {
            trend[i] =
                df[i].close > sslUp[i - 1] ? 1 :
                    df[i].close < sslDown[i - 1] ? -1 :
                        trend[i - 1];
        }

        df[i].SSL_Line = trend[i] === 1 ? sslUp[i] : sslDown[i];
        df[i].SSL_Trend = trend[i];
    }

    return df;
}



function computeSSL2(df, period = 20) {
    const sslUp = [];
    const sslDown = [];
    const trend = [];

    for (let i = 0; i < df.length; i++) {
        const slice = df.slice(Math.max(0, i - period + 1), i + 1);

        const smaHigh =
            slice.reduce((a, b) => a + b.high, 0) / slice.length;

        const smaLow =
            slice.reduce((a, b) => a + b.low, 0) / slice.length;

        sslUp[i] = smaHigh;
        sslDown[i] = smaLow;

        if (i === 0) {
            trend[i] = 1;
        } else {
            trend[i] =
                df[i].close > sslUp[i - 1] ? 1 :
                    df[i].close < sslDown[i - 1] ? -1 :
                        trend[i - 1];
        }

        df[i].SSL2_Line = trend[i] === 1 ? sslUp[i] : sslDown[i];
        df[i].SSL2_Trend = trend[i];
    }

    return df;
}



function computeSSLExit(df) {
    for (let i = 0; i < df.length; i++) {
        if (i === 0) {
            df[i].SSL_Exit = df[i].close;
            df[i].SSL_Exit_Trend = df[i].SSL_Trend || 0;
            continue;
        }

        const prev = df[i - 1];

        if (prev.SSL_Trend === 1 && df[i].SSL_Trend === -1) {
            df[i].SSL_Exit = df[i].close;
            df[i].SSL_Exit_Trend = -1;
        }
        else if (prev.SSL_Trend === -1 && df[i].SSL_Trend === 1) {
            df[i].SSL_Exit = df[i].close;
            df[i].SSL_Exit_Trend = 1;
        }
        else {
            // carry forward previous exit so we don't leave NaN
            df[i].SSL_Exit = prev.SSL_Exit;
            df[i].SSL_Exit_Trend = prev.SSL_Exit_Trend || 0;
        }
    }

    return df;
}

async function generateBoslim() {
    let boslim = await loadBOSLIM();

    boslim = computeHLV(boslim);
    boslim = computeSSLHybrid(boslim);
    boslim = computeSSL2(boslim);
    boslim = computeSSLExit(boslim);
    boslim = computeATR(boslim);

    // STEP 2
    boslim = computeSMA(boslim);

    // STEP 3
    boslim = computeRSI(boslim);

    return boslim;
}

module.exports = { generateBoslim };

if (require.main === module) {
    (async () => {
        const boslim = await generateBoslim();
        console.log(JSON.stringify({ boslim }));
    })();
}
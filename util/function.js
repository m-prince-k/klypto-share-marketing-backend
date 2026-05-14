// =========================================================
// INDICATORS.JS
// SAME TO SAME PYTHON -> JS CONVERSION
// =========================================================

const math = require("mathjs");

// =========================================================
// HELPERS
// =========================================================

function rollingMean(arr, period) {

    const result = new Array(arr.length).fill(null);

    for (let i = period - 1; i < arr.length; i++) {

        let sum = 0;

        for (let j = i - period + 1; j <= i; j++) {
            sum += Number(arr[j] || 0);
        }

        result[i] = sum / period;
    }

    return result;
}

function rollingApply(arr, period, cb) {

    const result = new Array(arr.length).fill(null);

    for (let i = period - 1; i < arr.length; i++) {

        const slice =
            arr.slice(i - period + 1, i + 1);

        result[i] = cb(slice);
    }

    return result;
}

// =========================================================
// SMA
// =========================================================

function calculateSma(df) {

    const closes = df.map(x => Number(x.close));

    [20, 50, 100, 200].forEach((p) => {

        const sma = rollingMean(closes, p);

        for (let i = 0; i < df.length; i++) {
            df[i][`SMA_${p}`] = sma[i];
        }
    });

    return df;
}

// =========================================================
// RSI
// =========================================================

function calculateRsi(df, period = 14) {

    if (df.length < 2) {

        for (const row of df) {
            row.RSI = null;
        }

        return df;
    }

    // REQUIRED COLS
    const requiredCols = [
        "Price_change",
        "Gain",
        "Loss",
        "RMA_Gain",
        "RMA_Loss",
        "RS",
        "RSI"
    ];

    for (const row of df) {

        for (const col of requiredCols) {

            if (!(col in row)) {
                row[col] = null;
            }
        }
    }

    // CHECK INITIALIZATION
    const isInitialized =
        df.some(r => r.RMA_Gain !== null && r.RMA_Gain !== undefined);

    // =====================================================
    // HISTORICAL INIT
    // =====================================================

    if (!isInitialized) {

        for (let i = 1; i < df.length; i++) {

            const change =
                Number(df[i].close) -
                Number(df[i - 1].close);

            const gain =
                Math.max(change, 0);

            const loss =
                Math.abs(Math.min(change, 0));

            df[i].Price_change = change;
            df[i].Gain = gain;
            df[i].Loss = loss;

            // FIRST RMA
            if (i === period) {

                let gainSum = 0;
                let lossSum = 0;

                for (let j = 1; j <= period; j++) {

                    gainSum += Number(df[j].Gain || 0);
                    lossSum += Number(df[j].Loss || 0);
                }

                const avgGain = gainSum / period;
                const avgLoss = lossSum / period;

                df[i].RMA_Gain = avgGain;
                df[i].RMA_Loss = avgLoss;
            }

            // NEXT RMA
            else if (i > period) {

                const prevRmaG =
                    Number(df[i - 1].RMA_Gain);

                const prevRmaL =
                    Number(df[i - 1].RMA_Loss);

                const rmaG =
                    ((prevRmaG * (period - 1)) + gain)
                    / period;

                const rmaL =
                    ((prevRmaL * (period - 1)) + loss)
                    / period;

                df[i].RMA_Gain = rmaG;
                df[i].RMA_Loss = rmaL;
            }

            // RSI
            if (i >= period) {

                const rmaG =
                    df[i].RMA_Gain;

                const rmaL =
                    df[i].RMA_Loss;

                if (rmaL === 0) {

                    df[i].RSI = 100;
                }
                else {

                    const rs = rmaG / rmaL;

                    df[i].RS = rs;

                    df[i].RSI =
                        100 - (100 / (1 + rs));
                }
            }
        }
    }

    // =====================================================
    // INCREMENTAL UPDATE
    // =====================================================

    else {

        const curr = df.length - 1;
        const prev = df.length - 2;

        const change =
            Number(df[curr].close) -
            Number(df[prev].close);

        const gain =
            Math.max(change, 0);

        const loss =
            Math.abs(Math.min(change, 0));

        df[curr].Price_change = change;
        df[curr].Gain = gain;
        df[curr].Loss = loss;

        const prevRmaG =
            Number(df[prev].RMA_Gain);

        const prevRmaL =
            Number(df[prev].RMA_Loss);

        const rmaG =
            ((prevRmaG * (period - 1)) + gain)
            / period;

        const rmaL =
            ((prevRmaL * (period - 1)) + loss)
            / period;

        df[curr].RMA_Gain = rmaG;
        df[curr].RMA_Loss = rmaL;

        if (rmaL === 0) {

            df[curr].RSI = 100;
        }
        else {

            const rs = rmaG / rmaL;

            df[curr].RS = rs;

            df[curr].RSI =
                100 - (100 / (1 + rs));
        }
    }

    return df;
}

// =========================================================
// WMA
// =========================================================

function WMA(series, period) {

    const weights = [];

    for (let i = 1; i <= period; i++) {
        weights.push(i);
    }

    const weightSum =
        weights.reduce((a, b) => a + b, 0);

    return rollingApply(series, period, (window) => {

        let total = 0;

        for (let i = 0; i < period; i++) {

            total +=
                Number(window[i]) * weights[i];
        }

        return total / weightSum;
    });
}

// =========================================================
// HMA
// =========================================================

function HMA(series, period) {

    const half =
        Math.floor(period / 2);

    const sqrtLen =
        Math.floor(Math.sqrt(period));

    const wmaHalf =
        WMA(series, half);

    const wmaFull =
        WMA(series, period);

    const diff =
        series.map((_, i) => {

            if (
                wmaHalf[i] == null ||
                wmaFull[i] == null
            ) {
                return null;
            }

            return (2 * wmaHalf[i]) - wmaFull[i];
        });

    const cleanDiff =
        diff.map(v => v == null ? 0 : v);

    return WMA(cleanDiff, sqrtLen);
}

// =========================================================
// SSL
// =========================================================

function calculateSsl(df) {

    const requiredCols = [

        "emaHigh",
        "emaLow",

        "maHigh2",
        "maLow2",

        "exitHigh",
        "exitLow",

        "Baseline",

        "ATR",
        "ATR_Upper",
        "ATR_Lower",

        "HLV1",
        "HLV2",
        "HLV3",

        "SSL_Line",
        "SSL_Trend",

        "SSL2_Line",
        "SSL2_Trend",

        "SSL_Exit"
    ];

    for (const row of df) {

        for (const col of requiredCols) {

            if (!(col in row)) {
                row[col] = null;
            }
        }
    }

    if (df.length < 60) {
        return df;
    }

    const initialized =
        df.some(r => r.emaHigh !== null && r.emaHigh !== undefined);

    // =====================================================
    // HISTORICAL INIT
    // =====================================================

    if (!initialized) {

        const highs =
            df.map(r => Number(r.high));

        const lows =
            df.map(r => Number(r.low));

        const closes =
            df.map(r => Number(r.close));

        const emaHigh =
            HMA(highs, 60);

        const emaLow =
            HMA(lows, 60);

        const maHigh2 =
            HMA(highs, 5);

        const maLow2 =
            HMA(lows, 5);

        const exitHigh =
            HMA(highs, 15);

        const exitLow =
            HMA(lows, 15);

        const baseline =
            HMA(closes, 60);

        // SAVE
        for (let i = 0; i < df.length; i++) {

            df[i].emaHigh = emaHigh[i];
            df[i].emaLow = emaLow[i];

            df[i].maHigh2 = maHigh2[i];
            df[i].maLow2 = maLow2[i];

            df[i].exitHigh = exitHigh[i];
            df[i].exitLow = exitLow[i];

            df[i].Baseline = baseline[i];
        }

        // ATR
        const trList = [];

        for (let i = 0; i < df.length; i++) {

            let tr;

            if (i === 0) {

                tr =
                    df[i].high -
                    df[i].low;
            }
            else {

                tr = Math.max(

                    df[i].high - df[i].low,

                    Math.abs(
                        df[i].high -
                        df[i - 1].close
                    ),

                    Math.abs(
                        df[i].low -
                        df[i - 1].close
                    )
                );
            }

            trList.push(tr);

            df[i].TR = tr;
        }

        const atr =
            rollingMean(trList, 14);

        for (let i = 0; i < df.length; i++) {

            df[i].ATR = atr[i];
        }

        for (let i = 1; i < df.length; i++) {

            if (
                df[i - 1].ATR != null &&
                i >= 14
            ) {

                df[i].ATR =
                    (
                        (df[i - 1].ATR * 13)
                        + df[i].TR
                    ) / 14;
            }
        }

        for (let i = 0; i < df.length; i++) {

            df[i].ATR_Upper =
                df[i].close + df[i].ATR;

            df[i].ATR_Lower =
                df[i].close - df[i].ATR;
        }

        // HLV
        let prev1 = 1;
        let prev2 = 1;
        let prev3 = 1;

        for (let i = 0; i < df.length; i++) {

            const c = df[i].close;

            // SSL1
            const h1 = df[i].emaHigh;
            const l1 = df[i].emaLow;

            if (c > h1) {
                prev1 = 1;
            }
            else if (c < l1) {
                prev1 = -1;
            }

            df[i].HLV1 = prev1;

            // SSL2
            const h2 = df[i].maHigh2;
            const l2 = df[i].maLow2;

            if (c > h2) {
                prev2 = 1;
            }
            else if (c < l2) {
                prev2 = -1;
            }

            df[i].HLV2 = prev2;

            // SSL3
            const h3 = df[i].exitHigh;
            const l3 = df[i].exitLow;

            if (c > h3) {
                prev3 = 1;
            }
            else if (c < l3) {
                prev3 = -1;
            }

            df[i].HLV3 = prev3;

            // FINAL SSL
            df[i].SSL_Line =
                prev1 === 1
                    ? df[i].emaLow
                    : df[i].emaHigh;

            df[i].SSL_Trend =
                prev1 === 1
                    ? "UP"
                    : "DOWN";

            df[i].SSL2_Line =
                prev2 === 1
                    ? df[i].maLow2
                    : df[i].maHigh2;

            df[i].SSL2_Trend =
                prev2 === 1
                    ? "UP"
                    : "DOWN";

            df[i].SSL_Exit =
                prev3 === 1
                    ? df[i].exitLow
                    : df[i].exitHigh;
        }
    }

    // =====================================================
    // INCREMENTAL UPDATE
    // =====================================================

    else {

        const curr =
            df.length - 1;

        const prev =
            df.length - 2;

        const highs =
            df.map(r => Number(r.high));

        const lows =
            df.map(r => Number(r.low));

        const closes =
            df.map(r => Number(r.close));

        df[curr].emaHigh =
            HMA(highs, 60).slice(-1)[0];

        df[curr].emaLow =
            HMA(lows, 60).slice(-1)[0];

        df[curr].maHigh2 =
            HMA(highs, 5).slice(-1)[0];

        df[curr].maLow2 =
            HMA(lows, 5).slice(-1)[0];

        df[curr].exitHigh =
            HMA(highs, 15).slice(-1)[0];

        df[curr].exitLow =
            HMA(lows, 15).slice(-1)[0];

        df[curr].Baseline =
            HMA(closes, 60).slice(-1)[0];

        // ATR
        const tr = Math.max(

            df[curr].high - df[curr].low,

            Math.abs(
                df[curr].high -
                df[prev].close
            ),

            Math.abs(
                df[curr].low -
                df[prev].close
            )
        );

        const prevAtr =
            df[prev].ATR;

        df[curr].ATR =
            ((prevAtr * 13) + tr) / 14;

        df[curr].ATR_Upper =
            df[curr].close +
            df[curr].ATR;

        df[curr].ATR_Lower =
            df[curr].close -
            df[curr].ATR;

        // SSL1
        const h1 = df[curr].emaHigh;
        const l1 = df[curr].emaLow;

        const prevHlv1 =
            df[prev].HLV1;

        const hlv1 =
            df[curr].close > h1
                ? 1
                : (
                    df[curr].close < l1
                        ? -1
                        : prevHlv1
                );

        df[curr].HLV1 = hlv1;

        df[curr].SSL_Line =
            hlv1 === 1 ? l1 : h1;

        df[curr].SSL_Trend =
            hlv1 === 1 ? "UP" : "DOWN";

        // SSL2
        const h2 = df[curr].maHigh2;
        const l2 = df[curr].maLow2;

        const prevHlv2 =
            df[prev].HLV2;

        const hlv2 =
            df[curr].close > h2
                ? 1
                : (
                    df[curr].close < l2
                        ? -1
                        : prevHlv2
                );

        df[curr].HLV2 = hlv2;

        df[curr].SSL2_Line =
            hlv2 === 1 ? l2 : h2;

        df[curr].SSL2_Trend =
            hlv2 === 1 ? "UP" : "DOWN";

        // SSL3
        const h3 = df[curr].exitHigh;
        const l3 = df[curr].exitLow;

        const prevHlv3 =
            df[prev].HLV3;

        const hlv3 =
            df[curr].close > h3
                ? 1
                : (
                    df[curr].close < l3
                        ? -1
                        : prevHlv3
                );

        df[curr].HLV3 = hlv3;

        df[curr].SSL_Exit =
            hlv3 === 1 ? l3 : h3;
    }

    return df;
}

// =========================================================
// UPDATE INDICATORS
// =========================================================

function updateIndicators(df) {

    df = calculateSma(df);

    df = calculateRsi(df);

    df = calculateSsl(df);

    return df;
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {

    calculateSma,

    calculateRsi,

    WMA,

    HMA,

    calculateSsl,

    updateIndicators
};

// =========================================================
// USAGE
// =========================================================

/*

let candles = [
    {
        datetime: "2026-05-14 09:15:00",
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000
    }
];

candles = updateIndicators(candles);

console.log(candles);

*/
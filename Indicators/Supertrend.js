
async function calculateSupertrend(candles, options) {

    const atrPeriod = options?.atrLength || 10;
    const factor = options?.factor || 3;

    const n = candles.length;

    const supertrend = new Array(n).fill(null);
    const direction = new Array(n).fill(0);
    const upTrend = new Array(n).fill(null);
    const downTrend = new Array(n).fill(null);
    const bodyMiddleArr = new Array(n).fill(null); // ✅ ADDED

    const finalUpperBand = new Array(n).fill(null);
    const finalLowerBand = new Array(n).fill(null);

    // ---------------- TRUE RANGE ----------------
    function trueRange(i) {
        if (i === 0) return candles[i].high - candles[i].low;

        return Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
    }

    // ---------------- ATR (TV STYLE) ----------------
    const atr = new Array(n).fill(null);
    let trSum = 0;

    for (let i = 0; i < n; i++) {
        const tr = trueRange(i);

        if (i < atrPeriod) {
            trSum += tr;
            if (i === atrPeriod - 1) {
                atr[i] = trSum / atrPeriod;
            }
        } else {
            atr[i] = ((atr[i - 1] * (atrPeriod - 1)) + tr) / atrPeriod;
        }
    }

    // ---------------- SUPER TREND ----------------
    for (let i = 0; i < n; i++) {

        // ✅ BODY MIDDLE STORE
        const bodyMiddle = (candles[i].open + candles[i].close) / 2;
        bodyMiddleArr[i] = bodyMiddle;

        if (!atr[i]) continue;

        const hl2 = (candles[i].high + candles[i].low) / 2;

        const basicUpper = hl2 + factor * atr[i];
        const basicLower = hl2 - factor * atr[i];

        if (i === 0 || !finalUpperBand[i - 1]) {
            finalUpperBand[i] = basicUpper;
            finalLowerBand[i] = basicLower;
            direction[i] = 1;
            supertrend[i] = finalLowerBand[i];
            continue;
        }

        // FINAL UPPER
        finalUpperBand[i] =
            (basicUpper < finalUpperBand[i - 1] || candles[i - 1].close > finalUpperBand[i - 1])
                ? basicUpper
                : finalUpperBand[i - 1];

        // FINAL LOWER
        finalLowerBand[i] =
            (basicLower > finalLowerBand[i - 1] || candles[i - 1].close < finalLowerBand[i - 1])
                ? basicLower
                : finalLowerBand[i - 1];

        // TREND SWITCH
        if (direction[i - 1] === -1) {
            if (candles[i].close > finalUpperBand[i]) {
                direction[i] = 1;
                supertrend[i] = finalLowerBand[i];
            } else {
                direction[i] = -1;
                supertrend[i] = finalUpperBand[i];
            }
        } else {
            if (candles[i].close < finalLowerBand[i]) {
                direction[i] = -1;
                supertrend[i] = finalUpperBand[i];
            } else {
                direction[i] = 1;
                supertrend[i] = finalLowerBand[i];
            }
        }

        // STORE TRENDS
        if (direction[i] === 1) {
            upTrend[i] = supertrend[i];
            downTrend[i] = null;
        } else {
            downTrend[i] = supertrend[i];
            upTrend[i] = null;
        }
    }

    if (!Array.isArray(candles)) return [];
    return candles.map((c, i) => ({
        time: c.time,
        bodyMiddle: bodyMiddleArr[i], // ✅ INCLUDED
        supertrend: supertrend[i],
        trendDirection: direction[i],
        upTrend: upTrend[i],
        downTrend: downTrend[i]
    }));
}

module.exports = { calculateSupertrend };

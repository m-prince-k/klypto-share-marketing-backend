async function calculateStochRSI(candles, params = {}) {

    if (!candles?.length) {
        return { message: "candles should not be empty" };
    }

    const lengthRSI = params.lengthRSI || 14;
    const lengthStoch = params.length || 14;
    const smoothK = params.kSmoothing || 3;
    const smoothD = params.dSmoothing || 3;
    const sourceType = params.source || "close";

    // ---------------- SOURCE ----------------
    const src = candles.map(c => {
        const { open, high, low, close } = c;

        switch (sourceType) {
            case "hl2": return (high + low) / 2;
            case "hlc3": return (high + low + close) / 3;
            case "ohlc4": return (open + high + low + close) / 4;
            case "open": return open;
            case "high": return high;
            case "low": return low;
            default: return close;
        }
    });

    // ---------------- RSI (Wilder - CORRECT) ----------------
    function calculateRSI(values, period) {
        const rsi = new Array(values.length).fill(null);

        let gain = 0, loss = 0;

        for (let i = 1; i <= period; i++) {
            const change = values[i] - values[i - 1];
            if (change >= 0) gain += change;
            else loss -= change;
        }

        let avgGain = gain / period;
        let avgLoss = loss / period;

        rsi[period] = avgLoss === 0
            ? 100
            : 100 - (100 / (1 + avgGain / avgLoss));

        for (let i = period + 1; i < values.length; i++) {
            const change = values[i] - values[i - 1];

            const g = change > 0 ? change : 0;
            const l = change < 0 ? -change : 0;

            avgGain = (avgGain * (period - 1) + g) / period;
            avgLoss = (avgLoss * (period - 1) + l) / period;

            rsi[i] = avgLoss === 0
                ? 100
                : 100 - (100 / (1 + avgGain / avgLoss));
        }

        return rsi;
    }

    const rsi = calculateRSI(src, lengthRSI);

    // ---------------- STOCH RSI (STRICT WINDOW) ----------------
    const stochRSI = new Array(rsi.length).fill(null);

    for (let i = 0; i < rsi.length; i++) {

        if (i < lengthRSI + lengthStoch - 1) continue;

        let min = Infinity;
        let max = -Infinity;
        let valid = true;

        for (let j = i - lengthStoch + 1; j <= i; j++) {
            const val = rsi[j];

            // ❗ full window must be valid (TV behavior)
            if (val === null || val === undefined) {
                valid = false;
                break;
            }

            if (val < min) min = val;
            if (val > max) max = val;
        }

        if (!valid) continue;

        stochRSI[i] = max === min
            ? 0
            : (rsi[i] - min) / (max - min); // ✅ 0–1 scale (TV)
    }

    // ---------------- SMA (TV STYLE SMOOTHING - matches TradingView exactly) ----------------
    function sma(values, period) {
        const result = new Array(values.length).fill(null);

        for (let i = 0; i < values.length; i++) {
            if (values[i] === null) continue;

            // collect `period` consecutive non-null values ending at i
            let sum = 0;
            let count = 0;
            for (let j = i; j >= 0 && count < period; j--) {
                if (values[j] === null) break;
                sum += values[j];
                count++;
            }

            if (count === period) {
                result[i] = sum / period;
            }
        }

        return result;
    }

    // ---------------- K & D ----------------
    const k = sma(stochRSI, smoothK);
    const d = sma(k, smoothD);

    // ---------------- OUTPUT ----------------
    return {
        candles: candles.map((c, i) => ({
            time: c.time,
            stochRsi: stochRSI[i] !== null ? stochRSI[i] * 100 : null, // display 0–100
            stochRsiK: k[i] !== null ? k[i] * 100 : null,
            stochRsiD: d[i] !== null ? d[i] * 100 : null,
        }))
    };
}

module.exports = { calculateStochRSI };
async function calculateStochRSI(candles, params = {}) {

    if (!candles?.length) {
        return [];
    }

    const lengthRSI = Number(params.lengthRSI || 14);
    const lengthStoch = Number(params.length || 14);
    const smoothK = Number(params.kSmoothing || 3);
    const smoothD = Number(params.dSmoothing || 3);
    const sourceType = params.source || "close";

    // ---------------- SOURCE RESOLVER ----------------
    function getSourceValue(c, source) {
        const o = Number(c?.open || c?.o || 0);
        const h = Number(c?.high || c?.h || 0);
        const l = Number(c?.low || c?.l || 0);
        const cl = Number(c?.close || c?.c || 0);

        switch (source) {
            case "hl2": return (h + l) / 2;
            case "hlc3": return (h + l + cl) / 3;
            case "ohlc4": return (o + h + l + cl) / 4;
            case "open": return o;
            case "high": return h;
            case "low": return l;
            case "close": return cl;
            default: return Number(c[source] || cl);
        }
    }

    const src = candles.map(c => getSourceValue(c, sourceType));

    // ---------------- RSI (Wilder - CORRECT) ----------------
    function calculateRSI(values, period) {
        const rsi = new Array(values.length).fill(null);
        if (values.length <= period + 1) return rsi;

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

    const rsiArray = calculateRSI(src, lengthRSI);

    // ---------------- STOCH RSI (STRICT WINDOW) ----------------
    const stochRSI = new Array(rsiArray.length).fill(null);

    for (let i = 0; i < rsiArray.length; i++) {

        if (i < lengthRSI + lengthStoch - 1) continue;

        let min = Infinity;
        let max = -Infinity;
        let valid = true;

        for (let j = i - lengthStoch + 1; j <= i; j++) {
            const val = rsiArray[j];
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
            : (rsiArray[i] - min) / (max - min); 
    }

    // ---------------- SMA ----------------
    function sma(values, period) {
        const result = new Array(values.length).fill(null);

        for (let i = 0; i < values.length; i++) {
            if (values[i] === null) continue;

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

    const k = sma(stochRSI, smoothK);
    const d = sma(k, smoothD);

    // ---------------- OUTPUT (Direct Array for Controller) ----------------
    return candles.map((c, i) => ({
        time: c.time,
        value: stochRSI[i] !== null ? Number((stochRSI[i] * 100).toFixed(2)) : null,
        stochRsi: stochRSI[i] !== null ? Number((stochRSI[i] * 100).toFixed(2)) : null,
        stochRsiK: k[i] !== null ? Number((k[i] * 100).toFixed(2)) : null,
        stochRsiD: d[i] !== null ? Number((d[i] * 100).toFixed(2)) : null,
    }));
}

module.exports = { calculateStochRSI };
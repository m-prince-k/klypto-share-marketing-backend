// ------------------------------- Average True Range (ATR) --------------------------------

function calculateATR(candles, options) {

    const length = options?.length || 14;
    const smoothing = options?.smoothing || "RMA"; // FIX
    const n = candles?.length;

    // ---------------- True Range ----------------
    const tr = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {

        if (i === 0) {
            tr[i] = candles[i].high - candles[i].low;
        } else {

            const h_l = candles[i].high - candles[i].low;
            const h_pc = Math.abs(candles[i].high - candles[i - 1].close);
            const l_pc = Math.abs(candles[i].low - candles[i - 1].close);

            tr[i] = Math.max(h_l, h_pc, l_pc);
        }
    }

    // ---------------- SMA ----------------
    function sma(array, len, index) {

        if (index + 1 < len) return null;

        const slice = array.slice(index - len + 1, index + 1);

        return slice.reduce((a, b) => a + b, 0) / len;
    }

    // ---------------- EMA ----------------
    function ema(array, len, index, prev) {

        const k = 2 / (len + 1);

        if (index < len - 1) return null;

        if (index === len - 1) {
            return sma(array, len, index);
        }

        return array[index] * k + prev * (1 - k);
    }

    // ---------------- WMA ----------------
    function wma(array, len, index) {

        if (index + 1 < len) return null;

        const slice = array.slice(index - len + 1, index + 1);

        const denom = (len * (len + 1)) / 2;

        let sum = 0;

        for (let i = 0; i < len; i++) {
            sum += slice[i] * (i + 1);
        }

        return sum / denom;
    }

    // ---------------- RMA (Wilder ATR) ----------------
    function rma(array, len, index, prev) {

        if (index < len - 1) return null;

        if (index === len - 1) {
            return sma(array, len, index);
        }

        return (prev * (len - 1) + array[index]) / len;
    }

    // ---------------- ATR Calculation ----------------
    const atr = new Array(n).fill(null);

    for (let i = 0; i < n; i++) {

        switch (smoothing) {

            case "SMA":
                atr[i] = sma(tr, length, i);
                break;

            case "EMA":
                atr[i] = ema(tr, length, i, i > 0 ? atr[i - 1] : null);
                break;

            case "WMA":
                atr[i] = wma(tr, length, i);
                break;

            case "RMA":
            default:
                atr[i] = rma(tr, length, i, i > 0 ? atr[i - 1] : null);
                break;
        }
    }

    // ---------------- Final Result ----------------

    if (!Array.isArray(candles)) return [];
    return candles.map((c, i) => ({
        time:c.time,
        atr: atr[i]
    }));
}

module.exports = { calculateATR };
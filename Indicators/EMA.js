//------------------------- EMA Indicator (Pine -> JS) -------------------------

async function calculateEMAIndicator(candles, options) {

    const len = options?.length || 9;
    const srcKey = options?.source || "close";
    const offset = options?.offset || 0;

    const maType = options?.maType || "none";
    const maLength = options?.maLength || 14;
    const bbMult = options?.bbStdDev || 2;

    const enableMA = maType.toLowerCase() !== "none";
    const isBB = maType === "SMA + Bollinger Bands";

    // -------- Source Resolver --------
    function getSourceValue(c, source) {
        const o = Number(c?.open || c?.o || 0);
        const h = Number(c?.high || c?.h || 0);
        const l = Number(c?.low || c?.l || 0);
        const cl = Number(c?.close || c?.c || 0);

        switch (source) {
            case "hl2": return (h + l) / 2;
            case "hlc3": return (h + l + cl) / 3;
            case "ohlc4": return (o + h + l + cl) / 4;
            case "hlcc4": return (h + l + cl + cl) / 4;
            case "open": return o;
            case "high": return h;
            case "low": return l;
            case "close": return cl;
            default: return Number(c[source] || cl);
        }
    }

    if (!Array.isArray(candles)) return [];
    
    // 👇 FIXED SOURCE
    const src = candles.map(c => getSourceValue(c, srcKey));
    const volume = candles.map(c => c.volume ?? 0);

    // ---------------- EMA ----------------
    function ema(values, length) {
        const { EMA } = require("technicalindicators");
        const result = new Array(values.length).fill(null);
        
        // Find first non-null index
        const firstValidIdx = values.findIndex(v => v !== null);
        if (firstValidIdx === -1 || values.length - firstValidIdx < length) return result;

        const validValues = values.slice(firstValidIdx);
        const libEma = EMA.calculate({ period: length, values: validValues });
        
        let outputIdx = firstValidIdx + length - 1;
        for (let i = 0; i < libEma.length; i++) {
            if (outputIdx < result.length) {
                result[outputIdx] = Number(libEma[i].toFixed(4));
                outputIdx++;
            }
        }
        return result;
    }


    // ---------------- SMA (fixed) ----------------
    function sma(values, length) {
        const result = new Array(values.length).fill(null);
        let sum = 0;
        let count = 0;

        for (let i = 0; i < values.length; i++) {
            const val = values[i];
            if (val !== null) {
                sum += val;
                count++;
            }

            if (i >= length) {
                const oldVal = values[i - length];
                if (oldVal !== null) {
                    sum -= oldVal;
                    count--;
                }
            }

            if (count === length) {
                result[i] = sum / length;
            }
        }

        return result;
    }

    // ---------------- RMA ----------------
    function rma(values, length) {

        const result = new Array(values.length).fill(null);

        if (values.length < length) return result;

        let sum = 0;
        for (let i = 0; i < length; i++) sum += values[i];

        let prev = sum / length;
        result[length - 1] = prev;

        for (let i = length; i < values.length; i++) {
            const val = (prev * (length - 1) + values[i]) / length;
            result[i] = val;
            prev = val;
        }

        return result;
    }

    // ---------------- WMA ----------------
    function wma(values, length) {

        const result = new Array(values.length).fill(null);
        const weightSum = (length * (length + 1)) / 2;

        for (let i = length - 1; i < values.length; i++) {

            let weightedSum = 0;

            for (let j = 0; j < length; j++) {

                if (values[i - j] === null) {
                    weightedSum = null;
                    break;
                }

                weightedSum += values[i - j] * (length - j);
            }

            if (weightedSum !== null)
                result[i] = weightedSum / weightSum;
        }

        return result;
    }

    // ---------------- VWMA ----------------
    function vwma(values, vol, length) {

        const result = new Array(values.length).fill(null);

        for (let i = length - 1; i < values.length; i++) {

            let pv = 0;
            let v = 0;

            for (let j = i - length + 1; j <= i; j++) {

                if (values[j] === null) {
                    pv = null;
                    break;
                }

                pv += values[j] * vol[j];
                v += vol[j];
            }

            if (pv !== null && v !== 0) result[i] = pv / v;
        }

        return result;
    }

    // ---------------- StdDev ----------------
    function stdev(values, length) {

        const result = new Array(values.length).fill(null);

        for (let i = length - 1; i < values.length; i++) {

            const slice = values.slice(i - length + 1, i + 1);

            if (slice.includes(null)) continue;

            const mean = slice.reduce((a, b) => a + b, 0) / length;

            const variance =
                slice.reduce((a, b) => a + (b - mean) ** 2, 0) / length;

            result[i] = Math.sqrt(variance);
        }

        return result;
    }

    // ---------------- Offset ----------------
    function applyOffset(arr, offset) {

        const result = new Array(arr.length).fill(null);

        for (let i = 0; i < arr.length; i++) {

            const newIndex = i + offset;

            if (newIndex >= 0 && newIndex < arr.length) {
                result[newIndex] = arr[i];
            }
        }

        return result;
    }

    //---------------- Base EMA ----------------
    const emaValues = ema(src, len);

    //---------------- Smoothing MA ----------------
    let smoothingMA = new Array(src.length).fill(null);

    if (enableMA) {

        switch (maType) {

            case "SMA":
            case "SMA + Bollinger Bands":
                smoothingMA = sma(emaValues, maLength);
                break;

            case "EMA":
                smoothingMA = ema(emaValues, maLength);
                break;

            case "SMMA (RMA)":
                smoothingMA = rma(emaValues, maLength);
                break;

            case "WMA":
                smoothingMA = wma(emaValues, maLength);
                break;

            case "VWMA":
                smoothingMA = vwma(emaValues, volume, maLength);
                break;
        }
    }

    //---------------- Bollinger Bands ----------------
    let bbUpper = new Array(src.length).fill(null);
    let bbLower = new Array(src.length).fill(null);

    if (isBB) {
        const std = stdev(smoothingMA, maLength); // ✅ calculate std on smoothingMA

        for (let i = 0; i < src.length; i++) {
            if (smoothingMA[i] !== null && std[i] !== null) {
                bbUpper[i] = smoothingMA[i] + std[i] * bbMult;
                bbLower[i] = smoothingMA[i] - std[i] * bbMult;
            }
        }
    }

    //---------------- Apply Offset ----------------
    const emaOffset = applyOffset(emaValues, offset);
    smoothingMA = applyOffset(smoothingMA, offset);
    bbUpper = applyOffset(bbUpper, offset);
    bbLower = applyOffset(bbLower, offset);

    //---------------- Final Output ----------------
    return candles.map((c, i) => ({
        time: c.time,
        ema: emaOffset[i],
        smoothingMA: smoothingMA[i],
        bbUpper: bbUpper[i],
        bbLower: bbLower[i]
    }));
}

module.exports = { calculateEMAIndicator };
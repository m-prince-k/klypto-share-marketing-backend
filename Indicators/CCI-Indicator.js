// ------------------------- Commodity Channel Index (CCI) -------------------------

async function calculateCCI(candles, params) {
    const length = params?.length || 20;
    const maType = params?.maType || "SMA";
    const maLength = params?.maLength || 14;
    const bbMult = params?.bbstdDev || 2;
    const source = params?.source || "close";

    if (!candles || candles.length === 0) return [];

    // ---- Typical Price ----
    if (!Array.isArray(candles)) return [];
    
    function getSourceValue(c, s) {
        const h = Number(c.high);
        const l = Number(c.low);
        const cl = Number(c.close);
        const o = Number(c.open);
        
        switch (s) {
            case "hl2": return (h + l) / 2;
            case "hlc3": return (h + l + cl) / 3;
            case "ohlc4": return (o + h + l + cl) / 4;
            case "open": return o;
            case "high": return h;
            case "low": return l;
            default: return cl;
        }
    }

    const tp = candles.map(c => {
        // CCI normally uses Typical Price (HLC3), but we can allow source override
        if (params?.source && params.source !== "hlc3") {
            return getSourceValue(c, params.source);
        }
        return (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
    });
    const cciArr = new Array(candles.length).fill(null);

    // ---- Raw CCI Calculation ----
    for (let i = length - 1; i < candles.length; i++) {
        const subset = tp.slice(i - length + 1, i + 1);
        const sma = subset.reduce((a, b) => a + b, 0) / length;
        const meanDev = subset.reduce((acc, val) => acc + Math.abs(val - sma), 0) / length;
        cciArr[i] = meanDev === 0 ? 0 : (tp[i] - sma) / (0.015 * meanDev);
    }

    // ---- MA Helpers ----
    function sma(arr, len, i) {
        if (i + 1 < len) return null;
        return arr.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0) / len;
    }

    function ema(arr, len) {
        const result = new Array(arr.length).fill(null);
        const k = 2 / (len + 1);
        let prev = arr.find(v => v !== null);
        if (prev == null) return result;
        result[arr.indexOf(prev)] = prev;
        for (let i = arr.indexOf(prev) + 1; i < arr.length; i++) {
            if (arr[i] == null) continue;
            prev = arr[i] * k + prev * (1 - k);
            result[i] = prev;
        }
        return result;
    }

    function rma(arr, len) {
        const result = new Array(arr.length).fill(null);
        let prev = arr.find(v => v !== null);
        if (prev == null) return result;
        result[arr.indexOf(prev)] = prev;
        for (let i = arr.indexOf(prev) + 1; i < arr.length; i++) {
            if (arr[i] == null) continue;
            prev = (prev * (len - 1) + arr[i]) / len;
            result[i] = prev;
        }
        return result;
    }

    function wma(arr, len, i) {
        if (i + 1 < len) return null;
        let weightedSum = 0;
        let weightTotal = 0;
        for (let j = 0; j < len; j++) {
            const val = arr[i - len + 1 + j];
            if (val == null) return null;
            const weight = j + 1;
            weightedSum += val * weight;
            weightTotal += weight;
        }
        return weightedSum / weightTotal;
    }

    function vwma(arr, len, i) {
        if (i + 1 < len) return null;
        let volSum = 0;
        let volWeightedSum = 0;
        for (let j = 0; j < len; j++) {
            const idx = i - len + 1 + j;
            const val = arr[idx];
            if (val == null) return null;
            volWeightedSum += val * candles[idx].volume;
            volSum += candles[idx].volume;
        }
        return volSum === 0 ? null : volWeightedSum / volSum;
    }

    // ---- Smoothing MA ----
    const smoothingMA = new Array(candles.length).fill(null);
    const isBB = maType === "SMA + Bollinger Bands";
    const enableMA = maType !== "None";

    let emaCache = null;
    let rmaCache = null;

    if (enableMA) {
        if (maType === "EMA") emaCache = ema(cciArr, maLength);
        if (maType === "SMMA (RMA)") rmaCache = rma(cciArr, maLength);
    }

    for (let i = 0; i < candles.length; i++) {
        if (!enableMA) continue;
        switch (maType) {
            case "SMA":
            case "SMA + Bollinger Bands":
                smoothingMA[i] = sma(cciArr, maLength, i);
                break;
            case "EMA":
                smoothingMA[i] = emaCache[i];
                break;
            case "SMMA (RMA)":
                smoothingMA[i] = rmaCache[i];
                break;
            case "WMA":
                smoothingMA[i] = wma(cciArr, maLength, i);
                break;
            case "VWMA":
                smoothingMA[i] = vwma(cciArr, maLength, i);
                break;
        }
    }

    // ---- Bollinger Bands ----
    const bbUpper = new Array(candles.length).fill(null);
    const bbLower = new Array(candles.length).fill(null);

    if (isBB) {
        for (let i = maLength - 1; i < candles.length; i++) {
            const subset = smoothingMA.slice(i - maLength + 1, i + 1).filter(v => v != null);
            if (subset.length < maLength) continue;
            const mean = subset.reduce((a, b) => a + b, 0) / subset.length;
            const stdDev = Math.sqrt(subset.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / subset.length);
            bbUpper[i] = smoothingMA[i] + stdDev * bbMult;
            bbLower[i] = smoothingMA[i] - stdDev * bbMult;
        }
    }

    // ---- Final Return ----
    return candles.map((c, i) => ({
        time: c.time,
        value: cciArr[i],
        cci: cciArr[i],
        smoothingMA: smoothingMA[i],
        bbUpper: bbUpper[i],
        bbLower: bbLower[i]
    }));
}

module.exports = { calculateCCI };
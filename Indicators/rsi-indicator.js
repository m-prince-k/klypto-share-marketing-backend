const { RSI } = require("technicalindicators");
async function calculateRSIIndicator(candles, options) {
    const rsiLength = options?.length || options?.rsiLength || 14;
    const sourceKey = options?.source || "close";

    const maType = options?.maType || options?.type || "SMA";
    const maLength = options?.maLength || 14;
    const bbMult = options?.bbStdDev || options?.bbMult || 2;

    const getSourceValue = (c, key) => {
        const o = Number(c?.open || c?.o || 0);
        const h = Number(c?.high || c?.h || 0);
        const l = Number(c?.low || c?.l || 0);
        const cl = Number(c?.close || c?.c || 0);

        switch (String(key).toLowerCase()) {
            case 'open': return o;
            case 'high': return h;
            case 'low': return l;
            case 'close': return cl;
            case 'hl2': return (h + l) / 2;
            case 'hlc3': return (h + l + cl) / 3;
            case 'ohlc4': return (o + h + l + cl) / 4;
            default: 
                const raw = Number(c?.[key]);
                return Number.isFinite(raw) ? raw : cl;
        }
    };

    const closes = Array.isArray(candles)
        ? candles.map(c => {
            const value = getSourceValue(c, sourceKey);
            return Number.isFinite(value) ? value : null;
        })
        : [];
    const volumes = Array.isArray(candles)
        ? candles.map(c => c?.volume ?? 0)
        : [];

    function sma(values, length) {
        const result = Array(values.length).fill(null);
        for (let i = length - 1; i < values.length; i++) {
            const slice = values.slice(i - length + 1, i + 1);
            if (slice.some(v => v === null)) continue;
            result[i] = slice.reduce((a, b) => a + b, 0) / length;
        }
        return result;
    }

    function ema(values, length) {
        const result = Array(values.length).fill(null);
        const k = 2 / (length + 1);

        let startIndex = values.findIndex((v, idx) => {
            if (idx < length - 1) return false;
            const slice = values.slice(idx - length + 1, idx + 1);
            return !slice.some(val => val === null);
        });

        if (startIndex === -1) return result;

        const slice = values.slice(startIndex - length + 1, startIndex + 1);
        result[startIndex] = slice.reduce((a, b) => a + b, 0) / length;

        for (let i = startIndex + 1; i < values.length; i++) {
            if (values[i] === null) continue;
            result[i] = values[i] * k + result[i - 1] * (1 - k);
        }

        return result;
    }

    function rma(values, length) {
        const result = Array(values.length).fill(null);
        let sum = 0;
        let count = 0;

        // Correct Wilder's Initialization
        for (let i = 0; i < values.length; i++) {
            if (values[i] === null) continue;
            sum += values[i];
            count++;
            if (count === length) {
                result[i] = sum / length;
                for (let j = i + 1; j < values.length; j++) {
                    if (values[j] === null) continue;
                    result[j] = (result[j - 1] * (length - 1) + values[j]) / length;
                }
                break;
            }
        }
        return result;
    }

    function wma(values, length) {
        const result = Array(values.length).fill(null);
        for (let i = length - 1; i < values.length; i++) {
            const slice = values.slice(i - length + 1, i + 1);
            if (slice.some(v => v === null)) continue;

            const weightSum = (length * (length + 1)) / 2;
            let weightedSum = 0;
            for (let j = 0; j < length; j++) {
                weightedSum += slice[j] * (j + 1);
            }
            result[i] = weightedSum / weightSum;
        }
        return result;
    }

    function vwma(values, volumes, length) {
        const result = Array(values.length).fill(null);
        for (let i = length - 1; i < values.length; i++) {
            const sliceV = values.slice(i - length + 1, i + 1);
            const sliceVol = volumes.slice(i - length + 1, i + 1);
            if (sliceV.some(v => v === null)) continue;

            let sumVol = 0, weightedSum = 0;
            for (let j = 0; j < length; j++) {
                weightedSum += sliceV[j] * sliceVol[j];
                sumVol += sliceVol[j];
            }
            if (sumVol === 0) continue;
            result[i] = weightedSum / sumVol;
        }
        return result;
    }

    function stdev(values, length) {
        const result = Array(values.length).fill(null);
        for (let i = length - 1; i < values.length; i++) {
            const slice = values.slice(i - length + 1, i + 1);
            if (slice.some(v => v === null)) continue;

            const mean = slice.reduce((a, b) => a + b, 0) / length;
            const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / length;
            result[i] = Math.sqrt(variance);
        }
        return result;
    }

    // --- MANUAL WILDER'S RSI CALCULATION (100% TradingView Match) ---
    const rsi = Array(candles.length).fill(null);
    if (closes.length > rsiLength) {
        let avgGain = 0;
        let avgLoss = 0;

        // 1. Initial SMA for the first 'rsiLength' bars
        for (let i = 1; i <= rsiLength; i++) {
            const diff = closes[i] - closes[i - 1];
            if (diff >= 0) avgGain += diff;
            else avgLoss -= diff;
        }
        avgGain /= rsiLength;
        avgLoss /= rsiLength;

        // Calculate first RSI
        if (avgLoss === 0) rsi[rsiLength] = 100;
        else {
            const rs = avgGain / avgLoss;
            rsi[rsiLength] = 100 - (100 / (1 + rs));
        }

        // 2. Wilder's Smoothing (RMA) for subsequent bars
        for (let i = rsiLength + 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            const currentGain = diff >= 0 ? diff : 0;
            const currentLoss = diff < 0 ? -diff : 0;

            // RMA Formula: (prevAvg * (n-1) + current) / n
            avgGain = (avgGain * (rsiLength - 1) + currentGain) / rsiLength;
            avgLoss = (avgLoss * (rsiLength - 1) + currentLoss) / rsiLength;

            if (avgLoss === 0) rsi[i] = 100;
            else {
                const rs = avgGain / avgLoss;
                rsi[i] = 100 - (100 / (1 + rs));
            }
        }
    }
    // --------------------------------------------

    let smoothingMA = Array(candles.length).fill(null);
    let bbUpper = Array(candles.length).fill(null);
    let bbLower = Array(candles.length).fill(null);

    // Default maType to "SMA + Bollinger Bands" if RSI is the type and no maType provided
    const effectiveMaType = (maType === "RSI" || !maType) ? "SMA + Bollinger Bands" : maType;

    if (effectiveMaType !== "None") {
        switch (effectiveMaType) {
            case "SMA":
            case "SMA + Bollinger Bands":
                smoothingMA = sma(rsi, maLength);
                break;
            case "EMA":
                smoothingMA = ema(rsi, maLength);
                break;
            case "SMMA (RMA)":
                smoothingMA = rma(rsi, maLength);
                break;
            case "WMA":
                smoothingMA = wma(rsi, maLength);
                break;
            case "VWMA":
                smoothingMA = vwma(rsi, volumes, maLength);
                break;
        }

        if (effectiveMaType === "SMA + Bollinger Bands") {
            const dev = stdev(rsi, maLength);
            for (let i = 0; i < candles.length; i++) {
                if (smoothingMA[i] !== null && dev[i] !== null) {
                    bbUpper[i] = smoothingMA[i] + dev[i] * bbMult;
                    bbLower[i] = smoothingMA[i] - dev[i] * bbMult;
                }
            }
        }
    }

    return candles.map((c, i) => {
        const timestamp = c.time ? c.time * 1000 : (c.timestamp ? new Date(c.timestamp).getTime() : Date.now());
        const dt = new Date(timestamp);
        return {
            time: Math.floor(timestamp / 1000),
            datetime: dt.toLocaleString("en-IN", { timeZone: 'Asia/Kolkata' }),
            isoDate: dt.toISOString().split('T')[0],
            rsi: rsi[i],
            smoothingMA: smoothingMA[i],
            bbUpper: bbUpper[i],
            bbLower: bbLower[i],
            status: true
        };
    });
}

/**
 * ✅ EXPORT
 */
module.exports = {
    calculateRSIIndicator,
};
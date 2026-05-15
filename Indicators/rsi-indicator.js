const { RSI } = require("technicalindicators");
async function calculateRSIIndicator(candles, options) {
    const rsiLength = options?.length || options?.rsiLength || 14;
    const sourceKey = options?.source || "close";

    const maType = options?.maType || options?.type || "SMA";
    const maLength = options?.maLength || 14;
    const bbMult = options?.bbStdDev || options?.bbMult || 2;

    const closes = Array.isArray(candles)
        ? candles.map(c => {
            const value = Number(c?.[sourceKey]);
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

    // --- WILDER'S RSI CALCULATION (RMA BASED) ---
    const rsi = Array(candles.length).fill(null);
    const validCloses = closes.filter(value => value !== null);

    if (validCloses.length > rsiLength) {
        const libRsi = RSI.calculate({ period: rsiLength, values: validCloses });
        const firstValidIndex = closes.findIndex(v => v !== null);
        let outputIdx = firstValidIndex + rsiLength;
        for (let i = 0; i < libRsi.length; i++) {
            if (outputIdx < rsi.length) {
                rsi[outputIdx] = Number(libRsi[i].toFixed(2));
                outputIdx++;
            }
        }
    }
    // --------------------------------------------

    let smoothingMA = Array(candles.length).fill(null);
    let bbUpper = Array(candles.length).fill(null);
    let bbLower = Array(candles.length).fill(null);

    if (maType !== "None") {
        switch (maType) {
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

        if (maType === "SMA + Bollinger Bands") {
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
        const dt = new Date(c.time * 1000);
        return {
            time: c.time,
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
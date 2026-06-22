 // ------------------------------------Commodity Channel Index (CCI) --------------------------------
 
async function calculateCCI(candles, options) {
    const length = options.length || 20;
    const maTypeInput = options.maType || "SMA"; // "None", "SMA", "SMA + Bollinger Bands", "EMA", "SMMA", "WMA", "VWMA"
    const maLengthInput = options.maLength || 14;
    const bbMultInput = options.bbMult || 2.0;

    const n = candles.length;

    // HLC3: (high + low + close)/3
    const hlc3 = candles.map(c => (Number(c.high) + Number(c.low) + Number(c.close)) / 3);

    // Helper: simple moving average
    function sma(arr, len, index) {
        if (index + 1 < len) return null;
        const slice = arr.slice(index - len + 1, index + 1);
        return slice.reduce((a, b) => a + b, 0) / len;
    }

    // Helper: EMA
    function ema(arr, len, index, prev) {
        const k = 2 / (len + 1);
        if (index === 0) return arr[0];
        return arr[index] * k + prev * (1 - k);
    }

    // Helper: RMA / SMMA
    function rma(arr, len, index, prev) {
        if (index === 0) return arr[0];
        return (prev * (len - 1) + arr[index]) / len;
    }

    // Helper: WMA
    function wma(arr, len, index) {
        if (index + 1 < len) return null;
        const slice = arr.slice(index - len + 1, index + 1);
        const denom = (len * (len + 1)) / 2;
        let sum = 0;
        for (let i = 0; i < len; i++) sum += slice[i] * (i + 1);
        return sum / denom;
    }

    // Standard Deviation
    function stdev(arr, len, index) {
        if (index + 1 < len) return null;
        const slice = arr.slice(index - len + 1, index + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / len;
        const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / len;
        return Math.sqrt(variance);
    }

    // Calculate CCI
    const cci = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
        const maValue = sma(hlc3, length, i);
        if (maValue === null) continue;
        const dev = stdev(hlc3, length, i);
        cci[i] = dev !== 0 ? (hlc3[i] - maValue) / (0.015 * dev) : 0;
    }

    // Smoothing MA calculation
    const smoothingMA = new Array(n).fill(null);
    const smoothingStDev = new Array(n).fill(null);
    const isBB = maTypeInput === "SMA + Bollinger Bands";
    for (let i = 0; i < n; i++) {
        if (maTypeInput === "None") continue;
        const val = cci[i];
        if (val === null) continue;

        let prev = i > 0 ? smoothingMA[i - 1] : val;
        switch (maTypeInput) {
            case "SMA":
            case "SMA + Bollinger Bands":
                smoothingMA[i] = sma(cci, maLengthInput, i);
                break;
            case "EMA":
                smoothingMA[i] = ema(cci, maLengthInput, i, prev);
                break;
            case "SMMA (RMA)":
                smoothingMA[i] = rma(cci, maLengthInput, i, prev);
                break;
            case "WMA":
                smoothingMA[i] = wma(cci, maLengthInput, i);
                break;
            case "VWMA":
                // For VWMA, you need volume. Use candles[i].volume
                const sliceVW = candles.slice(Math.max(0, i - maLengthInput + 1), i + 1);
                const volSum = sliceVW.reduce((sum, c) => sum + (c.volume || 1), 0);
                const wSum = sliceVW.reduce((sum, c, idx) => sum + (c.volume || 1) * cci[i - (sliceVW.length - 1 - idx)], 0);
                smoothingMA[i] = volSum !== 0 ? wSum / volSum : null;
                break;
        }

        if (isBB && smoothingMA[i] !== null) {
            const stdevVal = stdev(cci, maLengthInput, i);
            smoothingStDev[i] = stdevVal !== null ? stdevVal * bbMultInput : null;
        }
    }

    // Upper and Lower Bollinger Bands
    const bbUpperBand = new Array(n).fill(null);
    const bbLowerBand = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
        if (smoothingMA[i] !== null && smoothingStDev[i] !== null) {
            bbUpperBand[i] = smoothingMA[i] + smoothingStDev[i];
            bbLowerBand[i] = smoothingMA[i] - smoothingStDev[i];
        }
    }

    // Return candles with CCI, smoothing MA, and Bollinger Bands
    return candles.map((c, i) => ({
        time:c.time,
        CCI: cci[i],
        smoothingMA: smoothingMA[i],
        bbUpperBand: bbUpperBand[i],
        bbLowerBand: bbLowerBand[i],
    }));
}

// Example usage

module.exports={calculateCCI};

// const result = calculateCCI(candles, { length: 20, maType: "SMA + Bollinger Bands", maLength: 14, bbMult: 2 });




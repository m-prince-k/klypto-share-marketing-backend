async function calculateBollingerBands(candles, options) {



    const length = options?.length || 20;
    const maType = options?.maType || "SMA";
    const mult = options?.stdDev || 2;
    const sourceKey = options?.source || "close";
    const offset = options?.offset || 0;

    const n = candles.length;

    const basis = new Array(n).fill(null);
    const upper = new Array(n).fill(null);
    const lower = new Array(n).fill(null);
    const bandwidth = new Array(n).fill(null);
    const percentB = new Array(n).fill(null);

    function getSource(c) {
        const h = Number(c.high);
        const l = Number(c.low);
        const o = Number(c.open);
        const cl = Number(c.close);

        switch (sourceKey) {
            case "open": return o;
            case "high": return h;
            case "low": return l;
            case "hl2": return (h + l) / 2;
            case "hlc3": return (h + l + cl) / 3;
            case "ohlc4": return (o + h + l + cl) / 4;
            default: return cl;
        }
    }

    if (!Array.isArray(candles)) return [];
    const src = candles.map(c => getSource(c));

    // Manual calculation to support different MA types (like EMA)
    function calculateBasis(values, period, type) {
        if (type === "EMA") {
            const { EMA } = require("technicalindicators");
            return EMA.calculate({ period, values });
        }
        const { SMA } = require("technicalindicators");
        return SMA.calculate({ period, values });
    }

    const basisValues = calculateBasis(src, length, maType);
    
    // Standard Deviation calculation
    function calculateStdDev(values, period) {
        const result = [];
        for (let i = period - 1; i < values.length; i++) {
            const slice = values.slice(i - period + 1, i + 1);
            const mean = slice.reduce((a, b) => a + b, 0) / period;
            const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
            result.push(Math.sqrt(variance));
        }
        return result;
    }

    const stdDevValues = calculateStdDev(src, length);

    const firstIdx = length - 1;
    for (let i = 0; i < basisValues.length; i++) {
        const currIdx = firstIdx + i;
        if (currIdx < n) {
            basis[currIdx] = Number(basisValues[i].toFixed(4));
            const sd = stdDevValues[i] * mult;
            upper[currIdx] = Number((basis[currIdx] + sd).toFixed(4));
            lower[currIdx] = Number((basis[currIdx] - sd).toFixed(4));
            
            if (basis[currIdx] !== 0) {
                bandwidth[currIdx] = (upper[currIdx] - lower[currIdx]) / basis[currIdx];
            }
            if (upper[currIdx] !== lower[currIdx]) {
                percentB[currIdx] = (src[currIdx] - lower[currIdx]) / (upper[currIdx] - lower[currIdx]);
            }
        }
    }

    return candles.map((c, i) => ({

        // time: c.time,
        datetime: new Date(c.time * 1000).toLocaleString("en-IN"),

        // open: c.open,
        // high: c.high,
        // low: c.low,
        // close: c.close,
        // volume: c.volume,
        time:c.time,
        basis: basis[i],
        upper: upper[i],
        lower: lower[i],

        bandwidth: bandwidth[i],
        percentB: percentB[i]

    }));

}

module.exports = { calculateBollingerBands };
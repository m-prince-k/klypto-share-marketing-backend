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
        switch (sourceKey) {
            case "open": return c.open;
            case "high": return c.high;
            case "low": return c.low;
            case "hl2": return (c.high + c.low) / 2;
            case "hlc3": return (c.high + c.low + c.close) / 3;
            case "ohlc4": return (c.open + c.high + c.low + c.close) / 4;
            default: return c.close;
        }
    }

    if (!Array.isArray(candles)) return [];
    const src = candles.map(c => getSource(c));
    const volumes = candles.map(c => c.volume ?? 0);

    function sma(values, len, i) {
        if (i < len - 1) return null;

        let sum = 0;
        for (let j = i - len + 1; j <= i; j++) {
            sum += values[j];
        }
        return sum / len;
    }

    let maValues = src.map((_, i) => sma(src, length, i));

    for (let i = 0; i < n; i++) {

        if (i < length - 1 || maValues[i] === null) continue;

        let sum = 0;

        for (let j = i - length + 1; j <= i; j++) {
            sum += Math.pow(src[j] - maValues[i], 2);
        }

        const stdev = Math.sqrt(sum / length);

        basis[i] = maValues[i];
        upper[i] = maValues[i] + mult * stdev;
        lower[i] = maValues[i] - mult * stdev;

        bandwidth[i] = (upper[i] - lower[i]) / basis[i];
        percentB[i] = (src[i] - lower[i]) / (upper[i] - lower[i]);

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
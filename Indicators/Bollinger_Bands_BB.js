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
            case "hl2": return (Number(c.high) + Number(c.low)) / 2;
            case "hlc3": return (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
            case "ohlc4": return (Number(c.open) + Number(c.high) + Number(c.low) + Number(c.close)) / 4;
            default: return c.close;
        }
    }

    if (!Array.isArray(candles)) return [];
    const src = candles.map(c => getSource(c));
    const volumes = candles.map(c => c.volume ?? 0);

    const { BollingerBands } = require("technicalindicators");
    
    // Check if we have enough data
    const validSrc = src.filter(v => v !== null);
    if (validSrc.length >= length) {
        const bbInput = {
            period: length,
            values: validSrc,
            stdDev: mult
        };
        const bbResult = BollingerBands.calculate(bbInput);
        
        const firstValidIdx = src.findIndex(v => v !== null);
        let outputIdx = firstValidIdx + length - 1;
        
        for (let i = 0; i < bbResult.length; i++) {
            if (outputIdx < n) {
                basis[outputIdx] = Number(bbResult[i].middle.toFixed(4));
                upper[outputIdx] = Number(bbResult[i].upper.toFixed(4));
                lower[outputIdx] = Number(bbResult[i].lower.toFixed(4));
                
                bandwidth[outputIdx] = (upper[outputIdx] - lower[outputIdx]) / basis[outputIdx];
                percentB[outputIdx] = (src[outputIdx] - lower[outputIdx]) / (upper[outputIdx] - lower[outputIdx]);
                
                outputIdx++;
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
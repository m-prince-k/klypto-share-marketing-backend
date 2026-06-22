const { calculateSMA } = require('./SMA');

async function calculateBBPERB(candles, config = {}) {
    const length = config.length || 20;
    const stdDev = config.stdDev || 2;
    const sourceKey = config.source || "close";

    // Reusing the robust SMA + Bollinger Bands engine
    const bbResults = await calculateSMA(candles, {
        maType: "SMA + Bollinger Bands",
        maLength: length,
        bbStdDev: stdDev,
        source: sourceKey
    });

    return candles.map((c, i) => {
        const bb = bbResults[i];
        let percentB = null;

        if (bb && bb.bbUpper !== null && bb.bbLower !== null) {
            const upper = bb.bbUpper;
            const lower = bb.bbLower;
            
            // Avoid division by zero
            if (upper !== lower) {
                const sourceVal = Number(c[sourceKey] || c.close);
                percentB = (sourceVal - lower) / (upper - lower);
            } else {
                percentB = 0;
            }
        }

        return {
            time: c.timestamp || c.time,
            bbperb: percentB
        };
    });
}

module.exports = { calculateBBPERB };

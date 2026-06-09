const { calculateSMA } = require('./SMA');

async function calculateVolumeOscillator(candles, config = {}) {
    const shortLength = config.shortLength || 5;
    const longLength = config.longLength || 10;
    const maType = config.maType || "SMA"; // Can be "SMA" or "EMA"

    // Calculate short MA for Volume
    const shortMA = await calculateSMA(candles, {
        maType: maType,
        maLength: shortLength,
        source: "volume"
    });

    // Calculate long MA for Volume
    const longMA = await calculateSMA(candles, {
        maType: maType,
        maLength: longLength,
        source: "volume"
    });

    return candles.map((c, i) => {
        const shortVal = shortMA[i] ? shortMA[i].smoothingMA : null;
        const longVal = longMA[i] ? longMA[i].smoothingMA : null;
        
        let vo = null;

        if (shortVal !== null && longVal !== null && longVal !== 0) {
            vo = ((shortVal - longVal) / longVal) * 100;
        }

        return {
            time: c.timestamp || c.time,
            vo: vo
        };
    });
}

module.exports = { calculateVolumeOscillator };
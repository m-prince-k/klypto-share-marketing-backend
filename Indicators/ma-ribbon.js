const { calculateSMA } = require('./SMA');

async function calculateMARibbon(candles, config = {}) {
    // Default configurations matching the requested TradingView screenshot
    const defaultLines = [
        { type: "EMA", source: "close", length: 20 },
        { type: "SMA", source: "hlc3", length: 50 },
        { type: "WMA", source: "close", length: 100 },
        { type: "VWMA", source: "close", length: 200 }
    ];

    const lines = [
        config.ma1 || defaultLines[0],
        config.ma2 || defaultLines[1],
        config.ma3 || defaultLines[2],
        config.ma4 || defaultLines[3]
    ];

    const resultsArray = [];

    for (let i = 0; i < 4; i++) {
        const lineConfig = lines[i];
        
        // We leverage the existing calculateSMA engine which handles EMA, SMA, WMA, VWMA, etc.
        const maResult = await calculateSMA(candles, {
            maType: lineConfig.type,
            maLength: Number(lineConfig.length),
            source: lineConfig.source
        });

        resultsArray.push(maResult);
    }

    // Merge the 4 lines into a single result array for each candle
    const finalResult = candles.map((c, i) => {
        return {
            time: c.timestamp || c.time,
            ma1: resultsArray[0][i] ? resultsArray[0][i].smoothingMA : null,
            ma2: resultsArray[1][i] ? resultsArray[1][i].smoothingMA : null,
            ma3: resultsArray[2][i] ? resultsArray[2][i].smoothingMA : null,
            ma4: resultsArray[3][i] ? resultsArray[3][i].smoothingMA : null
        };
    });

    return finalResult;
}

module.exports = { calculateMARibbon };

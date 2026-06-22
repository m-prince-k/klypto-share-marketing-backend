async function calculateOBV(candles, params) {
    if (!candles || candles.length === 0) return [];

    // 1. Core OBV Calculation
    const obv = new Array(candles.length).fill(0);
    for (let i = 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i - 1].close;
        const sign = change > 0 ? 1 : change < 0 ? -1 : 0;
        obv[i] = obv[i - 1] + (sign * (candles[i].volume || 0));
    }

    const maType = params?.maType;
    const hasMA = maType && maType !== "None" && maType !== "";
    const hasBB = !!params?.bbLength;

    // 2. Optional Smoothing MA
    let smoothingMA = null;
    if (hasMA) {
        const maLength = params?.length ?? params?.maLength ?? 14;
        smoothingMA = new Array(candles.length).fill(null);
        
        if (maType === "SMA") {
            for (let i = 0; i < candles.length; i++) {
                if (i >= maLength - 1) {
                    let sum = 0;
                    for (let j = i - maLength + 1; j <= i; j++) sum += obv[j];
                    smoothingMA[i] = sum / maLength;
                }
            }
        } else if (maType === "EMA") {
            const k = 2 / (maLength + 1);
            smoothingMA[0] = obv[0];
            for (let i = 1; i < candles.length; i++) {
                smoothingMA[i] = obv[i] * k + smoothingMA[i - 1] * (1 - k);
            }
        }
        // ... (other MA types can be added if needed, matching helper logic)
    }

    // 3. Optional Bollinger Bands
    let bb = null;
    if (hasBB) {
        const bbLength = params.bbLength;
        const bbMult = params.bbstdDev ?? 2;
        const source = smoothingMA || obv; // BB usually applies to the smoothed line if exists
        
        bb = { middle: new Array(candles.length).fill(null), upper: new Array(candles.length).fill(null), lower: new Array(candles.length).fill(null) };
        
        for (let i = 0; i < candles.length; i++) {
            if (i >= bbLength - 1) {
                let sum = 0;
                for (let j = i - bbLength + 1; j <= i; j++) sum += source[j];
                const mean = sum / bbLength;
                
                let variance = 0;
                for (let j = i - bbLength + 1; j <= i; j++) variance += Math.pow(source[j] - mean, 2);
                const stdDev = Math.sqrt(variance / bbLength);
                
                bb.middle[i] = mean;
                bb.upper[i] = mean + bbMult * stdDev;
                bb.lower[i] = mean - bbMult * stdDev;
            }
        }
    }

    // 4. Clean Output (Only return what was calculated)
    return candles.map((c, i) => {
        const result = {
            time: c.time,
            obv: obv[i],
            value: obv[i] // default value for scanner
        };

        if (hasMA) result.smoothingMA = smoothingMA[i];
        if (hasBB) {
            result.bbMiddle = bb.middle[i];
            result.bbUpper = bb.upper[i];
            result.bbLower = bb.lower[i];
        }

        return result;
    });
}

module.exports = { calculateOBV };
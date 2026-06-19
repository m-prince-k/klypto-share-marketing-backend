async function calculateZigZag(candles, settings) {
    const deviation = settings?.deviation ?? 5.0; // percent
    const depth = settings?.depth ?? 10;         // lookback/lookahead

    if (!candles || candles.length === 0) return { pivots: [], series: [] };

    const pivots = [];
    const series = new Array(candles.length).fill(null);

    let lastPivotPrice = candles[0].close;
    let lastPivotIndex = 0;
    let lastTrend = null; // "up" or "down"

    for (let i = depth; i < candles.length - depth; i++) {
        const currentHigh = candles[i].high;
        const currentLow = candles[i].low;

        // check for local high / low
        let isHigh = true, isLow = true;
        for (let j = i - depth; j <= i + depth; j++) {
            if (candles[j].high > currentHigh) isHigh = false;
            if (candles[j].low < currentLow) isLow = false;
        }

        if (!isHigh && !isLow) continue;

        const currentPrice = isHigh ? currentHigh : currentLow;
        const changePercent = ((currentPrice - lastPivotPrice) / lastPivotPrice) * 100;

        // first pivot
        if (pivots.length === 0) {
            pivots.push({ index: i, price: currentPrice, type: isHigh ? "high" : "low", time: candles[i].time });
            series[i] = { time: candles[i].time, value: currentPrice };
            lastPivotPrice = currentPrice;
            lastPivotIndex = i;
            lastTrend = isHigh ? "down" : "up";
            continue;
        }

        // check if change exceeds deviation
        if (Math.abs(changePercent) >= deviation) {
            const isTrendBreak = (lastTrend === "up" && isHigh) || (lastTrend === "down" && isLow);
            if (isTrendBreak) {
                // fill series between last pivot and current pivot
                const start = lastPivotIndex;
                const end = i;
                const step = (currentPrice - lastPivotPrice) / (end - start);

                for (let k = start + 1; k <= end; k++) {
                    series[k] = {
                        time: candles[k].time,
                        value: lastPivotPrice + step * (k - start)
                    };
                }

                pivots.push({ index: i, price: currentPrice, type: isHigh ? "high" : "low", time: candles[i].time });
                lastPivotPrice = currentPrice;
                lastPivotIndex = i;
                lastTrend = lastTrend === "up" ? "down" : "up";
            }
        }
    }

    // Ensure all series entries have time
    for (let i = 0; i < series.length; i++) {
        if (!series[i]) {
            series[i] = { time: candles[i].time, value: null };
        } else if (!series[i].time) {
            series[i].time = candles[i].time;
        }
    }

    return { series };
}

module.exports = { calculateZigZag };

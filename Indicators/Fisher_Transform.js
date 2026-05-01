// ---------------------------- Fisher Transform (TradingView Exact Match) ----------------------------

function calculateFisherTransform(candles) {

    const len = 9; // same as default Pine input
    const result = [];

    const values = candles.map(c => (c.high + c.low) / 2); // hl2

    const vSeries = new Array(candles.length).fill(0);
    const fishSeries = new Array(candles.length).fill(0);

    function highest(src, i, len) {
        let max = -Infinity;
        const start = Math.max(0, i - len + 1);

        for (let j = start; j <= i; j++) {
            if (src[j] > max) max = src[j];
        }
        return max;
    }

    function lowest(src, i, len) {
        let min = Infinity;
        const start = Math.max(0, i - len + 1);

        for (let j = start; j <= i; j++) {
            if (src[j] < min) min = src[j];
        }
        return min;
    }

    function round_(val) {
        if (val > 0.99) return 0.999;
        if (val < -0.99) return -0.999;
        return val;
    }

    for (let i = 0; i < candles.length; i++) {

        const hl2 = values[i];

        if (i === 0) {
            result.push({
                time: candles[i].time,
                value: 0,
                fish: 0,
                trigger: 0
            });
            continue;
        }

        const high_ = highest(values, i, len);
        const low_ = lowest(values, i, len);

        const range = (high_ - low_) === 0 ? 1 : (high_ - low_);

        // 🔥 EXACT Pine logic
        const prevValue = vSeries[i - 1] ?? 0;

        let value =
            0.66 * ((hl2 - low_) / range - 0.5) +
            0.67 * prevValue;

        value = round_(value);

        vSeries[i] = value;

        const prevFish = fishSeries[i - 1] ?? 0;

        let fish1 =
            0.5 * Math.log((1 + value) / (1 - value)) +
            0.5 * prevFish;

        fishSeries[i] = fish1;

        const fish2 = fishSeries[i - 1] ?? 0;

        result.push({
            time: candles[i].time,
            datetime: new Date(candles[i].time * 1000).toISOString(),
            fish: fish1,     // Fisher Transform
            trigger: fish2,  // fish[1]
            value: value
        });
    }

    return result;
}


module.exports = { calculateFisherTransform };

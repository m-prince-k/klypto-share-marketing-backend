function calculateFibonacciPivots(candles, options = {}) {

    const timeframe = options.timeframe ?? "Daily";
    if (!candles || candles.length === 0) return [];

    // -------- 1️⃣ Group candles by timeframe --------

    function getPeriodKey(date) {
        const d = new Date(date);

        if (timeframe === "Daily")
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

        if (timeframe === "Weekly") {
            const firstDay = new Date(d.setDate(d.getDate() - d.getDay()));
            return `${firstDay.getFullYear()}-${firstDay.getMonth()}-${firstDay.getDate()}`;
        }

        if (timeframe === "Monthly")
            return `${d.getFullYear()}-${d.getMonth()}`;

        return "";
    }

    const groups = {};
    for (let c of candles) {
        const key = getPeriodKey(c.time);
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
    }

    const keys = Object.keys(groups).sort();
    const results = [];

    // -------- 2️⃣ Calculate using previous period --------

    for (let i = 1; i < keys.length; i++) {

        const prev = groups[keys[i - 1]];
        const curr = groups[keys[i]];

        const high = Math.max(...prev.map(c => c.high));
        const low = Math.min(...prev.map(c => c.low));
        const close = prev[prev.length - 1].close;

        const P = (high + low + close) / 3;
        const range = high - low;

        const levels = {
            P,

            R1: P + 0.382 * range,
            R2: P + 0.618 * range,
            R3: P + 1.000 * range,

            S1: P - 0.382 * range,
            S2: P - 0.618 * range,
            S3: P - 1.000 * range
        };

        results?.push({
            periodStart: curr[0].time,
            periodEnd: curr[curr.length - 1].time,
            levels
        });
    }

    return results;
}


// Example Usage
module.exports={calculateFibonacciPivots}
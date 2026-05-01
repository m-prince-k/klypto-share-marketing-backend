async function calculateClassicPivots(candles, options = {}) {

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

        const range = high - low;

        const P = (high + low + close) / 3;

        const levels = {
            P,

            R1: 2 * P - low,
            S1: 2 * P - high,

            R2: P + range,
            S2: P - range,

            R3: high + 2 * (P - low),
            S3: low - 2 * (high - P),

            R4: P + 2 * range,
            S4: P - 2 * range
        };

        results.push({
            periodStart: curr[0].time,
            periodEnd: curr[curr.length - 1].time,
            levels
        });
    }

    return results;
}

// Example Usage
module.exports={calculateClassicPivots}
// const classicPivots = calculateClassicPivots(candles, {
//     timeframe: "Daily"
// });
function calculatePivotPoints(candles, options = {}) {

    const type = options.type ?? "Traditional";
    const timeframe = options.timeframe ?? "Daily";

    if (!candles || candles.length === 0) return [];

    // ---- 1️⃣ Group candles by timeframe ----

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

    const results = [];

    const keys = Object.keys(groups).sort();

    // ---- 2️⃣ Calculate pivots for each completed period ----

    for (let i = 1; i < keys.length; i++) {

        const prevPeriod = groups[keys[i - 1]];
        const currentPeriod = groups[keys[i]];

        const high = Math.max(...prevPeriod.map(c => c.high));
        const low = Math.min(...prevPeriod.map(c => c.low));
        const close = prevPeriod[prevPeriod.length - 1].close;
        const open = prevPeriod[0].open;

        const levels = computeLevels(type, high, low, close, open);

        results.push({
            periodStart: currentPeriod[0].time,
            periodEnd: currentPeriod[currentPeriod.length - 1].time,
            levels
        });
    }

    return results;
}


// ================= LEVEL FORMULAS =================

function computeLevels(type, high, low, close, open) {

    const P = (high + low + close) / 3;
    const range = high - low;

    switch (type) {

        case "Traditional":
        case "Classic":
            return {
                P,
                R1: 2 * P - low,
                S1: 2 * P - high,
                R2: P + range,
                S2: P - range,
                R3: high + 2 * (P - low),
                S3: low - 2 * (high - P),
                R4: P + 2 * range,
                S4: P - 2 * range,
                R5: P + 3 * range,
                S5: P - 3 * range
            };

        case "Fibonacci":
            return {
                P,
                R1: P + 0.382 * range,
                S1: P - 0.382 * range,
                R2: P + 0.618 * range,
                S2: P - 0.618 * range,
                R3: P + range,
                S3: P - range
            };

        case "Woodie":
            const Pw = (high + low + 2 * close) / 4;
            return {
                P: Pw,
                R1: 2 * Pw - low,
                S1: 2 * Pw - high,
                R2: Pw + range,
                S2: Pw - range,
                R3: high + 2 * (Pw - low),
                S3: low - 2 * (high - Pw)
            };

        case "DM": // DeMark
            let X;
            if (close < open)
                X = high + 2 * low + close;
            else if (close > open)
                X = 2 * high + low + close;
            else
                X = high + low + 2 * close;

            const Pd = X / 4;

            return {
                P: Pd,
                R1: X / 2 - low,
                S1: X / 2 - high
            };

        case "Camarilla":
            return {
                P,
                R1: close + range * 1.1 / 12,
                S1: close - range * 1.1 / 12,
                R2: close + range * 1.1 / 6,
                S2: close - range * 1.1 / 6,
                R3: close + range * 1.1 / 4,
                S3: close - range * 1.1 / 4,
                R4: close + range * 1.1 / 2,
                S4: close - range * 1.1 / 2,
                R5: close + range * 1.1,
                S5: close - range * 1.1
            };

        default:
            return {};
    }
}

// Example Usage

module.exports={calculatePivotPoints};
// const pivots = calculatePivotPoints(candles, {
//     type: "Traditional",
//     timeframe: "Daily"
// });

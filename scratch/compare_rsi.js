const { RSI } = require("technicalindicators");

// Mock gains and losses similar to our implementation
const period = 14;
const values = [
    100, 101, 102, 101, 103, 104, 105, 104, 103, 102, 101, 100, 99, 98, 97, 98, 99, 100, 101, 102, 103, 104, 105
];

// 1. Library RSI
const libRSI = RSI.calculate({ period, values });

// 2. Our Implementation logic (Simplified)
function customRSI(values, period) {
    let gains = [];
    let losses = [];
    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        gains.push(Math.max(diff, 0));
        losses.push(Math.max(-diff, 0));
    }

    let rsi = Array(values.length).fill(null);
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i + 1] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    }
    return rsi.filter(v => v !== null);
}

const myRSI = customRSI(values, period);

console.log("Library RSI:", libRSI);
console.log("Custom RSI: ", myRSI);

const diffs = libRSI.map((v, i) => Math.abs(v - myRSI[i]));
console.log("Max Difference:", Math.max(...diffs));

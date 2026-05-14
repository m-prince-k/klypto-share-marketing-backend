const fs = require('fs');
const path = require('path');
const { calculateRsi } = require('./util/function');

const starterJson = path.join(__dirname, 'abb-json.json');
const data = JSON.parse(fs.readFileSync(starterJson, 'utf8'));

// We will take a slice of 300 rows and re-calculate RSI using our new strict formula
const testData = data.slice(0, 300).map(r => ({
    datetime: r.datetime,
    close: Number(r.close)
}));

const result = calculateRsi(testData, 14);

console.log("--- RSI COMPARISON (Sample) ---");
for (let i = 280; i < 300; i++) {
    const originalRsi = data[i].RSI;
    const calculatedRsi = result[i].RSI;
    const diff = Math.abs(originalRsi - calculatedRsi);
    console.log(`Time: ${data[i].datetime} | JSON RSI: ${originalRsi.toFixed(4)} | Calc RSI: ${calculatedRsi.toFixed(4)} | Diff: ${diff.toFixed(6)}`);
}

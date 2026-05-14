const fs = require('fs');
const path = require('path');
const { updateIndicators } = require('./util/function');

function formatDateTimeIST(dt) {
    const y = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const h = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    const s = String(dt.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d} ${h}:${mi}:${s} IST`;
}

async function fixMorning5Min() {
    const starterJson = path.join(__dirname, 'abb-json.json');
    const liveJson = path.join(__dirname, 'live-data.json');

    console.log("Reading historical data...");
    let df1m = JSON.parse(fs.readFileSync(starterJson, 'utf8'));

    // Resample to 5-minute candles
    let df5m = [];
    for (let i = 0; i < df1m.length; i += 5) {
        let chunk = df1m.slice(i, i + 5);
        if (chunk.length < 5) break;
        df5m.push({
            open: Number(chunk[0].open),
            high: Math.max(...chunk.map(c => Number(c.high))),
            low: Math.min(...chunk.map(c => Number(c.low))),
            close: Number(chunk[4].close),
            volume: chunk.reduce((s, c) => s + Number(c.volume), 0),
            exchange_code: "NSE",
            stock_code: "ABB"
        });
    }

    // We take last 60 rows (300 mins) ending at 10:15 AM today
    const totalNeeded = 60; 
    let chunk = df5m.slice(-totalNeeded);

    console.log(`Mapping ${chunk.length} candles to IST ending at 10:15 AM today...`);
    const today = new Date();
    // 10:15 AM IST Today
    const endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 15, 0);

    const mapped = chunk.map((row, index) => {
        const offsetMinutes = (chunk.length - 1 - index) * 5;
        const newDt = new Date(endTime.getTime() - (offsetMinutes * 60000));
        return {
            ...row,
            datetime: formatDateTimeIST(newDt)
        };
    });

    console.log("Recalculating Indicators...");
    let finalDf = updateIndicators(mapped);

    fs.writeFileSync(liveJson, JSON.stringify(finalDf, null, 4));
    console.log(`Done! Saved to live-data.json with IST formatting.`);
}

fixMorning5Min();

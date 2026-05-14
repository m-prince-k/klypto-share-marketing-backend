const fs = require('fs');
const path = require('path');
const { updateIndicators } = require('./util/function');

function formatDateTime(dt) {
    return dt.getFullYear() + '-' + 
        String(dt.getMonth() + 1).padStart(2, '0') + '-' + 
        String(dt.getDate()).padStart(2, '0') + ' ' + 
        String(dt.getHours()).padStart(2, '0') + ':' + 
        String(dt.getMinutes()).padStart(2, '0') + ':' + 
        String(dt.getSeconds()).padStart(2, '0');
}

async function generate5MinData() {
    const starterJson = path.join(__dirname, 'abb-json.json');
    const liveJson = path.join(__dirname, 'live-data.json');

    console.log("Reading 1-minute historical data...");
    let df1m = JSON.parse(fs.readFileSync(starterJson, 'utf8'));

    // Resample to 5-minute candles
    console.log("Resampling to 5-minute intervals...");
    let df5m = [];
    for (let i = 0; i < df1m.length; i += 5) {
        let chunk = df1m.slice(i, i + 5);
        if (chunk.length < 5) break; // Keep only full 5-min candles

        let candle = {
            datetime: chunk[0].datetime,
            open: Number(chunk[0].open),
            high: Math.max(...chunk.map(c => Number(c.high))),
            low: Math.min(...chunk.map(c => Number(c.low))),
            close: Number(chunk[4].close),
            volume: chunk.reduce((sum, c) => sum + Number(c.volume), 0),
            exchange_code: "NSE",
            stock_code: "ABB"
        };
        df5m.push(candle);
    }

    // We need enough history for indicators. Let's take the last 200 of 5-min candles
    let chunk5m = df5m.slice(-200);

    console.log("Shifting data to today starting 9:15 AM (5-min steps)...");
    const today = new Date();
    const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 15, 0);

    const result = chunk5m.map((row, index) => {
        // Each candle is 5 minutes apart
        const newDt = new Date(startTime.getTime() + (index * 5 * 60000));
        
        return {
            ...row,
            datetime: formatDateTime(newDt)
        };
    });

    console.log("Calculating 5-min indicators...");
    let finalDf = updateIndicators(result);

    // Vol Change
    for(let i=1; i<finalDf.length; i++) {
        finalDf[i].Vol_chng = finalDf[i].volume - finalDf[i-1].volume;
        finalDf[i].Vol_pct_chng = finalDf[i-1].volume !== 0 ? (finalDf[i].Vol_chng / finalDf[i-1].volume) : 0;
    }

    console.log(`Writing ${finalDf.length} rows (5-min intervals) to live-data.json...`);
    fs.writeFileSync(liveJson, JSON.stringify(finalDf, null, 4));
    console.log("Done!");
}

generate5MinData();

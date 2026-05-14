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

async function generateMorningData() {
    const starterJson = path.join(__dirname, 'abb-json.json');
    const liveJson = path.join(__dirname, 'live-data.json');

    console.log("Reading historical data...");
    let df = JSON.parse(fs.readFileSync(starterJson, 'utf8'));

    // We need 60 rows for 9:15 to 10:15, plus 300 rows buffer for indicators
    const windowSize = 60;
    const bufferSize = 300;
    const totalNeeded = windowSize + bufferSize;

    // Take the last chunk of historical data
    let chunk = df.slice(-totalNeeded);

    console.log("Shifting data to today 9:15 AM - 10:15 AM...");
    
    const today = new Date();
    // Target 10:15 AM today as the last record of our window
    const targetEndTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 15, 0);

    const result = chunk.map((row, index) => {
        const offsetMinutes = (chunk.length - 1 - index);
        const newDt = new Date(targetEndTime.getTime() - (offsetMinutes * 60000));
        
        // Remove existing indicator keys to ensure clean recalculation
        const cleanRow = {
            datetime: formatDateTime(newDt),
            exchange_code: "NSE",
            stock_code: "ABB",
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume)
        };
        return cleanRow;
    });

    console.log("Calculating indicators (SMA, RSI, SSL, ATR)...");
    let finalDf = updateIndicators(result);

    // Add Vol Change logic
    for(let i=1; i<finalDf.length; i++) {
        finalDf[i].Vol_chng = finalDf[i].volume - finalDf[i-1].volume;
        finalDf[i].Vol_pct_chng = finalDf[i-1].volume !== 0 ? (finalDf[i].Vol_chng / finalDf[i-1].volume) : 0;
    }

    // Filter only the 9:15 to 10:15 window
    const morningWindow = finalDf.filter(row => {
        const timePart = row.datetime.split(' ')[1];
        const h = parseInt(timePart.split(':')[0]);
        const m = parseInt(timePart.split(':')[1]);
        const timeVal = h * 60 + m;
        // 9:15 (555) to 10:15 (615)
        return timeVal >= 555 && timeVal <= 615;
    });

    console.log(`Writing ${morningWindow.length} rows to live-data.json...`);
    fs.writeFileSync(liveJson, JSON.stringify(morningWindow, null, 4));
    console.log("Done!");
}

generateMorningData();

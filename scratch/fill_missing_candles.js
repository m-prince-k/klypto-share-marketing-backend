const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');
const { createObjectCsvWriter } = require('csv-writer');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';

// Helper to generate all expected 75 timestamps for a given date
function generateExpectedTimes(dateStr) {
    const times = [];
    let h = 9, m = 15;
    while (!(h === 15 && m === 30)) {
        const hh = h.toString().padStart(2, '0');
        const mm = m.toString().padStart(2, '0');
        times.push(`${dateStr} ${hh}:${mm}:00`);
        m += 5;
        if (m === 60) { h++; m = 0; }
    }
    return times; // 75 items
}

async function fixMissingCandles() {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    console.log(`Scanning ${files.length} CSV files for missing 5-min candles...`);
    
    let totalFilled = 0;
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const rows = await csv().fromFile(filePath);
        
        if (rows.length === 0) continue;
        
        // Group by Date
        const rowsByDate = {};
        for (const row of rows) {
            if (!row.datetime) continue;
            const d = row.datetime.split(' ')[0];
            if (!rowsByDate[d]) rowsByDate[d] = [];
            rowsByDate[d].push(row);
        }
        
        const newRows = [];
        let fileFilledCount = 0;
        let lastKnownClose = rows[0].close; // Fallback
        
        for (const [date, dailyRows] of Object.entries(rowsByDate)) {
            const expectedTimes = generateExpectedTimes(date);
            const rowMap = {};
            for (const r of dailyRows) rowMap[r.datetime] = r;
            
            for (const expectedTime of expectedTimes) {
                if (rowMap[expectedTime]) {
                    newRows.push(rowMap[expectedTime]);
                    lastKnownClose = rowMap[expectedTime].close;
                } else {
                    // MISSING CANDLE: Forward Fill
                    const newRow = {
                        datetime: expectedTime,
                        open: lastKnownClose,
                        high: lastKnownClose,
                        low: lastKnownClose,
                        close: lastKnownClose,
                        volume: 0,
                        histogram: '0.0000',
                        previoushistogram: '0.0000',
                        percentagehistogram: '0.00',
                        previousclose: '0.0000',
                        percentageclose: '0.00'
                    };
                    newRows.push(newRow);
                    fileFilledCount++;
                    totalFilled++;
                }
            }
        }
        
        if (fileFilledCount > 0) {
            console.log(`[${file}] Fixed ${fileFilledCount} missing entries.`);
            const header = Object.keys(newRows[0]).map(k => ({id: k, title: k}));
            const csvWriter = createObjectCsvWriter({ path: filePath, header: header });
            await csvWriter.writeRecords(newRows);
        }
    }
    
    console.log(`\nAll done! A total of ${totalFilled} missing candles were successfully filled across all files.`);
    console.log(`Now every day has exactly 75 candles from 09:15:00 to 15:25:00.`);
}

fixMissingCandles().catch(console.error);

const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';

async function checkGaps() {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    let totalMissing = 0;
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const rows = await csv().fromFile(filePath);
        
        if (rows.length === 0) continue;
        
        const dateCounts = {};
        
        for (const row of rows) {
            const dateOnly = row.datetime.split(' ')[0];
            dateCounts[dateOnly] = (dateCounts[dateOnly] || 0) + 1;
        }
        
        for (const [date, count] of Object.entries(dateCounts)) {
            // A full trading day from 09:15 to 15:25 is 75 candles.
            if (count < 75) {
                console.log(`[${file}] ${date} has only ${count} candles (Missing ${75 - count})`);
                totalMissing += (75 - count);
            }
        }
    }
    console.log(`Total missing candles across all files: ${totalMissing}`);
}

checkGaps().catch(console.error);

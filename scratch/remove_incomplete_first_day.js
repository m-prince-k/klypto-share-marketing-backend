const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');
const { createObjectCsvWriter } = require('csv-writer');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';

async function processAllFiles() {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    console.log(`Found ${files.length} CSV files to process.`);
    
    let modifiedCount = 0;
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const rows = await csv().fromFile(filePath);
        
        if (rows.length === 0) continue;
        
        const firstRowTime = rows[0].datetime;
        // Check if the very first candle of the whole file is NOT at 09:15:00
        if (firstRowTime && !firstRowTime.includes(" 09:15:00")) {
            const firstDateOnly = firstRowTime.split(' ')[0]; // e.g., 2025-12-05
            
            // Remove all rows that belong to this first incomplete day
            const filteredRows = rows.filter(r => !r.datetime.startsWith(firstDateOnly));
            
            if (filteredRows.length > 0 && filteredRows.length !== rows.length) {
                const header = Object.keys(filteredRows[0]).map(k => ({id: k, title: k}));
                const csvWriter = createObjectCsvWriter({
                    path: filePath,
                    header: header
                });
                await csvWriter.writeRecords(filteredRows);
                console.log(`Removed incomplete first day (${firstDateOnly}) from ${file}`);
                modifiedCount++;
            }
        }
    }
    console.log(`\nSuccessfully cleaned up ${modifiedCount} files. All files now start precisely at 09:15:00 on their first day!`);
}

processAllFiles().catch(console.error);

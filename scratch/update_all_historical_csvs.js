const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');
const { createObjectCsvWriter } = require('csv-writer');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';

async function processAllFiles() {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));
    console.log(`Found ${files.length} CSV files to process.`);
    
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const rows = await csv().fromFile(filePath);
        
        if (rows.length === 0) continue;
        
        const uniqueDates = [];
        const lastCandleOfDate = {};
        
        // Find the last candle for each trading day
        for (const row of rows) {
            if (!row.datetime) continue;
            const dateOnly = row.datetime.split(' ')[0];
            if (!uniqueDates.includes(dateOnly)) {
                uniqueDates.push(dateOnly);
            }
            lastCandleOfDate[dateOnly] = row; // Overwrites until the last candle of the day
        }
        
        // Process each row to add the two new columns
        for (const row of rows) {
            if (!row.datetime) continue;
            const dateOnly = row.datetime.split(' ')[0];
            const dateIndex = uniqueDates.indexOf(dateOnly);
            
            let prevHist = "0.0000";
            let prevClose = "0.0000";
            if (dateIndex > 0) {
                const prevDate = uniqueDates[dateIndex - 1];
                prevHist = parseFloat(lastCandleOfDate[prevDate].histogram || 0).toFixed(4);
                prevClose = parseFloat(lastCandleOfDate[prevDate].close || 0).toFixed(4);
            }
            
            // Histogram Percentage
            const cVal = parseFloat(row.histogram || 0);
            const pVal = parseFloat(prevHist);
            let percentageHist = "0.00";
            
            if (pVal !== 0) {
                percentageHist = (((cVal - pVal) / pVal) * 100).toFixed(2);
            } else {
                percentageHist = cVal > 0 ? "100.00" : (cVal < 0 ? "-100.00" : "0.00");
            }
            
            // Close Percentage
            const cClose = parseFloat(row.close || 0);
            const pClose = parseFloat(prevClose);
            let percentageClose = "0.00";
            
            if (pClose !== 0) {
                percentageClose = (((cClose - pClose) / pClose) * 100).toFixed(2);
            } else {
                percentageClose = cClose > 0 ? "100.00" : (cClose < 0 ? "-100.00" : "0.00");
            }
            
            row['previoushistogram'] = prevHist;
            row['percentagehistogram'] = percentageHist;
            row['previousclose'] = prevClose;
            row['percentageclose'] = percentageClose;
        }
        
        // Save the updated rows back to the CSV
        if (rows.length > 0) {
            const header = Object.keys(rows[0]).map(k => ({id: k, title: k}));
            const csvWriter = createObjectCsvWriter({
                path: filePath,
                header: header
            });
            await csvWriter.writeRecords(rows);
            console.log(`Successfully updated ${file}`);
        }
    }
    console.log("All historical CSV files have been updated successfully!");
}

processAllFiles().catch(console.error);

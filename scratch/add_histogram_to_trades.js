const fs = require('fs');
const path = require('path');
const csv = require('csvtojson');
const { createObjectCsvWriter } = require('csv-writer');

function parseEntryTimeToISTString(entryTimeStr) {
    if (!entryTimeStr) return null;
    const parts = entryTimeStr.split(' ');
    if (parts.length < 2) return null;
    
    const datePart = parts[0];
    const timePart = parts[1];
    
    let [day, month, year] = datePart.split('-');
    if (!day || !month || !year) return null;
    if (year.length === 2) year = '20' + year;
    
    const [hour, minute] = timePart.split(':');
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
}

async function processTrades() {
    const tradesFile = 'c:\\Users\\HP\\Downloads\\trades_selected_not_selected_with_9_15_open.csv';
    const trades = await csv().fromFile(tradesFile);
    
    console.log(`Loaded ${trades.length} trades.`);
    
    const historicalData = {};
    let matchedCount = 0;
    
    const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';
    const availableFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv')).map(f => f.replace('.csv', ''));
    
    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        let stock = trade['Stock'];
        if (!stock) continue;
        
        // F&O Symbol mapping logic: If file doesn't exist, try to find a match using Stock_Name
        if (!availableFiles.includes(stock)) {
            const stockName = (trade['Stock_Name'] || "").toUpperCase();
            
            // Known manual mappings for F&O symbols
            const manualMap = {
                'BHAELE': 'BEL',
                'RUCSOY': 'PATANJALI',
                'BAJAUT': 'BAJAJ-AUTO',
                'M_M': 'M&M'
            };
            
            if (manualMap[stock] && availableFiles.includes(manualMap[stock])) {
                stock = manualMap[stock];
            } else {
                // Try substring match: check if any available stock symbol is inside the Stock_Name
                // e.g. "PATANJALI FOODS" includes "PATANJALI"
                const possibleMatch = availableFiles.find(s => stockName.includes(s.replace('-', ' ')));
                if (possibleMatch) {
                    stock = possibleMatch;
                }
            }
        }
        
        if (!historicalData[stock]) {
            const histFile = path.join(dirPath, `${stock}.csv`);
            if (fs.existsSync(histFile)) {
                historicalData[stock] = await csv().fromFile(histFile);
            } else {
                historicalData[stock] = [];
            }
        }
        
        const histRows = historicalData[stock];
        let currentHist = "0.0000";
        let prevHist = "0.0000";
        let percentageHist = "0.00";
        let prevClose = "0.0000";
        let percentageClose = "0.00";
        
        if (histRows.length > 0 && trade['Entry_Time']) {
            const targetIST = parseEntryTimeToISTString(trade['Entry_Time']);
            if (targetIST) {
                const targetIndex = histRows.findIndex(r => r.datetime === targetIST);
                
                if (targetIndex !== -1) {
                    matchedCount++;
                    currentHist = histRows[targetIndex].histogram || "0.0000";
                    prevHist = histRows[targetIndex].previoushistogram || "0.0000";
                    percentageHist = histRows[targetIndex].percentagehistogram || "0.00";
                    prevClose = histRows[targetIndex].previousclose || "0.0000";
                    percentageClose = histRows[targetIndex].percentageclose || "0.00";
                }
            }
        }
        
        trade['currenthistogram'] = parseFloat(currentHist).toFixed(4);
        trade['previoushistogram'] = parseFloat(prevHist).toFixed(4);
        trade['percentagehistogram'] = parseFloat(percentageHist).toFixed(2);
        trade['previousclose'] = parseFloat(prevClose).toFixed(4);
        trade['percentageclose'] = parseFloat(percentageClose).toFixed(2);
    }
    
    console.log(`Matched ${matchedCount} entries with historical data.`);
    
    if (trades.length > 0) {
        const header = Object.keys(trades[0]).map(k => ({id: k, title: k}));
        const csvWriter = createObjectCsvWriter({
            path: tradesFile,
            header: header
        });
        await csvWriter.writeRecords(trades);
        console.log("Successfully added currenthistogram, previoushistogram, percentagehistogram, previousclose, and percentageclose columns and saved the CSV file!");
    }
}

processTrades().catch(console.error);

const fs = require('fs');
const csv = require('csvtojson');

async function run() {
    const tradesFile = 'c:\\Users\\HP\\Downloads\\trades_selected_not_selected_with_9_15_open.csv';
    const trades = await csv().fromFile(tradesFile);
    
    const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';
    const availableStocks = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv')).map(f => f.replace('.csv', ''));
    
    const unmatched = {};
    
    for (const trade of trades) {
        const stock = trade['Stock'];
        const stockName = trade['Stock_Name'];
        
        if (!availableStocks.includes(stock)) {
            unmatched[stock] = stockName;
        }
    }
    
    console.log(`Total Unmatched Stocks: ${Object.keys(unmatched).length}`);
    for (const stock in unmatched) {
        console.log(`${stock} -> ${unmatched[stock]}`);
    }
}
run();

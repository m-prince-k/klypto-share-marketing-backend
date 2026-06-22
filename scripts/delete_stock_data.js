const db = require('../models');

const symbol = process.argv[2];

if (!symbol) {
    console.log('Error: Please provide a stock symbol to delete.');
    console.log('Example: node scripts/delete_stock_data.js OBEROIRLTY');
    process.exit(1);
}

async function deleteStockData() {
    try {
        await db.sequelize.authenticate();
        console.log(`Connected to Database. Searching for records with symbol: ${symbol}...`);
        
        // Count records first
        const count = await db.OptionChainData.count({ where: { symbol: symbol } });
        
        if (count === 0) {
            console.log(`No records found for ${symbol} in OptionChainData.`);
            process.exit(0);
        }

        console.log(`Found ${count} records for ${symbol}. Deleting...`);
        
        const deleted = await db.OptionChainData.destroy({ where: { symbol: symbol } });
        
        console.log(`Successfully deleted ${deleted} records!`);
        console.log(`You can now safely re-ingest ${symbol} files.`);
        
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during deletion:', err.message);
        process.exit(1);
    }
}

deleteStockData();

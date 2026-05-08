const { OptionChain } = require('../models');
const { Op } = require('sequelize');

async function checkABB() {
    try {
        console.log("Checking DB for ABB options...");
        
        const count = await OptionChain.count({
            where: { underlying: 'ABB' }
        });
        
        const uniqueSymbols = await OptionChain.findAll({
            attributes: ['symbol'],
            where: { underlying: 'ABB' },
            group: ['symbol']
        });
        
        const dateRange = await OptionChain.findAll({
            attributes: [
                [require('sequelize').fn('MIN', require('sequelize').col('timestamp')), 'minDate'],
                [require('sequelize').fn('MAX', require('sequelize').col('timestamp')), 'maxDate']
            ],
            where: { underlying: 'ABB' },
            raw: true
        });

        console.log(`\nResults for ABB:`);
        console.log(`Total Records: ${count}`);
        console.log(`Unique Contracts: ${uniqueSymbols.length}`);
        console.log(`Date Range: ${dateRange[0].minDate} to ${dateRange[0].maxDate}`);
        
        if (uniqueSymbols.length > 0) {
            console.log("\nSample Contracts:");
            uniqueSymbols.slice(0, 10).forEach(s => console.log(`- ${s.symbol}`));
        }

        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

checkABB();

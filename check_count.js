const { OptionChainData, sequelize } = require('./models');

async function countData() {
    try {
        console.log("Connecting to database...");
        await sequelize.authenticate();
        console.log("Connected. Running count query...");

        // 2. Distinct Underlying Stocks
        const distinctQuery = await OptionChainData.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('symbol')), 'symbol']],
            raw: true
        });
        
        console.log("DISTINCT STOCKS COUNT:", distinctQuery.length);
        console.log("DISTINCT STOCKS:", distinctQuery.map(r => r.symbol).join(", "));
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
countData();

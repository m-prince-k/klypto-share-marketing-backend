const { sequelize } = require('./models');

async function analyzeDb() {
    try {
        console.log("Running ANALYZE on option_chain_data...");
        const start = Date.now();
        await sequelize.query("ANALYZE option_chain_data;");
        console.log(`ANALYZE completed in ${Date.now() - start}ms`);
        
        console.log("Fetching pg_class reltuples...");
        const [res] = await sequelize.query("SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'option_chain_data';");
        console.log("Estimated rows:", res[0].estimate);
        
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
analyzeDb();

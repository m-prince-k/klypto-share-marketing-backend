const { sequelize } = require('./models');

async function testQuery() {
    try {
        console.log("Running EXPLAIN ANALYZE...");
        const [res] = await sequelize.query(`
            EXPLAIN ANALYZE 
            SELECT * FROM option_chain_data 
            ORDER BY timestamp_epoch DESC 
            LIMIT 10;
        `);
        console.log(res.map(r => r['QUERY PLAN']).join('\n'));
        process.exit(0);
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}
testQuery();

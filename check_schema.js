const db = require('./models');

async function run() {
    try {
        const [results] = await db.sequelize.query(`
            SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS data_type
            FROM   pg_index i
            JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                 AND a.attnum = ANY(i.indkey)
            WHERE  i.indrelid = 'historical_candles'::regclass
            AND    i.indisunique;
        `);
        console.log("Unique constraints on historical_candles:");
        console.table(results);
    } catch (e) {
        console.error(e);
    }
    process.exit();
}
run();

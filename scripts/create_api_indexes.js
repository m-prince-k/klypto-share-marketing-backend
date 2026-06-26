const db = require('../models');

async function createIndexes() {
    try {
        console.log('Connecting to database...');
        await db.sequelize.authenticate();
        
        console.log('Creating CONCURRENT Index on symbol...');
        // We use CONCURRENTLY so it doesn't lock the table while PM2 is inserting!
        await db.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_symbol ON option_chain_data(symbol);`);
        console.log('✅ Index on symbol created!');

        console.log('Creating CONCURRENT Index on timestamp_epoch DESC...');
        await db.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timestamp_epoch_desc ON option_chain_data(timestamp_epoch DESC);`);
        console.log('✅ Index on timestamp_epoch created!');

        console.log('Creating CONCURRENT Index on expiry_date...');
        await db.sequelize.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expiry_date ON option_chain_data(expiry_date);`);
        console.log('✅ Index on expiry_date created!');
        
        console.log('All API indexes successfully created!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating indexes:', err);
        process.exit(1);
    }
}
createIndexes();

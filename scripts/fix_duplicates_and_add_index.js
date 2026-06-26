const { Sequelize } = require('sequelize');
const db = require('../models');

async function fixDuplicatesAndAddIndex() {
    try {
        await db.sequelize.authenticate();
        console.log('Database connected.');

        console.log('1. Cleaning up duplicate rows... This might take some time depending on the table size.');
        // Using Postgres CTID to delete duplicates and keep the one with the smallest id (or ctid)
        const deleteQuery = `
            DELETE FROM option_chain_data
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT id,
                    ROW_NUMBER() OVER( PARTITION BY symbol, expiry_date, strike, option_side, timestamp_epoch ORDER BY id ) as row_num
                    FROM option_chain_data
                ) t
                WHERE t.row_num > 1
            );
        `;
        
        const [results, metadata] = await db.sequelize.query(deleteQuery);
        console.log(`Cleanup completed! Duplicates deleted: ${metadata.rowCount || 0}`);

        console.log('2. Adding strict UNIQUE constraint to prevent future duplicates...');
        const indexQuery = `
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS unique_option_chain_data_idx 
            ON option_chain_data (symbol, expiry_date, strike, option_side, timestamp_epoch);
        `;
        
        await db.sequelize.query(indexQuery);
        console.log('Unique Index added successfully!');

        console.log('✅ Database is now protected against duplicates. You can safely run the ingestion script.');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing duplicates:', error);
        process.exit(1);
    }
}

fixDuplicatesAndAddIndex();

const db = require('../models');

async function cleanBadRows() {
    try {
        await db.sequelize.authenticate();
        console.log('Cleaning up bad records with missing symbols...');
        
        // The script was inserting rows where symbol was null because of the missing CSV header
        const deleteQuery = `DELETE FROM option_chain_data WHERE symbol IS NULL AND import_file = 'option_chain_data.csv';`;
        const [results, metadata] = await db.sequelize.query(deleteQuery);
        
        console.log(`Cleaned up ${metadata.rowCount || 0} bad rows!`);
        process.exit(0);
    } catch (err) {
        console.error('Error cleaning rows:', err);
        process.exit(1);
    }
}
cleanBadRows();

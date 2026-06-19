const db = require('../models');
const { processTargetFolder } = require('../services/ingestionService');
const path = require('path');
const fs = require('fs');

async function startRecovery() {
    try {
        await db.sequelize.authenticate();
        console.log('Database connected successfully. Starting recovery...');
        
        const vikasFolderPath = path.join(__dirname, '../vikas');
        const summary = await processTargetFolder(vikasFolderPath, false);
        
        console.log('\n--- Recovery Summary ---');
        console.log(summary);
        
        // Checking the log file status
        const logFilePath = path.join(__dirname, '../failed_ingestion.log');
        if (fs.existsSync(logFilePath)) {
             console.log('\nNOTE: failed_ingestion.log is currently not cleared automatically as per your comments in ingestionService.js.');
             console.log('If the recovery is 100% successful, you should clear this file so it does not delete records again on next run.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Recovery failed:', err);
        process.exit(1);
    }
}

startRecovery();

const { syncPriorityOptionsHistory } = require('../services/optionSyncService');
const { sequelize } = require('../models');
const store = require('../services/marketStore');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');

async function run() {
    try {
        console.log("Initializing for manual sync...");
        await sequelize.sync();
        await fetchTop200Stocks();
        await login();
        
        console.log("Starting Priority Sync for ABB...");
        await syncPriorityOptionsHistory();
        console.log("Manual Sync Completed.");
        process.exit(0);
    } catch (err) {
        console.error("Manual Sync Error:", err);
        process.exit(1);
    }
}

run();

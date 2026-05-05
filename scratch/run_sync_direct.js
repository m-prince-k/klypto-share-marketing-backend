const { syncAllUnderlyingsHistory, syncAllOptionsHistory } = require('../services/bulkSyncService');
const smartApi = require('../services/smartApi');

async function runDirectSync() {
    try {
        console.log("Starting Direct Mega Sync...");
        
        // Wait for SmartAPI authentication if needed
        if (!smartApi.access_token) {
            console.log("Waiting for SmartAPI token...");
            await new Promise(r => setTimeout(r, 5000));
        }

        console.log("Initializing Master Lists...");
        const { fetchTop200Stocks } = require('../services/stockService');
        await fetchTop200Stocks();
        
        console.log("Starting Syncing...");
        syncAllUnderlyingsHistory().catch(e => console.error("Underlying sync error:", e));
        syncAllOptionsHistory().catch(e => console.error("Options sync error:", e));
        
        console.log("Sync processes launched in background.");
        
        // Keep script alive for a bit to see logs
        await new Promise(r => setTimeout(r, 30000));
        process.exit(0);
    } catch (err) {
        console.error("Sync Error:", err.message);
        process.exit(1);
    }
}

runDirectSync();

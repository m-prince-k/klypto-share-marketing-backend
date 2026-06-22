const axios = require('axios');

async function runDailySync() {
    console.log(`[PM2 Cron] Triggering Daily Historical Sync for BOSLIM Cache...`);
    try {
        const response = await axios.get('http://localhost:9000/api/strategy/internal-sync', {
            timeout: 600000 // 10 minutes timeout since it takes 5-6 mins
        });
        console.log(`[PM2 Cron] Sync Completed Successfully:`, response.data);
        process.exit(0);
    } catch (error) {
        console.error(`[PM2 Cron] Sync Failed:`, error.message);
        process.exit(1);
    }
}

runDailySync();

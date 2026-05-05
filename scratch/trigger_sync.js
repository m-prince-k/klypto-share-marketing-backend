const axios = require('axios');

async function triggerSync() {
    try {
        console.log("Triggering Bulk Sync...");
        const response = await axios.post("http://localhost:9000/options/bulk-sync-history", {});
        console.log("Response:", response.data);
    } catch (err) {
        console.error("Error triggering sync:", err.message);
    }
}

triggerSync();

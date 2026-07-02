const axios = require('axios');
async function checkApi() {
    console.log("Calling API...");
    try {
        const start = Date.now();
        const res = await axios.get("http://localhost:5000/options/data-table?page=1&limit=10", { timeout: 10000 });
        console.log(`API responded in ${Date.now() - start}ms`);
        console.log("Pagination info:", JSON.stringify(res.data.pagination, null, 2));
    } catch(err) {
        console.error("API error:", err.message);
    }
}
checkApi();

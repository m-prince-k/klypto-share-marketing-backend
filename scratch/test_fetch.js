const { fetchGoldHistory } = require('./services/commodityService');
const store = require('./services/marketStore');

async function test() {
    try {
        console.log("Loading store data...");
        // Mock store if needed
        const res = await fetch("http://localhost:7000/equity/stocks"); // Just to make sure backend is up
        console.log("Store ping:", res.status);
        console.log("Fetching Gold history...");
        
        // Let's just rely on the existing backend since it requires AngelOne auth which is kept in memory.
        // Wait, AngelOne auth is initialized inside index.js. 
        // Better test: let's query the live endpoint for 1 day
        const data = await fetch("http://localhost:7000/equity/commodity/gold/live?interval=1m&fromDate=2026-05-04&toDate=2026-05-05");
        console.log("Status:", data.status);
        const json = await data.json();
        console.log("Success:", json.success);
        console.log("Data contracts count:", json.data ? json.data.length : 0);
    } catch (e) {
        console.error(e);
    }
}
test();

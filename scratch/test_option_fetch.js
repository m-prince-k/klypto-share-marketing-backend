const smartApi = require('../services/smartApi');

async function testFetch() {
    try {
        console.log("Waiting for SmartAPI token...");
        await new Promise(r => setTimeout(r, 5000));
        
        const params = {
            exchange: "NFO",
            symboltoken: "35129", // MIDCPNIFTY sample
            interval: "FIVE_MINUTE",
            fromdate: "2026-04-20 09:15",
            todate: "2026-05-05 15:30"
        };
        
        console.log("Fetching with params:", params);
        const response = await smartApi.getCandleData(params);
        console.log("Response Status:", response.status);
        if (response.data) {
            console.log("Data count:", response.data.length);
            if (response.data.length > 0) {
                console.log("Sample candle:", response.data[0]);
            }
        } else {
            console.log("No data returned:", response.message);
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

testFetch();

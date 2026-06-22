const { login } = require('./services/authService');
const smartApi = require('./services/smartApi');
const axios = require('axios');

async function check() {
    await login();
    const scripRes = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const master = scripRes.data;
    const match = master.find(s => s.symbol === "DALBHARAT-EQ" && s.exch_seg === "NSE");
    
    console.log("Fetching from 2026-05-08 to 2026-06-09...");
    const reqData = {
        exchange: "NSE",
        symboltoken: match.token,
        interval: "FIVE_MINUTE",
        fromdate: "2026-05-08 09:15",
        todate: "2026-06-09 15:30"
    };
    
    try {
        const response = await smartApi.getCandleData(reqData);
        console.log("API Response Status:", response?.status);
        console.log("API Error Message:", response?.message);
        console.log("Data Length:", response?.data ? response.data.length : "undefined");
        if (response?.data && response.data.length > 0) {
            console.log("First Candle:", response.data[0]);
            console.log("Last Candle:", response.data[response.data.length - 1]);
        }
    } catch(e) {
        console.log("Exception:", e.message);
    }
}
check();

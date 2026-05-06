const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const motors = all.filter(s => s.symbol.includes("MOTORS") && s.exch_seg === "NSE");
        console.log(`MOTORS symbols:`, motors.map(s => s.symbol));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

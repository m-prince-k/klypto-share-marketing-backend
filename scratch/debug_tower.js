const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const tower = all.find(s => s.symbol === "INDUSTOWER-EQ" && s.exch_seg === "NSE");
        console.log(`INDUSTOWER:`, JSON.stringify(tower, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

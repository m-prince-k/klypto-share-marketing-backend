const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const matches = all.filter(s => s.symbol.toUpperCase().includes("TATAMOTORS"));
        console.log(`Any TATAMOTORS matches:`, JSON.stringify(matches.slice(0, 5), null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

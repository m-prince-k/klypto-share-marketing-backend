const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const matches = all.filter(s => s.name.toUpperCase().includes("TATA MOTORS") && s.exch_seg === "NSE");
        console.log(`TATA MOTORS matches:`, JSON.stringify(matches, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

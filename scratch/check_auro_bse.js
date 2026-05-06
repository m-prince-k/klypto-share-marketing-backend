const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const bse = all.filter(s => s.name.includes("AUROPHARMA") && s.exch_seg === "BSE");
        console.log(`AUROPHARMA in BSE:`, JSON.stringify(bse, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

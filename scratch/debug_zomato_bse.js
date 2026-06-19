const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const zomatoBse = all.filter(s => s.exch_seg === "BSE" && s.symbol.includes("ZOMATO"));
        console.log(`ZOMATO in BSE:`, JSON.stringify(zomatoBse, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

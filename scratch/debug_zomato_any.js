const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const zomato = all.filter(s => s.symbol.includes("ZOMATO"));
        console.log(`ZOMATO matches (any):`, JSON.stringify(zomato.slice(0, 3), null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

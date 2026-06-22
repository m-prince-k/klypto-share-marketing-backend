const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const matches = all.filter(s => s.name.toUpperCase().includes("ZOMATO"));
        console.log(`ZOMATO name matches:`, matches.length);
        if (matches.length > 0) {
            console.log(`Sample:`, JSON.stringify(matches[0], null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

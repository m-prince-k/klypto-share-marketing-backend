const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        console.log(`Total records: ${all.length}`);
        
        // Find ZOMATO anywhere in the JSON string
        const str = JSON.stringify(all);
        console.log(`ZOMATO in string: ${str.includes("ZOMATO")}`);
        console.log(`TATAMOTORS in string: ${str.includes("TATAMOTORS")}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

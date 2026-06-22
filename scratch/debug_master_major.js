const axios = require('axios');

async function test() {
    try {
        const response = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
        const all = response.data;
        
        const str = JSON.stringify(all);
        console.log(`INFY in string: ${str.includes("INFY")}`);
        console.log(`HDFCBANK in string: ${str.includes("HDFCBANK")}`);
        console.log(`SBIN in string: ${str.includes("SBIN")}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

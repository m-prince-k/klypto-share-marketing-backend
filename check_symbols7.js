const axios = require('axios');
const fs = require('fs');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    fs.writeFileSync('scrips.json', JSON.stringify(res.data, null, 2));
    console.log("Saved");
}
checkSymbols();

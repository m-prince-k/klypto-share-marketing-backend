const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    
    console.log("Sample keys of an item:");
    console.log(Object.keys(all[0]));
    console.log("First 5 NSE Equity items:");
    console.log(all.filter(s => s.exch_seg === "NSE" && s.instrumenttype === "").slice(0, 5));
}
checkSymbols();

const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    
    console.log("Total scrips: ", all.length);
    console.log("NSE count: ", all.filter(s => s.exch_seg === "NSE").length);
    console.log("Sample NSE scrips: ", all.filter(s => s.exch_seg === "NSE").slice(0, 5).map(s => s.symbol));
}
checkSymbols();

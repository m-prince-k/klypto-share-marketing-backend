const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    
    console.log("All matches for TATAMOTORS:");
    console.log(all.filter(s => s.symbol.includes("TATAMOTORS")).map(s => `${s.symbol} (${s.exch_seg} - ${s.instrumenttype})`));

    console.log("All matches for ZOMATO:");
    console.log(all.filter(s => s.symbol.includes("ZOMATO")).map(s => `${s.symbol} (${s.exch_seg} - ${s.instrumenttype})`));
}
checkSymbols();

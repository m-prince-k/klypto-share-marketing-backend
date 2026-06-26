const axios = require('axios');
async function checkSymbols() {
    const res = await axios.get("https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json");
    const all = res.data;
    const nse = all.filter(s => s.exch_seg === "NSE");
    
    console.log("Matches for TATAMOTORS:");
    console.log(nse.filter(s => s.symbol.includes("TATAMOTORS")).map(s => s.symbol));
    
    console.log("Matches for POWERINDIA / ABBPOW:");
    console.log(nse.filter(s => s.symbol.includes("POWERINDIA") || s.name.includes("ABB POWER")).map(s => s.symbol));

    console.log("Matches for ABB:");
    console.log(nse.filter(s => s.symbol.startsWith("ABB")).map(s => s.symbol));

    console.log("Matches for JUBLFOOD / JUBILANT:");
    console.log(nse.filter(s => s.symbol.includes("JUBL")).map(s => s.symbol));

    console.log("Matches for ZOMATO:");
    console.log(nse.filter(s => s.symbol.includes("ZOMATO")).map(s => s.symbol));

    console.log("Matches for FINNIFTY:");
    console.log(nse.filter(s => s.symbol.includes("FINNIFTY") || s.name.includes("NIFTY FIN")).map(s => s.symbol));
}
checkSymbols();

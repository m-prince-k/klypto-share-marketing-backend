const store = require('../services/marketStore');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
require('dotenv').config();

async function check() {
    await login();
    await fetchTop200Stocks();
    console.log(`Total NFO Scrips: ${store.nfoMasterData.length}`);
    if (store.nfoMasterData.length > 0) {
        console.log("Sample NFO Scrip:", store.nfoMasterData[0]);
    }
    const uSym = "ABB";
    const filtered = store.nfoMasterData.filter(o => o.name === uSym);
    console.log(`Found ${filtered.length} scrips with name ${uSym}`);
    if (filtered.length > 0) {
        console.log("Sample filtered scrip:", filtered[0]);
    }
    const allOptions = filtered.filter(o => (o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTSTK"));
    if (allOptions.length > 0) {
        console.log("Full sample option:", JSON.stringify(allOptions[0], null, 2));
    }
}

check().catch(console.error);

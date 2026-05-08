const store = require('../services/marketStore');
const { login } = require('../services/authService');
const { fetchTop200Stocks } = require('../services/stockService');
require('dotenv').config();

async function check() {
    await login();
    await fetchTop200Stocks();
    const uSym = "ABB";
    const allOptions = store.nfoMasterData.filter(o => (o.name === uSym) && (o.instrumenttype === "OPTSTK"));
    const fs = require('fs');
    if (allOptions.length > 0) {
        fs.writeFileSync('scratch/abb_metadata.json', JSON.stringify(allOptions[0], null, 2));
        console.log("Saved to scratch/abb_metadata.json");
    } else {
        console.log("No ABB options found.");
    }
}

check().catch(console.error);

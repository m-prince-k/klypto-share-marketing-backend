const store = require('./services/marketStore');
const stockService = require('./services/stockService');

async function test() {
    await stockService.fetchTop200Stocks();
    console.log("Total stocks in store:", store.stocks.length);
    console.log("First 20 stocks:", store.stocks.slice(0, 20).map(s => s.userCode));
}
test();

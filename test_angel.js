const { getHistoricalCandle } = require('./services/angelOne');
const { fetchTop200Stocks } = require('./services/stockService');

(async () => {
    try {
        await fetchTop200Stocks();
        console.log("Testing...");
        const res = await getHistoricalCandle({
            symbol: 'TCS',
            interval: '1d',
            fromDate: '2024-01-01 09:15',
            toDate: '2024-04-30 15:30',
            exchange: 'NSE'
        });
        console.log(res);
    } catch (e) {
        console.error(e);
    }
})();

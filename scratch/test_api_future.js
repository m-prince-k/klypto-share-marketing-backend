const { getHistoricalCandle } = require('../services/angelOne');
const { login } = require('../services/authService');

async function test() {
    try {
        await login();
        const data = await getHistoricalCandle({
            symbol: "ABB26MAY26FUT",
            interval: "ONE_DAY",
            fromDate: "2026-04-01 09:15",
            toDate: "2026-05-06 15:30",
            exchange: "NFO",
            symboltoken: "66074"
        });
        console.log(`Data count: ${data.length}`);
        if (data.length > 0) {
            console.log(`First:`, data[0]);
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

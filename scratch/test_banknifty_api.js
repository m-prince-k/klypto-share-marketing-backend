const { getHistoricalCandle } = require('../services/angelOne');
const { login } = require('../services/authService');

async function test() {
    try {
        await login();
        const data = await getHistoricalCandle({
            symbol: "BANKNIFTY",
            interval: "ONE_DAY",
            fromDate: "2026-01-01 09:15",
            toDate: "2026-05-06 15:30",
            exchange: "NSE",
            symboltoken: "26009"
        });
        console.log(`BANKNIFTY Data count: ${data.length}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

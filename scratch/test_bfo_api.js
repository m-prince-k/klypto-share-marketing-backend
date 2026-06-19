const { getHistoricalCandle } = require('../services/angelOne');
const { login } = require('../services/authService');

async function test() {
    try {
        await login();
        const data = await getHistoricalCandle({
            symbol: "ABB26MAYFUT",
            interval: "ONE_DAY",
            fromDate: "2026-04-01 09:15",
            toDate: "2026-05-06 15:30",
            exchange: "BFO",
            symboltoken: "874698"
        });
        console.log(`BFO Data count: ${data.length}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();

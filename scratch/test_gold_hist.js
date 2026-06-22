const { getHistoricalCandle } = require('../services/angelOne');
const { login } = require('../services/authService');

async function testGold() {
    try {
        await login();
        const candles = await getHistoricalCandle({
            symbol: 'GOLD27MAY26FUT',
            interval: 'ONE_DAY',
            fromDate: '2026-04-01 09:15',
            toDate: '2026-05-06 15:30',
            exchange: 'MCX',
            symboltoken: '488796'
        });
        console.log('Latest Gold Candle:', candles[candles.length - 1]);
    } catch (e) {
        console.error(e);
    }
}
testGold();

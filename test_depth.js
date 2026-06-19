const smartApi = require('./services/smartApi');

async function testApi() {
    try {
        const resp = await smartApi.marketData({ mode: 'FULL', exchangeTokens: { NSE: ["2885"] } }); // 2885 is RELIANCE
        console.log(JSON.stringify(resp.data.fetched[0].depth, null, 2));
    } catch(e) {
        console.error(e);
    }
}
testApi();

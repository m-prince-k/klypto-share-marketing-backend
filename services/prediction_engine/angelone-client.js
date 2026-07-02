const smartApi = require('../smartApi');

async function fetchHistoricalCandles(symbol, token, interval, fromDateStr, toDateStr) {
  const payload = {
    exchange: "NSE",
    symboltoken: token,
    interval: interval,
    fromdate: fromDateStr,
    todate: toDateStr
  };

  try {
    const response = await smartApi.getCandleData(payload);
    if (!response || !response.status) throw new Error("Fallback to raw");
    return response;
  } catch (err) {
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const tokenPath = path.join(__dirname, '..', '..', 'angel_token.json');
    let jwtToken = '';
    if (fs.existsSync(tokenPath)) {
      const t = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      jwtToken = t.jwtToken;
    }

    const res = await axios.post(
      "https://apiconnect.angelbroking.com/rest/secure/angelbroking/historical/v1/getCandleData",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "01-01-01-01-01-01",
          "X-PrivateKey": process.env.ANGEL_API_KEY,
          Authorization: `Bearer ${jwtToken}`,
        },
        timeout: 25000,
      }
    );
    return res.data;
  }
}

async function fetchMarketDataBatch(tokens) {
  const payload = {
    mode: "FULL",
    exchangeTokens: {
      "NSE": tokens
    }
  };

  // Assuming smartApi has getMarketData for v1/quote, or we use axios directly with the JWT token
  // Let's use smartApi.getMarketData if it exists, otherwise we can just grab the JWT token from angel_token.json and use axios.
  try {
    const response = await smartApi.getMarketData(payload);
    return response;
  } catch (err) {
    // If getMarketData isn't the right method, fallback to raw axios call using token
    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const tokenPath = path.join(__dirname, '..', '..', 'angel_token.json');
    let jwtToken = '';
    if (fs.existsSync(tokenPath)) {
      const t = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      jwtToken = t.jwtToken;
    }

    const res = await axios.post(
      "https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote",
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-UserType": "USER",
          "X-SourceID": "WEB",
          "X-ClientLocalIP": "127.0.0.1",
          "X-ClientPublicIP": "127.0.0.1",
          "X-MACAddress": "01-01-01-01-01-01",
          "X-PrivateKey": process.env.ANGEL_API_KEY,
          Authorization: `Bearer ${jwtToken}`,
        },
        timeout: 25000,
      }
    );
    return res.data;
  }
}

module.exports = {
  fetchHistoricalCandles,
  fetchMarketDataBatch
};

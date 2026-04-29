const axios = require("axios");
const csv = require("csvtojson");
const BreezeConnect = require("breezeconnect").BreezeConnect;

// 🔐 Credentials
const apiKey = "J79hE1567716242L7829Vh7)68287507";
const apiSecret = "W7T470%0y5923B7SJO@0617684TKs67c";
const sessionToken = "55451082";

// ✅ Initialize
const breeze = new BreezeConnect({ appKey: apiKey });

async function getData(object) {
  try {
    // ✅ Generate session
    await breeze.generateSession(apiSecret, sessionToken);

    // ✅ Correct method (V2 nahi)
    const data = await breeze.getHistoricalData({
      interval: object.interval || "1minute",
      fromDate: object.from_date || "2026-04-15T07:00:00.000Z",
      toDate:  object.to_date || "2026-04-28T07:00:00.000Z",

      stockCode: object.symbol || "ICIBAN",
      exchangeCode: "NFO", //NFO IS FOR FUTURE AND OPTIONS && NSE IS FOR EQUITY
      productType: "futures", //option //cash

      expiryDate: "2026-04-28T07:00:00.000Z",
      right: "others", //ONLY USE FOR OPTIONS && WE CAN PASS CALL AND PUT
      strikePrice: "0"
    });

    console.log("Historical Data:", data);
    return data;

  } catch (error) {
    console.error("Error:", error.message || error);
  }
}


async function getAllStocks() {
  const url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv";

  const response = await axios.get(url);

  console.log(response,"998878977877_____________")

  const json = await csv().fromString(response.data);

  return json.map(item => ({
    symbol: item.SYMBOL,
    name: item.NAME_OF_COMPANY
  }));
}

module.exports={getData,getAllStocks}
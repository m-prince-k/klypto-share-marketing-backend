const store = require('./marketStore');
const { OptionChainAngelOne } = require('../models');
const { calculateIV, calculateGreeks } = require('../utils/blackScholes');

const RISK_FREE_RATE = 0.1;

// Helper to parse expiry
const MONTH_TO_NUMBER = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function parseExpiryToUtc(expiryDateStr) {
  if (!expiryDateStr || expiryDateStr.length < 9) return null;
  const day = expiryDateStr.substring(0, 2);
  const month = MONTH_TO_NUMBER[expiryDateStr.substring(2, 5).toUpperCase()];
  const year = expiryDateStr.substring(5);
  if (!month) return null;
  return new Date(`${year}-${month}-${day}T10:00:00.000Z`);
}

function getTimeToExpiryInYears(expiryDateStr) {
  const expiryDate = parseExpiryToUtc(expiryDateStr);
  if (!expiryDate) return 0;
  const now = new Date();
  let timeToExpiryDays = (expiryDate - now) / (1000 * 60 * 60 * 24);
  return Math.max(timeToExpiryDays / 365, 0.0001); // Avoid 0 DTE
}

async function saveIntradaySnapshot() {
  console.log(`[HistoricalScheduler] Running Intraday Snapshot for OptionChainAngelOne...`);
  try {
    const masterData = store.nfoMasterData || [];
    if (masterData.length === 0) return;

    // Get Target symbols (e.g. NIFTY, BANKNIFTY) - we can use the same list as DailyOptionData
    const symbols = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "MIDCPNIFTY"];
    
    const dbData = [];
    const now = new Date();

    for (const symbol of symbols) {
      const uSym = symbol.toUpperCase();
      let spotLtp = store.latestMarketData[`${uSym}:NSE`]?.last_traded_price || store.latestMarketData[`${uSym}:BSE`]?.last_traded_price || 0;
      spotLtp = parseFloat(spotLtp);

      if (spotLtp === 0) continue;

      const allOpts = masterData.filter(o => 
        (o.name === uSym || o.symbol.startsWith(uSym)) && 
        (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTCOM")
      );

      if (allOpts.length === 0) continue;

      // Group by expiry
      const expiries = [...new Set(allOpts.map(o => o.expiry))].sort((a, b) => new Date(a) - new Date(b));
      const targetExpiry = expiries[0]; // Nearest expiry

      const expiryOpts = allOpts.filter(o => o.expiry === targetExpiry);
      const timeToExpiry = getTimeToExpiryInYears(targetExpiry);

      // Only save nearest 20 strikes to save DB space
      const uniqueStrikes = [...new Set(expiryOpts.map(o => parseFloat(o.strike) / 100))].sort((a, b) => a - b);
      const atmStrike = uniqueStrikes.reduce((prev, curr) => Math.abs(curr - spotLtp) < Math.abs(prev - spotLtp) ? curr : prev);
      const atmIdx = uniqueStrikes.indexOf(atmStrike);
      const targetStrikes = uniqueStrikes.slice(Math.max(0, atmIdx - 10), Math.min(uniqueStrikes.length, atmIdx + 11));

      expiryOpts.forEach(opt => {
        const strike = parseFloat(opt.strike) / 100;
        if (!targetStrikes.includes(strike)) return;

        const live = store.latestMarketData[`${opt.token}:NFO`];
        const ltp = live ? parseFloat(live.last_traded_price || live.ltp || 0) : 0;
        
        if (ltp === 0) return; // Skip zero LTP options

        let iv = 0, delta = 0, gamma = 0, theta = 0, vega = 0;
        
        try {
            iv = calculateIV(spotLtp, strike, timeToExpiry, RISK_FREE_RATE, ltp, opt.optiontype === 'CE' ? 'call' : 'put');
            if (iv > 0) {
                const greeks = calculateGreeks(spotLtp, strike, timeToExpiry, RISK_FREE_RATE, iv, opt.optiontype === 'CE' ? 'call' : 'put');
                delta = greeks.delta;
                gamma = greeks.gamma;
                theta = greeks.theta;
                vega = greeks.vega;
            }
        } catch (e) {
            // Ignore calc errors
        }

        dbData.push({
          symbol: opt.name,
          expiry_date: opt.expiry,
          strike_price: strike,
          option_type: opt.optiontype,
          open: live ? parseFloat(live.open_price_day || live.open || 0) : 0,
          high: live ? parseFloat(live.high_price_day || live.high || 0) : 0,
          low: live ? parseFloat(live.low_price_day || live.low || 0) : 0,
          close: live ? parseFloat(live.close_price || live.close || 0) : 0,
          ltp: ltp,
          spot_price: spotLtp,
          iv: iv,
          delta: delta,
          gamma: gamma,
          theta: theta,
          vega: vega,
          volume: live ? parseInt(live.vol_traded || live.v || 0) : 0,
          oi: live ? parseInt(live.open_interest || live.oi || 0) : 0,
          oi_change: live ? parseFloat(live.open_interest_change || live.oiChange || 0) : 0,
          best_buy: live?.best_5_buy_data?.[0]?.price ? live.best_5_buy_data[0].price : null,
          best_sell: live?.best_5_sell_data?.[0]?.price ? live.best_5_sell_data[0].price : null,
          datetime_ist: now
        });
      });
    }

    if (dbData.length > 0) {
      // Chunking to avoid massive inserts
      const CHUNK_SIZE = 500;
      for (let i = 0; i < dbData.length; i += CHUNK_SIZE) {
        await OptionChainAngelOne.bulkCreate(dbData.slice(i, i + CHUNK_SIZE), { ignoreDuplicates: true });
      }
      console.log(`[HistoricalScheduler] Saved ${dbData.length} records to OptionChainAngelOne.`);
    }

  } catch (err) {
    console.error(`[HistoricalScheduler] Error:`, err);
  }
}

module.exports = {
  saveIntradaySnapshot
};

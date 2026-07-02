const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { OptionChainAngelOne } = require('../models');
const store = require('../services/marketStore'); // the main memory store

router.get('/api/option-chain', async (req, res) => {
  try {
    const {
      symbol = "NIFTY",
      expiry_date,
      strike_price,
      option_type,
    } = req.query;

    // Pull from the main backend's marketStore
    // The option chain store has nfoMasterData and latestMarketData
    // We will build a list similar to what the UI expects
    
    // In klypto-share-marketing-backend, latestMarketData is keyed by 'TOKEN:NSE' or 'TOKEN:NFO'
    // But nfoMasterData is an array of objects with instrumenttype, name, symbol, strike, expiry
    let filteredData = [];
    const masterData = store.nfoMasterData || [];
    
    // Filter master data by symbol
    const uSym = symbol.toUpperCase();
    const allOpts = masterData.filter(o => 
      (o.name === uSym || o.symbol.startsWith(uSym)) && 
      (o.instrumenttype === "OPTSTK" || o.instrumenttype === "OPTIDX" || o.instrumenttype === "OPTCOM")
    );

    // Get underlying LTP — try multiple key formats for indices
    let spotLtp = 
      store.latestMarketData[`${uSym}:NSE`]?.last_traded_price ||
      store.latestMarketData[`${uSym}:BSE`]?.last_traded_price ||
      store.latestMarketData[`${uSym}:NSE`]?.ltp ||
      store.latestMarketData[`${uSym}:BSE`]?.ltp ||
      // Try any key that starts with the symbol
      (() => {
        const key = Object.keys(store.latestMarketData).find(k => k.startsWith(`${uSym}:`));
        return key ? (store.latestMarketData[key]?.last_traded_price || store.latestMarketData[key]?.ltp || 0) : 0;
      })() || 0;
    
    allOpts.forEach(opt => {
      // Determine CE or PE from symbol suffix (e.g., "NIFTY07JUL2026CE24000")
      const optionType = opt.symbol.endsWith('CE') ? 'CE' : opt.symbol.endsWith('PE') ? 'PE' : null;
      if (!optionType) return; // skip non-CE/PE entries

      // Apply filters
      if (expiry_date && opt.expiry !== expiry_date) return;
      if (strike_price && parseFloat(opt.strike) !== parseFloat(strike_price)) return;
      if (option_type && optionType !== option_type) return;

      const live = store.latestMarketData[`${opt.token}:NFO`];
      const lastTradedPrice = live ? parseFloat(live.last_traded_price || live.ltp || 0) : 0;

      filteredData.push({
        symbol: opt.name,
        expiry_date: opt.expiry,
        strike_price: parseFloat(opt.strike), // raw paisa value; UI will divide by 100
        option_type: optionType,
        token: opt.token,
        ltp: lastTradedPrice,
        open: live ? parseFloat(live.open_price_day || live.open || 0) : 0,
        high: live ? parseFloat(live.high_price_day || live.high || 0) : 0,
        low: live ? parseFloat(live.low_price_day || live.low || 0) : 0,
        close: live ? parseFloat(live.close_price || live.close || 0) : 0,
        volume: live ? parseInt(live.vol_traded || live.v || 0) : 0,
        oi: live ? parseInt(live.open_interest || live.oi || 0) : 0,
        oi_change: live ? parseFloat(live.open_interest_change || live.oiChange || 0) : 0,
        best_buy: live?.best_5_buy_data?.[0]?.price ?? null,
        best_sell: live?.best_5_sell_data?.[0]?.price ?? null,
        spot_price: parseFloat(spotLtp),
        update_time: new Date()
      });
    });

    res.json({
      success: true,
      symbol,
      totalRecords: filteredData.length,
      data: filteredData,
    });
  } catch (error) {
    console.error("Error fetching Option Chain for API:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

router.get("/api/historical-data", async (req, res) => {
  try {
    const { symbol, expiry_date, strike_price, option_type, date } = req.query;
    const whereClause = {};

    if (symbol) whereClause.symbol = symbol;
    if (expiry_date) whereClause.expiry_date = expiry_date;
    if (strike_price) whereClause.strike_price = strike_price;
    if (option_type) whereClause.option_type = option_type;

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      whereClause.datetime_ist = {
        [Op.between]: [startDate, endDate],
      };
    }

    const data = await OptionChainAngelOne.findAll({
      where: whereClause,
      order: [["datetime_ist", "ASC"]],
    });

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error fetching historical data:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

router.get("/api/historical-metadata", async (req, res) => {
  try {
    const metadata = await OptionChainAngelOne.findAll({
      attributes: ["symbol", "expiry_date", "strike_price"],
      group: ["symbol", "expiry_date", "strike_price"],
      raw: true,
    });

    res.json({
      success: true,
      data: metadata,
    });
  } catch (error) {
    console.error("Error fetching historical metadata:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

module.exports = router;

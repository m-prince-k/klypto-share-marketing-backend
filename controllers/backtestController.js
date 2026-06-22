const backtestService = require('../services/backtestService');

const getBacktestDashboardData = async (req, res) => {
  try {
    // Fetch trades from the database (seeds mock data if empty)
    let trades = await backtestService.getTradesFromDB();

    const body = req.body || {};
    const query = req.query || {};

    // Filter by specific stock if provided in query (e.g., ?symbol=RELIANCE)
    if (query.symbol) {
      const symbolTarget = query.symbol.toUpperCase();
      trades = trades.filter(t => t.symbol.toUpperCase() === symbolTarget);
    }

    // Default initial capital to $10,000 if not provided
    const initialCapital = Number(body.initialCapital || query.initialCapital || 10000);
    const riskFreeRate = Number(body.riskFreeRate || query.riskFreeRate || 0.05);

    const metrics = backtestService.calculateBacktestMetrics(trades, initialCapital, riskFreeRate);

    if (!metrics) {
      return res.status(400).json({
        success: false,
        message: 'Could not calculate metrics. Trades data might be invalid.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Backtest metrics generated successfully',
      data: metrics
    });
  } catch (error) {
    console.error('Error generating backtest metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

const store = require('../services/marketStore');
const engine = require('../trading_engine');

const getEngineTradeSignal = async (req, res) => {
  try {
    const symbol = req.query.symbol;
    if (!symbol) return res.status(400).json({ success: false, message: "Symbol is required (e.g., ?symbol=RELIANCE)" });

    const uSym = symbol.toUpperCase();

    // Find the latest live tick for this symbol to feed to the engine
    // We look up in marketStore.liveCandles or marketStore.latestMarketData
    const tokenKey = `${uSym}_NSE`;
    const token = store.symbolToTokenMaster[tokenKey] || store.symbolToTokenMaster[uSym];

    let liveTick = store.liveCandles[token] || store.liveCandles[uSym];

    if (!liveTick) {
        // Fallback to latestMarketData
        const marketData = store.latestMarketData[`${uSym}:NSE`] || store.latestMarketData[`${uSym}:NFO`];
        if (marketData) {
            liveTick = {
                open: marketData.open_price_of_the_day || marketData.last_traded_price,
                high: marketData.high_price_of_the_day || marketData.last_traded_price,
                low: marketData.low_price_of_the_day || marketData.last_traded_price,
                close: marketData.last_traded_price,
                volume: marketData.volume_trade_for_the_day || 0,
                timestamp: new Date().toISOString()
            };
        } else {
            // Force fetch if completely missing from memory
            const smartApi = require('../services/smartApi');
            const exchange = store.tokenToExchange[token] || "NSE";
            if (token) {
                const resp = await smartApi.marketData({
                    mode: "LTP",
                    exchangeTokens: { [exchange]: [token] }
                });
                if (resp && resp.data && resp.data.fetched && resp.data.fetched.length > 0) {
                    const fetchedLtp = resp.data.fetched[0].ltp;
                    liveTick = {
                        open: fetchedLtp,
                        high: fetchedLtp,
                        low: fetchedLtp,
                        close: fetchedLtp,
                        volume: 0,
                        timestamp: new Date().toISOString()
                    };
                }
            }
        }
    }

    if (!liveTick) {
        return res.status(404).json({ success: false, message: `No live tick found for ${uSym}` });
    }

    // Process the tick through the engine
    const tradeSignal = await engine.process_stock_tick(uSym, liveTick);
    
    if (!tradeSignal) {
        return res.status(200).json({
            success: true,
            message: `Tick processed, but no valid trade signal generated for ${uSym}.`,
            data: null
        });
    }

    // Save the new live trade to the Trade database table
    try {
        const { Trade } = require('../models');
        await Trade.create({
            symbol: tradeSignal.Stock,
            direction: tradeSignal.Type === 'CALL' ? 'Long' : 'Short',
            entryTime: new Date(tradeSignal.Entry_Time),
            exitTime: null,
            entryPrice: tradeSignal.Entry_Price,
            exitPrice: null,
            pnlValue: 0,
            pnlPercentage: 0,
            status: 'OPEN',
            reason: `Signal: ${tradeSignal.Signal}, RSI: ${tradeSignal.RSI}`
        });
        console.log(`[DB] Successfully saved OPEN trade for ${tradeSignal.Stock}`);
    } catch (dbErr) {
        console.error('[DB] Error saving live trade to DB:', dbErr.message);
    }

    return res.status(200).json({
        success: true,
        message: 'Trade signal generated successfully',
        data: tradeSignal
    });

  } catch (error) {
    console.error('Error generating trade signal:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

module.exports = {
  getBacktestDashboardData,
  getEngineTradeSignal
};

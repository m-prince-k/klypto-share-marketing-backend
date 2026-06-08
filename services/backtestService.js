const calculateBacktestMetrics = (trades, initialCapital = 10000, riskFreeRate = 0.05) => {
  if (!trades || trades.length === 0) return null;

  let currentEquity = initialCapital;
  let peakEquity = initialCapital;
  let maxDrawdownValue = 0;
  let maxDrawdownPct = 0;

  let netPnL = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalWins = 0;
  let totalLosses = 0;

  let maxProfitSingleTrade = 0;
  let maxLossSingleTrade = 0;

  let consecutiveWins = { current: 0, max: 0 };
  let consecutiveLosses = { current: 0, max: 0 };
  let largestWinningStreakValue = 0;
  let currentWinningStreakValue = 0;
  let largestLosingStreakValue = 0;
  let currentLosingStreakValue = 0;

  let longTrades = { count: 0, wins: 0, netPnL: 0 };
  let shortTrades = { count: 0, wins: 0, netPnL: 0 };

  const profitByDay = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const pnlDistribution = {}; 
  const pnlBins = [-1500, -1000, -500, 0, 500, 1000, 1500, 2000, 2500];

  const equityCurveData = [];
  const drawdownCurveData = [];
  const dailyReturns = {};

  equityCurveData.push({ time: trades[0].entryTime, value: initialCapital, benchmark: initialCapital });
  drawdownCurveData.push({ time: trades[0].entryTime, value: 0 });

  const firstDateMs = new Date(trades[0].entryTime).getTime();

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    const pnl = trade.pnlValue;
    
    // Equity and Drawdown
    currentEquity += pnl;
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    
    const currentDrawdown = peakEquity > 0 ? (currentEquity - peakEquity) / peakEquity : 0;
    const currentDrawdownValue = currentEquity - peakEquity;
    
    if (currentDrawdown < maxDrawdownPct) maxDrawdownPct = currentDrawdown;
    if (currentDrawdownValue < maxDrawdownValue) maxDrawdownValue = currentDrawdownValue;

    const exitDateMs = new Date(trade.exitTime).getTime();
    const daysElapsed = (exitDateMs - firstDateMs) / (1000 * 60 * 60 * 24);
    // Mock benchmark: 12% annualized return + some noise to look like a real index
    const noise = (Math.sin(daysElapsed / 5) * 0.03) * initialCapital; 
    const benchmarkValue = initialCapital * Math.pow(1 + 0.12, daysElapsed / 365) + noise;

    equityCurveData.push({ 
      time: trade.exitTime, 
      value: parseFloat(currentEquity.toFixed(2)),
      benchmark: parseFloat(benchmarkValue.toFixed(2))
    });
    drawdownCurveData.push({ time: trade.exitTime, value: parseFloat((currentDrawdown * 100).toFixed(2)) });

    // PnL updates
    netPnL += pnl;
    if (pnl > 0) {
      grossProfit += pnl;
      totalWins++;
      consecutiveWins.current++;
      consecutiveLosses.current = 0;
      if (consecutiveWins.current > consecutiveWins.max) consecutiveWins.max = consecutiveWins.current;
      
      currentWinningStreakValue += pnl;
      currentLosingStreakValue = 0;
      if (currentWinningStreakValue > largestWinningStreakValue) largestWinningStreakValue = currentWinningStreakValue;
      
      if (pnl > maxProfitSingleTrade) maxProfitSingleTrade = pnl;
    } else {
      grossLoss += Math.abs(pnl);
      totalLosses++;
      consecutiveLosses.current++;
      consecutiveWins.current = 0;
      if (consecutiveLosses.current > consecutiveLosses.max) consecutiveLosses.max = consecutiveLosses.current;
      
      currentLosingStreakValue += pnl;
      currentWinningStreakValue = 0;
      if (currentLosingStreakValue < largestLosingStreakValue) largestLosingStreakValue = currentLosingStreakValue;
      
      if (pnl < maxLossSingleTrade) maxLossSingleTrade = pnl;
    }

    // Long vs Short
    if (trade.direction === 'Long') {
      longTrades.count++;
      longTrades.netPnL += pnl;
      if (pnl > 0) longTrades.wins++;
    } else {
      shortTrades.count++;
      shortTrades.netPnL += pnl;
      if (pnl > 0) shortTrades.wins++;
    }

    // Profit by Time (Day of week)
    const exitDate = new Date(trade.exitTime);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayStr = dayNames[exitDate.getDay()];
    if (profitByDay[dayStr] !== undefined) {
      profitByDay[dayStr] += pnl;
    }

    // Daily Returns (for Sharpe/Sortino)
    const dateStr = exitDate.toISOString().split('T')[0];
    if (!dailyReturns[dateStr]) {
      dailyReturns[dateStr] = { initialEquity: currentEquity - pnl, finalEquity: currentEquity };
    } else {
      dailyReturns[dateStr].finalEquity = currentEquity;
    }
    
    // Distribution Binning
    let assigned = false;
    for(let b=0; b<pnlBins.length; b++){
       if(pnl <= pnlBins[b]) {
           const label = b === 0 ? `< ${pnlBins[0]}` : `${pnlBins[b-1]} to ${pnlBins[b]}`;
           pnlDistribution[label] = (pnlDistribution[label] || 0) + 1;
           assigned = true;
           break;
       }
    }
    if(!assigned) {
       const label = `> ${pnlBins[pnlBins.length-1]}`;
       pnlDistribution[label] = (pnlDistribution[label] || 0) + 1;
    }
  }

  const finalCapital = currentEquity;
  const totalTrades = trades.length;
  const winRatePct = (totalWins / totalTrades) * 100;
  const totalReturnPct = (netPnL / initialCapital) * 100;
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : grossProfit; 
  const avgProfit = totalWins > 0 ? grossProfit / totalWins : 0;
  const avgLoss = totalLosses > 0 ? (grossLoss / totalLosses) * -1 : 0; 
  
  const expectancy = ((totalWins / totalTrades) * avgProfit) - ((totalLosses / totalTrades) * Math.abs(avgLoss));
  const kellyCriterionPct = (avgLoss !== 0) ? ((totalWins / totalTrades) - ((1 - (totalWins / totalTrades)) / (avgProfit / Math.abs(avgLoss)))) * 100 : 0;

  // Annualized Metrics
  const firstDate = new Date(trades[0].entryTime);
  const lastDate = new Date(trades[trades.length - 1].exitTime);
  const daysTraded = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
  const yearsTraded = daysTraded / 365;
  const annualizedReturn = ((finalCapital / initialCapital) ** (1 / Math.max(0.001, yearsTraded))) - 1;

  // Sharpe and Sortino
  const returnsArray = Object.values(dailyReturns).map(d => d.initialEquity > 0 ? (d.finalEquity - d.initialEquity) / d.initialEquity : 0);
  const avgDailyReturn = returnsArray.length > 0 ? returnsArray.reduce((sum, r) => sum + r, 0) / returnsArray.length : 0;
  const stdDevDaily = returnsArray.length > 0 ? Math.sqrt(returnsArray.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / returnsArray.length) : 0;
  const annualizedStdDev = stdDevDaily * Math.sqrt(252); 
  
  const negativeReturns = returnsArray.filter(r => r < 0);
  const avgNegReturn = negativeReturns.length > 0 ? negativeReturns.reduce((sum, r) => sum + r, 0) / negativeReturns.length : 0;
  const sortinoStdDevDaily = negativeReturns.length > 0 ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r - avgNegReturn, 2), 0) / negativeReturns.length) : 0;
  const annualizedSortinoStdDev = sortinoStdDevDaily * Math.sqrt(252);

  const sharpeRatio = annualizedStdDev > 0 ? (annualizedReturn - riskFreeRate) / annualizedStdDev : 0;
  const sortinoRatio = annualizedSortinoStdDev > 0 ? (annualizedReturn - riskFreeRate) / annualizedSortinoStdDev : 0;
  
  const calmarRatio = Math.abs(maxDrawdownPct) > 0 ? annualizedReturn / Math.abs(maxDrawdownPct) : 0;
  const recoveryFactor = Math.abs(maxDrawdownValue) > 0 ? netPnL / Math.abs(maxDrawdownValue) : 0;

  const longVsShort = {
    long: {
      count: longTrades.count,
      winRatePct: parseFloat((longTrades.count > 0 ? (longTrades.wins / longTrades.count) * 100 : 0).toFixed(2)),
      netPnL: parseFloat(longTrades.netPnL.toFixed(2))
    },
    short: {
      count: shortTrades.count,
      winRatePct: parseFloat((shortTrades.count > 0 ? (shortTrades.wins / shortTrades.count) * 100 : 0).toFixed(2)),
      netPnL: parseFloat(shortTrades.netPnL.toFixed(2))
    }
  };

  const formattedPnlDistribution = Object.keys(pnlDistribution).map(key => ({
    range: key,
    count: pnlDistribution[key]
  }));

  // Fix profit by day to decimals
  Object.keys(profitByDay).forEach(k => {
    profitByDay[k] = parseFloat(profitByDay[k].toFixed(2));
  });

  return {
    netPnL: parseFloat(netPnL.toFixed(2)),
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    totalTrades,
    winRatePct: parseFloat(winRatePct.toFixed(2)),
    totalWins,
    totalLosses,
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    maxDrawdownPct: parseFloat((maxDrawdownPct * 100).toFixed(2)),
    maxDrawdownValue: parseFloat(maxDrawdownValue.toFixed(2)),
    maxProfitSingleTrade: parseFloat(maxProfitSingleTrade.toFixed(2)),
    maxLossSingleTrade: parseFloat(maxLossSingleTrade.toFixed(2)),
    initialCapital: parseFloat(initialCapital.toFixed(2)),
    finalCapital: parseFloat(finalCapital.toFixed(2)),
    annualizedReturn: parseFloat((annualizedReturn * 100).toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    avgProfit: parseFloat(avgProfit.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    calmarRatio: parseFloat(calmarRatio.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    consecutiveWins,
    consecutiveLosses,
    largestWinningStreakValue: parseFloat(largestWinningStreakValue.toFixed(2)),
    largestLosingStreakValue: parseFloat(largestLosingStreakValue.toFixed(2)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(2)),
    kellyCriterionPct: parseFloat(kellyCriterionPct.toFixed(2)),
    pnlDistribution: formattedPnlDistribution,
    profitByTime: profitByDay,
    longVsShort,
    equityCurveData,
    drawdownCurveData,
    recentTrades: trades.slice(-5).reverse()
  };
};

const { Trade } = require('../models');

// Fetch Trades from DB (and seed mock data if empty)
const getTradesFromDB = async () => {
  try {
    const count = await Trade.count();
    
    if (count === 0) {
      console.log("[DB] Trade table is empty. Seeding with mock trades...");
      const mockTrades = [];
      const symbols = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'RELIANCE', 'TCS', 'HDFC'];
      let startTime = new Date('2023-01-01T09:30:00Z').getTime();

      for (let i = 1; i <= 312; i++) {
        const durationMs = (Math.floor(Math.random() * 5) + 1) * 60 * 60 * 1000; 
        const exitTime = startTime + durationMs;
        
        const direction = Math.random() > 0.5 ? 'Long' : 'Short';
        const symbol = symbols[Math.floor(Math.random() * symbols.length)];
        const entryPrice = Math.random() * 200 + 100;
        
        const isWin = Math.random() < 0.62;
        let pnlPct = (Math.random() * 0.05) + 0.001; 
        if (!isWin) pnlPct = -pnlPct;
        
        const exitPrice = direction === 'Long' ? entryPrice * (1 + pnlPct) : entryPrice * (1 - pnlPct);
        const shares = 100; 
        const pnlValue = direction === 'Long' ? (exitPrice - entryPrice) * shares : (entryPrice - exitPrice) * shares;

        mockTrades.push({
          entryTime: new Date(startTime),
          exitTime: new Date(exitTime),
          direction,
          symbol,
          entryPrice: parseFloat(entryPrice.toFixed(2)),
          exitPrice: parseFloat(exitPrice.toFixed(2)),
          pnlValue: parseFloat(pnlValue.toFixed(2)),
          pnlPercentage: parseFloat((pnlPct * 100).toFixed(2)),
          status: 'CLOSED',
          reason: 'Mock Data'
        });

        startTime = exitTime + (Math.floor(Math.random() * 2) + 1) * 24 * 60 * 60 * 1000;
      }
      
      await Trade.bulkCreate(mockTrades);
      console.log("[DB] Successfully seeded 312 mock trades into the Trade table.");
    }
    
    // Fetch all trades from DB
    const dbTrades = await Trade.findAll({ order: [['entryTime', 'ASC']] });
    
    // Map them to plain JS objects for calculation
    return dbTrades.map(t => t.get({ plain: true }));
  } catch (err) {
    console.error("[DB] Error fetching trades:", err);
    return [];
  }
};

module.exports = {
  calculateBacktestMetrics,
  getTradesFromDB
};

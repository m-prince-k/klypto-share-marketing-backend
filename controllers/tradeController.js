const { Trade } = require('../models');

// CREATE a new manual trade
const createTrade = async (req, res) => {
  try {
    const { symbol, direction, entryTime, exitTime, entryPrice, exitPrice, status, reason } = req.body;

    if (!symbol || !direction || !entryPrice) {
      return res.status(400).json({ success: false, message: 'symbol, direction, and entryPrice are required' });
    }

    let pnlValue = 0;
    let pnlPercentage = 0;

    // Calculate PnL if trade is already closed
    if (exitPrice && entryPrice) {
      const shares = 100; // Mock fixed shares for now
      if (direction === 'Long') {
        pnlValue = (exitPrice - entryPrice) * shares;
        pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;
      } else {
        pnlValue = (entryPrice - exitPrice) * shares;
        pnlPercentage = ((entryPrice - exitPrice) / entryPrice) * 100;
      }
    }

    const trade = await Trade.create({
      symbol,
      direction,
      entryTime: entryTime ? new Date(entryTime) : new Date(),
      exitTime: exitTime ? new Date(exitTime) : null,
      entryPrice,
      exitPrice: exitPrice || null,
      pnlValue,
      pnlPercentage,
      status: status || (exitPrice ? 'CLOSED' : 'OPEN'),
      reason: reason || 'Manual Entry'
    });

    return await res.status(201).json({ success: true, message: 'Trade created successfully', data: trade });
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

// UPDATE an existing trade (e.g., closing an OPEN trade)
const updateTrade = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const trade = await Trade.findByPk(id);
    if (!trade) {
      return res.status(404).json({ success: false, message: 'Trade not found' });
    }

    // If we are closing the trade by providing an exitPrice
    if (updates.exitPrice && !trade.exitPrice) {
      const entryPrice = trade.entryPrice;
      const exitPrice = updates.exitPrice;
      const direction = trade.direction;
      const shares = 100; // Mock fixed shares for now

      if (direction === 'Long') {
        updates.pnlValue = (exitPrice - entryPrice) * shares;
        updates.pnlPercentage = ((exitPrice - entryPrice) / entryPrice) * 100;
      } else {
        updates.pnlValue = (entryPrice - exitPrice) * shares;
        updates.pnlPercentage = ((entryPrice - exitPrice) / entryPrice) * 100;
      }
      
      updates.status = 'CLOSED';
      if (!updates.exitTime) {
        updates.exitTime = new Date();
      }
    }

    await trade.update(updates);

    res.status(200).json({ success: true, message: 'Trade updated successfully', data: trade });
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

// GET all trades
const getTrades = async (req, res) => {
  try {
    const trades = await Trade.findAll({ order: [['entryTime', 'DESC']] });
    res.status(200).json({ success: true, data: trades });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

module.exports = {
  createTrade,
  updateTrade,
  getTrades
};

const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');

// GET all trades
// GET /api/trades
router.get('/', tradeController.getTrades);

// POST create a new manual trade
// POST /api/trades
// Body: { symbol, direction, entryPrice, entryTime, exitPrice?, exitTime?, status?, reason? }
router.post('/', tradeController.createTrade);

// PUT update/close an existing trade
// PUT /api/trades/:id
// Body: { exitPrice, exitTime? } to close, or any fields to update
router.put('/:id', tradeController.updateTrade);

module.exports = router;

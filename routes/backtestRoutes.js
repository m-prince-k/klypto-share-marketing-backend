const express = require('express');
const router = express.Router();
const backtestController = require('../controllers/backtestController');

// GET request to fetch dashboard data with mock trades
router.get('/dashboard', backtestController.getBacktestDashboardData);

// POST request if user wants to send their own trades or capital settings in the future
router.post('/dashboard', backtestController.getBacktestDashboardData);

// GET request for live trading engine trade signal
router.get('/engine-signal', backtestController.getEngineTradeSignal);

module.exports = router;

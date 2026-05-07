const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alertController');

router.post('/', alertController.createAlert);
router.get('/', alertController.getAlerts);
router.delete('/:id', alertController.deleteAlert);
router.patch('/:id/toggle', alertController.toggleAlert);

// TEST TRIGGER ROUTE
router.get('/test-trigger', (req, res) => {
    const alertService = require('../services/alertService');
    const io = require('../services/socket').getIO();
    
    const testData = {
        symbol: 'RELIANCE',
        token: '2885',
        exchange: 'NSE',
        indicator: 'RSI',
        value: 50,
        operator: '>',
        triggeredValue: 55.4,
        timestamp: Date.now()
    };
    
    if (io) {
        io.emit('ALERT_TRIGGERED', testData);
        res.send("Test Alert Sent to Dashboard! Check your watchlist.");
    } else {
        res.status(500).send("Socket not initialized");
    }
});

module.exports = router;

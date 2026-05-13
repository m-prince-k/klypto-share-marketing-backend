const express = require('express');
const router = express.Router();
const { calculateSSLHybrid } = require('../Indicators/ssl-hybrid');

// POST /api/indicator/ssl-hybrid
// Calculates SSL Hybrid indicator on provided candles
router.post('/ssl-hybrid', async (req, res) => {
    try {
        const { candles, options } = req.body;
        
        if (!candles || !Array.isArray(candles)) {
            return res.status(400).json({ success: false, error: "Candles array is required" });
        }

        const result = await calculateSSLHybrid(candles, options);
        res.json(result);
    } catch (err) {
        console.error("[IndicatorRoute] SSL Hybrid Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

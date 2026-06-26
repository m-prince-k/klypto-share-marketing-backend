const express = require('express');
const router = express.Router();
const { getMarkers, forwardToPredict, evaluatePythonStrategy, getScannerDashboard, runDynamicScanner } = require('../controllers/strategyController');

/**
 * GET /api/strategy/markers
 */
router.get('/markers', getMarkers);

// GET /api/strategy/internal-sync
const { generateInternalBoslimCache } = require('../controllers/strategyController');
router.get('/internal-sync', generateInternalBoslimCache);

// POST /api/strategy/predict
router.all('/predict', forwardToPredict);

// POST /api/strategy/evaluate-python
router.post('/evaluate-python', evaluatePythonStrategy);

const authMiddleware = require('../middleware/authMiddleware');

// GET /api/strategy/scanner-dashboard
router.get('/scanner-dashboard', authMiddleware, getScannerDashboard);

// POST /api/strategy/run-scanner
router.post('/run-scanner', authMiddleware, runDynamicScanner);


// ---------------------------------------------------------
// Internal Webhooks — called by Python scanner to push
// progress/signals back to frontend via Socket.io
// NO auth needed (internal only, called from localhost)
// ---------------------------------------------------------
router.post('/internal/scanner-progress', (req, res) => {
    try {
        const io = require('../services/socket').getIO();
        const EVENTS = require('../constants/socketEvents');
        const { userId, processed, total, current_stock } = req.body;
        if (io && userId) {
            io.to(userId).emit(EVENTS.SCANNER_PROGRESS, { processed, total, current_stock });
        }
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

router.post('/internal/scanner-signal', (req, res) => {
    try {
        const io = require('../services/socket').getIO();
        const EVENTS = require('../constants/socketEvents');
        const { userId, symbol, signalData } = req.body;
        if (io && userId) {
            io.to(userId).emit(EVENTS.NEW_SCANNER_SIGNAL, { symbol, ...signalData });
        }
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

router.post('/internal/scanner-error', (req, res) => {
    try {
        const io = require('../services/socket').getIO();
        const EVENTS = require('../constants/socketEvents');
        const { userId, symbol, error } = req.body;
        if (io && userId) {
            io.to(userId).emit(EVENTS.SCANNER_ERROR, { symbol, error });
        }
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});

router.post('/internal/scanner-complete', (req, res) => {
    try {
        const io = require('../services/socket').getIO();
        const EVENTS = require('../constants/socketEvents');
        const { userId, success, message } = req.body;
        if (io && userId) {
            io.to(userId).emit(EVENTS.SCANNER_COMPLETE, { success, message });
        }
        console.log(`[Scanner] Python scan complete for ${userId}: ${message}`);
        res.json({ ok: true });
    } catch (e) { res.json({ ok: false }); }
});


module.exports = router;




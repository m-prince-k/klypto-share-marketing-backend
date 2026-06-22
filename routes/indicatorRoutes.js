const express = require('express');
const router = express.Router();
const { calculateSSLHybrid } = require('../Indicators/ssl-hybrid');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

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

// GET /api/indicator/historical-boslim
// Reads all files in historical_csv, calculates BOSLIM in Python, and returns the data
router.get('/historical-boslim', async (req, res) => {
    try {
        const historicalDir = path.join(__dirname, '../historical_csv');
        if (!fs.existsSync(historicalDir)) {
            return res.status(404).json({ success: false, message: "historical_csv directory not found" });
        }

        console.log(`[Historical Boslim] Spawning Python to process directory: ${historicalDir}`);

        const { spawn } = require('child_process');
        const pyScriptPath = path.join(__dirname, '../../klypto-python-strategy/boslim_indicators.py');
        const pythonProcess = spawn('python', [pyScriptPath, '--dir', historicalDir]);

        res.setHeader('Content-Type', 'application/json');
        res.write('{"success":true,"data":');

        let errorData = '';

        pythonProcess.stdout.on('data', (data) => {
            res.write(data);
        });

        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
        });

        pythonProcess.on('error', (err) => {
            console.error("[IndicatorRoute] Python spawn error:", err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: "Failed to start python script" });
            } else {
                res.end(`],"error":"Failed to start python script"}`);
            }
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error("[IndicatorRoute] Python script exited with code", code);
                console.error(errorData);
                res.end(`],"error":"Python script failed: ${errorData.replace(/"/g, "'").replace(/\n/g, ' ')}"}`);
            } else {
                res.write(`,"totalRowsProcessed":"Done"}`);
                res.end();
                console.log(`[Historical Boslim] Streaming complete.`);
            }
        });

    } catch (err) {
        console.error("[IndicatorRoute] Historical Boslim Error:", err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.end(`],"error":"${err.message}"}`);
        }
    }
});

module.exports = router;

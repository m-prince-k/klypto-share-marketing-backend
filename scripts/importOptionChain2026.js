const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { OptionChainData, sequelize } = require('../models');

const BASE_DIR = path.join(__dirname, '../vikas');
const PROGRESS_FILE = path.join(__dirname, '../data/import_progress.json');
const MISSING_FILE = path.join(__dirname, '../data/missing_stocks.json');
const BATCH_SIZE = 1000;

// Initialize or load progress
let progress = { completed_files: [], in_progress: null };
if (fs.existsSync(PROGRESS_FILE)) {
    try {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to parse progress file. Starting fresh.");
    }
}

// Initialize missing stocks
let missingStocks = [];
if (fs.existsSync(MISSING_FILE)) {
    try {
        missingStocks = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
    } catch (e) {}
}

function saveProgress() {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function logMissingStock(stockName, reason, file) {
    missingStocks.push({ stockName, reason, file, timestamp: new Date().toISOString() });
    fs.writeFileSync(MISSING_FILE, JSON.stringify(missingStocks, null, 2));
}

async function processFile(filePath, stockName) {
    return new Promise((resolve, reject) => {
        const relativePath = path.relative(BASE_DIR, filePath);
        
        if (progress.completed_files.includes(relativePath)) {
            console.log(`⏩ [SKIPPING] Already completed: ${relativePath}`);
            return resolve();
        }

        let skipRows = 0;
        if (progress.in_progress && progress.in_progress.file === relativePath) {
            skipRows = progress.in_progress.last_row;
            console.log(`▶️ [RESUMING] Stock: ${stockName} | File: ${path.basename(filePath)} | Resuming from row ${skipRows}`);
        } else {
            console.log(`▶️ [STARTING] Stock: ${stockName} | File: ${path.basename(filePath)}`);
            progress.in_progress = { file: relativePath, last_row: 0 };
            saveProgress();
        }

        let batch = [];
        let rowCount = 0;
        let insertedCount = skipRows;

        const stream = fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', async (row) => {
                rowCount++;

                if (rowCount <= skipRows) {
                    return; // Skip already inserted rows
                }

                // Map row to OptionChainData fields
                const record = {
                    excel_row_number: parseInt(row.row_number) || null,
                    relative_path: relativePath,
                    sheet_name: path.basename(filePath),
                    stock_name: stockName,
                    
                    // Direct mapping
                    timestamp_epoch: row.timestamp_epoch ? parseInt(row.timestamp_epoch) : null,
                    timestamp_ist: row.timestamp_ist ? new Date(row.timestamp_ist) : null,
                    date_ist: row.date_ist,
                    time_ist: row.time_ist,
                    iv: row.iv ? parseFloat(row.iv) : null,
                    oi: row.oi ? parseInt(row.oi) : null,
                    strike: row.strike ? parseFloat(row.strike) : null,
                    spot: row.spot ? parseFloat(row.spot) : null,
                    open: row.open ? parseFloat(row.open) : null,
                    high: row.high ? parseFloat(row.high) : null,
                    low: row.low ? parseFloat(row.low) : null,
                    close: row.close ? parseFloat(row.close) : null,
                    volume: row.volume ? parseInt(row.volume) : null,
                    option_type: row.option_type,
                    market_price: row.market_price ? parseFloat(row.market_price) : null,
                    iv_raw: row.iv_raw ? parseFloat(row.iv_raw) : null,
                    iv_used_decimal: row.iv_used_decimal ? parseFloat(row.iv_used_decimal) : null,
                    iv_source: row.iv_source,
                    underlying_spot: row.underlying_spot ? parseFloat(row.underlying_spot) : null,
                    underlying_spot_source: row.underlying_spot_source,
                    expiry_date: row.expiry_date,
                    expiry_datetime_ist: row.expiry_datetime_ist ? new Date(row.expiry_datetime_ist) : null,
                    expiry_source: row.expiry_source,
                    risk_free_rate: row.risk_free_rate ? parseFloat(row.risk_free_rate) : null,
                    time_to_expiry_years: row.time_to_expiry_years ? parseFloat(row.time_to_expiry_years) : null,
                    bs_theoretical_price: row.bs_theoretical_price ? parseFloat(row.bs_theoretical_price) : null,
                    delta: row.delta ? parseFloat(row.delta) : null,
                    gamma: row.gamma ? parseFloat(row.gamma) : null,
                    theta: row.theta ? parseFloat(row.theta) : null,
                    vega: row.vega ? parseFloat(row.vega) : null,
                    rho: row.rho ? parseFloat(row.rho) : null,
                    calc_status: row.calc_status,
                    calc_note: row.calc_note,
                    side: row.side,
                    response_leg: row.response_leg,
                    request_strike_selector: row.request_strike_selector,
                    request_option_type: row.request_option_type,
                    request_to_date: row.request_to_date,
                    request_from_date: row.request_from_date,
                    ingested_at: new Date()
                };

                batch.push(record);

                if (batch.length >= BATCH_SIZE) {
                    stream.pause();
                    const currentBatch = [...batch];
                    batch = [];
                    try {
                        await OptionChainData.bulkCreate(currentBatch, { logging: false, ignoreDuplicates: true });
                        insertedCount += currentBatch.length;
                        progress.in_progress.last_row = insertedCount;
                        saveProgress();
                        stream.resume();
                    } catch (error) {
                        console.error(`❌ [ERROR] Batch insert failed for ${relativePath}:`, error.message);
                        logMissingStock(stockName, `Batch insert error: ${error.message}`, relativePath);
                        stream.destroy(error);
                    }
                }
            })
            .on('end', async () => {
                if (batch.length > 0) {
                    try {
                        await OptionChainData.bulkCreate(batch, { logging: false, ignoreDuplicates: true });
                        insertedCount += batch.length;
                        progress.in_progress.last_row = insertedCount;
                        saveProgress();
                    } catch (error) {
                        console.error(`❌ [ERROR] Final batch insert failed for ${relativePath}:`, error.message);
                        logMissingStock(stockName, `Final batch insert error: ${error.message}`, relativePath);
                        return reject(error);
                    }
                }
                
                console.log(`✅ [COMPLETED] Stock: ${stockName} | File: ${path.basename(filePath)} | Total Rows: ${insertedCount}`);
                progress.completed_files.push(relativePath);
                progress.in_progress = null;
                saveProgress();
                resolve();
            })
            .on('error', (err) => {
                console.error(`❌ [ERROR] Reading file ${relativePath}:`, err.message);
                logMissingStock(stockName, `File read error: ${err.message}`, relativePath);
                reject(err);
            });
    });
}

async function run() {
    console.log("🚀 Starting Option Chain Data Import (2026)");
    
    try {
        await sequelize.authenticate();
        console.log("Database connected successfully.\n");
    } catch (error) {
        console.error("Unable to connect to the database:", error);
        process.exit(1);
    }

    if (!fs.existsSync(BASE_DIR)) {
        console.error(`Directory not found: ${BASE_DIR}`);
        process.exit(1);
    }

    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    const folders = fs.readdirSync(BASE_DIR).filter(f => {
        const fullPath = path.join(BASE_DIR, f);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const folder of folders) {
        const stockName = folder.replace(/_\d+$/, '');
        const folderPath = path.join(BASE_DIR, folder);
        
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.csv') && !f.includes('monthly summary'));

        if (files.length === 0) {
            console.log(`⚠️  [MISSING] No CSV files found for Stock: ${stockName}`);
            logMissingStock(stockName, "No CSV files found in folder", folder);
            continue;
        }

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            try {
                await processFile(filePath, stockName);
            } catch (err) {
                console.error(`⏭️ Skipping file due to error: ${filePath}`);
            }
        }
    }

    console.log("\n🎉 All files processed successfully!");
    process.exit(0);
}

run();

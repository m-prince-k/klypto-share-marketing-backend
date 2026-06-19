const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../models');
const OptionChainData = db.OptionChainData;

const withTimeout = (promise, ms, message = "Operation timed out") => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([
        promise.then(result => {
            clearTimeout(timeoutId);
            return result;
        }).catch(err => {
            clearTimeout(timeoutId);
            throw err;
        }),
        timeoutPromise
    ]);
};

const stockNameMapping = {
    'ITC': 'ITC LIMITED',
    'ABB': 'ABB INDIA LIMITED',
    'NTPC': 'NTPC LIMITED',
    'NUVAMA': 'NUVAMA WEALTH MANAGEMENT LIMITED',
    'OBEROIRLTY': 'OBEROI REALTY LIMITED',
    'OFSS': 'ORACLE FINANCIAL SERVICES SOFTWARE LIMITED',
    'OIL': 'OIL INDIA LIMITED',
    'ONGC': 'OIL AND NATURAL GAS CORPORATION LIMITED',
    'PAGEIND': 'PAGE INDUSTRIES LIMITED',
    'PAYTM': 'ONE 97 COMMUNICATIONS LIMITED',
    'PERSISTENT': 'PERSISTENT SYSTEMS LIMITED',
    'PETRONET': 'PETRONET LNG LIMITED'
};

async function ingestSingleStockFolder(folderPath, summary, forceReingest) {
    if (!fs.existsSync(folderPath)) return;

    const folderName = path.basename(folderPath);
    let symbol = folderName;
    if (folderName.includes('_')) {
        symbol = folderName.split('_')[0];
    }

    const fullStockName = stockNameMapping[symbol] || symbol;
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));

    for (const file of files) {
        const filePath = path.join(folderPath, file);

        try {
            console.log(`\n[Ingestion] --- Processing Stock: ${fullStockName} | File: ${file} ---`);

            const existingCount = await withTimeout(OptionChainData.count({ where: { import_file: file, symbol: symbol } }), 120000, "Count query timed out");
            if (existingCount > 0) {
                if (!forceReingest) {
                    console.log(`[Ingestion] File ${file} already ingested (${existingCount} rows). Skipping to save time.`);
                    summary.filesSkipped++;
                    continue;
                } else {
                    console.log(`[Ingestion] Force re-ingesting ${file}. Deleting ${existingCount} existing records...`);
                    await withTimeout(OptionChainData.destroy({ where: { import_file: file, symbol: symbol } }), 180000, "Destroy query timed out");
                }
            }

            console.log(`[Ingestion] Reading and mapping data for ${file}...`);
            // Parse Excel
            const workbook = xlsx.readFile(filePath);
            let rawData = [];
            const targetSheets = ['rows_call', 'rows_put'];

            targetSheets.forEach(sheetName => {
                if (workbook.Sheets[sheetName]) {
                    let sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    const injectedSide = sheetName === 'rows_call' ? 'CE' : 'PE';
                    sheetData = sheetData.map(row => ({
                        ...row,
                        _option_side: injectedSide,
                        option_side: injectedSide
                    }));
                    rawData = rawData.concat(sheetData);
                }
            });

            if (rawData.length === 0) {
                console.log(`[Ingestion] No target data found in ${file}. Skipping.`);
                summary.filesSkipped++;
                continue;
            }

            // Map data
            const mappedData = rawData.map(row => {
                return {
                    excel_row_number: row.excel_row_number || null,
                    relative_path: row.relative_path || null,
                    sheet_name: row.sheet_name || null,
                    breeze_code: symbol,
                    file_fingerprint: row._file_fingerprint || row.file_fingerprint || null,
                    import_file: file,
                    ingested_at: new Date(),
                    mapped_security_id: String(row._mapped_security_id || row.mapped_security_id || ''),
                    mapping_sheet: row._mapping_sheet || row.mapping_sheet || null,
                    nse_code: symbol,
                    option_side: row._option_side || row.option_side || null,
                    row_num: row._row || row.row || null,
                    search_text: row._search_text || row.search_text || null,
                    security_id: String(row._security_id || row.security_id || ''),
                    sheet: row._sheet || row.sheet || null,
                    stock_name: fullStockName,
                    symbol: symbol,
                    bs_theoretical_price: row.bs_theoretical_price || null,
                    calc_note: row.calc_note || null,
                    calc_status: row.calc_status || null,
                    close: row.close || null,
                    date_ist: row.date_ist || null,
                    delta: row.delta || null,
                    expiry_date: row.expiry_date || row._expiry_date || null,
                    expiry_datetime_ist: row.expiry_datetime_ist ? new Date(row.expiry_datetime_ist.$date || row.expiry_datetime_ist) : null,
                    expiry_source: row.expiry_source || null,
                    gamma: row.gamma || null,
                    high: row.high || null,
                    iv: row.iv || null,
                    iv_raw: row.iv_raw || null,
                    iv_source: row.iv_source || null,
                    iv_used_decimal: row.iv_used_decimal || null,
                    low: row.low || null,
                    market_price: row.market_price || null,
                    oi: row.oi || null,
                    open: row.open || null,
                    request_option_type: row.request_option_type || null,
                    request_strike_selector: row.request_strike_selector || null,
                    response_leg: row.response_leg || null,
                    rho: row.rho || null,
                    risk_free_rate: row.risk_free_rate || null,
                    row_number: row.row_number || null,
                    side: row.side || null,
                    spot: row.spot || null,
                    strike: row.strike || null,
                    theta: row.theta || null,
                    time_ist: row.time_ist || null,
                    time_to_expiry_years: row.time_to_expiry_years || null,
                    timestamp_epoch: row.timestamp_epoch || row._timestamp_epoch || null,
                    timestamp_ist: row.timestamp_ist ? new Date(row.timestamp_ist.$date || row.timestamp_ist) : (row._timestamp_ist ? new Date(row._timestamp_ist.$date || row._timestamp_ist) : null),
                    underlying_spot: row.underlying_spot || null,
                    underlying_spot_source: row.underlying_spot_source || null,
                    vega: row.vega || null,
                    volume: row.volume || null
                };
            });

            // Insert data
            const BATCH_SIZE = 1000; // Reduced to 1000 for lightning-fast inserts without locking the DB
            for (let i = 0; i < mappedData.length; i += BATCH_SIZE) {
                const chunk = mappedData.slice(i, i + BATCH_SIZE);
                console.log(`[Ingestion] Inserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(mappedData.length / BATCH_SIZE)} (${chunk.length} rows) for ${file}`);

                try {
                    // Removed explicit transaction to prevent Database Deadlocks and Table Locks
                    await withTimeout(OptionChainData.bulkCreate(chunk, {
                        logging: false,
                        hooks: false,
                        validate: false,
                        returning: false // Extremely important: Prevents DB from sending back rows
                    }), 300000, "bulkCreate timed out"); // Increased to 5 minutes
                } catch (error) {
                    console.error(`[Ingestion] Error inserting batch for ${file}:`, error.message);

                    // Log failure for recovery
                    const logMsg = `[${new Date().toISOString()}] FAILED BATCH | Stock: ${symbol} | File: ${file} | Batch: ${i / BATCH_SIZE + 1} | Error: ${error.message}\n`;
                    fs.appendFileSync(path.join(__dirname, '../failed_ingestion.log'), logMsg);

                    throw new Error(`Batch insertion failed for ${file}`);
                }
            }

            console.log(`[Ingestion] Successfully finished ${file}\n`);
            summary.filesProcessed++;
            summary.newRowsInserted += mappedData.length;

        } catch (fileError) {
            console.error(`Failed to process file ${file}:`, fileError);

            // Maintain a record of the completely failed file
            try {
                const errorMsg = `[${new Date().toISOString()}] FAILED FILE | Stock: ${symbol} | File: ${file} | Error: ${fileError.message || 'Unknown'}\n`;
                fs.appendFileSync(path.join(__dirname, '../failed_ingestion.log'), errorMsg);
            } catch (logErr) {
                console.error("Failed to write to failed_ingestion.log", logErr);
            }
        }
    }
}

async function processTargetFolder(targetFolder, forceReingest = false) {
    if (!fs.existsSync(targetFolder)) {
        throw new Error(`Folder not found: ${targetFolder}`);
    }

    // --- AUTO RECOVERY LOGIC ---
    const logFilePath = path.join(__dirname, '../failed_ingestion.log');
    if (fs.existsSync(logFilePath)) {
        try {
            console.log("\n[AUTO-RECOVERY] Found failed_ingestion.log! Automatically cleaning up failed files for re-ingestion...");
            const logContent = fs.readFileSync(logFilePath, 'utf8');
            const lines = logContent.split('\n');
            const failedItems = new Set();

            lines.forEach(line => {
                const stockMatch = line.match(/Stock:\s*([^|]+)/);
                const fileMatch = line.match(/File:\s*([^|]+)/);
                if (stockMatch && fileMatch) {
                    failedItems.add(JSON.stringify({ symbol: stockMatch[1].trim(), file: fileMatch[1].trim() }));
                }
            });

            for (const itemStr of failedItems) {
                const item = JSON.parse(itemStr);
                console.log(`[AUTO-RECOVERY] Deleting corrupted records for Stock: ${item.symbol}, File: ${item.file}`);
                await db.OptionChainData.destroy({ where: { import_file: item.file, symbol: item.symbol } });
            }

            // User ne mana kiya hai file delete karne ke liye, isliye hum isko delete nahi kar rahe
            // fs.unlinkSync(logFilePath);
            console.log("[AUTO-RECOVERY] Cleanup complete! Failed files will now be re-ingested automatically.\n");
        } catch (err) {
            console.error("[AUTO-RECOVERY ERROR] Failed to clean up from log:", err);
        }
    }
    // ---------------------------

    const summary = {
        foldersScanned: 0,
        filesSkipped: 0,
        filesProcessed: 0,
        newRowsInserted: 0
    };

    const items = fs.readdirSync(targetFolder);
    const hasExcelFiles = items.some(item => item.endsWith('.xlsx') || item.endsWith('.csv'));

    if (hasExcelFiles) {
        summary.foldersScanned = 1;
        await ingestSingleStockFolder(targetFolder, summary, forceReingest);
    } else {
        const subDirs = items.filter(item => {
            return fs.statSync(path.join(targetFolder, item)).isDirectory();
        });

        summary.foldersScanned = subDirs.length;

        for (const dir of subDirs) {
            await ingestSingleStockFolder(path.join(targetFolder, dir), summary, forceReingest);
        }
    }

    return summary;
}

module.exports = {
    processTargetFolder
};

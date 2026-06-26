const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const db = require('../models'); 
const OptionChainData = db.OptionChainData; 

// Mapping logic for full stock name
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

async function ingestSingleStockFolder(folderPath) {
    if (!fs.existsSync(folderPath)) {
        console.error(`Folder not found: ${folderPath}`);
        return;
    }

    // Extract symbol from folder name (e.g. "ITC_1660" -> "ITC")
    const folderName = path.basename(folderPath);
    let symbol = folderName;
    if (folderName.includes('_')) {
        symbol = folderName.split('_')[0];
    }
    
    const fullStockName = stockNameMapping[symbol] || symbol;

    console.log(`\n--- Starting processing for Stock: ${symbol} ---`);
    console.log(`Full Stock Name: ${fullStockName}`);
    console.log(`Folder Path: ${folderPath}`);

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
    console.log(`Found ${files.length} valid files in ${folderPath}`);

    for (const file of files) {
        const filePath = path.join(folderPath, file);
        console.log(`Processing file: ${file}`);

        try {
            // Layer 1: File-Level Deduplication
            const existingRowsCount = await OptionChainData.count({
                where: { import_file: file }
            });

            // Parse Excel
            console.log(`Reading file: ${file}... This might take a moment.`);
            const workbook = xlsx.readFile(filePath);
            
            let rawData = [];
            const targetSheets = ['rows_call', 'rows_put'];
            
            targetSheets.forEach(sheetName => {
                if (workbook.Sheets[sheetName]) {
                    let sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    // CRITICAL FIX: Explicitly mark CE or PE based on the sheet name
                    const injectedSide = sheetName === 'rows_call' ? 'CE' : 'PE';
                    sheetData = sheetData.map(row => ({
                        ...row,
                        _option_side: injectedSide, // Inject strictly so mapping catches it
                        option_side: injectedSide
                    }));
                    
                    console.log(`Found ${sheetData.length} rows in sheet '${sheetName}' (Marked as ${injectedSide})`);
                    rawData = rawData.concat(sheetData);
                } else {
                    console.log(`Sheet '${sheetName}' not found in ${file}`);
                }
            });

            console.log(`Total: Found ${rawData.length} rows combined in ${file}`);

            if (rawData.length === 0) {
                console.log(`Skipping ${file} as no data was found in target sheets.`);
                continue;
            }

            // Prepare mapped data
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

            if (existingRowsCount >= mappedData.length) {
                console.log(`[${symbol}] Skipping ${file} (Already fully ingested: ${existingRowsCount}/${mappedData.length} rows)`);
                continue;
            } else if (existingRowsCount > 0) {
                console.log(`[${symbol}] Resuming ${file} from row ${existingRowsCount} (Found ${existingRowsCount}/${mappedData.length} rows in DB)`);
            }

            // Batch insertion
            const BATCH_SIZE = 5000;
            // Start loop from existingRowsCount to resume where it left off
            for (let i = existingRowsCount; i < mappedData.length; i += BATCH_SIZE) {
                const chunk = mappedData.slice(i, i + BATCH_SIZE);
                console.log(`[${symbol}] Inserting batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(mappedData.length/BATCH_SIZE)} (${chunk.length} rows) for ${file}`);
                
                try {
                    // Layer 2: Row-level deduplication via ignoreDuplicates (SUPER FAST)
                    // We removed the transaction and updateOnDuplicate to speed this up massively.
                    await OptionChainData.bulkCreate(chunk, { 
                        logging: false, // EXTREMELY IMPORTANT: Prevents terminal from freezing with massive SQL logs
                        ignoreDuplicates: true, // Just ignores existing rows without trying to update them
                        validate: false // Bypasses Sequelize JS-level validations for maximum speed
                    });
                } catch (error) {
                    console.error(`[${symbol}] Error inserting batch for ${file}: ${error.message}`);
                    fs.appendFileSync('ingestion_errors.log', `[${new Date().toISOString()}] Error in ${file} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}\n`);
                }
            }

            console.log(`Successfully finished ${file}`);
        } catch (fileError) {
            console.error(`Failed to process file ${file}:`, fileError);
            fs.appendFileSync('ingestion_errors.log', `[${new Date().toISOString()}] File failed completely ${file}: ${fileError.message}\n`);
        }
    }

    console.log(`--- Completed processing for Stock: ${symbol} ---`);
}

async function processTargetFolder(targetFolder) {
    if (!fs.existsSync(targetFolder)) {
        console.error(`Folder not found: ${targetFolder}`);
        process.exit(1);
    }

    const items = fs.readdirSync(targetFolder);
    const hasExcelFiles = items.some(item => item.endsWith('.xlsx') || item.endsWith('.csv'));

    if (hasExcelFiles) {
        // It's a single stock folder (like ITC_1660)
        await ingestSingleStockFolder(targetFolder);
    } else {
        // It's a parent folder containing multiple stock folders (like vikas)
        const subDirs = items.filter(item => {
            const itemPath = path.join(targetFolder, item);
            return fs.statSync(itemPath).isDirectory();
        });

        console.log(`Detected Parent Folder. Found ${subDirs.length} subdirectories.`);

        for (const dir of subDirs) {
            const dirPath = path.join(targetFolder, dir);
            await ingestSingleStockFolder(dirPath);
        }
    }
}

// Ensure the db connects properly before starting
const targetFolder = process.argv[2];

if (!targetFolder) {
    console.error('Please provide a folder path. Usage: node scripts/ingest_option_chain.js <path_to_folder>');
    process.exit(1);
}

let startTime;

db.sequelize.authenticate().then(() => {
    console.log('Database connected successfully.');
    startTime = Date.now();
    return processTargetFolder(targetFolder);
}).then(() => {
    const totalTimeMs = Date.now() - startTime;
    const totalSeconds = (totalTimeMs / 1000).toFixed(2);
    const totalMinutes = (totalSeconds / 60).toFixed(2);
    console.log(`\n=============================================`);
    console.log(`All Ingestion processes completed successfully.`);
    console.log(`Total Execution Time: ${totalMinutes} minutes (${totalSeconds} seconds)`);
    console.log(`=============================================\n`);
    process.exit(0);
}).catch(err => {
    console.error('Fatal error connecting to database or during processing:', err);
    process.exit(1);
});

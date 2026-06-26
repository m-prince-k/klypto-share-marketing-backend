const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('../models');
const OptionChainData = db.OptionChainData;

// Configuration
const CSV_FILE_PATH = path.join(__dirname, '../option_chain_data.csv');
const BATCH_SIZE = 5000; // Adjust based on your memory and DB performance

async function ingestHugeCSV() {
    console.log(`Starting ingestion for huge CSV: ${CSV_FILE_PATH}`);

    if (!fs.existsSync(CSV_FILE_PATH)) {
        console.error(`Error: File not found at ${CSV_FILE_PATH}`);
        process.exit(1);
    }

    try {
        await db.sequelize.authenticate();
        console.log('✅ Database connected successfully.');
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }

    const totalSizeBytes = fs.statSync(CSV_FILE_PATH).size;
    const STATE_FILE = path.join(__dirname, 'ingest_state.json');

    let targetRowsToSkip = 0;
    if (fs.existsSync(STATE_FILE)) {
        try {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            targetRowsToSkip = state.totalInserted || 0;
            if (targetRowsToSkip > 0) {
                console.log(`🔄 Found saved state! Fast-forwarding and skipping the first ${targetRowsToSkip} rows without hitting the DB...`);
            }
        } catch (e) {
            console.error("Could not read state file, starting from 0");
        }
    }

    let batch = [];
    let totalInserted = targetRowsToSkip; // Start counting from where we left off
    let rowsSkippedCount = 0;
    let isProcessingBatch = false;

    const headersList = [
        'id', 'excel_row_number', 'relative_path', 'sheet_name', 'breeze_code',
        'file_fingerprint', 'import_file', 'ingested_at', 'mapped_security_id',
        'mapping_sheet', 'nse_code', 'option_side', 'row_num', 'search_text',
        'security_id', 'sheet', 'stock_name', 'symbol', 'bs_theoretical_price',
        'calc_note', 'calc_status', 'close', 'date_ist', 'delta', 'expiry_date',
        'expiry_datetime_ist', 'expiry_source', 'gamma', 'high', 'iv', 'iv_raw',
        'iv_source', 'iv_used_decimal', 'low', 'market_price', 'oi', 'open',
        'request_option_type', 'request_strike_selector', 'response_leg', 'rho',
        'risk_free_rate', 'row_number', 'side', 'spot', 'strike', 'theta',
        'time_ist', 'time_to_expiry_years', 'timestamp_epoch', 'timestamp_ist',
        'underlying_spot', 'underlying_spot_source', 'vega', 'volume', 'createdAt', 'updatedAt'
    ];

    // Use a read stream to avoid Out of Memory (OOM) errors on 13GB file
    const readStream = fs.createReadStream(CSV_FILE_PATH)
        .pipe(csv({ headers: headersList }))
        .on('data', async (row) => {

            // --- SUPER FAST SKIP LOGIC ---
            // If we are resuming, purely skip the rows in Javascript without touching the DB
            // This is lightning fast compared to sending them to Postgres to be ignored!
            if (rowsSkippedCount < targetRowsToSkip) {
                rowsSkippedCount++;
                if (rowsSkippedCount % 500000 === 0) {
                    console.log(`⏭️ Fast-forwarded ${rowsSkippedCount} rows...`);
                }
                return;
            }

            // Map the CSV row to the OptionChainData model fields
            // The mapping assumes the CSV headers match the keys inside the row object
            const mappedRow = {
                excel_row_number: row.excel_row_number ? parseInt(row.excel_row_number) : null,
                relative_path: row.relative_path || null,
                sheet_name: row.sheet_name || null,
                breeze_code: row.breeze_code || row.symbol || null,
                file_fingerprint: row._file_fingerprint || row.file_fingerprint || null,
                import_file: 'option_chain_data.csv',
                ingested_at: new Date(),
                mapped_security_id: String(row._mapped_security_id || row.mapped_security_id || ''),
                mapping_sheet: row._mapping_sheet || row.mapping_sheet || null,
                nse_code: row.nse_code || row.symbol || null,
                option_side: row._option_side || row.option_side || null,
                row_num: row._row || row.row ? parseInt(row._row || row.row) : null,
                search_text: row._search_text || row.search_text || null,
                security_id: String(row._security_id || row.security_id || ''),
                sheet: row._sheet || row.sheet || null,
                stock_name: row.stock_name || null,
                symbol: row.symbol || null,
                bs_theoretical_price: row.bs_theoretical_price ? parseFloat(row.bs_theoretical_price) : null,
                calc_note: row.calc_note || null,
                calc_status: row.calc_status || null,
                close: row.close ? parseFloat(row.close) : null,
                date_ist: row.date_ist || null,
                delta: row.delta ? parseFloat(row.delta) : null,
                expiry_date: row.expiry_date || row._expiry_date || null,
                expiry_datetime_ist: row.expiry_datetime_ist ? new Date(row.expiry_datetime_ist) : null,
                expiry_source: row.expiry_source || null,
                gamma: row.gamma ? parseFloat(row.gamma) : null,
                high: row.high ? parseFloat(row.high) : null,
                iv: row.iv ? parseFloat(row.iv) : null,
                iv_raw: row.iv_raw ? parseFloat(row.iv_raw) : null,
                iv_source: row.iv_source || null,
                iv_used_decimal: row.iv_used_decimal ? parseFloat(row.iv_used_decimal) : null,
                low: row.low ? parseFloat(row.low) : null,
                market_price: row.market_price ? parseFloat(row.market_price) : null,
                oi: row.oi ? parseInt(row.oi) : null,
                open: row.open ? parseFloat(row.open) : null,
                request_option_type: row.request_option_type || null,
                request_strike_selector: row.request_strike_selector || null,
                response_leg: row.response_leg || null,
                rho: row.rho ? parseFloat(row.rho) : null,
                risk_free_rate: row.risk_free_rate ? parseFloat(row.risk_free_rate) : null,
                row_number: row.row_number ? parseInt(row.row_number) : null,
                side: row.side || null,
                spot: row.spot ? parseFloat(row.spot) : null,
                strike: row.strike ? parseFloat(row.strike) : null,
                theta: row.theta ? parseFloat(row.theta) : null,
                time_ist: row.time_ist || null,
                time_to_expiry_years: row.time_to_expiry_years ? parseFloat(row.time_to_expiry_years) : null,
                timestamp_epoch: row.timestamp_epoch || row._timestamp_epoch ? parseInt(row.timestamp_epoch || row._timestamp_epoch) : null,
                timestamp_ist: row.timestamp_ist ? new Date(row.timestamp_ist) : null,
                underlying_spot: row.underlying_spot ? parseFloat(row.underlying_spot) : null,
                underlying_spot_source: row.underlying_spot_source || null,
                vega: row.vega ? parseFloat(row.vega) : null,
                volume: row.volume ? parseInt(row.volume) : null
            };

            batch.push(mappedRow);

            if (batch.length >= BATCH_SIZE) {
                // Pause the read stream so memory doesn't blow up while we insert into the database
                readStream.pause();
                isProcessingBatch = true;

                const currentBatch = [...batch];
                batch = [];

                try {
                    await OptionChainData.bulkCreate(currentBatch, {
                        logging: false, // Critical to avoid freezing console with massive queries
                        ignoreDuplicates: true // Skips duplicate row errors based on unique constraints/indexes
                    });

                    totalInserted += currentBatch.length;

                    // --- SAVE STATE ---
                    // Save progress so we can resume here if script restarts!
                    fs.writeFileSync(STATE_FILE, JSON.stringify({ totalInserted: totalInserted }));

                    // Track progress percentage and GB remaining based on file size
                    const bytesRead = readStream.bytesRead || 0;
                    const progressPercent = totalSizeBytes > 0 ? ((bytesRead / totalSizeBytes) * 100).toFixed(2) : 0;
                    const remainingGB = totalSizeBytes > 0 ? ((totalSizeBytes - bytesRead) / (1024 * 1024 * 1024)).toFixed(2) : 0;

                    // Extract unique stock names from this batch for better logging
                    const uniqueSymbols = [...new Set(currentBatch.map(r => r.symbol || r.stock_name || r.nse_code || r.breeze_code).filter(Boolean))].join(', ');
                    const displaySymbols = uniqueSymbols.length > 50 ? uniqueSymbols.substring(0, 50) + '...' : (uniqueSymbols || 'Unknown/Blank');

                    console.log(`Inserted ${totalInserted} rows | Progress: ${progressPercent}% (${remainingGB}GB left) | Stocks: ${displaySymbols}`);

                    // Resume streaming the CSV once insertion completes
                    isProcessingBatch = false;
                    readStream.resume();
                } catch (error) {
                    console.error('Error inserting batch:', error.message);
                    // Decide if you want to stop or continue on batch failure. Let's resume for resilience:
                    isProcessingBatch = false;
                    readStream.resume();
                }
            }
        })
        .on('end', async () => {
            // Insert any remaining items in the last batch
            if (batch.length > 0) {
                try {
                    await OptionChainData.bulkCreate(batch, { logging: false, ignoreDuplicates: true });
                    totalInserted += batch.length;
                } catch (error) {
                    console.error('Error inserting final batch:', error.message);
                }
            }
            console.log(`✅ Ingestion Complete! Successfully inserted ${totalInserted} rows from the CSV.`);
            process.exit(0);
        })
        .on('error', (err) => {
            console.error('Error parsing CSV:', err);
        });
}

ingestHugeCSV();

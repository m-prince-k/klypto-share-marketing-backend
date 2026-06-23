const { Op } = require('sequelize');
const { OptionChainData, sequelize } = require('../models');
const { processTargetFolder } = require('../services/ingestionService');
const path = require('path');

// In-memory cache for unique symbols and expiries
let cachedSymbols = null;
let lastSymbolsCacheTime = 0;
const SYMBOLS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let cachedExpiries = {}; // Key: stockName (or 'all'), Value: { data, timestamp }
const EXPIRIES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper to clear caches on demand (e.g., after data ingestion)
function clearOptionChainCache() {
    cachedSymbols = null;
    lastSymbolsCacheTime = 0;
    cachedExpiries = {};
}

/**
 * Fetch main data table with filters, sorting, and pagination
 */
exports.getDataTable = async (req, res) => {
    try {
        // 1. Pagination
        const page = parseInt(req.query.page) || 1;
        const isFetchAll = req.query.limit === 'all';
        const limit = isFetchAll ? null : (parseInt(req.query.limit) || 25);
        const offset = isFetchAll ? null : (page - 1) * limit;

        // 2. Filters Setup
        const whereClause = {};

        // Stock Name (Symbol) Filter
        if (req.query.stockName && req.query.stockName !== 'All Stocks') {
            whereClause.symbol = req.query.stockName;
        }

        // Expiry Date Filter
        if (req.query.expiryDate && req.query.expiryDate !== 'All Expiries') {
            whereClause.expiry_date = req.query.expiryDate;
        }

        // Date Range Filter (Using timestamp_epoch which has valid Unix timestamps)
        if (req.query.fromDate || req.query.toDate) {
            whereClause.timestamp_epoch = {};
            if (req.query.fromDate) {
                const startEpoch = Math.floor(new Date(req.query.fromDate).getTime() / 1000);
                whereClause.timestamp_epoch[Op.gte] = startEpoch;
            }
            if (req.query.toDate) {
                const endDate = new Date(req.query.toDate);
                endDate.setHours(23, 59, 59, 999);
                const endEpoch = Math.floor(endDate.getTime() / 1000);
                whereClause.timestamp_epoch[Op.lte] = endEpoch;
            }
        }

        // 3. Sorting Setup
        let sortBy = req.query.sortBy || 'timestamp_epoch'; // Default sort by valid epoch
        if (sortBy === 'timestamp_ist') sortBy = 'timestamp_epoch'; // Redirect invalid column
        const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC'; // Default to DESC
        const orderClause = [[sortBy, sortOrder]];

        // 4. Query Database
        const queryOptions = {
            where: whereClause,
            order: orderClause,
            attributes: [
                'id', 'date_ist', 'symbol', 'expiry_date', 'strike', 'option_side',
                'request_option_type', 'response_leg', 'side',
                'open', 'high', 'low', 'close', 'volume', 'oi', 'iv', 'timestamp_ist'
            ]
        };

        if (!isFetchAll) {
            queryOptions.limit = limit;
            queryOptions.offset = offset;
        }

        const { count, rows } = await OptionChainData.findAndCountAll(queryOptions);

        // 5. Calculate Pagination Metadata
        const totalPages = isFetchAll ? 1 : Math.ceil(count / limit);

        // Map and normalize option_type (CE/PE)
        const formattedRows = rows.map(row => {
            const data = row.toJSON();
            let type = data.option_side || data.response_leg || data.side || data.request_option_type || 'Unknown';
            if (type.toUpperCase() === 'CALL') type = 'CE';
            if (type.toUpperCase() === 'PUT') type = 'PE';
            data.optionType = type.toUpperCase();

            // remove unnecessary columns to keep response light
            delete data.request_option_type;
            delete data.response_leg;
            delete data.side;
            
            return data;
        });

        // 6. Return Response
        return res.status(200).json({
            success: true,
            data: formattedRows,
            pagination: {
                totalRecords: count,
                totalPages: totalPages,
                currentPage: page,
                limit: limit
            }
        });

    } catch (error) {
        console.error('Error fetching Option Chain Data Table:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Fetch unique symbols for dropdown (optimized with recursive CTE and caching)
 */
exports.getUniqueSymbols = async (req, res) => {
    try {
        const now = Date.now();
        if (cachedSymbols && (now - lastSymbolsCacheTime < SYMBOLS_CACHE_DURATION)) {
            return res.status(200).json({ success: true, data: cachedSymbols });
        }

        // Fast index-skip scan emulation query for Postgres
        const query = `
            WITH RECURSIVE t AS (
                (SELECT symbol FROM option_chain_data ORDER BY symbol LIMIT 1)
                UNION ALL
                SELECT (SELECT symbol FROM option_chain_data WHERE symbol > t.symbol ORDER BY symbol LIMIT 1)
                FROM t
                WHERE t.symbol IS NOT NULL
            )
            SELECT symbol FROM t WHERE symbol IS NOT NULL;
        `;
        
        const [results] = await sequelize.query(query);
        const symbolList = results.map(s => s.symbol).filter(s => s != null);

        cachedSymbols = symbolList;
        lastSymbolsCacheTime = now;

        return res.status(200).json({ success: true, data: symbolList });
    } catch (error) {
        console.error('Error fetching unique symbols:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Fetch unique expiry dates for dropdown (optimized with recursive CTE and caching)
 */
exports.getUniqueExpiries = async (req, res) => {
    try {
        const stockName = (req.query.stockName && req.query.stockName !== 'All Stocks') ? req.query.stockName : 'all';
        const now = Date.now();

        if (cachedExpiries[stockName] && (now - cachedExpiries[stockName].timestamp < EXPIRIES_CACHE_DURATION)) {
            return res.status(200).json({ success: true, data: cachedExpiries[stockName].data });
        }

        let query;
        if (stockName !== 'all') {
            // Fast index-skip scan for specific stock using composite index
            query = `
                WITH RECURSIVE t AS (
                    (SELECT expiry_date FROM option_chain_data WHERE symbol = :stockName ORDER BY expiry_date LIMIT 1)
                    UNION ALL
                    SELECT (SELECT expiry_date FROM option_chain_data WHERE symbol = :stockName AND expiry_date > t.expiry_date ORDER BY expiry_date LIMIT 1)
                    FROM t
                    WHERE t.expiry_date IS NOT NULL
                )
                SELECT expiry_date FROM t WHERE expiry_date IS NOT NULL;
            `;
        } else {
            // Fast index-skip scan for all stocks
            query = `
                WITH RECURSIVE t AS (
                    (SELECT expiry_date FROM option_chain_data ORDER BY expiry_date LIMIT 1)
                    UNION ALL
                    SELECT (SELECT expiry_date FROM option_chain_data WHERE expiry_date > t.expiry_date ORDER BY expiry_date LIMIT 1)
                    FROM t
                    WHERE t.expiry_date IS NOT NULL
                )
                SELECT expiry_date FROM t WHERE expiry_date IS NOT NULL;
            `;
        }

        const [results] = await sequelize.query(query, {
            replacements: { stockName }
        });
        const expiryList = results.map(e => e.expiry_date).filter(e => e != null);

        cachedExpiries[stockName] = {
            data: expiryList,
            timestamp: now
        };

        return res.status(200).json({ success: true, data: expiryList });
    } catch (error) {
        console.error('Error fetching unique expiries:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Smart endpoint to automatically scan and ingest the 'vikas' folder
 */
exports.ingestDumpData = async (req, res) => {
    try {
        const startTime = Date.now();
        const forceReingest = req.query.force === 'true';

        // Find the absolute path to the vikas folder
        const vikasFolderPath = path.join(__dirname, '../vikas');

        const summary = await processTargetFolder(vikasFolderPath, forceReingest);

        // Clear option chain memory cache as new records are loaded
        clearOptionChainCache();

        // Calculate Execution Time
        const totalTimeMs = Date.now() - startTime;
        const minutes = Math.floor(totalTimeMs / 60000);
        const seconds = ((totalTimeMs % 60000) / 1000).toFixed(2);
        summary.executionTime = `${minutes} minute(s) and ${seconds} second(s)`;

        if (summary.filesProcessed === 0 && summary.filesSkipped > 0) {
            return res.status(200).json({
                success: true,
                message: "No new files found. All records are already saved.",
                details: summary
            });
        }

        return res.status(200).json({
            success: true,
            message: forceReingest ? "Successfully FORCE re-ingested dump records." : "Successfully ingested new dump records.",
            details: summary
        });

    } catch (error) {
        console.error('Error during smart ingestion:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

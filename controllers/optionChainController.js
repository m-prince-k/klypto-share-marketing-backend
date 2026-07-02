const { Op } = require('sequelize');
const { OptionChainData, sequelize } = require('../models');
const { processTargetFolder } = require('../services/ingestionService');
const path = require('path');

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

        // Date Range Filter using timestamp_epoch (indexed column, stores trading date as Unix timestamp)
        if (req.query.fromDate || req.query.toDate) {
            whereClause.timestamp_epoch = {};
            if (req.query.fromDate) {
                // Parse as IST start of day: YYYY-MM-DD 09:15:00 IST = YYYY-MM-DD 03:45:00 UTC
                const startDate = new Date(req.query.fromDate + 'T03:45:00Z');
                whereClause.timestamp_epoch[Op.gte] = Math.floor(startDate.getTime() / 1000);
            }
            if (req.query.toDate) {
                // Parse as IST end of day: YYYY-MM-DD 23:59:59 IST = YYYY-MM-DD 18:29:59 UTC
                const endDate = new Date(req.query.toDate + 'T18:30:00Z');
                whereClause.timestamp_epoch[Op.lte] = Math.floor(endDate.getTime() / 1000);
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
                'open', 'high', 'low', 'close', 'volume', 'oi', 'iv', 'timestamp_ist', 'timestamp_epoch'
            ]
        };

        if (!isFetchAll) {
            queryOptions.limit = limit;
            queryOptions.offset = offset;
        }

        // Use findAll instead of findAndCountAll to avoid the massively slow exact COUNT(*) query
        let rows = await OptionChainData.findAll(queryOptions);
        let usedFallback = false;

        // --- SMART FALLBACK: If date filter returns 0 rows, return the latest available data ---
        const hasDateFilter = !!(req.query.fromDate || req.query.toDate);
        if (rows.length === 0 && hasDateFilter) {
            // Strip the date filter and return the latest data instead
            const fallbackWhere = { ...whereClause };
            delete fallbackWhere.timestamp_epoch;

            const fallbackOptions = {
                ...queryOptions,
                where: fallbackWhere,
            };
            rows = await OptionChainData.findAll(fallbackOptions);
            usedFallback = true;
        }

        let estimatedCount = rows.length;
        
        // Determine which whereClause to use for count
        const activeWhereClause = usedFallback
            ? (() => { const w = { ...whereClause }; delete w.timestamp_epoch; return w; })()
            : whereClause;

        if (Object.keys(activeWhereClause).length > 0) {
            // If user applied filters (like stockName), calculate exact count. 
            // It's fast because we have indexes on symbol and expiry_date.
            estimatedCount = await OptionChainData.count({ where: activeWhereClause });
        } else {
            // Fetch a super fast estimated row count directly from PostgreSQL internal statistics for the full table
            const [countResult] = await sequelize.query(`SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'option_chain_data';`);
            if (countResult[0] && countResult[0].estimate > 0) {
                estimatedCount = parseInt(countResult[0].estimate);
            }
        }

        // 5. Calculate Pagination Metadata using the appropriate count
        const totalPages = isFetchAll ? 1 : Math.ceil(estimatedCount / limit);
        const count = estimatedCount;

        // Map and normalize option_type (CE/PE)
        const formattedRows = rows.map(row => {
            const data = row.toJSON();
            let type = data.option_side || data.response_leg || data.side || data.request_option_type || 'Unknown';
            if (type.toUpperCase() === 'CALL') type = 'CE';
            if (type.toUpperCase() === 'PUT') type = 'PE';
            data.optionType = type.toUpperCase();

            // Format date_ist to Angel One format (YYYY-MM-DD HH:mm) using timestamp_epoch
            if (data.timestamp_epoch) {
                // IST is UTC+5:30
                const d = new Date(parseInt(data.timestamp_epoch) * 1000 + 5.5 * 3600 * 1000);
                const pad = (n) => String(n).padStart(2, '0');
                data.date_ist = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
            }

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
            ...(usedFallback && {
                warning: `No data found for the requested date range. Showing latest available data instead.`,
                dateRangeFallback: true,
            }),
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
 * Get available date range (min & max dates) in the option_chain_data table
 * Frontend should call this on load to know what dates to show in date pickers
 */
exports.getDateRange = async (req, res) => {
    try {
        const whereClause = {};
        if (req.query.stockName && req.query.stockName !== 'All Stocks') {
            whereClause.symbol = req.query.stockName;
        }

        // Use fast MIN/MAX aggregation on indexed timestamp_epoch column
        const [result] = await sequelize.query(`
            SELECT 
                MIN(timestamp_epoch) AS min_epoch,
                MAX(timestamp_epoch) AS max_epoch
            FROM option_chain_data
            ${whereClause.symbol ? `WHERE symbol = '${whereClause.symbol}'` : ''}
        `);

        const row = result[0];
        if (!row || !row.min_epoch) {
            return res.status(200).json({ success: true, data: { minDate: null, maxDate: null } });
        }

        // Convert epoch to YYYY-MM-DD (IST = UTC+5:30)
        const toISTDate = (epoch) => {
            const d = new Date(parseInt(epoch) * 1000);
            const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
            return ist.toISOString().split('T')[0];
        };

        return res.status(200).json({
            success: true,
            data: {
                minDate: toISTDate(row.min_epoch), // e.g. "2025-01-02"
                maxDate: toISTDate(row.max_epoch), // e.g. "2025-12-31"
            }
        });
    } catch (error) {
        console.error('Error fetching date range:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


exports.getUniqueSymbols = async (req, res) => {
    try {
        // Use a Recursive CTE (Loose Index Scan) for lightning-fast distinct values on massive tables
        // Requires an index on 'symbol' to be fully effective
        const query = `
            WITH RECURSIVE t AS (
                SELECT min(symbol) AS symbol FROM option_chain_data
                UNION ALL
                SELECT (SELECT min(symbol) FROM option_chain_data WHERE symbol > t.symbol)
                FROM t WHERE t.symbol IS NOT NULL
            )
            SELECT symbol FROM t WHERE symbol IS NOT NULL;
        `;
        const [results] = await sequelize.query(query);
        
        const symbolList = results.map(r => r.symbol).filter(Boolean);
        return res.status(200).json({ success: true, data: symbolList });
    } catch (error) {
        console.error('Error fetching unique symbols:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

/**
 * Fetch unique expiry dates for dropdown
 */
exports.getUniqueExpiries = async (req, res) => {
    try {
        const whereClause = {};
        if (req.query.stockName && req.query.stockName !== 'All Stocks') {
            whereClause.symbol = req.query.stockName;
        }

        const expiries = await OptionChainData.findAll({
            where: whereClause,
            attributes: [
                [sequelize.fn('DISTINCT', sequelize.col('expiry_date')), 'expiry_date']
            ],
            order: [['expiry_date', 'ASC']]
        });

        const expiryList = expiries.map(e => e.expiry_date).filter(e => e != null);
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

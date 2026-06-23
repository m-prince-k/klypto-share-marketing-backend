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

        // Use findAll instead of findAndCountAll to avoid the massively slow exact COUNT(*) query
        const rows = await OptionChainData.findAll(queryOptions);

        let estimatedCount = rows.length;
        
        if (Object.keys(whereClause).length > 0) {
            // If user applied filters (like stockName), calculate exact count. 
            // It's fast because we have indexes on symbol and expiry_date.
            estimatedCount = await OptionChainData.count({ where: whereClause });
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
 * Fetch unique symbols for dropdown
 */
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

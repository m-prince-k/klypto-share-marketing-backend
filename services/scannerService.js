const fs = require('fs');
const path = require('path');

/**
 * Reads the historical_csv folder and returns a list of symbols based on the filenames.
 * E.g., 'RELIANCE.csv' -> 'RELIANCE'
 */
function getScannerSymbols() {
    const csvDir = path.join(__dirname, '../historical_csv');
    if (!fs.existsSync(csvDir)) {
        console.warn('[ScannerService] historical_csv directory not found.');
        return [];
    }

    const files = fs.readdirSync(csvDir);
    const symbols = [];

    for (const file of files) {
        if (file.endsWith('.csv')) {
            const symbol = file.replace('.csv', '');
            symbols.push(symbol);
        }
    }

    return symbols;
}

module.exports = {
    getScannerSymbols
};

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scrips.json', 'utf8'));

console.log("Searching for ZOM:");
console.log(data.filter(s => s.symbol && s.symbol.startsWith('ZOM')));

console.log("Searching for TATA:");
console.log(data.filter(s => s.symbol && s.symbol.startsWith('TATA') && s.exch_seg === 'NSE' && s.instrumenttype === '').map(s => s.symbol));

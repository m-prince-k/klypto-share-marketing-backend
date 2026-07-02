const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scrips.json', 'utf8'));

console.log("Searching for RELIANCE:");
console.log(data.filter(s => s.name && s.name.toUpperCase().includes('RELIANCE')).slice(0, 5));

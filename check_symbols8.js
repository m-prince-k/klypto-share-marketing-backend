const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scrips.json', 'utf8'));

console.log("Searching for ZOMATO:");
console.log(data.filter(s => s.name && s.name.toUpperCase().includes('ZOMATO')));

console.log("Searching for TATA MOTORS:");
console.log(data.filter(s => s.name && s.name.toUpperCase().includes('TATA MOTORS')));

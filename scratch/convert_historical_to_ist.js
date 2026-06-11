const fs = require('fs');
const path = require('path');

const dirPath = 'c:\\Users\\HP\\Desktop\\trading_klypto\\klypto-share-marketing-backend\\historical_csv';
const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.csv'));

function convertToIST(dateStr) {
    // dateStr is like "2025-11-10 05:45:00" (which is UTC)
    // Add 5 hours and 30 mins
    const dt = new Date(dateStr.replace(' ', 'T') + 'Z');
    
    // Shift by 5.5 hours to simulate IST in UTC methods
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(dt.getTime() + istOffset);
    
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

console.log(`Found ${files.length} CSV files to process...`);

for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split(',');
        const originalDate = parts[0];
        
        // Safety check to avoid double conversion: UTC time is usually before 09:00 for morning trades
        // But if it's already IST, we might mess it up if run twice. 
        // We will just convert indiscriminately, so only run this ONCE!
        
        const newDate = convertToIST(originalDate);
        parts[0] = newDate;
        lines[i] = parts.join(',');
    }
    
    fs.writeFileSync(filePath, lines.join('\n'));
    console.log(`Converted ${file} to IST`);
}

console.log("All files converted to IST successfully!");

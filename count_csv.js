const fs = require('fs');

function countLines(filePath) {
    return new Promise((resolve, reject) => {
        let count = 0;
        const readStream = fs.createReadStream(filePath);
        
        readStream.on('data', (chunk) => {
            for (let i = 0; i < chunk.length; i++) {
                if (chunk[i] === 10) count++; // 10 is '\n'
            }
        });
        
        readStream.on('end', () => {
            resolve(count);
        });
        
        readStream.on('error', (err) => {
            reject(err);
        });
    });
}

const start = Date.now();
countLines('option_chain_data.csv')
    .then(count => {
        console.log(`Total lines in CSV: ${count}`);
        console.log(`Time taken: ${(Date.now() - start) / 1000}s`);
    })
    .catch(err => {
        console.error("Error reading file:", err);
    });

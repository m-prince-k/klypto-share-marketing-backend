const fs = require('fs');

function scanFile(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const candles = data.historic_data || data;
        
        if (!Array.isArray(candles)) {
            console.log("Error: Data is not an array");
            return;
        }

        console.log(`Total candles found: ${candles.length}`);

        // Group by day and check duplicates
        const dayMap = {};
        const duplicates = [];
        const seen = new Set();

        candles.forEach(c => {
            const dt = c.datetime; // Format: YYYY-MM-DD HH:MM:SS
            if (!dt) return;

            if (seen.has(dt)) {
                duplicates.push(dt);
            } else {
                seen.add(dt);
            }

            const [datePart, timePart] = dt.split(' ');
            if (!dayMap[datePart]) {
                dayMap[datePart] = [];
            }
            dayMap[datePart].push(timePart);
        });

        // Report duplicates
        if (duplicates.length > 0) {
            console.log(`\nFound ${duplicates.length} duplicate entries:`);
            duplicates.slice(0, 10).forEach(d => console.log(` - ${d}`));
            if (duplicates.length > 10) console.log(` ... and ${duplicates.length - 10} more.`);
        } else {
            console.log("\nNo duplicate entries found.");
        }

        // Check for missing data points
        // 09:15 to 15:25 every 5 minutes
        const expectedTimes = [];
        let h = 9, m = 15;
        while (h < 15 || (h === 15 && m <= 25)) {
            const hh = String(h).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            expectedTimes.push(`${hh}:${mm}:00`);
            m += 5;
            if (m >= 60) {
                h++;
                m -= 60;
            }
        }

        console.log(`\nExpected candles per day: ${expectedTimes.length}`);

        let totalMissing = 0;
        for (const [date, times] of Object.entries(dayMap)) {
            const timeSet = new Set(times);
            const missing = expectedTimes.filter(t => !timeSet.has(t));
            
            if (missing.length > 0) {
                console.log(`\nDate: ${date} has ${missing.length} missing candles:`);
                if (missing.length > 15) {
                    console.log(` - ${missing.slice(0, 5).join(', ')} ... and ${missing.length - 5} more`);
                } else {
                    console.log(` - ${missing.join(', ')}`);
                }
                totalMissing += missing.length;
            } else {
                console.log(`\nDate: ${date} has ALL expected candles.`);
            }
        }

        console.log(`\nTotal missing data points across all days: ${totalMissing}`);

    } catch (e) {
        console.log("Error reading or parsing file:", e);
    }
}

scanFile('testingpayload.json');

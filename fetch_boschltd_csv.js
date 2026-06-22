/**
 * BOSCHLTD CSV - Append Missing Data
 * Reads existing CSV, finds last date, fetches only missing data,
 * and appends it to the existing file.
 * Run: npm run fetch-bosch
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// NOTE: JWT token expires ~12 hours. If you get 401, restart server and get fresh token.
const JWT_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6IkFBQVA0MjM5NjkiLCJyb2xlcyI6MCwidXNlcnR5cGUiOiJVU0VSIiwidG9rZW4iOiJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKMWMyVnlYM1I1Y0dVaU9pSmpiR2xsYm5RaUxDSjBiMnRsYmw5MGVYQmxJam9pZEhKaFpHVmZZV05qWlhOelgzUnZhMlZ1SWl3aVoyMWZhV1FpT2pFd01pd2ljMjkxY21ObElqb2lNeUlzSW1SbGRtbGpaVjlwWkNJNkltUTBZV0V6WXpRekxUazJZMll0TTJWbVppMDVNRFprTFROalkyWmlPV1l5WWpkaVl5SXNJbXRwWkNJNkluUnlZV1JsWDJ0bGVWOTJNaUlzSW05dGJtVnRZVzVoWjJWeWFXUWlPakV3TWl3aWNISnZaSFZqZEhNaU9uc2laR1Z0WVhRaU9uc2ljM1JoZEhWeklqb2lZV04wYVhabEluMHNJbTFtSWpwN0luTjBZWFIxY3lJNkltRmpkR2wyWlNKOWZTd2lhWE56SWpvaWRISmhaR1ZmYkc5bmFXNWZjMlZ5ZG1salpTSXNJbk4xWWlJNklrRkJRVkEwTWpNNU5qa2lMQ0psZUhBaU9qRTNPREV3TnpBNE1EY3NJbTVpWmlJNk1UYzRNRGs0TkRJeU55d2lhV0YwSWpveE56Z3dPVGcwTWpJM0xDSnFkR2tpT2lKbVpURmpORFJqTmkxa09HVTJMVFEwTUdJdE9EWmpaQzA0TkRCaVlqRmpaVEUyTURraUxDSlViMnRsYmlJNklpSjkudU5Lcjl0c0xZVzI4d05jSHlFakJTamhTQWg1eWVxdmhwY2VYclpPLWNidklocnRaNGphZEFkS1ptMzVjNUNZcl8yd0RSZkdJdVNlLXVwRFowdlM0aS1BZlBBOWpqT2oxWnVncTJmbEdhcXlRMUFuMFN6U1M2QnFmWExGTnJ1MEJYOG05QTZIRmI3YVRtRS0xNU03ZVZhT2lwQUdMTzN1SXZ5NzlsN2ZwU05VIiwiQVBJLUtFWSI6IkFzWnNzUTlpIiwiaWF0IjoxNzgwOTg0NDA3LCJleHAiOjE3ODEwMjk4MDB9.Ipgtt2eJM_MZ1mfkucBXeoNSJ8H3pBm4rypkFYMxea4hriQL0vcY2HdOc2cYZHp40mxBvE6NOSzEgFsX51jctA";
const API_KEY   = "AsZssQ9i";
const TOKEN     = "2181";   // BOSCHLTD NSE token
const INTERVAL  = "FIVE_MINUTE";

const OUTPUT_FILE = path.join(__dirname, 'historical_csv', 'BOSCHLTD.csv');

// ─── HELPERS ───────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d, time) {
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${time}`;
}
function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

// Read last date from existing CSV
function getLastDateFromCSV(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    // Skip header, get last line
    const lastLine = lines[lines.length - 1];
    if (!lastLine || lastLine.startsWith('datetime')) return null;
    const dateStr = lastLine.split(',')[0]; // e.g. "2026-04-10 15:25:00"
    return new Date(dateStr);
}

// Angel One API call
function fetchChunk(fromdate, todate) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            exchange:    'NSE',
            symboltoken: TOKEN,
            interval:    INTERVAL,
            fromdate,
            todate
        });

        const options = {
            hostname: 'apiconnect.angelone.in',
            path: '/rest/secure/angelbroking/historical/v1/getCandleData',
            method: 'POST',
            headers: {
                'Content-Type':     'application/json',
                'Accept':           'application/json',
                'Authorization':    `Bearer ${JWT_TOKEN}`,
                'X-PrivateKey':     API_KEY,
                'X-UserType':       'USER',
                'X-SourceID':       'WEB',
                'X-ClientLocalIP':  '127.0.0.1',
                'X-ClientPublicIP': '127.0.0.1',
                'X-MACAddress':     '00:00:00:00:00:00',
                'Content-Length':   Buffer.byteLength(body)
            }
        };

        let data = '';
        const req = https.request(options, (res) => {
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (!json.status) {
                        console.warn(`  ⚠️  API Error: ${json.message || JSON.stringify(json).slice(0,100)}`);
                        resolve([]);
                    } else {
                        resolve(json?.data || []);
                    }
                } catch(e) {
                    console.warn('  ⚠️  Parse error:', data.slice(0, 150));
                    resolve([]);
                }
            });
        });

        req.on('error', (e) => { console.warn('  ⚠️  Request error:', e.message); resolve([]); });
        req.setTimeout(30000, () => { req.destroy(); console.warn('  ⚠️  Timeout!'); resolve([]); });
        req.write(body);
        req.end();
    });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  BOSCHLTD CSV - Append Missing Data      ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // 1. Find last date in existing CSV
    const lastDate = getLastDateFromCSV(OUTPUT_FILE);
    if (!lastDate) {
        console.error('❌ Could not read existing CSV:', OUTPUT_FILE);
        process.exit(1);
    }

    // Start from next day after last entry
    const startDate = addDays(lastDate, 1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(); // today

    if (startDate >= endDate) {
        console.log('✅ CSV is already up to date! Last entry:', fmtDate(lastDate, `${pad(lastDate.getHours())}:${pad(lastDate.getMinutes())}`));
        return;
    }

    console.log(`📄 Existing data ends : ${fmtDate(lastDate, `${pad(lastDate.getHours())}:${pad(lastDate.getMinutes())}`)}`);
    console.log(`📅 Fetching from      : ${fmtDate(startDate, '09:15')}`);
    console.log(`📅 Fetching to        : ${fmtDate(endDate, '15:30')}`);

    // 2. Build chunks (50 days max for 5-min data)
    const CHUNK_DAYS = 50;
    const chunks = [];
    let cursor = new Date(startDate);
    while (cursor < endDate) {
        const end = addDays(cursor, CHUNK_DAYS);
        chunks.push({
            from: fmtDate(cursor, '09:15'),
            to:   fmtDate(end > endDate ? endDate : end, '15:30')
        });
        cursor = addDays(end, 1);
    }

    console.log(`📦 Chunks             : ${chunks.length}\n`);

    // 3. Fetch all chunks
    const allNew = [];
    for (let i = 0; i < chunks.length; i++) {
        const { from, to } = chunks[i];
        process.stdout.write(`⏳ [${i+1}/${chunks.length}] ${from} → ${to} ... `);
        const data = await fetchChunk(from, to);
        console.log(`✅ ${data.length} candles`);
        allNew.push(...data);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    if (allNew.length === 0) {
        console.error('\n❌ No new data received.');
        console.error('   Possible reasons:');
        console.error('   1. JWT token expired → restart server, get fresh token');
        console.error('   2. Market was closed for the entire period\n');
        process.exit(1);
    }

    // 4. Filter only candles strictly after lastDate, sort, deduplicate
    const lastTs = lastDate.getTime();
    const seen = new Set();
    const newCandles = allNew
        .filter(c => {
            const ts = new Date(c[0]).getTime();
            if (ts <= lastTs) return false;
            if (seen.has(c[0])) return false;
            seen.add(c[0]);
            return true;
        })
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));

    // 5. Append to CSV
    const newRows = newCandles.map(c => {
        const dt = new Date(c[0]);
        const dtStr = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        return `${dtStr},${c[1]},${c[2]},${c[3]},${c[4]},${c[5] || 0}`;
    });

    fs.appendFileSync(OUTPUT_FILE, '\n' + newRows.join('\n'), 'utf-8');
    const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║  ✅  Data Appended Successfully!          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`\n📊 New Candles Added : ${newCandles.length}`);
    console.log(`📅 New Last Entry    : ${newCandles[newCandles.length-1]?.[0] || 'N/A'}`);
    console.log(`📁 File              : ${OUTPUT_FILE}`);
    console.log(`📏 File Size         : ${sizeKB} KB\n`);
}

main().catch(err => {
    console.error('\n❌ Fatal Error:', err.message);
    process.exit(1);
});

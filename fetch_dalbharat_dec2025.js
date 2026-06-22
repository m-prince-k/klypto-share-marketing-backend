/**
 * DALBHARAT - Fetch & Prepend December 2025 Data
 * Fetches Dec 2025 (5-min candles) from Angel One API
 * and PREPENDS them to the existing DALBHARAT.csv
 *
 * Run:  node fetch_dalbharat_dec2025.js
 *
 * NOTE: If you get 401, get a fresh JWT token from your running server logs
 *       and update JWT_TOKEN below.
 */

const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');

// ─── CONFIG ────────────────────────────────────────────────────────────────
// JWT token — get a fresh one from your server if this is expired
const JWT_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1c2VybmFtZSI6IkFBQVA0MjM5NjkiLCJyb2xlcyI6MCwidXNlcnR5cGUiOiJVU0VSIiwidG9rZW4iOiJleUpoYkdjaU9pSlNVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKMWMyVnlYM1I1Y0dVaU9pSmpiR2xsYm5RaUxDSjBiMnRsYmw5MGVYQmxJam9pZEhKaFpHVmZZV05qWlhOelgzUnZhMlZ1SWl3aVoyMWZhV1FpT2pFd01pd2ljMjkxY21ObElqb2lNeUlzSW1SbGRtbGpaVjlwWkNJNkltUTBZV0V6WXpRekxUazJZMll0TTJWbVppMDVNRFprTFROalkyWmlPV1l5WWpkaVl5SXNJbXRwWkNJNkluUnlZV1JsWDJ0bGVWOTJNaUlzSW05dGJtVnRZVzVoWjJWeWFXUWlPakV3TWl3aWNISnZaSFZqZEhNaU9uc2laR1Z0WVhRaU9uc2ljM1JoZEhWeklqb2lZV04wYVhabEluMHNJbTFtSWpwN0luTjBZWFIxY3lJNkltRmpkR2wyWlNKOWZTd2lhWE56SWpvaWRISmhaR1ZmYkc5bmFXNWZjMlZ5ZG1salpTSXNJbk4xWWlJNklrRkJRVkEwTWpNNU5qa2lMQ0psZUhBaU9qRTNPREV3TnpBNE1EY3NJbTVpWmlJNk1UYzRNRGs0TkRJeU55d2lhV0YwSWpveE56Z3dPVGcwTWpJM0xDSnFkR2tpT2lKbVpURmpORFJqTmkxa09HVTJMVFEwTUdJdE9EWmpaQzA0TkRCaVlqRmpaVEUyTURraUxDSlViMnRsYmlJNklpSjkudU5Lcjl0c0xZVzI4d05jSHlFakJTamhTQWg1eWVxdmhwY2VYclpPLWNidklocnRaNGphZEFkS1ptMzVjNUNZcl8yd0RSZkdJdVNlLXVwRFowdlM0aS1BZlBBOWpqT2oxWnVncTJmbEdhcXlRMUFuMFN6U1M2QnFmWExGTnJ1MEJYOG05QTZIRmI3YVRtRS0xNU03ZVZhT2lwQUdMTzN1SXZ5NzlsN2ZwU05VIiwiQVBJLUtFWSI6IkFzWnNzUTlpIiwiaWF0IjoxNzgwOTg0NDA3LCJleHAiOjE3ODEwMjk4MDB9.Ipgtt2eJM_MZ1mfkucBXeoNSJ8H3pBm4rypkFYMxea4hriQL0vcY2HdOc2cYZHp40mxBvE6NOSzEgFsX51jctA";
const API_KEY   = "AsZssQ9i";
const INTERVAL  = "FIVE_MINUTE";

const OUTPUT_FILE = path.join(__dirname, 'historical_csv', 'DALBHARAT.csv');

// December 2025 date range
// NSE trading hours: 09:15 to 15:30 IST = 03:45 to 10:00 UTC
const FROM_DATE = "2025-12-01 09:15";
const TO_DATE   = "2025-12-31 15:30";

// ─── HELPERS ───────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

// Fetch DALBHARAT token from Angel One master scrip
function fetchDalbharatToken() {
    return new Promise((resolve, reject) => {
        console.log('🔍 Fetching DALBHARAT token from Angel One master scrip...');
        const url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const allScrips = JSON.parse(data);
                    // Find DALBHARAT-EQ in NSE
                    const found = allScrips.find(s =>
                        s.exch_seg === 'NSE' &&
                        (s.symbol === 'DALBHARAT-EQ' || s.symbol === 'DALBHARAT') &&
                        s.instrumenttype === ''
                    );
                    if (found) {
                        console.log(`✅ DALBHARAT token found: ${found.token} (symbol: ${found.symbol})`);
                        resolve(found.token);
                    } else {
                        reject(new Error('DALBHARAT-EQ not found in master scrip!'));
                    }
                } catch(e) {
                    reject(new Error('Failed to parse master scrip JSON: ' + e.message));
                }
            });
        }).on('error', reject)
          .setTimeout(60000, function() {
              this.destroy();
              reject(new Error('Timeout fetching master scrip'));
          });
    });
}

// Angel One historical candle data API call
function fetchChunk(token, fromdate, todate) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            exchange:    'NSE',
            symboltoken: token,
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
                        console.warn(`  ⚠️  API Error: ${json.message || JSON.stringify(json).slice(0, 150)}`);
                        resolve([]);
                    } else {
                        resolve(json?.data || []);
                    }
                } catch(e) {
                    console.warn('  ⚠️  Parse error:', data.slice(0, 200));
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
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  DALBHARAT - Prepend December 2025 Data          ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 1. Check existing CSV
    if (!fs.existsSync(OUTPUT_FILE)) {
        console.error('❌ CSV file not found:', OUTPUT_FILE);
        process.exit(1);
    }

    const existingContent = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const existingLines = existingContent.trim().split('\n');
    const header = existingLines[0]; // datetime,open,high,low,close,volume
    const dataLines = existingLines.slice(1);

    // Check first entry date
    const firstLine = dataLines[0];
    const firstDate = new Date(firstLine.split(',')[0]);
    console.log(`📄 Existing CSV first entry: ${firstLine.split(',')[0]}`);
    console.log(`📄 Existing CSV total rows : ${dataLines.length}`);

    // 2. Fetch DALBHARAT NSE token
    let TOKEN;
    try {
        TOKEN = await fetchDalbharatToken();
    } catch(e) {
        console.error('❌ Token fetch failed:', e.message);
        process.exit(1);
    }

    // 3. Fetch December 2025 data in chunks (Angel One allows max 50 days per request for 5-min)
    console.log(`\n📅 Fetching Dec 2025: ${FROM_DATE} → ${TO_DATE}`);

    // Split into 2 chunks to be safe (Dec 1-15, Dec 16-31)
    const chunks = [
        { from: "2025-12-01 09:15", to: "2025-12-15 15:30" },
        { from: "2025-12-16 09:15", to: "2025-12-31 15:30" }
    ];

    const allNew = [];
    for (let i = 0; i < chunks.length; i++) {
        const { from, to } = chunks[i];
        process.stdout.write(`⏳ [${i+1}/${chunks.length}] ${from} → ${to} ... `);
        const data = await fetchChunk(TOKEN, from, to);
        console.log(`✅ ${data.length} candles`);
        allNew.push(...data);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    if (allNew.length === 0) {
        console.error('\n❌ No December 2025 data received.');
        console.error('   Possible reasons:');
        console.error('   1. JWT token expired → update JWT_TOKEN in this script');
        console.error('   2. December 2025 is before the API data retention window');
        process.exit(1);
    }

    // 4. Format candles, sort, deduplicate
    const seen = new Set();

    // Filter to strictly Dec 2025 and before the existing first entry
    const decCandles = allNew
        .filter(c => {
            const dt = new Date(c[0]);
            const ts = c[0];
            if (dt >= firstDate) return false;   // don't overlap with existing
            if (seen.has(ts)) return false;
            seen.add(ts);
            return true;
        })
        .sort((a, b) => new Date(a[0]) - new Date(b[0]));

    if (decCandles.length === 0) {
        console.error('\n❌ No new December 2025 candles to prepend (all already exist or overlap).');
        process.exit(1);
    }

    // 5. Format as CSV rows
    const newRows = decCandles.map(c => {
        const dt = new Date(c[0]);
        const dtStr = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
        return `${dtStr},${c[1]},${c[2]},${c[3]},${c[4]},${c[5] || 0}`;
    });

    // 6. Write new file: header + dec rows + existing rows
    const newContent = header + '\n' + newRows.join('\n') + '\n' + dataLines.join('\n');
    fs.writeFileSync(OUTPUT_FILE, newContent, 'utf-8');

    const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  ✅  December 2025 Data Prepended Successfully!   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\n📊 New Candles Prepended : ${decCandles.length}`);
    console.log(`📅 First entry (new)     : ${newRows[0]?.split(',')[0]}`);
    console.log(`📅 Last entry (new)      : ${newRows[newRows.length - 1]?.split(',')[0]}`);
    console.log(`📁 File                  : ${OUTPUT_FILE}`);
    console.log(`📏 File Size             : ${sizeKB} KB\n`);
}

main().catch(err => {
    console.error('\n❌ Fatal Error:', err.message);
    process.exit(1);
});

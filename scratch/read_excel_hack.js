const AdmZip = require('adm-zip');

function readHeaders() {
    try {
        const zip = new AdmZip('c:/Users/HP/Desktop/trading_klypto/klypto-share-marketing-backend/TCS_11536/TCS_11536/11536 Aug 25.xlsx');
        const zipEntries = zip.getEntries();
        let sharedStringsXml = '';
        zipEntries.forEach(function (zipEntry) {
            if (zipEntry.entryName === 'xl/sharedStrings.xml') {
                sharedStringsXml = zipEntry.getData().toString('utf8');
            }
        });

        // Parse XML tags to get the strings. The first ~20 strings usually contain the headers.
        const regex = /<t[^>]*>(.*?)<\/t>/g;
        let match;
        const strings = [];
        let count = 0;
        while ((match = regex.exec(sharedStringsXml)) !== null && count < 50) {
            strings.push(match[1]);
            count++;
        }
        return strings;
    } catch (e) {
        return { error: e.message };
    }
}

const express = require('express');
const app = express();
app.get('/hack', (req, res) => {
    res.json(readHeaders());
});
app.listen(9999, () => console.log('Hack server running on 9999'));

const https = require('https');
const fs = require('fs');

const apiKey = 'AIzaSyD8NBhHuGMBEajNIenKQx8q6ATO5hAw-j8';

https.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            const parsedData = JSON.parse(rawData);
            if (parsedData.models) {
                const gemini3Models = parsedData.models
                    .filter(m => m.name.includes('gemini-3'))
                    .map(m => m.name);
                fs.writeFileSync('check_models.json', JSON.stringify(gemini3Models, null, 2));
            } else {
                fs.writeFileSync('check_models.json', JSON.stringify({error: "no models", data: parsedData}));
            }
        } catch (e) {
            console.error(e.message);
        }
    });
}).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
});

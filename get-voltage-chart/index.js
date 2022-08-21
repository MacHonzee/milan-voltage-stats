const functions = require('@google-cloud/functions-framework');
const fs = require('fs');

functions.http('getVoltageChart', async (req, res) => {
    // disable CORS, we need it public
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        // Send response to OPTIONS requests
        res.set('Access-Control-Allow-Methods', 'GET');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
    } else {
        let content = await fs.promises.readFile("./chart.html", {encoding: 'utf-8'});
        res.set('Content-type', 'text/html; charset=utf-8')
        res.set('Cache-control', 'public, max-age=604800, s-maxage=604800')
        res.send(content);
    }
});

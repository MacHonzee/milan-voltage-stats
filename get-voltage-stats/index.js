const functions = require('@google-cloud/functions-framework');
const axios = require("axios");

async function loadData(device, ln, zm) {
    const DEVICE = device ?? "0000002463";
    const LN = ln ?? "240";
    const ZM = zm ?? "6";
    const URL = `http://sensorfor.com/cloud/m2m_data_get.php?id=${DEVICE}&ln=${LN}&zm=${ZM}`;

    let rawData;
    let retries = 0;
    while (!rawData) {
        retries++
        if (retries === 10) {
            throw new Error("Unexpected error when contacting Sensorfor cloud.");
        }

        try {
            rawData = await axios.get(URL);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    return rawData.data.split("\n<br>").map(line => {
        let splits = line.split(";");
        let isoDate = `20${splits[0]}-${splits[1]}-${splits[2]}T${splits[3]}:${splits[4]}:${splits[5]}.000Z`;
        let voltage = (parseInt(splits[9]) + parseInt(splits[10]) * 256)/100;
        return [new Date(isoDate), splits[6], splits[7], voltage];
    }).sort((a, b) => a[0].getTime() - b[0].getTime());
}

functions.http("getVoltageStats", async (req, res) => {
    // disable CORS, we need it public
    res.set('Access-Control-Allow-Origin', '*');

    let data = await loadData(req.query.device, req.query.ln, req.query.zm);
    res.send(JSON.stringify(data));
});

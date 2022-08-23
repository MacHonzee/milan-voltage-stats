const functions = require('@google-cloud/functions-framework');
const {MongoClient} = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
const COLLECTION = "voltageStats";

async function getVoltageReport(year, month) {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const collection = client.db().collection(COLLECTION);

        // detail for one specific month, return all days
        if (year && month) {
            // we assume clever client here, he would only fuck himself anyway
            let monthStart = new Date(`${year}-${month}-01T00:00:00.000Z`);
            let monthEnd = new Date(monthStart);
            monthEnd.setMonth(monthEnd.getMonth() + 1);

            return await collection.find({ts: {$gte: monthStart, $lt: monthEnd}}).toArray();
        } else {
            // aggregation for every month of all the years
            return await collection.aggregate([
                {
                    $group: {
                        _id: {
                            year: {$year: "$ts"},
                            month: {$month: "$ts"}
                        },
                        totalPower: {$sum: "$power"},
                    }
                }
            ]).toArray();
        }
    } finally {
        await client.close();
    }
}

function setCacheControl(res, year, month) {
    if (!year || !month) {
        // cache for 1 hour
        res.set('Cache-control', 'public, max-age=3600, s-maxage=3600');
    } else {
        let now = new Date();
        if (year === now.getFullYear().toString() && parseInt(month) === now.getMonth() + 1) {
            // cache for 1 hour for current month
            res.set('Cache-control', 'public, max-age=3600, s-maxage=3600');
        } else {
            // cache for 1 week for past months
            res.set('Cache-control', 'public, max-age=604800, s-maxage=604800')
        }
    }
}

functions.http("getVoltageReport", async (req, res) => {
    // setup cors
    const corsWhitelist = [
        'https://get-voltage-table-su36le2cma-ew.a.run.app',
        'https://dumtech.cz/',
    ];
    if (corsWhitelist.indexOf(req.headers.origin) !== -1) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    }

    if (!MONGO_URI) {
        res.status(500);
        res.send("process.env.MONGODB_URI is not defined!");
    }

    const {year, month} = req.query;
    const voltageReport = await getVoltageReport(year, month);

    // set some caches, because data from past will not be changed anyway
    setCacheControl(res, year, month);

    res.send(voltageReport);
});

const functions = require('@google-cloud/functions-framework');
const {MongoClient} = require('mongodb');
const axios = require("axios");

const MONGO_URI = process.env.MONGODB_URI;
const COLLECTION = "voltageStats";
const DEVICE = "0000002463"; // hardcoded for now since there is only one device
// const FETCH_DATA_URL = "http://localhost:8081/getVoltageStats";
const FETCH_DATA_URL = "https://get-voltage-stats-su36le2cma-ew.a.run.app";

// to calculate the power precisely
const WATTAGE_CONSTANT = 47.62;

async function downloadLatestData() {
    const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();

        // get last written document (has to exist) to see how much data we need to save
        const collection = client.db().collection(COLLECTION);
        const lastDoc = await collection.findOne({}, {sort: {ts: -1}});

        let now = new Date();
        let nowDatekey = now.toISOString().split("T")[0];
        const lastDocDate = lastDoc.ts.toISOString().split("T")[0];

        let allData = await axios.get(FETCH_DATA_URL);

        // group data by days and hours
        let grouppedData = {};
        for (let item of allData.data) {
            let dateKey = item[0].split("T")[0];
            // skip today and what we already have in DB
            if (dateKey <= lastDocDate || dateKey === nowDatekey) continue;

            grouppedData[dateKey] = grouppedData[dateKey] || {};

            let date = new Date(item[0]);
            let hours = date.getHours();
            grouppedData[dateKey][hours] = grouppedData[dateKey][hours] || [];
            grouppedData[dateKey][hours].push(item[3]);
        }

        // count average values for every hour of every day
        for (let dateKey in grouppedData) {
            for (let hours in grouppedData[dateKey]) {
                let values = grouppedData[dateKey][hours];
                let sum = values.reduce((sum, val) => sum + val, 0);
                grouppedData[dateKey][hours] = sum / values.length;
            }
        }

        // count adjusted sums of daily output
        for (let dateKey in grouppedData) {
            grouppedData[dateKey] = Object.values(grouppedData[dateKey]).reduce((sum, val) => {
                // let adjustedValue = val * ADJUSTMENT_CONSTANT;
                // let wattHour = (adjustedValue * adjustedValue) / WATT_HOUR_CONSTANT;
                return sum + val * WATTAGE_CONSTANT;
            }, 0.0);
            grouppedData[dateKey] = Math.round(grouppedData[dateKey]);
        }

        // save all the new counts to database
        for (let dateKey in grouppedData) {
            console.log(`Saving document for day ${dateKey} with power ${grouppedData[dateKey]}`);
            await collection.insertOne({
                device: DEVICE,
                ts: new Date(dateKey + "T00:00:00.000Z"),
                power: grouppedData[dateKey]
            });
        }
    } finally {
        await client.close();
    }
}

functions.http("downloadVoltageData", async (req, res) => {
    if (!MONGO_URI) {
        res.status(500);
        res.send("process.env.MONGODB_URI is not defined!");
    }

    await downloadLatestData();

    res.send({status: 'ok'});
});

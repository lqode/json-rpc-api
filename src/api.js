const https = require("https");
const request = require("request");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
mongoose.connect("mongodb://0.0.0.0:27017/coinsDB", { useNewUrlParser: true});

let started = false;
let entries = [];

let queryDataAll, queryData=[], data;

// METHOD - To start the App
const startApp = async function () {
  await startSystem();
  await rootRoute;
}

// Root route, shows 5 coins
const rootRoute = async function () {
  // set tracked to true for 5 coins, call callApiForEachCoin() to get price, time from coin provider API, add price, last_synced field to these coins in DB
  await trackFirstFive();
  return queryData;
}; 

// METHOD A, get coins info for comma delimited srray of strings (coin names)
const getInfo = async function(params) {
  entries = []; // reset this every time this is called, as we have to return only queried coins
  let data = params.newCoins; 
  // null input
  if (data.length == 0) {
    if ( !queryDataAll || queryDataAll.length === 0) {
      queryDataAll = await Coin.find();
    }
    //If parameter 0 is omitted from the request, or is a string-list of length 0, the result should
    // be a list of all coins available from your system, with the element schema matching the result object schema above.
    entries = queryDataAll;
  }
  else {
    if (data.length > 1) {
    data = data.split(",");
    }

    for (const newCoin of data) {
      // check in database if they exist
      const entry = await Coin.find({ name: newCoin }); 

      // if the entry exists in database
      if (entry[0]) {
        // update tracked in database of this entry
        await Coin.updateOne({ name: entry[0].name }, { tracked: true });
        entries.push(entry[0]);
      }
      else {
        throw new Error("The coin doesn't exist in DB ");
      }
    }
  }
  return entries
};

// METHOD B (coinId: String, datapoints: Number, order: ascending, descending or null)
let historicalData, insertedDatapoints = false;

const getHistoricalData = async function (params) {
  historicalData = [];
  let coinId = params.coinId; 
  let order = params.order;
  let numOfPoints = params.datapoints;

  // check if this coin is tracked, in database. We only have 20 coins, id: 0 to 19
  if ( coinId >= 0 && coinId <= 19) {
    // if nothing in numOfPoints as parametr, return 10
    if ( !numOfPoints || numOfPoints.length==0) {
      numOfPoints = 10;
    }
    // more than available in database
    else if ( numOfPoints > 100 ) {
      numOfPoints = 50;
    }
    // insert the datapoints
    if ( !insertedDatapoints ) {
      await insertHistoricalData();
    }
    const tempData = await Coin.find( { _id: coinId });
    historicalData = tempData[0].datapoints.slice(0, numOfPoints);

    // change order if we want it sorted in ascending order - oldest first
    if ( order === "ascending" ) {
      historicalData = historicalData.reverse();
    }
  }
  return historicalData;
};

// METHOD C
// allows the requestor to instruct your API to enable/disable tracking for a specific coin.
// The system should actually start/stop tracking the coin you specify

const trackingMap = new Map(); // to store coin id's as keys, 
const isTracked = async function(params, res) {
  let coinId = params.coinId; // String
  let track = params.track; // boolean

  const coin = await Coin.find({ _id: coinId });
  const coinName = coin[0].name;
  // if track is set to false, disable tracking
  if ( track === false) {
    trackingMap.delete(coinId); // remove from tracking map
    Coin.updateOne( { _id: coinId }, { tracked: false }); // update in DB
  }
  // if track set to true, add this to trackingMap, start calling API on that list of coins
  else {
    trackingMap.set(coinId, coinName); // add to tracking map
    Coin.updateOne( { _id: coinId }, { tracked: true }); // update in DB
  }
};

// Call trackCoins() every 5 sec
const intervalID = setInterval(trackCoins, 10000, trackingMap);

// Calls API for the coins in trackingMap
async function trackCoins(trackingMap) {
  console.log('trackCoins() ');
  for (const key of trackingMap.keys()) {
    const tempData = await callApiForEachCoin(trackingMap.get(key));
    // add price, lasySynced for it in DB
    await Coin.updateOne({ _id: key }, { price: tempData.data.priceUsd, lastSynced: Date.now()});
  }
}

// function to start system when system is spun up
const startSystem = async function () {
  try {
    data = await callCoinApi();
    // Store the data in mongo DB for first time when it loads up
    await Coin.deleteMany({ id: { $gte: 0 }}); // remove all docuements in this model
    await insertData(data); 
  }
  catch (err) {
    console.log(err);
  }
}

const trackFirstFive = async function() {
  // track only 5 coins
  // 1-5  tracked: true,  price: $$$, last_synced: time   6-20 tracked: false, no price field and last_synced
  let dataFromApi; 
  queryDataAll = await Coin.find();
  const firstFive = await queryDataAll.slice(0,5);
  // set tracked to true for 5 coins
  await Coin.updateMany({ _id: { $lt: 5 } }, { tracked: true });
  
  // sync with system callApiForEachCoin(), and get price, timestamp
  for (const d in firstFive) {
    // call the Coin provider API to get data
    dataFromApi = await callApiForEachCoin(firstFive[d].name);
    // add price, lasySynced for it in DB
    await Coin.updateOne({ name: dataFromApi.data.id }, { price: dataFromApi.data.priceUsd, lastSynced: Date.now()});
    // get the updated data (with price, tracked:true,...), and save it to send as queryData
    let tempdata = await Coin.findOne({ name: dataFromApi.data.id });
    queryData.push(tempdata);  
  }
}

// call the Coin provider API to get data for each coin 
// Eg: Call api.coincap.io/v2/assets/bitcoin
const callApiForEachCoin = function(coinName) {
  return new Promise((resolve, reject) => {
    let apiData;
    let coinData='';
    const options = {
    "method": "GET",
    "hostname": "api.coincap.io", 
    "path": "/v2/assets/"+coinName, 
    "headers": {'Authorization': 'Bearer da36f2d1-a54d-4498-bec9-1025a89a7904'} 
    };

  const request = https.request(options, function(response) {
    response.on("data", function (data) {
      coinData = `${coinData}${data}`;
    });
    response.on("end", function() {
      apiData = JSON.parse(coinData);
      resolve(apiData);
    })
  });
  request.end();
  })
}

let initialData = [];
// Call Coin Cap API to get the information about all assets (coins), return 20 which will be tracked by our DB
const callCoinApi = function() {
  return new Promise((resolve, reject) => {
    const options = {
    "method": "GET",
    "hostname": "api.coincap.io", 
    "path": "/v2/assets", 
    "headers": {'Authorization': 'Bearer da36f2d1-a54d-4498-bec9-1025a89a7904'} 
  };
  const request = https.request(options, function(response) {
    let coinData='';
    response.on("data", function (data) {
      coinData = `${coinData}${data}`
    });

    response.on("end", function() {
      const apiData = JSON.parse(coinData);
      initialData = apiData.data.slice(0,20);
      resolve(initialData);
    })
  });
  request.end();
  })
}

// call the Coin provider API to get historical data for each coin
// Eg: api.coincap.io/v2/assets/bitcoin/history?interval=d1
const getHistoricalDataFromApi = function(coinName) {
  return new Promise((resolve, reject) => {
    let apiData;
    let coinData='';
    const options = {
    "method": "GET",
    "hostname": "api.coincap.io", 
    "path": "/v2/assets/" + coinName + "/history?interval=d1", 
    "headers": {'Authorization': 'Bearer da36f2d1-a54d-4498-bec9-1025a89a7904'} 
    };
  const request = https.request(options, function(response) {
    response.on("data", function (data) {
      coinData = `${coinData}${data}`;
    });
    response.on("end", function() {
      apiData = JSON.parse(coinData);
      resolve(apiData);
    })
  });
  request.end();
  })
}

// create a schema for the data to save in our mongo database
const coinSchema = new mongoose.Schema({
  _id: String,
  name: { 
    type: String,
    required: [true, "Please check the coin entry. No name specified."]
  },
  symbol: {
     type: String,
     required: [true, "Please check the coin entry. No symbol specified."]
  },
  tracked: Boolean,
  price: {
    type: Number,
    min: 0
  },
  lastSynced: Date,
  datapoints: [
    {
      name: String,
      id: Number,
      price: Number,
      synced_on: Date
    }
  ]
});

// use the schema to create a mongoose model
const Coin = mongoose.model("Coin", coinSchema);

// only for initial data, with the list that can be tracked by the system
const insertData = function (coinList) {
  let name, symbol, id, price, tracked, lastSynced;
  for (index in coinList) {
    let document = new Coin ({
      _id: String(index),
      name: coinList[index].id, //.name,
      symbol: coinList[index].symbol,
      tracked: false,
    })
    document.save();
  }
}

// insert historical data
const insertHistoricalData = async function () {
  let dataToPass;
  queryDataAll = await Coin.find();
  // get historical data for all coins
  for (const d in queryDataAll) {
    dataToPass = []; // clear array for each coin
    let coinName = queryDataAll[d].name; // get coin name
    // call the Coin provider API to get data
    dataFromApi = await getHistoricalDataFromApi(coinName);
    // structure dataToPass from dataFromApi 
    for (const index in dataFromApi.data) {
      let currentDocument = {
        name: coinName,
         id: queryDataAll[d]._id,
         price: dataFromApi.data[index].priceUsd,
         synced_on: dataFromApi.data[index].date
      }
      dataToPass.push(currentDocument);
    }

    dataToPass = await dataToPass.reverse(); // to get latest at top
    // add historical data (100 points) to datapoints it in DB
    await Coin.updateOne( { name: coinName }, { datapoints: dataToPass.slice(0,100) }); 
  }
  insertedDatapoints = true; // true after inserting them
}

module.exports = { startApp, getInfo, getHistoricalData, isTracked };


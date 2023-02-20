const express = require("express");
const bodyParser = require("body-parser");
const { JSONRPCServer } = require("json-rpc-2.0");
const api = require(__dirname + "/api.js");

const server = new JSONRPCServer();

// Run this first to start the app, calls some initialization function
server.addMethod("startApp", api.startApp ); 


// METHOD A: getInfo
// serve up coin information for some or all coins tracked by your API
server.addMethod("getInfo", api.getInfo);

// METHOD B: getHistoricalData
// serves up historical coin information for a specific coin
server.addMethod("getHistoricalData", api.getHistoricalData);

// METHOD C: isTracked
// allows the requestor to instruct your API to enable/disable tracking for a specific coin
server.addMethod("isTracked", api.isTracked);

const app = express();
app.use(bodyParser.json()); 

app.post("/", function(req,res) {
	const jsonRPCRequest = req.body;
	server.receive(jsonRPCRequest).then( function (jsonRPCResponse) {
		console.log('jsonRPCResponse ', jsonRPCResponse);
		try {
			// Valid result - method, params are correct
			if (jsonRPCResponse.result) {
				res.json(jsonRPCResponse);
			}
			
			else if (jsonRPCResponse.error) {
				res.status(400).send({
		         code: -32602,
		         message: 'Invalid params'
		      });
			}
			// No return, just a message, Method 3
			else {
				// If result response is absent, METHOD 3
				// send code 200 with 'Ok'
	      	res.status(200).send({
			     message: 'Ok'
			  	});
			}
		}
		// Any Error - Invalid params Eg: wrong coinName, etc.
		catch(err) {
			console.log(err);
			res.status(400).send({
	          code: -32602,
	           message: 'This is an error!'
	      });
		}		
	});
});


app.listen(5000, function() {
	console.log("App is running at port 5000");
});

/* ===================================
 * Crime Analysis Server
 * Khairi Reda
 * caserver.js
 * ===================================
 */

"use strict";

var http = require('http');
var crimesQuery = require('./query.js');
var TimeSeriesDictionary = require('./timeseries.js');

var jsonData = '';

// create server
http.createServer(function(req, res) {
	
	switch (req.url) {

		case '/':
			res.writeHead(200, "OK", {'Content-Type': 'text/html'});
			res.write('<html><head><title>Crime Analysis Server</title></head><body>Welcome!</body></html>');
			res.end();
			break;

		case '/grid':
			if (req.method == "POST") 
			{
				jsonData = '';
				req.on('data', function(chunk) {
					jsonData += chunk.toString();
				});

				req.on('end', function() 
				{
					res.writeHead(200, "OK", {
						'Content-Type': 'text/plan', 
						'Access-Control-Allow-Origin': 'http://localhost:8080'
					});

					// perform a query database query and write the results back to client
					var jsonRequest = JSON.parse(jsonData);

					// see request type
					switch (jsonRequest.query)
					{
						case 'aggregateCrimeCountOverGrid':
							
							// aggregate crime count over grid
							(function (jsonRequest) {
								crimesQuery.aggregateCrimeCountOverGrid(jsonRequest, function(results) 
								{
									
									// tag information about original query
									results.originalQuery = 
									{
										signalAggregate: 	jsonRequest.signalAggregate,
										limitYear: 			jsonRequest.limitYear,
										yearRange: 			jsonRequest.yearRange,
										crimeType:  		jsonRequest.crimeType
									};

									var strResults = JSON.stringify(results);
									console.log("\tData size: " + strResults.length);
									res.write(strResults);
									res.end();
								});
							})(jsonRequest);
							break;
					}

				});
			}
			else
			{
				console.log("received /grid OTHER request (not sure what to do here).");
				res.writeHead(405, "Method not supported", {'Content-Type': 'text/html'});
				res.write('<html><head><title>Crime Analysis Server</title></head><body>You must use POST to /grid.</body></html>');
				res.end();
			}
			break;

		default:
			res.writeHead(404, "Not found", {'Content-Type': 'text/html'});
			res.write('<html><head><title>Crime Analysis Server</title></head><body>Not found.</body></html>');
			res.end();
	};

}).listen(12345);

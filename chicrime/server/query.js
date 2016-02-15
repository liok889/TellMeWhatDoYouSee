/* ===================================
 * Crime Analysis Server
 * Khairi Reda
 * query.js
 * ===================================
 */
"use strict";

// requires
var crypto = require('crypto');
var HashMap = require('hashmap');
var Analysis = require('./analysis.js');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

// constant
var URL = 'mongodb://localhost:27017/TellMeWhatDoYouSee';

var cache = null;
var md5Hash = null;

module.exports = {

	aggregateCrimeCountOverGrid: function(query, callback)
	{
		// remove grid (we don't need that)
		query.grid = undefined;

		// initialize cache if needed
		if (!cache) {
			cache = new HashMap();
		}

		// hash the query and see if it's in the cache
		var md5Hash = crypto.createHash('md5');
		var _queryHash = md5Hash.update(JSON.stringify(query)).digest('hex');
		var cachedResults = cache.get(_queryHash);
		
		if (cachedResults)
		{
			// callback and return data
			console.log("* Found in cache.");
			callback(cachedResults);
		}
		else
		{
			// connect and issue aggreaget query
			(function(queryHash, query, callback) { 
				connectToDB(function(db) 
				{
					readPreviousResults(db.collection('analyses'), query, function(data) 
					{
						if (data)
						{
							// yay, we have previous results
							callback(data.results);
							
							// close database
							db.close();
							
							// store them into memory cache
							if (!cache.get(queryHash)) {
								cache.set(queryHash, data.results);
							}
						}
						else
						{
							// construct a MongoDB aggregate query
							var mongoQuery = constructAggregateQuery(query);

							// perform query and collect results
							executeAndCompile(db.collection('crimes'), mongoQuery.N, mongoQuery.stages, query, 
								function (data, sums, total, listOfSeries)
								{	
									// close database connection
									db.close();

									// perform analysis
									var analysis = new Analysis(data, sums, total / listOfSeries.length, listOfSeries);
										
									analysis.filter();
									analysis.calcSimilarityMatrix();
									analysis.projectMDS();

									// collect results
									var results = {
										timeseries: 		data,
										aggregate: 			sums,
										simMatrix: 			analysis.getSimMatrix(),
										tsIndex: 			analysis.getTSIndex(),
										mdsPositions: 		analysis.getMDSPositions()
									};

									// callback and return data
									callback(results);

									// store into memory cache
									if (!cache.get(queryHash)) {
										cache.set(queryHash, results);
									}
									
									// store analyses into database
									query.grid = undefined;
									query.results = results;

									(function(resultToStore)
									{
										connectToDB(function(dbConn) {
											dbConn.collection('analyses').insertOne(resultToStore, function(err, result) 
											{
												assert.equal(err, null);
												dbConn.close();
											});
										});
									})(query);
								}
							);
						}
					});
				});
			}) (_queryHash, query, callback);
		}
	}
};

function readPreviousResults(collection, query, callback)
{
	collection.findOne(query, function(err, document) {
		assert.equal(err, null);
		if (document) {
			console.log("Found document with previous result!");
		}
		else
		{
			console.log("No previous result found");
		}
		callback(document);
	})	
}

function executeAndCompile(_collection, _N, _stages, _query, _callback)
{
	// execute the aggregate onto the database
	(function(collection, N, stages, query, callback) 
	{
		collection.aggregate( stages, {allowDiskUse: true} ).toArray(function(err, docs) 
		{
			// check for error
			assert.equal(null, err);
			console.log("Received: " + docs.length + " docs from MongoDB.");
					
			// loop through the documents and put them in [row][col][timeseries] format
			var 
				data = [], 				// data for the time series
				sums = [], 				// sums for each cell
				total = 0, 				// sums for all the cells
				listOfSeries = [];		// list of time series that have actual data

			// loop through all returned documentes
			for (var i = 0, len = docs.length; i < len; i++) 
			{
				var doc = docs[i];
				var r = +doc._id.rowNum; if (query.cellOffset.lat < 0) r = Math.max(0, query.gridRows -1 + r);
				var c = +doc._id.colNum; if (query.cellOffset.lon < 0) c = Math.max(0, query.gridCols -1 + c);
				var tIndex = doc._id.tIndex ? +doc._id.tIndex : 0;
						
				if (r < 0 || c < 0) {
					console.log("Warning: negative grid indices: " + r + ", " + c + ", grid: " + query.gridRows + ", " + query.gridCols);
				}
				if (!data[r]) {
					data[r] = [];
					sums[r] = [];
				}

				if (!data[r][c]) 
				{
					// initialize time series with empty counts
					var arr = new Array(N);
					for (var j = 0; j < N; j++) { arr[j] = 0; }
							
					data[r][c] = arr;
					sums[r][c] = 0;
					listOfSeries.push( {
						data: arr,
						r: r, c: c 
					});
				}

				var v = +doc.crimeCount;
				data[r][c][tIndex] = v;
				sums[r][c] += v;
				total += v;
			}

			callback(data, sums, total, listOfSeries);
		});
	})(_collection, _N, _stages, _query, _callback);
}

function constructAggregateQuery(query)
{
	// see if we're filtering by a specific year
	var match = { $and: []};

	if (query.limitYear) 
	{
		match.$and.push({ 
			timestamp: {$gte: new Date(query.limitYear, 1, 1), $lt: new Date(query.limitYear+1, 1, 1) }
		});
	} else if (query.yearRange) {
		match.$and.push({ 
			timestamp: {$gte: new Date(query.yearRange[0], 1, 1), $lt: new Date(query.yearRange[1]+1, 1, 1) }
		});
	}

	if (query.crimeType && query.crimeType !== "ALL") 
	{
		
		if (Array.isArray(query.crimeType)) {
			var OR = [];
			for (var i=0, len=query.crimeType.length; i<len; i++) {
				OR.push({"crimeType": query.crimeType[i]});
			}
			match.$and.push({$or: OR});
		}
		else
		{
			match.$and.push({
				crimeType: query.crimeType
			});
		}
	}

	// lat, lon limit
	match.$and.push({ lat: {$gte: query.gridMin.lat, $lte: query.gridMax.lat} });
	match.$and.push({ lon: {$gte: query.gridMin.lon, $lte: query.gridMax.lon} });

	// now project the index of the cell (in both rows and grid numbers, relative to the year )
	var project = {
		row: {$divide: [{$subtract: ["$lat", query.gridMin.lat]}, query.cellOffset.lat]},
		col: {$divide: [{$subtract: ["$lon", query.gridMin.lon]}, query.cellOffset.lon]},
	};

	// group elements by their integer rounded row and col
	var group = {
		_id: {
			rowNum: {$subtract: ["$row", {$mod: [ "$row", 1 ]}]},
			colNum: {$subtract: ["$col", {$mod: [ "$col", 1 ]}]}
		},
			crimeCount: { $sum: 1}
	};

	var N = 0;	// length of time series
	switch (query.signalAggregate)
	{
	// Weekly aggregation, every 24 hours period
	case "weekly":
		project.dayOfWeek = {$mod: [{$add: [{$dayOfWeek: "$timestamp"}, 5]}, 7]};
		project.hourOfDay = {$hour: "$timestamp"};
		group._id.tIndex = {$add: [{$multiply: ["$dayOfWeek", 24]}, "$hourOfDay"]};

		// 7 days in a week * 24 hours in a day (hourly resolution)
		N = 7*24;
		break;

	case "monthly":
		project.quarterOfDay = {$divide: [{$hour: "$timestamp"}, 6]};
		project.dayOffset = {$multiply: [{$subtract: [{$dayOfMonth: "$timestamp"}, 1]}, 4]};
		group._id.tIndex = {$add: [
			"$dayOffset",
			{$subtract: ["$quarterOfDay", {$mod: ["$quarterOfDay", 1]}]}
		]};

		// 31 days in a month * 4 quarters in a day (6 hours resolution)
		N = 31 * 4
		break;

	case "yearly":
		project.dayOfYear = {$subtract: [{$dayOfYear: "$timestamp"}, 1]};
		group._id.tIndex = "$dayOfYear";

		// 366 days in a year
		N = 366;
		break;

	case "daily":
		project.hourOfDay = {$hour: "$timestamp"};
		project.minute = {$minute: "$timestamp"};
		project.halfHourOffset = {$add: [
			{$multiply: [2, {$hour: "$timestamp"}]},
			{$divide: [
				{$subtract: [
					{$minute: "$timestamp"}, 
					{$mod: [{$minute: "$timestamp"}, 30]}
				]}, 30
			]}
		]};
		group._id.tIndex = "$halfHourOffset";

		// every 30 minutes of the day
		N = 24 * 2;
		break;

	// aggregate everything to a single point
	case "total":
		N = 1;
	}

	// now put all those combines into the aggregate function
	var stages = [ {$match: match}, {$project: project}, {$group: group} ];
	
	// print out some info
	console.log("Aggregate query:")
	console.log("\twarp: " + query.signalAggregate);
	console.log("\trange: " + query.yearRange);
	if (query.crimeType) {
		console.log("\tcrime type: " + query.crimeType);
	}

	return {
		stages: stages,
		N: N
	};
}

function connectToDB(callback) 
{
	MongoClient.connect(URL, function(err, db) {
		assert.equal(null, err);

		// callback and give the DB connection
		callback(db);
	});
}

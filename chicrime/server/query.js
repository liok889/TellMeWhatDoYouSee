/* ===================================
 * Crime Analysis Server
 * Khairi Reda
 * query.js
 * ===================================
 */
"use strict";

var MongoClient = require('mongodb').MongoClient, assert = require('assert');
var URL = 'mongodb://localhost:27017/TellMeWhatDoYouSee';
var TimeSeriesDictionary = require('./timeseries.js');

module.exports = {

	aggregateCrimeCountOverGrid: function(query, callback)
	{
		// connect and issue aggreaget query
		connectToDB(function(db) 
		{
			var crimes = db.collection('crimes');
			
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
				console.log("aggregate timeseries by: " + "weekly trends");
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
			/*
			console.log("\tcellOffset: " + query.cellOffset.lat + ", " + query.cellOffset.lon);
			console.log("\tgridMin: " + query.gridMin.lat + ", " + query.gridMin.lon);
			console.log("\tgridMax: " + query.gridMax.lat + ", " + query.gridMax.lon);
			*/

			// execute the aggregate onto the database
			(function(N, query) {
				crimes.aggregate( stages, {allowDiskUse: true} ).toArray(function(err, docs) 
				{
					// check for error
					assert.equal(null, err);
					console.log("Received: " + docs.length + " docs from DB.");
					
					// loop through the documents and put them in [row][col][timeseries] format
					var 
						data = [], 			// data for the time series
						sums = [], 			// sums for each cell
						total = 0, 			// sums for all the cells
						cellCount = 0,		// number of cells
						series = [];		// list of time series that have actual data

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
							series.push( {
								data: arr,
								r: r, c: c 
							});
						}

						var v = +doc.crimeCount;
						data[r][c][tIndex] = v;
						sums[r][c] += v;
						total += v;
					}

					// make a time series
					console.log("total: " + total);
					var ret = makeTimeSeries(data, sums, total / series.length, series);
					
					// callback
					callback( {
						timeseries: 	data,
						aggregate: 		sums,
						simMatrix: 		ret.simMatrix,
						tsIndex: 		ret.tsIndex 
					});
				
					// close database
					db.close();

				});
			}) (N, query);

		});
	}
};

var ALPHABET_SIZE = 4;
var WORD_SIZE = 8;
var WINDOW_SIZE = 40;//88; //96;
var MAX_DEVIATION = 3;			// max deviation from standard deviation for each cell
var MAX_LOG_STRESS = 1.75;

// generates a matrix from results that are indexed by rows and columns
function makeTimeSeries(data, sums, mean, series)
{
	// keep track of processing time
	var startTime = new Date();
	var filtered = 0;
	var maxIncidence = 0;

	// calculate standard deviation for
	// sums of series in each individual cell
	var std = 0;
	for (var i = 0, len = series.length; i < len; i++) 
	{
		var s = series[i];
		var sum = sums[s.r][s.c];
		var diff = sum - mean;
		std += diff*diff;

		if (sum > maxIncidence) {
			maxIncidence = sum;
		}
	}
	std = Math.sqrt(std / series.length);

	var logStress = Math.log10(maxIncidence);
	var minFilter = 0;
	if (logStress > MAX_LOG_STRESS) {
		minFilter = Math.floor(Math.pow(10, logStress-MAX_LOG_STRESS));
	}
	console.log("Data characteristics:");
	console.log("=====================");
	console.log("\tN: " + series.length);
	console.log("\tMean: " + mean.toFixed(3));
	console.log("\tSTD: " + std.toFixed(3));
	console.log("\tMax: " + maxIncidence);
	console.log("\tFilter: " + minFilter);


	// construct a time series dictionary
	var tsDictionary = new TimeSeriesDictionary(ALPHABET_SIZE, WORD_SIZE, WINDOW_SIZE);
	
	// loop through the time series again, adding only the onles that are not more than
	// 3 x standard deviation away from the mean 
	var tsIndex = [];
	var listOfSeries = [];
	for (var i = 0, len = series.length; i < len; i++) 
	{
		var s = series[i];
		var sum = sums[s.r][s.c];
		var timeseries = data[s.r][s.c];

		var stdDiff = Math.abs(sum - mean) / std;
		//console.log("\t\t std diff: " + stdDiff.toFixed(3) + ", count: " + sums[s.r][s.c]);
		if (sum < minFilter || !Array.isArray(timeseries)) 
		{
			// remove time series from our calculations
			data[s.r][s.c] = undefined;
			sums[s.r][s.c] = undefined;
			filtered++;
		}
		else
		{
			listOfSeries.push(s);
			//tsDictionary.addTimeSeries(timeseries);
			//tsIndex.push([s.r, s.c]);
		}
	}

	// put in distribution measurement
	for (var i=0, N=listOfSeries.length; i<N; i++) 
	{
		var s = listOfSeries[i];
		var timeseries = data[s.r][s.c];
		tsDictionary.addToDistribution(timeseries);
	}

	// calculate equi-probably break points
	tsDictionary.calcEquiprobableBreaks();

	// add time series to similarity analysis
	for (var i=0, N=listOfSeries.length; i<N; i++) {
		var s = listOfSeries[i];
		var timeseries = data[s.r][s.c];
		tsDictionary.addTimeSeries(timeseries);
		tsIndex.push([s.r, s.c]);
	}

	// calculate similarity matrix
	var simMatrix = tsDictionary.calcSimilarityMatrix();
	
	// measure time for the whole thing
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("Done. Time series analysis took: " + processTime.toFixed(1) + " seconds.");
	console.log("Removed " + filtered + " series.");
	
	return {
		simMatrix: simMatrix,
		tsIndex: tsIndex,
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





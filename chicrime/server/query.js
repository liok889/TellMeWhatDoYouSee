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
			//console.log("\tlimit year: " + query.limitYear);
			console.log("\trange: " + query.yearRange);
			console.log("\tcellOffset: " + query.cellOffset.lat + ", " + query.cellOffset.lon);
			console.log("\tgridMin: " + query.gridMin.lat + ", " + query.gridMin.lon);
			console.log("\tgridMax: " + query.gridMax.lat + ", " + query.gridMax.lon);

			// execute the aggregate onto the database
			(function(N, query) {
				crimes.aggregate( stages, {allowDiskUse: true} ).toArray(function(err, docs) 
				{
					// check for error
					assert.equal(null, err);
					console.log("\t Received: " + docs.length + " documents from aggregate function.");
					
					// do the callback
					callback( makeTimeSeries(N, docs, query.gridRows, query.gridCols, query.cellOffset) );
				
					// close database
					db.close();

				});
			}) (N, query);

		});
	}
};

var ALPHABET_SIZE = 4;
var WORD_SIZE = 8;
var WINDOW_SIZE = 96;

// generates a matrix from results that are indexed by rows and columns
function makeTimeSeries(N, docs, gridRows, gridCols, cellOffset)
{
	var data = [];
	var maxRow = Number.MIN_VALUE;
	var maxCol = Number.MIN_VALUE;

	// create a dictionary of time series
	var startTime = new Date();
	var tsDictionary = new TimeSeriesDictionary(ALPHABET_SIZE, WORD_SIZE, WINDOW_SIZE);

	// loop through all returned documentes
	for (var i = 0, len = docs.length; i < len; i++) 
	{
		var doc = docs[i];
		var r = +doc._id.rowNum; if (cellOffset.lat < 0) r = gridRows-1 + r;
		var c = +doc._id.colNum; if (cellOffset.lon < 0) c = gridCols-1 + c;
		var tIndex = doc._id.tIndex ? +doc._id.tIndex : 0;

		//console.log("document=> r: " + r + ", c: " + c + ", tIndex: " + tIndex + ", count: " + doc.crimeCount)
		
		// keep track of the max column/row index
		maxRow = Math.max(r, maxRow);
		maxCol = Math.max(c, maxCol);


		if (!data[r]) data[r] = [];
		if (!data[r][c]) 
		{ 
			var arr = new Array(N);
			for (var j = 0; j < N; j++) { arr[j] = 0; }
			data[r][c] = arr;
		}
		data[r][c][tIndex] = +doc.crimeCount;
	}

	// count time-series aggregate (heatmap) and analyze the time-series 
	var aggregate = [];
	var tsIndex = [];
	for (var i = 0, len = data.length; i < len; i++) 
	{
		if (!data[i]) continue;
		
		var row = data[i];
		var aggRow = [];

		for (var j = 0, len2 = row.length; j < len2; j++) 
		{
			if (!row[j]) continue;
			var timeseries = row[j];
			var total = 0;

			// if no timeseries data for this block, just mark as having a zero count
			// also update the data record and put an empty array instead of a non-exsiting object
			
			if (Array.isArray(timeseries)) 
			{
				if (timeseries.length > 1) 
				{
					// add this time series to the dictionary
					var ret = tsDictionary.addTimeSeries(timeseries);
					tsIndex.push([i, j]);
				}

				for (var k=0, len3=timeseries.length; k < len3; k++) {
					total += isNaN(timeseries[k]) ? 0 : +timeseries[k];
				}
			}
			aggRow[j] = total;
		}
		aggregate[i] = aggRow;
	}

	console.log("Calculating similarity for: " + tsDictionary.getTimeSeriesCount() + " series...");
	var simMatrix = tsDictionary.calcSimilarityMatrix();
	
	// measure time for the whole process
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("Done. Time series analysis took: " + processTime.toFixed(1) + " seconds.");
	
	return {
		timeseries: data, 
		simMatrix: simMatrix,
		tsIndex: tsIndex,
		aggregate: aggregate
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





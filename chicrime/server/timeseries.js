 /* ========================================================================================
 * Time series similarity anaylsis
 *
 * Based on algorithm proposed by: Lin & Li:
 * "Finding Structural Similarity in Time Series Data Using Bag-of-Patterns Representation"
 * In M. Winslett (Ed.): SSDBM 2009, LNCS 5566, pp. 461–477, 2009, Springer-Verlag
 *
 * Implementation in JS/Node by Khairi Reda
 * timeseries.js
 * ========================================================================================
 */
"use strict";

var HashMap = require("hashmap");
var Timeseries = require("../src/ts.js");

var EQUIPROBABLE_BREAKS = false;
var P_HIST_BINS = 200;

function TimeSeriesDictionary(alphabetSize, wordSize, windowSize)
{
	this.a = alphabetSize;
	this.wordSize = wordSize;
	this.windowSize = windowSize;

	// Find the equiprobably break points in a Gaussian distribution
	// Note: for this implementation we'll assume a fixed alphabet of a=5 (suggested by algoritm authors)
	// with the following breakpoints
	/*
	this.a = 4;
	this.breakPoints = [-0.67, 0, 0.67];
	*/

	this.a = 5;
	this.breakPoints = [ -0.84, -0.25, 0.25, 0.84 ];

	// create a dictionary
	this.dictionary = new HashMap();
	this.timeSeriesCount = 0;
	this.meanNormalizedSeries = [];
}

TimeSeriesDictionary.prototype.getTimeSeriesCount = function() {
	return this.timeSeriesCount;
}

TimeSeriesDictionary.prototype.addTimeSeries = function(data)
{
	var id = this.timeSeriesCount++;

	// segment this time series, and get local bag of strings
	var bagOfStrings = this.getBagOfStrings(data);
	
	// add to global bag of strings
	(function(dictionary, BoS) 
	{
		BoS.forEach(function(value, word) 
		{
			var wordFreq = dictionary.get(word);
			if (!wordFreq) 
			{
				wordFreq = [{id: id, frequency: value, frequency2: value*value}];
				dictionary.set(word, wordFreq);
			}
			else {
				wordFreq.push({id: id, frequency: value, frequency2: value*value});
			}
		});
	})(this.dictionary, bagOfStrings);
	
	return {
		id: id,
		strings: bagOfStrings 
	};
}

var WORK=0;
TimeSeriesDictionary.prototype.calcSimilarityMatrix = function()
{
	// initialize a similarity matrix with 0s
	var nn = this.timeSeriesCount;
	var matrix = new Array(nn);
	for (var i = 0; i < nn; i++) 
	{
		var row = new Array(i);
		for (var j = 0; j < i; j++) 
		{
			row[j] = 0;
		}
		matrix[i] = row;
	}

	// measure amount of work done (for verfication purposes)
	WORK=0;

	(function(theMatrix, n, dictionary) 
	{
		// loop through all words in the dictionary
		dictionary.forEach(function(commons, word) 
		{
			// loop through time series that have this word as a common
			commons.forEach( function(element) 
			{
				var id = element.id;
				var penalty = element.frequency2;

				// loop through all time series, adding a penalty for them not having that word
				for (var i = 0; i < id; i++) 
				{
					theMatrix[id][i] -= penalty;
					WORK++;
				}
				for (var i = id+1; i < n; i++) 
				{
					theMatrix[i][id] -= penalty;
					WORK++;
				}
			});

			// now loop within the commons list, correcting for overpenalty
			for (var i=1, len=commons.length; i < len; i++) 
			{
				var c1 = commons[i];
				var x	= c1.id;
				var xFreq  = c1.frequency;
				var xFreq2 = c1.frequency2;

				for (var j=0; j<i; j++) 
				{
					var c2 = commons[j];
					var y = c2.id;
					var diff = xFreq - c2.frequency;

					theMatrix[x][y] = theMatrix[x][y]
						+ (xFreq2 + c2.frequency2) 		// correction for over-penalty
						- diff*diff;					// actual penalty for mismatch
					WORK++;
				}
			}
		});

	})(matrix, this.timeSeriesCount, this.dictionary);
	
	console.log("similarity calculation work: " + WORK + " accesses to matrix");
	return matrix;
}

TimeSeriesDictionary.prototype.addTimeSeriesEDR = function(data)
{
	this.meanNormalizedSeries.push(new Timeseries(data, true));
}

TimeSeriesDictionary.prototype.calcSimilarityMatrixEDR = function()
{
	var allSeries = this.meanNormalizedSeries;
	var nn = allSeries.length;
	var matrix = new Array(nn);
	for (var i = 0; i < nn; i++) 
	{
		var t1 = allSeries[i];
		var row = new Array(i);

		for (var j = 0; j < i; j++) 
		{
			var t2 = allSeries[j];
			row[j] = t2.distanceEDR(t1);
		}
		matrix[i] = row;
	}

	return matrix;
}

TimeSeriesDictionary.prototype.addToDistribution = function(timeseries)
{
	if (!EQUIPROBABLE_BREAKS) {
		return;
	}
	else
	{
		// initialize distribution
		if (!this.histogram) {
			this.histogram = new Array(P_HIST_BINS);
			for (var i=0; i<P_HIST_BINS; i++) {
				this.histogram[i] = 0;
			}
			this.histCount = 0;
			this.histList = [];
			this.histMin = Number.MAX_VALUE;
			this.histMax = -Number.MAX_VALUE;
		}

		for (var i=0, N=timeseries.length; i<N; i++) 
		{
			var v = timeseries[i];
			if (v > this.histMax) {
				this.histMax = v;
			}
			else if (v < this.histMin) {
				this.histMin = v;
			}
		}
		this.histCount++;
		this.histList.push(timeseries);
	}
}

TimeSeriesDictionary.prototype.calcEquiprobableBreaks = function()
{
	if(!EQUIPROBABLE_BREAKS) {
		return;
	}
	else
	{
		var histogram = this.histogram;
		var histMin = this.histMin;
		var histMax = this.histMax;
		var histList = this.histList;
		var histDiff = histMax - histMin;
		var histStep = histDiff / P_HIST_BINS;
		var totalHits = 0;

		// loop through hist list
		for (var i=0, K=histList.length; i<K; i++) 
		{
			var timeseries = histList[i];
			for (var j=0, N=timeseries.length; j<N; j++) 
			{
				var v = (timeseries[j] - histMin) / histDiff;
				var bin = Math.min(Math.floor(v * (P_HIST_BINS)), P_HIST_BINS-1);
				histogram[bin]++;
			}
		}

		// total hits
		for (var i=0, N=histogram.length; i<N; i++) {
			totalHits += histogram[i];
		}

		// calculate equiprobably breakpoints
	}
}

TimeSeriesDictionary.prototype.getBagOfStrings = function(data) 
{
	// moving window
	var windowSize = this.windowSize;
	var windowCount = data.length - windowSize + 1;
	if (windowSize > data.length) 
	{
		/*
 		console.log("WARNING: window size (" + windowSize + ") greater than length of time series (" + data.length + ")");
 		console.log("Adjusting time series so that is equal to the length of time series");
 		*/
 		windowSize = data.length;
 		windowCount = 1;
	}

	var stepSize = windowSize / this.wordSize;
	if (!isInteger(stepSize)) 
	{
		/*
		console.log("WARNING: window size is not divisible by word size.");
		console.log("Some oddities may occur (shouldn't be too bad though)...");
		*/
		stepSize = Math.ceil(stepSize);
	}

	// running mean, keep track of it
	var m = 0;
	for (var i = 0; i < windowSize; i++) {
		m += data[i];
	}

	// bag of strings
	var lastString = null;
	var localBag = new HashMap();

	// moving window over the time series
	for (var w = 0; w < windowCount; w++) 
	{
		// calculate standard deviation
		var index = w, mean = m / windowSize, delta = 0;
		for (var i=0; i < windowSize; i++, index++) 
		{
			var diff = data[index] - mean;
			delta += diff*diff;
		}
		var std = Math.sqrt( delta / windowSize );

		// z-normalize time series;
		var nData = [];
		index = w;
		for (var i=0; i < windowSize; i++, index++) {
			nData.push( (data[index] - mean) / std );
		}

		// update the running mean
		if (w < windowCount-1) {
			m = m - data[w] + data[index];
		}

		// this will hold the resulting string for the current window
		var str = "";

		// work on the normalized data
		for (var j=0, len = nData.length; j < len; j+=stepSize) 
		{
			var avg = 0, k = 0, c = 0;
			for (; (k < stepSize) && (j+k < len); k++) {
				avg += nData[j+k];
			}
			avg /= k;

			// look up the character
			for (c=0; c < this.breakPoints.length; c++) {
				if (avg < this.breakPoints[c]) {
					break;
				}
			}

			// transcribe to a letter starting from 'a'
			str += (String.fromCharCode(97 + c));	// 97 is the ASCII/Unicode for 'a'
		}

		// add string to bag
		if (!(str === lastString)) 
		{
			var b = localBag.get(str);
			if (b) {
				b++;
			} else { b = 1; }
			localBag.set(str, b);
			lastString = str;
		}
	}

	return localBag;
}

function isInteger(x) {
	return x % 1 === 0;
}

module.exports = TimeSeriesDictionary;

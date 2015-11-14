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

function TimeSeriesDictionary(alphabetSize, wordSize, windowSize)
{
	this.a = alphabetSize;
	this.wordSize = wordSize;
	this.windowSize = windowSize;

	// Find the equiprobably break points in a Gaussian distribution
	// Note: for this implementation we'll assume a fixed alphabet of a=4 (suggested by algoritm authors)
	// with the following breakpoints
	this.a = 4;
	this.breakPoints = [-0.67, 0, 0.67];

	// create a dictionary
	this.dictionary = new HashMap();
	this.timeSeriesCount = 0;
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
				wordFreq = [{id: id, frequency: value}];
				dictionary.set(word, wordFreq);
			}
			else {
				wordFreq.push({id: id, frequency: value});
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
	// make a similarity matrix
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
	WORK=0;

	(function(theMatrix, n, dictionary) 
	{
		// loop through all words in the dictionary
		dictionary.forEach(function(commons, word) 
		{
			// loop through time series within that word occurence list
			commons.forEach( function(element) {

				// loop through all time series
				var id = element.id;
				var freq = element.frequency;

				for (var i = 0; i < n; i++) 
				{
					if (i < id) {
						theMatrix[id][i] -= freq*freq;
					} 
					else if (i > id) {
						theMatrix[i][id] -= freq*freq;
					}
					WORK++;
				}
			});

			for (var i=1, len=commons.length; i < len; i++) 
			{
				for (var j=0; j<i; j++) 
				{
					var c1 = commons[i], c2 = commons[j];
					var x = c1.id;
					var y = c2.id;

					var xFreq = c1.frequency;
					var yFreq = c2.frequency;
					var diff = xFreq - yFreq;

					theMatrix[x][y] += xFreq*xFreq + yFreq*yFreq;
					theMatrix[x][y] -= diff*diff;
					WORK++;
				}
			}
		});
		console.log("similarity calculation work: " + WORK);
	})(matrix, this.timeSeriesCount, this.dictionary);

	return matrix;
}

TimeSeriesDictionary.prototype.getBagOfStrings = function(data) 
{
	// moving window
	var windowCount = data.length - this.windowSize + 1;
	var windowSize = this.windowSize;
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

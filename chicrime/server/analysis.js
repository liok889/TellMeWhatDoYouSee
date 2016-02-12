/* ===================================
 * Crime Analysis Server
 * Khairi Reda
 * analysis.js
 * ===================================
 */

"use strict";

// requires
var Numeric = require('./numeric-1.2.6.js');
var TimeSeriesDictionary = require('./timeseries.js');


// constants
var ALPHABET_SIZE	= 4;
var WORD_SIZE		= 8;
var WINDOW_SIZE		= 40;			//88; //96;
var MAX_DEVIATION	= 3;			// max deviation from standard deviation for each cell
var MAX_LOG_STRESS 	= 1.75;			// maximum log strength


function Analysis(data, sums, mean, listOfSeries)
{
	this.data = data;
	this.sums = sums;
	this.mean = mean;
	this.listOfSeries = listOfSeries;
}

Analysis.prototype.getTimeseries = function()
{
	return this.data;
}

Analysis.prototype.getSums = function()
{
	return this.sums;
}

Analysis.prototype.getMean = function()
{
	return this.mean;
}

Analysis.prototype.getListOfSeries = function()
{
	return this.listOfSeries;
}

Analysis.prototype.getTSIndex = function()
{
	var tsIndex = [];
	var series = this.listOfSeries;
	for (var i=0, N=series.length; i<N; i++) {
		var s = series[i];
		tsIndex.push([s.r, s.c]);
	}
	return tsIndex;
}

// analytic products
Analysis.prototype.getSimMatrix = function()
{
	return this.simMatrix;
}

Analysis.prototype.getMDSPositions = function()
{
	return this.mdsPositions;
}

Analysis.prototype.filter = function()
{
	var filtered = 0;
	var maxIncidence = 0, minIncidence = Number.MAX_VALUE;

	// calculate standard deviation for
	// sums of series in each individual cell
	var std = 0;
	var series = this.listOfSeries;

	for (var i = 0, len = series.length; i < len; i++) 
	{
		var s = series[i];
		var sum = this.sums[s.r][s.c];
		var diff = sum - this.mean;
		std += diff*diff;

		if (sum > maxIncidence) {
			maxIncidence = sum;
		}
		if (sum < minIncidence) {
			minIncidence = sum;
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
	console.log("\tN:\t\t" + series.length);
	console.log("\tMean:\t\t" + this.mean.toFixed(3));
	console.log("\tSTD:\t\t" + std.toFixed(3));
	console.log("\tMin/Max:\t" + minIncidence + ", " + maxIncidence);
	console.log("\tFilter:\t\t" + minFilter);

	// loop through the time series again, adding only the onles that are not more than
	// 3 x standard deviation away from the mean 
	var filteredSeries = [];
	for (var i = 0, len = series.length; i < len; i++) 
	{
		var s = series[i];
		var sum = this.sums[s.r][s.c];
		var timeseries = this.data[s.r][s.c];
		//var stdDiff = Math.abs(sum - this.mean) / std;
		
		if ( sum < minFilter || !Array.isArray(timeseries) ) 
		{
			// remove time series from our calculations
			this.data[s.r][s.c] = undefined;
			this.sums[s.r][s.c] = undefined;
			filtered++;
		}
		else
		{
			filteredSeries.push(s);
		}
	}

	console.log("Removed " + filtered + " series.");
	this.listOfSeries = filteredSeries;
}

// generates a similarity matrix (for times seires) from results that are indexed by rows and columns
Analysis.prototype.calcSimilarityMatrix = function()
{
	// keep track of processing time
	var startTime = new Date();

	// construct a time series dictionary
	var tsDictionary = new TimeSeriesDictionary(
		ALPHABET_SIZE, 
		WORD_SIZE, 
		WINDOW_SIZE
	);

	// put in distribution measurement
	/*
	for (var i=0, N=this.listOfSeries.length; i<N; i++) 
	{
		var s = this.listOfSeries[i];
		var timeseries = this.data[s.r][s.c];
		tsDictionary.addToDistribution(timeseries);
	}

	// calculate equi-probably break points
	tsDictionary.calcEquiprobableBreaks();
	*/

	// add time series to similarity analysis
	for (var i=0, N=this.listOfSeries.length; i<N; i++) 
	{
		var s = this.listOfSeries[i];
		var timeseries = this.data[s.r][s.c];
		tsDictionary.addTimeSeriesEDR(timeseries);
	}

	// calculate similarity matrix
	this.simMatrix = tsDictionary.calcSimilarityMatrixEDR();
	
	// measure time for the whole thing
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("Time series analysis took: " + processTime.toFixed(1) + " seconds.");	
}

Analysis.prototype.projectMDS = function(dimensions)
{
	console.log("Projecting MDS...");
	var startTime = new Date();
	var distances = processRawMatrix(this.simMatrix);
	dimensions = dimensions || 2;
	
	// square distances
	var M = numeric.mul(-0.5, numeric.pow(distances, 2));

	// calculate row, column, and whole means
	var N = M.length;
	var rowMeans = calcRowMeans(M);
	var colMeans = calcColMeans(M);
	var totalMean = calcMean(rowMeans);

	for (var i = 0; i < M.length; ++i) {
		for (var j =0; j < M[0].length; ++j) {
			M[i][j] += totalMean - rowMeans[i] - colMeans[j];
		}
	}

	// take the SVD of the double centred matrix, and return the
	// points from it
	var ret = numeric.svd(M),
	eigenValues = numeric.sqrt(ret.S);

	// measure time
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("MDS projection took: " + processTime.toFixed(1) + " seconds.");

	this.mdsPositions = ret.U.map(function(row) {
		return numeric.mul(row, eigenValues).splice(0, dimensions);
	});
}

// helper functions
function pow(x, y)
{
	return Math.pow(x, y);
}

// processes raw similarity / distance matrix received from backend
//  1) makes a symmetric square matrix out of a traingular one
//  2) makes sure matrix elements are ositive integers to reflect dis-similarity  
function processRawMatrix(matrix)
{
	var n = matrix.length;
	var distanceM = [];
	distanceM.length = n;
	
	// init distance matrix
	for (var i = 0; i < n; i++) 
	{
		var arr = []; arr.length;
		distanceM[i] = arr;
		distanceM[i][i] = 0;
	}

	for (var i = 0; i < n; i++) 
	{
		for (var j = i+1; j < n; j++) 
		{
			var v = Math.abs(matrix[j][i]);
			distanceM[i][j] = v;
			distanceM[j][i] = v;			
		}
	}
	return distanceM;
}

function calcRowMeans(M)
{
	var N = M.length;
	var means = [];

	for (var i=0; i<N; i++) {

		var t=0;
		for (var j=0; j<N; j++)
		{
			t += M[i][j]
		}
		means.push(t/N);
	}
	return means;
}

function calcColMeans(M)
{
	var N = M.length;
	var means = [];

	for (var i=0; i<N; i++) 
	{
		var t=0;
		for (var j=0; j<N; j++)
		{
			t += M[j][i]
		}
		means.push(t/N);
	}
	return means;
}

function calcMean(A) {
	var m = 0, N=A.length;
	for (var i=0; i<N; i++) {
		m+= A[i];
	}
	return m/N;
}

// export
module.exports = Analysis;


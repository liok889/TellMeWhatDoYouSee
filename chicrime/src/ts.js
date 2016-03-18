/* --------------------------------------------
 * Timeseries
 * ts.js
 * ============================================
 */

function Timeseries(_series, shallow)
{
	this.series = [];
	if (shallow)
	{
		this.series = _series;
	}
	else if (_series && !shallow) 
	{
		// deep copy series
		var seriesMax = -Number.MAX_NUMBER;
		for (var i=0, N=_series.length; i < N; i++) {
			var v = _series[i];
			seriesMax = Math.max(v, seriesMax);
			this.series.push(v);
		}

		this.seriesMax = seriesMax;
	}

}

Timeseries.prototype.size = function() {
	return this.series.length;
}

Timeseries.prototype.get = function(index) {
	return this.series[index];
}

Timeseries.prototype.getSeries = function() {
	return this.series;
}

Timeseries.prototype.figureMax = function() {
	if (this.seriesMax) {
		return this.seriesMax;
	}
	else if (this.series.length > 0)
	{
		var theMax = this.series[0];
		for (var i=1, N=this.series.length; i<N; i++) {
			theMax = Math.max(theMax, this.series[i]);
		}
		this.seriesMax = theMax;
		return theMax;
	}
	else {
		return undefined;
	}
}

Timeseries.prototype.extent = function() {
	if (this.series.length < 1) {
		return undefined;
	}
	else
	{
		return [0, this.figureMax()];
	}
}

Timeseries.prototype.initEmpty = function(N) {
	var series = new Array(N);
	for (var i=0; i<N; i++) {
		series[i] = 0;
	}
	this.series = series;
}

Timeseries.prototype.add = function(anotherSeries, scalar) 
{
	// make sure the two series have equal lengths
	if (this.series.length == 0 && anotherSeries.size() > 0) {
		this.initEmpty(anotherSeries.size());
	}
	else if (this.series.length != anotherSeries.size()) {
		console.error("WARNING: Timeseries.add() mismatch in length");
		return;
	}

	for (var i=0, N=this.series.length; i<N; i++) {
		this.series[i] += (scalar ? scalar : 1.0) * anotherSeries.series[i];
	}
	this.seriesMax = undefined;
	return this;
}

Timeseries.prototype.subtract = function(anotherSeries) 
{
	return this.add(anotherSeries, -1.0);
}

Timeseries.prototype.multiplyScalar = function(scalar)
{
	for (var i=0, N=this.series.length; i<N; i++) {
		this.series[i] *= scalar;
	}
	if (this.seriesMax) {
		this.seriesMax *= scalar;
	}
}

Timeseries.prototype.clone = function()
{
	var clone = new Timeseries();
	clone.series = new Array(this.series.length);
	for (var i=0, N=this.series.length; i<N; i++)
	{
		clone.series[i] = this.series[i];
	}
	clone.seriesMax = this.seriesMax;
	return clone;
}

Timeseries.prototype.getMeanNormalized = function()
{

	if (this.meanNormalized) 
	{
		// already calculated
		return this.meanNormalized;
	}

	var mean = 0;
	var std = 0;
	var series = this.series;
	var N = this.series.length;

	meanNormalized = [];
	meanNormalized.length = N;
	
	if (N > 0)
	{
		// calculate mean
		for (var i=0; i<N; i++) {
			mean += series[i];
		}
		mean /= N;

		// calculate standard deviation
		for (var i=0; i<N; i++) {
			std += Math.pow(series[i]-mean, 2);
		}
		std = Math.sqrt(std / N);

		// mean normalize
		for (var i=0; i<N; i++) {
			meanNormalized[i] = (series[i]-mean) / std;
		}
	}

	this.meanNormalized = meanNormalized;
	return meanNormalized;
}

Timeseries.prototype.normalize = function()
{
	// normalize
	var seriesMax = this.figureMax();
	for (var i=0, N=this.series.length; i<N; i++) {
		this.series[i] /= seriesMax;
	}
	this.prevMax = seriesMax;
	this.seriesMax = 1.0;
	
	// invalidate bag of strings after normalization
	this.bagOfStrings = undefined;

	return this;
}

Timeseries.prototype.getPathGenerator = function(width, height, pad, constX, constY) 
{
	return (function(W, H, N, seriesMax, X, Y) 
	{
		return d3.svg.line()
			.x(X || function(d, i) { return i/(N-1)           * W; })
			.y(Y || function(d, i) { return (1.0-d/seriesMax) * H; });
	
	})(
		width - (pad ? 2*pad : 0), 
		height - (pad ? 2*pad : 0), 
		this.series.length, this.figureMax(),
		constX,
		constY
	);
}

Timeseries.prototype.invalidate = function()
{
	this.bagOfStrings = undefined;
	this.meanNormalized = undefined;
	this.grid = undefined;
}

// calculates distance between two timeseries (this and anotherSeries)
Timeseries.prototype.distance = function(anotherSeries)
{
	// compute bag of strings for both timeseries
	if (!this.bagOfStrings) {
		this.bagOfStrings = getBagOfStrings(this.series);
	}
	if (!anotherSeries.bagOfStrings) {
		anotherSeries.bagOfStrings = getBagOfStrings(anotherSeries.series);
	}

	// compare distance
	var _distance = 0;
	return (function(distance, bag1, bag2) 
	{
		// count commons
		var commons = d3.map();
		bag1.forEach(function(str, freq1) {

			var freq2 = bag2.get(str); 
			if (isNaN(freq2)) { 
				freq2 = 0; 
			} else 
			{
				// add to commons
				commons.set(str, true);
			}

			distance += Math.pow(freq1-freq2, 2);
		});

		// count occurences in bag2
		bag2.forEach( function(str, freq) {
			if (!commons.get(str)) {
				distance += Math.pow(freq, 2);
			}
		});
		return distance;

	})(_distance, this.bagOfStrings, anotherSeries.bagOfStrings);
}

/* ---------------------------------
 * Edit Distance on Real Sequence
 * ---------------------------------*/

// Constants for EDR distance
var EPSILON = 0.5;
var MAX_STD = 4.0;
var EPSILON_GRID = 2 * MAX_STD / EPSILON;

Timeseries.prototype.distanceEDR = function(anotherSeries)
{
	var nR = anotherSeries.getMeanNormalized();
	var nS = this.getMeanNormalized();
	var M = nR.length;
	var N = nS.length;

	var G = anotherSeries.grid;
	if (!G) 
	{
		G = this.grid;
		if (G) 
		{
			// flip nS and nR
			var tmp = nR;
			nR = nS;
			nS = tmp;
			M = nR.length;
			N = nS.length;
		}
		else
		{
			G = getEpsilonGrid(nR);
			anotherSeries.grid = G;
		}
	}

	// get intersections between the two timeseries
	var intersections = getEpsilonIntersections(nR, nS, G);

	// calculate EDR 
	// ==============
	// initialize matches
	var matches = []; 
	matches.length = 2 * N + 1;
	matches[0] = 0;
	for (var i=1, len=matches.length; i<len; i++) {
		matches[i] = M+1
	}
	var theMax = 0;

	// initialize matches
	for (var j=1; j<=N; j++) 
	{
		var c = 0;
		var temp = matches[0];
		var temp2 = matches[0];

		var Lj = intersections[ j-1 ];
		for (var k_in_Lj=0, len=Lj.length; k_in_Lj<len; k_in_Lj++)
		{
			var k = Lj[ k_in_Lj ] + 1;		// for algorithm purposes, array indices start at 1
			if (temp < k) 
			{
				while (matches[c] < k) 
				{
					if (temp < matches[c] - 1 && temp < M - 1) {
						temp2 = matches[c];
						matches[c] = temp + 1;
						temp = temp2;
					}
					else
					{
						temp = matches[c];
					}
					c++;
				}
				temp2 = matches[c];
				matches[c] = temp + 1;
				temp = matches[c + 1];
				if (matches[c + 1] > k) { matches[c + 1] = k; }
				if (theMax < c + 1) { theMax = c + 1; }
				c += 2;
			}
			else if (temp2 < k && k < matches[c]) 
			{
				temp2 = temp;
				temp = matches[c];
				matches[c] = k;
				if (theMax < c) { theMax = c; }
				c++;
			}
		}

		for (var i=c; i <= theMax+1; i++) 
		{
			if (temp < matches[i] - 1 && temp < M-1) 
			{
				temp2 = matches[i];
				matches[i] = temp + 1;
				temp = temp2;
				if (theMax < i) { theMax = i; }
			}
			else
			{
				temp = matches[i];
			}
		}
	}
	return (M+N) - theMax;
}

// use EDR as default distance function
Timeseries.prototype.distance = Timeseries.prototype.distanceEDR;


function getEpsilonGrid(nR)
{
	var G = []; G.length = EPSILON_GRID;

	for (var j=0; j<EPSILON_GRID; j++) {
		G[j] = [];
	}

	for (var k=0, M=nR.length; k<M; k++) 
	{
		var r  = nR[k];
		var x1 = Math.floor( (r - EPSILON + MAX_STD) / EPSILON )    ;
		var x2 = Math.ceil ( (r + EPSILON + MAX_STD) / EPSILON ) - 1;
		for (var j=Math.max(0, x1), jEnd = Math.min(EPSILON_GRID-1, x2); j<=jEnd; j++) 
		{
			G[j].push(k);
		}
	}
	return G;	
}

function getEpsilonIntersections(nR, nS, G)
{
	var N = nS.length;
	var intersections = []; intersections.length = N;

	for (var i=0; i<N; i++)
	{
		var nSi = nS[i];
		var Li = [];

		// index in the grid where nS[i] falls
		// also make sure index stays within range of grid
		var s = Math.floor((nSi + MAX_STD) / EPSILON);
		if (s >= EPSILON_GRID) {
			s = EPSILON_GRID-1; 
		} 
		else if (s < 0) {
			s=0;
		}

		// get grid element
		var g = G[s];
		for (var j=0, len=g.length; j<len; j++) 
		{
			var k = g[j];
			if (Math.abs(nSi - nR[k]) < EPSILON) {
				Li.push(k);
			}
		}
		intersections[i] = Li;
	}

	return intersections;
}

/* ---------------------------------
 * Bag of Strings similarity
 * ---------------------------------*/
var ALPHABET_SIZE 	= 5;
var WORD_SIZE 		= 8;
var WINDOW_SIZE 	= 40;
var BREAK_POINTS = 	[ -0.84, -0.25, 0.25, 0.84 ];



function getBagOfStrings(data) 
{
	// moving window
	var windowSize = WINDOW_SIZE;
	var windowCount = data.length - windowSize + 1;
	if (windowSize > data.length) 
	{
 		windowSize = data.length;
 		windowCount = 1;
	}

	var stepSize = windowSize / WORD_SIZE;
	if (!isInteger(stepSize)) 
	{
		stepSize = Math.ceil(stepSize);
	}

	// running mean, keep track of it
	var m = 0;
	for (var i = 0; i < windowSize; i++) {
		m += data[i];
	}

	// bag of strings
	var lastString = null;
	var localBag = d3.map();

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
			for (c=0; c < BREAK_POINTS.length; c++) {
				if (avg < BREAK_POINTS[c]) {
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

if (typeof module !== "undefined") module.exports = Timeseries;


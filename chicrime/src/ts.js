/* --------------------------------------------
 * Timeseries
 * ts.js
 * ============================================
 */

function Timeseries(_series)
{
	this.series = [];
	if (_series) 
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


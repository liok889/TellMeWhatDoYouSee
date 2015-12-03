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
}

Timeseries.prototype.subtract = function(anotherSeries) 
{
	this.add(anotherSeries, -1.0);
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

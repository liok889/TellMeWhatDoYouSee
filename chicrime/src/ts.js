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
	for (var i=0; i<N; i++)
		series[i] = 0;
	this.series = series;
}

Timeseries.prototype.add = function(anotherSeries) 
{
	// make sure the two series have equal lengths
	if (this.series.length != anotherSeries.size()) {
		console.error("WARNING: Timeseries.add() mismatch in length");
		return;
	}

	for (var i=0, N=this.series.length; i<N; i++) {
		this.series[i] += anotherSeries.series[i];
	}
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

Timeseries.prototype.getPathGenerator = function(width, height) 
{
	return (function(W, H, N, seriesMax) 
	{
		return pathGenerator = d3.svg.line()
			.x(function(d, i) { return i/(N-1)           * W; })
			.y(function(d, i) { return (1.0-d/seriesMax) * H; });
	
	})(width, height, this.series.length, this.figureMax());

}

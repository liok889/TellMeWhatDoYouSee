/* --------------------------------------------
 * Explore Pane
 * explore.js
 * ============================================
 */

var SIGNAL_INDIVIDUAL = 0;
var SIGNAL_AVG = 1;
var SIGNAL_DIFF = 2;

function SignalVis(g, w, h)
{
	// dimensions of the signal visualizer
	this.w = w;
	this.h = h;
	this.group = g;
	
	this.selections = [];
	this.signals = [];

	this.sumSeries = new Timeseries();
	this.avgSeries = new Timeseries();
}

SignalVis.prototype.addSelection = function(selection)
{
	// make sure selection does not already exist
	var exists = false;
	for (var i=0, N=this.selections.length; i++) 
	{
		var = this.selections[i];
		if (selection == s) 
		{
			this.jiggleSignal(signal[i].g);
			exists = true;
			break;
		}
	}

	if (!exists) 
	{
		var newSignal = this.generatePathSignal( seleciton.getTimeseries(), selection.getColor() );
	}
}

SignalVis.prototype.generateSignalPath = function(timeseries, color)
{
	var PAD = SignalVis.SIGNAL_PAD;
	var pathGenerator = timeseries.getPathGenerator(
		SignalVis.SIGNAL_W, 
		SignalVis.SIGNAL_H,
		PAD		
	);

	// make a baseline generator, which will give us an initial path with Y set to 0
	// so that we can make a nice transition
	var baselinePathGenerator = jQuery.extend(true, {}, pathGenerator);
	baselinePathGenerator.y(function(d, i) { return SignalVis.SIGNAL_H - 2*PAD; });


	// make a pth 
	var pathG = this.g.append("g").attr("transform", "translate(" + PAD + "," + PAD + ")");
	var path = pathG.append("path")
		.attr("class", "timeseriesPlot")
		.attr("d", baselinePathGenerator(timeseries.getSeries()))
		.attr("stroke", color || "black");
		.attr("stroke-width", "3px")
		.attr("fill", "none");
	
	path.transition()
		.attr("d", pathGenerator(timeseries.getSeries()));

	return {
		group: pathG,
		path: path,
		pathGenerator: pathGenerator,
		timeseries: timeseries
	};

}

SignalVis.prototype.updateSelection = function()
{

}

SignalVis.prototype.jiggleSignal = function(_g)
{
	var JIGGLE_FACTOR = 1.1;
	(function(g, transform, w, h) 
	{
		var xOffset = (1.0 - JIGGLE_FACTOR)* w/2;
		var yOffset = (1.0 - JIGGLE_FACTOR)* h/2;

		g.transition().duration(50)
			.attr("transform", transform + (transform !== "" ? "," : "") + "scale(" + JIGGLE_FACTOR + "),translate(" + xOffset + "," + yOffset + ")");

		setTimeout(function() {
			g.transition().duration(60).attr("transform", transform);
		}, 60);
	})(_g, _g.attr("transform"), this.w, this.h)
}

// constants
// ==========
SignalVis.SIGNAL_PAD = 10;
SignalVis.SIGNAL_W = 400;
SignalVis.SIGNAL_H = 150;

function Explore(svg)
{

}
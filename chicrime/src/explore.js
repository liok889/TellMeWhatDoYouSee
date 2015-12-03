/* --------------------------------------------
 * Exploration Pane
 * explore.js
 * ============================================
 */

var SIGNAL_INDIVIDUAL = 0;
var SIGNAL_AVG = 1;
var SIGNAL_DIFF = 2;

// ==================================
// Signal
// ==================================
function Signal(selection)
{
	this.selection = selection;
}

Signal.prototype.getSelection = function()
{
	return this.selection;
}

Signal.prototype.getGroup = function()
{
	return this.group;
}

Signal.prototype.enter = function(group)
{
	this.group = group;
	var ret = generateSignalPath(
		this.group,
		this.selection.getTimeseries(),
		this.selection.getColor()
	);

	this.pathG = ret.pathG;
	this.path = ret.path;
	this.pathGenerator = ret.pathGenerator;
}

Signal.prototype.exit =function()
{
	var _midPathGenerator = jQuery.extend(true, {}, this.pathGenerator);
	_midPathGenerator.y(function(d, i) { return 0.5 * (SignalVis.SIGNAL_H - 2*SignalVis.SIGNAL_PAD); });
	
	(function(signal, midPathGenerator) {

		signal.path.transition()
		.attr("d", midPathGenerator(this.selection.getSeries()))
		.each("end", function() 
		{
			signal.getGroup().remove();
		});
	})(this, _midPathGenerator);
}

function generateSignalPath(group, timeseries, color)
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
	var pathG = group.append("g").attr("transform", "translate(" + PAD + "," + PAD + ")");
	var path = pathG.append("path")
		.attr("class", "timeseriesPlot")
		.attr("d", baselinePathGenerator(timeseries.getSeries()))
		.attr("stroke", color || "black")
		.attr("stroke-width", "3px")
		.attr("fill", "none");
	
	path.transition()
		.attr("d", pathGenerator(timeseries.getSeries()));

	return {
		pathG: pathG,
		path: path,
		pathGenerator: pathGenerator
	};
}


// ==================================
// SignalVis
// ==================================
function SignalVis(g)
{
	// group
	this.group = g;

	// add a rectangle to this group
	this.bgRect = g.append("rect")
		.attr("width", SignalVis.SIGNAL_W)
		.attr("height". SignalVis.SIGNAL_H)
		.attr("class", "signalBox");
	
	// we'll store all signals here
	this.signals = [];

	// maintain a running sum and average time series
	this.sumSeries = new Timeseries();
	this.avgSeries = new Timeseries();
}

SignalVis.prototype.addSignal = function(selection)
{
	// make sure selection does not already exist
	var exists = false;
	for (var i=0, N=this.signals.length; i<N; i++) 
	{
		var s = this.signals[i].getSelection;
		if (selection == s) 
		{
			this.jiggleSignal(signals[i].getGroup());
			exists = true;
			break;
		}
	}

	if (!exists) 
	{
		var newSignal = new Signal(selection);
		this.signals.push(newSignal);
		this.updateSignals();
	}
}

SignalVis.prototype.removeSignal = function(selection)
{
	var update = false;

	for (var i=0, N=this.signals.length; i<N; i++) 
	{
		if (this.signals[i].getSelection() == selection) {
			this.signals.splice(i, 1);
			update = true;
			break;
		}
	}

	if (update) {
		this.updateSignals();
	}
}

SignalVis.prototype.updateSignals = function()
{
	// bind to groups
	var update = this.group.selectAll("g.signalGroup").data(
		this.signals, 
		function(d) { return d.getSelection().selecitonID }
	);
	
	// deal with enters
	var enter = update.enter().append("g")
		.attr("class", "signalGroup")
		.each(function(signal) {
			signal.enter(d3.select(this));
		});

	// keep track of times series
	(function(sumSeries, _enter, _exit) 
	{
		_enter.each(function(signal) {
			sumSeries.add(signal.getSelection().getTimeseries())
		});

		_exit.each(function(signal) {
			sumSeries.subtract(signal.getSelection().getTimeseries());
		});
	})(this.sumSeries, enter, exit);

	// exits the graphics
	var exit = update.exit().each(function(signal) {
		signal.exit();
	});
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
SignalVis.SIGNAL_SEPARATION = 15;
SignalVis.SIGNAL_PAD = 7;
SignalVis.SIGNAL_W = 400;
SignalVis.SIGNAL_H = 150;


// ==================================
// Explore
// ==================================
function Explore(svg)
{
	this.svg = svg;
	this.signalMultiples = [];

	var yOffset = SignalVis.SIGNAL_SEPARATION;
	for (var i=0; i<Explore.ROWS; i++, yOffset += SignalVis.SIGNAL_SEPARATION + SignalVis.SIGNAL_H) 
	{

		var xOffset = SignalVis.SIGNAL_SEPARATION;
		var visRow = [];
		for (var j=0; j<Explore.COLS; j++, xOffset += SignalVis.SIGNAL_SEPARATION + SignalVis.SIGNAL_W) 
		{
			var g = svg.append("g").attr("transform", "translate(" + xOffset + "," + yOffset + ")");
			var signalVis = new SignalVis(g);
			visRow.push(signalVis);
		}
		this.signalMultiples.push( visRow );
	}
}

Explore.COLS = 1;
Explore.ROWS = 2;



















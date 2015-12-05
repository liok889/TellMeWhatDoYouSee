/* --------------------------------------------
 * Exploration Pane
 * explore.js
 * ============================================
 */

var SIGNAL_INDIVIDUAL = 0;
var SIGNAL_AVG = 1;
var SIGNAL_DIFF = 2;

// constants
// ==========
SIGNAL_SEPARATION = 15;
SIGNAL_PAD = 7;
SIGNAL_W = 550;
SIGNAL_H = 150;


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
}

Signal.prototype.exit =function()
{
	var _midPathGenerator = this.getSelection().getTimeseries().getPathGenerator(
		SIGNAL_W,
		SIGNAL_H,
		SIGNAL_PAD,
		undefined,
		0.5 * (SIGNAL_H - 2*SIGNAL_PAD)
	);


	(function(signal, midPathGenerator) 
	{
		var series = signal.getSelection().getTimeseries().getSeries();
		signal.path.transition()
			.attr("d", midPathGenerator(series))
			.style("stroke-opacity", 0.0)
			.each("end", function() 
			{
				signal.getGroup().remove();
			});
	})(this, _midPathGenerator);
}

Signal.prototype.updateTimeseries = function()
{
	var timeseries =  this.selection.getTimeseries();
	var pathGenerator = timeseries.getPathGenerator(SIGNAL_W, SIGNAL_H, SIGNAL_PAD);
	this.path.transition()
		.attr("d", pathGenerator(timeseries.getSeries()));
}

function generateSignalPath(group, timeseries, color)
{
	// actual path generator
	var pathGenerator = timeseries.getPathGenerator(SIGNAL_W, SIGNAL_H, SIGNAL_PAD);

	// make a baseline generator, which will give us an initial path with Y set to 0
	// so that we can make a nice transition
	var baselinePathGenerator = timeseries.getPathGenerator(
		SIGNAL_W, 
		SIGNAL_H, 
		SIGNAL_PAD, 
		undefined, 
		SIGNAL_H-2*SIGNAL_PAD
	);


	// make a pth 
	var pathG = group.append("g").attr("transform", "translate(" + SIGNAL_PAD + "," + SIGNAL_PAD + ")");
	var path = pathG.append("path")
		.attr("class", "timeseriesPlot")
		.attr("d", baselinePathGenerator(timeseries.getSeries()))
		.style("stroke", color || "black");

	path.transition()
		.attr("d", pathGenerator(timeseries.getSeries()));

	return {
		pathG: pathG,
		path: path,
	};
}


// ==================================
// SignalVis
// ==================================
function SignalVis(g)
{
	// group
	this.group = g;
	this.init();
}

SignalVis.prototype.getContentContainer = function()
{
	return this.group;
}

SignalVis.prototype.init = function()
{
	// add a rectangle to this group
	this.bgRect = this.group.append("rect")
		.attr("width", SIGNAL_W)
		.attr("height", SIGNAL_H)
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
		var s = this.signals[i].getSelection();
		if (selection == s) 
		{
			this.jiggleSignal(this.signals[i].getGroup());
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

SignalVis.prototype.clearAll = function()
{
	this.signals = [];
	this.updateSignals();
}

SignalVis.prototype.updateOneSignal = function(selection)
{
	// check to see which selection it is
	var update = false;
	for (var i=0, N=this.signals.length; i<N; i++) {
		var signal = this.signals[i];
		if (signal.getSelection() == selection) 
		{
			signal.updateTimeseries();
			update = true;
			break;
		}
	}

	if (update) {
		this.calcAvgSignal();
		return true;
	}
	else {
		return false;
	}
}

SignalVis.prototype.updateSignals = function()
{
	// bind to groups
	var update = this.group.selectAll("g.signalGroup").data(
		this.signals, 
		function(signal) { return signal.getSelection().selectionID; }
	);
	
	// deal with enters
	var enter = update.enter().append("g")
		.attr("class", "signalGroup");

	// invoke enter
	enter
		.each(function(signal) 
		{
			signal.enter(d3.select(this));
		});

	// keep track of the sum of times series
	(function(sumSeries, _enter, _exit) 
	{
		_enter.each(function(signal) {
			sumSeries.add(signal.getSelection().getTimeseries())
		});

		_exit.each(function(signal) {
			sumSeries.subtract(signal.getSelection().getTimeseries());
		});
	})(this.sumSeries, enter, update.exit());

	// exits the graphics
	var exit = update.exit().each(function(signal) {
		signal.exit();
	});

	this.avgSeries = this.sumSeries.clone();
	this.avgSeries.normalize();
}

SignalVis.prototype.calcAvgSignal = function()
{
	this.sumSeries = new Timeseries();
	for (var i=0, N=this.signals.length; i<N; i++) {
		this.sumSeries.add(this.signals[i].getSelection().getTimeseries());
	}
	this.avgSeries = this.sumSeries.clone();
	this.avgSeries.normalize();
}

SignalVis.prototype.jiggleSignal = function(_g)
{
	var JIGGLE_FACTOR = 1.1;
	(function(g, transform, w, h) 
	{
		var xOffset = (1.0 - JIGGLE_FACTOR)* w/2;
		var yOffset = (1.0 - JIGGLE_FACTOR)* h/2;
		var oldTransform = (transform && transform !== "") ? (transform + ",")  : "";

		g.transition().duration(50)
			.attr("transform", oldTransform + "scale(" + JIGGLE_FACTOR + "),translate(" + xOffset + "," + yOffset + ")");

		setTimeout(function() {
			g.transition().duration(60).attr("transform", transform);
		}, 60);
	})(_g, _g.attr("transform") || "", SIGNAL_W, SIGNAL_H)
}

// ==================================
// Explore
// ==================================
function Explore(svg)
{
	this.svg = svg;
	this.signalMultiples = [];
	this.signalList = [];

	var yOffset = SIGNAL_SEPARATION;
	for (var i=0; i<Explore.ROWS; i++, yOffset += SIGNAL_SEPARATION + SIGNAL_H) 
	{

		var xOffset = SIGNAL_SEPARATION;
		var visRow = [];
		for (var j=0; j<Explore.COLS; j++, xOffset += SIGNAL_SEPARATION + SIGNAL_W) 
		{
			var g = svg.append("g").attr("transform", "translate(" + xOffset + "," + yOffset + ")");
			var signalVis = new SignalVis(g);
			visRow.push(signalVis);
			this.signalList.push(signalVis);

		}
		this.signalMultiples.push( visRow );
	}
}

Explore.prototype.clearAll = function()
{
	// clear all signals
	for (var i=0, N=this.signalList.length; i<N; i++) {
		this.signalList[i].clearAll();
	}
}

Explore.prototype.dragSelection = function(selection)
{
	this.selectionDrag = undefined;

	// see if we are within any signal visualizer
	for (var i=0, N=this.signalMultiples.length; i<N; i++) 
	{
		var row = this.signalMultiples[i];
		for (var j=0, M=row.length; j<M; j++) 
		{
			var signalVis = this.signalMultiples[i][j];

			// see if we are within this signal
			var container = signalVis.getContentContainer();
			var m = d3.mouse( container.node() );
			if (
				SIGNAL_W >= m[0] && m[0] >= 0 &&
				SIGNAL_H >= m[1] && m[1] >= 0
			) {
				signalVis.bgRect.attr("class", "signalBoxDrop");
				this.selectionDrag = 
				{
					signalVis: signalVis,
					selection: selection,
					ij: [i, j]
				};
			}
			else {
				signalVis.bgRect.attr("class", "signalBox");
			}
		}
	}
}

Explore.prototype.endDragSelection = function(selection)
{
	var drop = this.selectionDrag;
	if (drop) {
		drop.signalVis.bgRect.attr("class", "signalBox");
		drop.signalVis.addSignal( drop.selection );
		drop = undefined;
	}
}

Explore.prototype.removeSelection = function(selection) {
	// remove selection from all signals
	for (var i=0, N=this.signalList.length; i<N; i++){
		this.signalList[i].removeSignal(selection);
	}
}

Explore.prototype.updateSelectionCallback = function(selection) {
	for (var i=0, N=this.signalList.length; i<N; i++) {
		this.signalList[i].updateOneSignal(selection);
	}
}

Explore.prototype.setSeriesLabels = function() {

}



Explore.COLS = 1;
Explore.ROWS = 2;



















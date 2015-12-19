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
SIGNAL_PAD = 11;
SIGNAL_W = 565;
SIGNAL_H = 170;
SIGNAL_H_PAD = 15;
SIGNAL_W_PAD = 10;
SIGNAL_X_OFFSET = 25;


var CIRCLE_R = 8;
var CIRCLE_OFFSET = 2;

var COLOR_OVER = '#ff6666';
var COLOR_UNDER = '#6666ff';

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
	this.mode = SIGNAL_INDIVIDUAL;
	this.group = g;

	// list of signals we want to callback on updates
	this.updateCallbacks = [];

	// init
	this.init();
}

SignalVis.prototype.setOpposingSignal = function(signal)
{
	if (this.opposingSignal) {
		this.opposingSignal.removeUpdateCallback(this);
		this.opposingSignal = undefined;
	}

	this.opposingSignal = signal;
	if (signal) {
		signal.addUpdateCallback(this);
	}
	this.calcDiffSignal();
}

SignalVis.prototype.addUpdateCallback = function(signal)
{
	// make sure signal does not exist
	for (var i=0, N=this.updateCallbacks.length; i<N; i++) {
		if (this.updateCallbacks[i] == signal) {
			return;
		}
	}
	this.updateCallbacks.push(signal);
}

SignalVis.prototype.removeUpdateCallback = function(signal)
{
	// make sure signal does not exist
	for (var i=0, N=this.updateCallbacks.length; i<N; i++) {
		if (this.updateCallbacks[i] == signal) {
			this.updateCallbacks.splice(i, 1);
			break;
		}
	}
}

SignalVis.prototype.getContentContainer = function()
{
	return this.group;
}

SignalVis.prototype.getAvgTimeseries = function()
{
	return this.avgSeries;
}

SignalVis.prototype.init = function()
{
	// add a rectangle to this group
	this.bgRect = this.group.append("rect")
		.attr("width", SIGNAL_W + SIGNAL_W_PAD + SIGNAL_X_OFFSET)
		.attr("height", SIGNAL_H + SIGNAL_H_PAD)
		.attr("class", "signalBox");

	(function(thisSignalVis) 
	{
		thisSignalVis.modeCircle = thisSignalVis.group.append("circle")
			.attr("cx", SIGNAL_W + SIGNAL_W_PAD + CIRCLE_OFFSET + SIGNAL_X_OFFSET + CIRCLE_R)
			.attr("cy", CIRCLE_R + CIRCLE_OFFSET)
			.attr("r", CIRCLE_R)
			.style("fill", "#ffffff")
			.on("mouseover", function() {
				d3.select(this).style("stroke", "black");
			})
			.on('mouseout', function() {
				d3.select(this).style("stroke", "");
			})
			.on("click", function() 
			{
				thisSignalVis.mode = (thisSignalVis.mode + 1) % 3;
				thisSignalVis.updateMode();
				thisSignalVis.updateYAxis();
			});
	})(this);

	
	// we'll store all signals here
	this.signals = [];

	// maintain a running sum and average time series
	this.sumSeries = new Timeseries();
	this.avgSeries = new Timeseries();

	this.updateSignals();
}

SignalVis.prototype.updateMode = function() 
{
	var visVector = null;
	switch (this.mode)
	{
	case SIGNAL_INDIVIDUAL:
		visVector = [true, false, false];
		break;

	case SIGNAL_AVG:
		visVector = [false, true, false];
		break;

	case SIGNAL_DIFF:
		visVector = [false, false, true];
		break;
	}

	this.group.selectAll("g.individualSignalGroup")
		.attr("visibility", visVector[0] ? "visible" : "hidden");
	this.group.selectAll("g.averageSignalGroup")
		.attr("visibility", visVector[1] ? "visible" : "hidden");
	this.group.selectAll("g.diffSignalGroup")
		.attr("visibility", visVector[2] ? "visible" : "hidden");
	this.group.selectAll("g.brushSignalGroup")
		.attr("visibility", visVector[2] ? "hidden" : "visible");

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

SignalVis.prototype.opposingUpdate = function()
{
	this.calcDiffSignal();
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
		this.updateSignals();
		return true;
	}
	else {
		return false;
	}
}

SignalVis.prototype.updateSignals = function()
{
	// bind to groups
	var update = this.group.selectAll("g.individualSignalGroup").data(
		this.signals, 
		function(signal) { return signal.getSelection().selectionID; }
	);
	
	// deal with enters
	var enter = update.enter().append("g")
		.attr("visibility", this.mode == SIGNAL_INDIVIDUAL ? "visible" : "hidden")
		.attr("class", "individualSignalGroup")
		.attr("transform", "translate(" + SIGNAL_X_OFFSET + ",0)");

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


	// make color labels
	var updateLabels = this.group.selectAll("circle.timeseriesColorButton").data(
		this.signals, function(signal) { return signal.getSelection().selectionID; }
	);

	// adjust circle radius, if necessary
	var totalCircle = this.signals.length * (CIRCLE_OFFSET + CIRCLE_R*2);
	var circle_r;
	
	if (totalCircle > SIGNAL_H - CIRCLE_OFFSET * 2 - CIRCLE_R * 2) {
		circle_r = (SIGNAL_H - CIRCLE_OFFSET*2 - CIRCLE_R*2) / (2*this.signals.length);
		circle_r -= CIRCLE_OFFSET;
	} else {
		circle_r = CIRCLE_R;
	}

	(function(thisSignalVis, update, R, OFFSET) {

		update.enter().append("circle")
			.attr("class", "timeseriesColorButton")
			.style("fill", function(signal) { return signal.getSelection().getColor(); })
			.style("fill-opacity", "0.0")
			.attr("cy", SIGNAL_H + SIGNAL_H_PAD - R)
			.attr("cx", SIGNAL_W + SIGNAL_W_PAD + SIGNAL_X_OFFSET + OFFSET + R)
			.attr("r", R)
			.on("mouseover", function(signal) 
			{
				d3.select(this).style("stroke", "black");
				if (thisSignalVis.mode != SIGNAL_DIFF) {
					thisSignalVis.brushSignal(signal);
				}
			})
			.on("mouseout", function(signal) 
			{
				d3.select(this).style("stroke", "");
				if (thisSignalVis.mode != SIGNAL_DIFF) {
					thisSignalVis.brushSignal(null);
				}
			})
			.on("dblclick", function(signal) {
				thisSignalVis.removeSignal(signal.getSelection());
			});


		update.transition()
			//.attr("cx", SIGNAL_W + OFFSET + R)
			.attr("cy", function(d, i) { return SIGNAL_H + SIGNAL_H_PAD - R - i*(2*R+OFFSET);})
			.attr("r", R)
			.style("fill-opacity", "1.0");

		update.exit().transition().style("fill-opacity", "0.0")
			.each(function(signal) { thisSignalVis.brushSignal(null)})
			.remove();

	})(this, updateLabels, circle_r, CIRCLE_OFFSET);

	// calculate average signal
	this.calcAvgSignal();

	// calculate signal difference
	this.calcDiffSignal();

	if (this.signals.length == 0) 
	{
		this.modeCircle.attr("visibility", "visible");
	}
	else
	{
		this.modeCircle.attr("visibility", "visible");
	}

	// do callbacks
	for (var i=0, N=this.updateCallbacks.length; i<N; i++) 
	{
		this.updateCallbacks[i].opposingUpdate();
	}

	// update Y axis
	this.updateYAxis();
}

SignalVis.prototype.updateBrushSignal = function(timeseries)
{
	var g = this.group.selectAll("g.brushSignalGroup");
	if (g.size() == 0) 
	{
		g = this.group.append("g")
			.attr("transform", "translate(" + (SIGNAL_X_OFFSET + SIGNAL_PAD) + "," + (SIGNAL_PAD) + ")")
			.attr("class", "brushSignalGroup");
		g.append("path")
			.style("stroke-dasharray", "2,2")
			.attr("stroke", "white")
			.attr("stroke-width", "1.5px")
			.attr("fill", "none")
			.attr("d", "");
	}
	
	var path = g.select("path");
	if (timeseries) {
		var pathGenerator = timeseries.getPathGenerator(SIGNAL_W, SIGNAL_H, SIGNAL_PAD);
		path.attr("d", pathGenerator( timeseries.getSeries() ));
	}
	else
	{
		path.attr("d", "");
	}
	//path.attr("visibility", this.mode == SIGNAL_DIFF ? "hidden" : "visible")
	
	if (this.mode == SIGNAL_DIFF && this.signals.length > 0)
	{
		this.calcDiffSignal(timeseries);
		this.updateYAxis();
	}
	else
	{
		putNodeOnTop(g.node());
	}
}

SignalVis.prototype.brushSignal = function(_signal)
{
	var pathSelection = this.group.selectAll("g.individualSignalGroup").selectAll("path");

	if (_signal) {
		(function(signal, path, mode) {
			path
				.style("stroke-opacity", function(d) { return (d == signal ? 1.0 : 0.5);})
				.style("stroke-width", function(d) { return (d == signal ? "2.5px" : "");})
				.each(function(d) {
					if (d == signal) 
					{
						var parentG = getParentElement(this.parentElement, "g", "individualSignalGroup");
						putNodeOnTop( parentG );
						if (mode != SIGNAL_INDIVIDUAL) {
							d3.select(parentG).attr("visibility", "visible");
						}

					}
				});

		})(_signal, pathSelection, this.mode);
	}
	else
	{
		pathSelection.style("stroke-opacity", "").style("stroke-width", "");
		if (this.mode != SIGNAL_INDIVIDUAL) {
			this.group.selectAll("g.individualSignalGroup").attr("visibility", "hidden");			
		}
	}

	if (this.brushSignalCallback) {
		this.brushSignalCallback(_signal);
	}
}

SignalVis.prototype.calcAvgSignal = function()
{
	// calculate a new average time series
	this.sumSeries = new Timeseries();
	for (var i=0, N=this.signals.length; i<N; i++) {
		this.sumSeries.add(this.signals[i].getSelection().getTimeseries());
	}
	this.avgSeries = this.sumSeries.clone();
	if (this.signals.length > 0) {
		this.avgSeries.multiplyScalar( 1 / this.signals.length);
		this.avgSeries.normalize();
	}

	// update
	var updateAvg = this.group.selectAll("g.averageSignalGroup").data([this.avgSeries]);
	var g = updateAvg.enter().append("g")
		.attr("class", "averageSignalGroup")
		.attr("visibility", this.mode == SIGNAL_AVG ? "visible" : "hidden")
		.attr("transform", "translate(" + SIGNAL_X_OFFSET + ",0)");
	
	// generate a signal path
	generateSignalPath(g, this.avgSeries, "white");

	// update, if no enter
	if (updateAvg.enter().size() == 0) 
	{
		var pathGenerator = this.avgSeries.getPathGenerator(SIGNAL_W, SIGNAL_H, SIGNAL_PAD);
		(function(update, pg, avgSeries) 
		{
			update.selectAll("path").transition()
				.attr("d", pg(avgSeries.getSeries()));
		})(updateAvg, pathGenerator, this.avgSeries);
	}

}

SignalVis.prototype.calcDiffSignal = function(otherTimeseries)
{
	// make / select groups
	var diffGroup = this.group.selectAll("g.diffSignalGroup");
	var g = null;
	if (diffGroup.size() == 0) 
	{
		diffGroup = this.group.append("g")
			.attr("class", "diffSignalGroup")
			.attr("visibility", this.mode == SIGNAL_DIFF ? "visible" : "hidden")
			.attr("transform", "translate(" + SIGNAL_X_OFFSET + ",0)");
		g = diffGroup.append("g").attr("class", "diffPaths");
		
		// add a zero baseline
		diffGroup.append("line")
			.attr("x1", SIGNAL_PAD)
			.attr("y1", (SIGNAL_H-2*SIGNAL_PAD) / 2 + SIGNAL_PAD)
			.attr("x2", SIGNAL_W-SIGNAL_PAD)
			.attr("y2", (SIGNAL_H-2*SIGNAL_PAD) / 2 + SIGNAL_PAD)
			.attr("stroke", "#cccccc")
			.attr("stroke-width", "0.5px");

	}
	else
	{
		g = diffGroup.selectAll("g.diffPaths")
	}

	var A = this.avgSeries;
	var B = this.opposingSignal;
	if (B) {
		B = B.getAvgTimeseries();
	}
	if (otherTimeseries) {
		B = otherTimeseries;
	}

	var paths = [];
	if (!B || A.size() == 0 || B.size() == 0) 
	{
		
		// nothing to plot here
		g.selectAll("path").remove();
	}
	else
	{
		
		var diff = A.clone().subtract(B);
		var diffSeries = diff.getSeries();
		
		// build a new different
		var lastV = diffSeries[0];
		var overZero = lastV >= 0.0;	// see if we are over or under
		var curVertexSet = [[0, 0]];
		
		var minV = diffSeries[0];
		var maxV = diffSeries[0];

		for (var i=1, N=diffSeries.length; i<N; i++) 
		{
			var v = diffSeries[i];
			minV = Math.min(minV, v);
			maxV = Math.max(maxV, v);

			// did we change curve direction
			if ((v >= 0 && overZero) || (v < 0 && !overZero)) {
				// no, still same, add vertex
				curVertexSet.push([i, v]);
			}
			else
			{
				// change direction
				var zeroIntercept = (0-lastV) / (v-lastV);
				var zeroXIntercept = (i-1) + zeroIntercept;
				curVertexSet.push([zeroXIntercept, 0]);

				// close the path
				paths.push({
					direction: overZero, 
					vertices: curVertexSet
				});

				// start a new vertex set
				curVertexSet = [[zeroXIntercept, 0], [i, v]];
				overZero = (v >= 0);
			}
			lastV = v;
		}

		if (curVertexSet.length > 0) {
			curVertexSet.push([diffSeries.length-1, 0]);
			paths.push({
				direction: overZero,
				vertices: curVertexSet
			});
		}

		var yRange = Math.max( Math.abs(minV), Math.abs(maxV) );
		yRange = Math.ceil(yRange* 10) / 10;
		yRange = Math.max(yRange, 0.5);
		this.yDiffRange = yRange;

		var xScale = d3.scale.linear().domain([0, diffSeries.length-1]).range([SIGNAL_PAD, SIGNAL_W-SIGNAL_PAD]);
		var yScale = d3.scale.linear().domain([-yRange, yRange]).range([ SIGNAL_H-SIGNAL_PAD, SIGNAL_PAD ]);

		// generate commands for the paths
		for (var i=0, K=paths.length; i<K; i++) 
		{

			var vertices = paths[i].vertices;
			var d = "";
			var baseD = "";

			for (var j=0, M=vertices.length; j<M; j++) 
			{
				var v = vertices[j];
				d += j == 0 ? "M " : " L ";
				d += xScale(v[0]) + " " + yScale(v[1]);

				baseD += j == 0 ? "M " : " L ";
				baseD += xScale(v[0]) + " " + yScale(0);

			}
			
			paths[i].d = d;
			paths[i].baseD = baseD;
		}
	}

	// bind
	var update = g.selectAll("path").data(paths);
	
	var enter = update.enter().append("path")
		.attr("stroke", "white")
		.attr("stroke-width", "1.5px")
		.attr("d", function(path) { return path.d; })
		.attr("fill", function(path) { return path.direction ? COLOR_OVER : COLOR_UNDER; });


	update
		.attr("fill", function(path) { return path.direction ? COLOR_OVER : COLOR_UNDER; })
		.attr("d", function(path) { return path.d; })
		.attr("fill-opacity", otherTimeseries ? "0.65" : "")
		.style("stroke-dasharray", otherTimeseries ? "2,2" : "");	
	/*
	(function(update) {
		update.transition().duration(50).attr("fill", "none");
		setTimeout(function() {
			update.transition().duration(250)
				.attr("fill", function(path) { return path.direction ? COLOR_OVER : COLOR_UNDER; })
				.attr("d", function(path) { return path.d; });
		}, 50);
	})(update);
	*/

	
	update.exit()//.transition()
		//.attr("d", function(path) { return path.baseD; })
		//.attr("fill", "none")
		.remove();
}

SignalVis.prototype.updateYAxis = function()
{

	var yScale = d3.scale.linear();
	var tickCount = 5;

	if (this.mode == SIGNAL_DIFF) 
	{
		yScale.domain([-this.yDiffRange, this.yDiffRange]);
		tickCount = 5;
	}
	else
	{
		yScale.domain([0, 1]);
	}
	yScale.range([SIGNAL_H - 2*SIGNAL_PAD, 0]);


	this.group.selectAll("g.yAxis").remove();
	var yAxisGroup = this.group.append("g")
		.attr("class", "yAxis")
		.attr("transform", "translate(" + (SIGNAL_X_OFFSET + SIGNAL_PAD/2) + "," + SIGNAL_PAD + ")");
	
	var yAxis = d3.svg.axis().scale(yScale).orient("left").ticks(tickCount);
	yAxisGroup.call(yAxis);
}

SignalVis.prototype.setXAxis = function(xAxis) 
{
	this.group.selectAll("g.xAxis").remove();
	this.group.append("g")
		.attr("class", "xAxis")
		.attr("transform", "translate(" + (SIGNAL_PAD + SIGNAL_X_OFFSET) + "," + (-SIGNAL_PAD+SIGNAL_H) + ")")
		.call(xAxis);
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

	var Y_OFFSET = SIGNAL_SEPARATION + SIGNAL_H + SIGNAL_H_PAD;
	var X_OFFSET = SIGNAL_SEPARATION + SIGNAL_W + SIGNAL_W_PAD + SIGNAL_X_OFFSET;

	var yOffset = SIGNAL_SEPARATION;
	for (var i=0; i<Explore.ROWS; i++, yOffset += Y_OFFSET) 
	{

		var xOffset = 2;
		var visRow = [];
		for (var j=0; j<Explore.COLS; j++, xOffset += X_OFFSET) 
		{
			var g = svg.append("g").attr("transform", "translate(" + xOffset + "," + yOffset + ")");
			var signalVis = new SignalVis(g);
			visRow.push(signalVis);
			this.signalList.push(signalVis);

		}
		this.signalMultiples.push( visRow );
	}

	// set opposing signal
	this.signalList[0].setOpposingSignal(this.signalList[1]);
	this.signalList[1].setOpposingSignal(this.signalList[0]);

}

Explore.prototype.setAxis = function(aggregation)
{
	if (!aggregation) {
		return;
	}
	else
	{
		var xScale = d3.scale.linear(), yScale = d3.scale.linear();
		var labels;
		var xAxis = d3.svg.axis().orient("bottom"), yAxis = d3.svg.axis();
		var labels = [];

		switch (aggregation)
		{
		case "weekly":
			labels = [
				'Mon', 'noon', 
				'Tue', 'noon',
				'Wed', 'noon', 
				'Thu', 'noon',
				'Fri', 'noon', 
				'Sat', 'noon',
				'Sun', 'noon', '12am'];
			break;
		
		case 'daily':
			labels = [
				'12am', '3', '6', '9', 'noon', '3', '6', '9', '12am'
			];
			break;
		
		case 'yearly':
			labels = [
				'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
			];
		}

		xScale.domain([0, labels.length-1]).range([0, SIGNAL_W - 2*SIGNAL_PAD]);

		(function(axis, theScale, labels) 
		{
			var xScale = 
			axis.scale(theScale).ticks(labels.length).tickFormat(function(i) {
				return labels[i];
			});
		})(xAxis, xScale, labels);

		for (var i=0, N=this.signalList.length; i<N; i++) {
			this.signalList[i].setXAxis(xAxis);
		}
	}
}

Explore.prototype.clearAll = function(aggregate)
{
	// clear all signals
	for (var i=0, N=this.signalList.length; i<N; i++) 
	{
		this.signalList[i].clearAll();
	}

	// set axis
	this.setAxis(aggregate);
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

Explore.prototype.setBrushSignalCallback = function(callback)
{
	this.brushSignalCallback = callback;
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

Explore.prototype.brushDataPoints = function(points)
{
	// average the time series
	var avgTimeseries = null;
	if (points.length > 0)
	{
		avgTimeseries = new Timeseries();
		for (var i=0, N=points.length; i<N; i++) {
			avgTimeseries.add( points[i].timeseries );
		}
		avgTimeseries.multiplyScalar(1 / points.length);
		avgTimeseries.normalize();
	}

	// make this timeseries visible
	function updateSignals(signalList, avg)
	{
		for (var i=0, N=signalList.length; i<N; i++) 
		{
			signalList[i].updateBrushSignal(avg);
		}
	}

	// update 
	(function(explore, dataPoints, avg) {

		if (dataPoints.length == 0) {
			explore.reset = true;
			setTimeout(function() {
				if (explore.reset)
				{
					updateSignals(explore.signalList, avg);
				}
			}, 200);
		}
		else
		{
			explore.reset = undefined;
			updateSignals(explore.signalList, avg);
		}
	})(this, points, avgTimeseries);
}

Explore.COLS = 1;
Explore.ROWS = 2;



















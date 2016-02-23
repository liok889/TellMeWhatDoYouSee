/* --------------------------------------------
 * Exploration Pane
 * editor.js
 * ============================================
 */

// edit modes
var MAX_EDIT_RANGE	= 80;
var EDIT_ONE		= 1;
var EDIT_WEEKDAY	= 2;
var EDIT_ALL		= 3;
var EDITOR_ID		= 1;

function SignalEditor(group, w, h, timeseries, aggregation)
{
	this.group = group;
	this.w = w;
	this.h = h;
	this.original = timeseries.clone();
	this.timeseries = timeseries.clone();
	this.aggregation = aggregation;
	this.selectionRange = 5;
	this.selections = [];
	this.mode = EDIT_ONE;
	this.editorID = EDITOR_ID++;

	switch (aggregation)
	{
	case "weekly":
		this.period = 24;
	}

	(function(thisEditor) 
	{	
		thisEditor.rangeGroup = thisEditor.group.append("g");
		thisEditor.signalGroup = thisEditor.group.append("g")
			.attr("transform", "translate(" + ( -SIGNAL_PAD) + "," + (-SIGNAL_PAD) + ")");

		// plot signal
		thisEditor.plotSignal();

		// add a rectangular background to capture mouse move events
		thisEditor.bgRect = thisEditor.group.append("rect")
			.attr("x", 0).attr("y", 0)
			.attr("width", thisEditor.w)
			.attr("height", thisEditor.h)
			.style("fill", "rgba(255, 255, 255, 0.0)")
			.style("stroke", "none")
			.on("mousemove", function() 
			{
				thisEditor.mouseOver = true;
				var mouseCoord = d3.mouse(this);
				if (!thisEditor.drag)
				{
					thisEditor.mousemove( mouseCoord );
				}
			})
			.on("click", function() {
				if (!thisEditor.dragged) {
					thisEditor.mode++;
					if (thisEditor.mode > 3) 
					{
						thisEditor.mode = EDIT_ONE;
					}
					thisEditor.mousemove(d3.mouse(this));
				}

			})
			.on("mouseout", function()
			{
				if (thisEditor.drag) {
					d3.select(window).on("mouseup.mouseoutRelease", function() {
						thisEditor.mouseout();
						thisEditor.mouseOver = false;					
						d3.select(window).on("mouseup.mouseoutRelease", null);
					});
				}
				else
				{
					thisEditor.mouseout();
					thisEditor.mouseOver = false;
				}
			})
			.on("mousedown", function() 
			{
				thisEditor.drag = true;
				thisEditor.dragged = false;
				thisEditor.lastMouse = d3.mouse(this);

				d3.select(window)
					.on("mouseup.signalEditor", function() 
					{
						thisEditor.drag = undefined;
						d3.select(window)
							.on("mousemove.signalEditor", null)
							.on("mouseup.signalEditor", null);
					})
					.on("mousemove.signalEditor", function() 
					{
						var mouse = d3.mouse(thisEditor.bgRect.node());
						thisEditor.mousedrag( mouse );
						thisEditor.lastMouse = mouse;
						thisEditor.dragged = true;
					})
			});

		d3.select(window).on("wheel." + thisEditor.editorID, function() 
		{
			if (thisEditor.mouseOver) 
			{

				if (d3.event.deltaY > 0 && thisEditor.selectionRange < MAX_EDIT_RANGE) {
					thisEditor.selectionRange++;
				}
				else if (d3.event.deltaY < 0 && thisEditor.selectionRange > 0) {
					thisEditor.selectionRange--;
				}
				thisEditor.mousemove( d3.mouse(thisEditor.bgRect.node()) );
			}
		});

	})(this)
}

SignalEditor.prototype.getEditedSeries = function()
{
	return this.timeseries;
}

SignalEditor.prototype.plotSignal = function(timeseries)
{
	if (timeseries) {
		this.timeseries = timeseries.clone();
	}

	this.signalGroup.selectAll("path").remove();
	this.signalGroup.append("path")
	this.signalPath = generateSignalPath(this.signalGroup, this.timeseries, "black", 0).path;
}

SignalEditor.prototype.mousedrag = function(mouse)
{
	var dMouse = [mouse[0]-this.lastMouse[0], mouse[1]-this.lastMouse[1]];
	var dY = dMouse[1];

	// make sure there is vertical movement. if not, then just exit
	if (dY == 0) {
		return;
	}

	// pixel to normalized unit
	var pN = -dY / this.h;


	// apply to all selections
	var series = this.timeseries.getSeries();
	for (var i=0, len=this.selections.length; i<len; i++) 
	{
		var range = this.selections[i];
		var rangeMiddle = (range[0] + range[1]) / 2;

		for (var r=range[0]; r<=range[1]; r++) 
		{
			// module pN
			if (pN > 0 && (series[r] + pN > 1.0)) {
				pN = 1.0 - series[r];
			}
			else if (pN < 0 && (series[r] + pN < 0.0)) {
				pN = -series[r];
			}
		}

		// do the adjustment
		for (var r=range[0]; r<=range[1]; r++) 
		{
			if (this.selectionRange > 2) {
				var ppN = 1.0 - Math.max(0, Math.min(1, Math.abs(rangeMiddle-r) / this.selectionRange));
				ppN *= pN
				series[r] += ppN;
			}
			else
			{
				series[r] += pN;
			}
		}
	}

	var pathGenerator = this.timeseries.getPathGenerator(
		SIGNAL_W,
		SIGNAL_H,
		SIGNAL_PAD
	);
	this.signalPath.attr("d", pathGenerator(series));

	// trigger an edit event
	this.timeseries.invalidate();

	// loop through all timesteps in the system
	gridAnalysis.showDistanceToExample(this.timeseries);
}

SignalEditor.prototype.mousemove = function(mouse) 
{
	var N = this.timeseries.size();
	var R = this.selectionRange;
	var W = this.w;
	var H = this.h;

	// see if we have a time series to edit in the first place
	if (N == 0) {
		// nothing to edit
		return;
	}

	// figure out index we are currently above
	var hoverI = (mouse[0] / W) * N;
	hoverI = Math.min(Math.floor(hoverI), N-1);

	// figure out selections
	var selections = [];
	var indices = [];
	if (this.aggregation == "weekly") 
	{

		// figure out day of week
		var hourOfDay = hoverI % 24;
		var dayOfWeek = Math.floor(hoverI / 24);
		var rangeI = [ Math.max(hoverI-R, 0), Math.min(hoverI+R, N-1) ];
		var rangeD = [ hoverI-rangeI[0], hoverI-rangeI[1] ];
		var dayRange = [];

		if (this.mode == EDIT_ONE)
		{
			dayRange = [dayOfWeek, dayOfWeek];
		}
		else if (this.mode == EDIT_WEEKDAY)
		{
			if (dayOfWeek == 5 || dayOfWeek == 6)
			{
				dayRange = [5, 6];
			}
			else
			{
				dayRange = [0, 4];
			}
		}
		else if (this.mode == EDIT_ALL)
		{
			dayRange = [0, 6];
		}

		for (var d=dayRange[0]; d<= dayRange[1]; d++) 
		{
			var dOffset = d * 24 + hourOfDay;
			var range = [Math.max(0, dOffset - rangeD[0]), Math.min(dOffset - rangeD[1], 24*7-1)];
			selections.push(range);

		}
	}
	
	this.selections = selections;

	
	var updateSelection = this.rangeGroup.selectAll("rect.editSelection").data(selections);
	updateSelection.enter().append("rect")
		.attr("class", "editSelection")
		.attr("height", H)
		.style("fill", "#fff2e5");

	updateSelection
		.attr("x", function(d) { return d[0]/N * W; })
		.attr("y", "0")
		.attr("width", function(d) { return (d[1]-d[0])/N * W; })
	
	updateSelection.exit().remove();
	
}

SignalEditor.prototype.mouseout = function(mouse)
{
	this.group.selectAll("rect.editSelection").remove();
	this.selections = [];
}

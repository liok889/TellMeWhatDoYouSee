/* --------------------------------------------
 * Cluster Selector
 * selector.js
 * ============================================
 */

var SELECTION_SERIAL = 1;
function Selection(color, members, avgTimeseries, selector)
{
	this.selectionID = SELECTION_SERIAL++;
	this.members = members;
	this.avgTimeseries = avgTimeseries;
	this.parentSelector = selector;
	this.color = color;
}

Selection.prototype.getMembers = function() 
{
	return this.members;
}

Selection.prototype.getTimeseries = function() {
	return this.avgTimeseries;
}

Selection.prototype.getColor = function() {
	return this.color;
}

Selection.prototype.updateMemberList = function(newMembers)
{
	if (newMembers) {
		this.members = newMembers;
		this.avgTimeseries = calcAvgTimeseries(newMembers);
	}

	var pathGenerator = this.avgTimeseries.getPathGenerator(
		ClusterSelector.RECT_W, 
		ClusterSelector.RECT_H,
		ClusterSelector.RECT_PAD		
	);
	var PAD = ClusterSelector.RECT_PAD;

	// append the path
	if (!this.pathG) {
		this.pathG = this.content.append("g").attr("transform", "translate(" + PAD + "," + PAD + ")");
		this.pathG.append("path")
			.attr("class", "timeseriesSelection")
			.attr("d", pathGenerator(this.avgTimeseries.getSeries()))
			.attr("stroke", "black")
			.attr("stroke-width", "1px")
			.attr("fill", "none");
	}
	else
	{
		this.pathG.selectAll("path.timeseriesSelection").attr("d", pathGenerator(this.avgTimeseries.getSeries()));
	}
};

Selection.prototype.populateSelection = function(g)
{
	// create a group and rectangle
	this.g = g;
	this.content = g.append("g");
	this.rect = this.content.append("rect")
		.attr("width", ClusterSelector.RECT_W)
		.attr("height", ClusterSelector.RECT_H)
		.attr("fill", this.color || ClusterSelector.LAST_COLOR)
		.attr("rx", 3.5)
		.attr("ry", 3.5)
		.attr("stroke", "");

	// this will draw the average time series
	this.updateMemberList();

	// add buttons
	(function(thisSelection) 
	{

		var imgH = 1.7*ClusterSelector.RECT_H/4-4;
		var imgX = ClusterSelector.RECT_W+ClusterSelector.RECT_PAD;

		thisSelection.g.append("image")
			.attr("xlink:href", "assets/cross.svg")
			.attr("clas", "svgButton")
			.attr("x", imgX)
			.attr("y", 2)
			.attr("width", imgH)
			.attr("height", imgH)
			.on("click", function() 
			{
				thisSelection.parentSelector.removeSelection(thisSelection);
			});

		thisSelection.g.append("image")
			.attr("xlink:href", "assets/show.svg")
			.attr("clas", "svgButton")
			.attr("x", imgX)
			.attr("y", 4 + imgH)
			.attr("width", imgH)
			.attr("height", imgH);

		thisSelection.content
			.on("mouseover", function() 
			{
				thisSelection.rect
					.style("stroke", BRUSH_COLOR)
					.style("stroke-width", "2px");
				thisSelection.parentSelector.brushOut = undefined;
				thisSelection.parentSelector.brushMembers(thisSelection);

			})
			.on("mouseout", function() 
			{
				thisSelection.rect
					.style("stroke", "")
					.style("stroke-width", "");
				thisSelection.parentSelector.brushOut = true;

				setTimeout(function() {
					if (thisSelection.parentSelector.brushOut) {
						thisSelection.parentSelector.brushMembers();
					}
				}, 150);
			});

	})(this)
}


Selection.prototype.jiggle = function()
{
	var JIGGLE_FACTOR = 1.2;
	(function(g, transform) 
	{
		var xOffset = (1.0 - JIGGLE_FACTOR)*ClusterSelector.RECT_W/2;
		var yOffset = (1.0 - JIGGLE_FACTOR)*ClusterSelector.RECT_H/2;

		g.transition().duration(50)
			.attr("transform", transform + (transform !== "" ? "," : "") + "scale(" + JIGGLE_FACTOR + "),translate(" + xOffset + "," + yOffset + ")");

		setTimeout(function() {
			g.transition().duration(60).attr("transform", transform);
		}, 60);
	})(this.g, this.g.attr("transform"))
}


/* ======================================
 * ClusterSelector
 * ======================================
 */
function ClusterSelector(svg, grid)
{
	// initialize to empty selections
	this.selections = [];
	this.selectionMap = d3.map();

	this.svg = svg;
	this.grid = grid;

	// to initialize available set of colors
	this.clearAll();

	// color map
	this.colorMap = d3.map();
}

ClusterSelector.prototype.setMDS = function(_mds) {
	this.mds = _mds;
}

ClusterSelector.prototype.getColorMap = function()
{
	return this.colorMap;
}

ClusterSelector.prototype.hasColors = function()
{
	return ClusterSelector.SELECTION_COLORS.length > 0;
}

ClusterSelector.prototype.removeSelection = function(selection)
{
	for (var i=0, N=this.selections.length; i<N; i++) 
	{
		if (this.selections[i] == selection) {
			this.selections.splice(i, 1);
			break;
		}
	}

	if (selection.color && selection.color != ClusterSelector.LAST_COLOR) {
		// return color to available pool of colors
		ClusterSelector.SELECTION_COLORS.push(selection.color);
	}
	this.updateSelections();
}

ClusterSelector.prototype.updateSelections = function() 
{
	var update = this.svg.selectAll("g.ClusterSelectionGroup").data(
		this.selections, 
		function(selection) { return selection.selectionID; }
	);
	
	// enter
	var enter = update.enter()
		.append("g").attr("class", "ClusterSelectionGroup").attr("transform", "translate(0,900)")
		.each(function(d, i) {
			d.populateSelection(d3.select(this));
		});

	// update
	update.transition().duration(350).attr("transform", function(d, i) { 
		return "translate(0," + (i*(ClusterSelector.RECT_OFFSET + ClusterSelector.RECT_H)) + ")";
	})

	// exit
	update.exit().transition().attr("transform", function(d) {
		return d3.select(this).attr("transform") + ",scale(" + (1e-6) + ")";
	});

	// build color map
	var colorMap = d3.map();
	for (var i=0, N=this.selections.length; i<N; i++) 
	{
		var selection = this.selections[i];
		var members = selection.getMembers();
		for (var j=0, K=members.length; j<K; j++) 
		{
			colorMap.set( members[j].id, selection.color );

		}
	}
	this.colorMap = colorMap;

	// if we have a reference to MDS, restore colors
	if (this.mds) 
	{
		this.mds.setColorMap(this.colorMap);
		this.mds.restoreColors();
	}
}

ClusterSelector.prototype.newSelection = function(members)
{
	var modifiedSelections = [];
	var _newMap = mapifyMemberList(members);

	// check previous selections and see if we have overlapping members
	// if we do, remove those members from the earlier selections
	for (var i=0; i < this.selections.length; i++) 
	{
		var s = this.selections[i];
		var sM = s.getMembers();
		var _curMap = mapifyMemberList( sM );

		var ret = (function(curMap, newMap) 
		{
			var list = [];
			var changed = false;
			var completeOverlap = true;

			curMap.forEach(function(key, value) 
			{
				if (!newMap.get(key)) 
				{
					list.push(value);
					completeOverlap = false;
				}
				else
				{
					changed = true;
				}
			});

			completeOverlap = completeOverlap && changed;

			return {
				fullOverlap: completeOverlap,
				changed: changed,
				memberList: list
			};
		})(_curMap, _newMap);

		if (ret.fullOverlap && (sM.length == members.length)) 
		{
			s.jiggle();
			return;
		}
		else if (ret.changed) 
		{
			if (ret.memberList.length > 0) 
			{
				modifiedSelections.push(s);
				s.updateMemberList(ret.memberList);
			}
			else
			{
				// cluster is now empty, remove it
				this.selections.splice(i, 1);
				if (s.color && s.color != ClusterSelector.LAST_COLOR) 
				{
					// return color to available pool of colors
					ClusterSelector.SELECTION_COLORS.push(s.color);
				}
				i--;
			}
		}
	}

	// average the time series
	var avgTimeseries = calcAvgTimeseries(members);

	// add a selection to the cluster group
	var color = null;
	if (ClusterSelector.SELECTION_COLORS.length > 0) {
		color = ClusterSelector.SELECTION_COLORS.pop();
	}
	else {
		color = ClusterSelector.LAST_COLOR;
	}

	// add to selection
	var selection = new Selection(color, members, avgTimeseries, this);
	this.selections.push( selection );

	// update selections
	this.updateSelections();
}

ClusterSelector.prototype.clearAll = function() 
{
	this.selections = [];
	this.selectionMap = d3.map();
	this.svg.selectAll("g").remove();
	ClusterSelector.SELECTION_COLORS = [];
	ClusterSelector.DEFAULT_COLORS.forEach(function(element) {
		ClusterSelector.SELECTION_COLORS.push(element);
	});

	// clear out existing color map
	this.colorMap = d3.map();
	if (this.mds) {
		this.mds.setColorMap(this.colorMap);
		this.mds.restoreColors();
	}
}

ClusterSelector.prototype.setSelectionBrushCallback = function(callback) {
	this.selectionBrushCallback = callback;
}

ClusterSelector.prototype.brushMembers = function(selection)
{
	if (this.selectionBrushCallback)
	{
		var ids = [];
		var members = selection ? selection.getMembers() : [];
		for (var i=0, N=members.length; i<N; i++) 
		{
			ids.push(members[i].id);
		}
		this.selectionBrushCallback(ids);
	}
}

function mapifyMemberList(ar) 
{
	var m = d3.map();
	for (var i=0, N=ar.length; i<N; i++) {
		m.set(ar[i].id, ar[i]);
	}
	return m;
}

function calcAvgTimeseries(members)
{
	// average the time series
	var avgTimeseries = new Timeseries();

	for (var i = 0, len = members.length; i < len; i++) 
	{
		var member = members[i];
		if (avgTimeseries.size() == 0) 
		{
			avgTimeseries.initEmpty( member.timeseries.size() );
		}

		// blend the time series
		avgTimeseries.add( member.timeseries );
	}
	avgTimeseries.normalize();
	return avgTimeseries;
}

// constants
// ==========
//ClusterSelector.DEFAULT_COLORS = ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2'].reverse();
ClusterSelector.DEFAULT_COLORS = ['#fb8072','#80b1d3','#fdb462','#8dd3c7', '#bebada','#b3de69','#fccde5','#d9d9d9'].reverse();
ClusterSelector.SELECTION_COLORS = null;
ClusterSelector.LAST_COLOR = '#8dd3c7';
ClusterSelector.RECT_W = 140;
ClusterSelector.RECT_H = 37;
ClusterSelector.RECT_PAD = 3;
ClusterSelector.RECT_OFFSET = 2;


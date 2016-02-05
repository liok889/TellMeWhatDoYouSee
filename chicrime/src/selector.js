/* --------------------------------------------
 * Cluster Selector
 * selector.js
 * ============================================
 */

var SELECTION_SERIAL = 1;
function Selection(color, members, selector)
{
	this.selectionID = SELECTION_SERIAL++;
	this.members = members;
	this.avgTimeseries = calcAvgTimeseries(members);
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
			.attr("class", "selectionCurve")
			.attr("d", pathGenerator(this.avgTimeseries.getSeries()));
	}
	else
	{
		this.pathG.selectAll("path.selectionCurve").transition()
			.attr("d", pathGenerator(this.avgTimeseries.getSeries()));
	}
};

Selection.prototype.getContentContainer = function()
{
	return this.content;
}

Selection.prototype.populateSelection = function(g)
{
	// create a group and rectangle
	this.g = g;
	this.content = g.append("g");
	this.rect = this.content.append("rect")
		.attr("width", ClusterSelector.RECT_W)
		.attr("height", ClusterSelector.RECT_H)
		.attr("fill", this.color || ClusterSelector.LAST_COLOR)
		.attr("fill-opacity", "0.6")
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
			})
			.on("mousedown", function() {
				thisSelection.parentSelector.beginDragSelection(thisSelection);
				
				// register mousemove callback on window so we can continue to track dragging
				d3.select(window).on("mousemove.selectionDrag", function() {
					thisSelection.parentSelector.dragSelection(thisSelection);
				})
				d3.select(window).on("mouseup.selectionDrag", function() {

					// unregister event handlers
					d3.select(window).on("mouseup.selectionDrag", null);
					d3.select(window).on("mousemove.selectionDrag", null);

					thisSelection.parentSelector.endDragSelection(thisSelection);

				})
			});

	})(this)
}


Selection.prototype.jiggle = function()
{
	var JIGGLE_FACTOR = 1.2;
	if (this.jiggling) {
		// prevent more than one jiggle animation
		return;
	}
	else
	{
		this.jiggling = true;
		(function(g, transform, selection) 
		{
			var xOffset = (1.0 - JIGGLE_FACTOR)*ClusterSelector.RECT_W/2;
			var yOffset = (1.0 - JIGGLE_FACTOR)*ClusterSelector.RECT_H/2;
			var oldTransform = (transform !== "") ? (transform + ",")  : "";

			g.transition().duration(50)
				.attr("transform", oldTransform + "scale(" + JIGGLE_FACTOR + "),translate(" + xOffset + "," + yOffset + ")");

			setTimeout(function() {
				g.transition().duration(60).attr("transform", transform).each("end", function() {
					selection.jiggling = undefined;
				});
			}, 60);
		})(this.g, this.g.attr("transform"), this)
	}
}


/* ======================================
 * ClusterSelector
 * ======================================
 */
function ClusterSelector(svg, grid, _offset)
{
	// initialize to empty selections
	this.selections = [];

	this.svg = svg;
	this.grid = grid;

	// to initialize available set of colors
	this.clearAll();

	// color map
	this.colorMap = d3.map();

	// store transform
	this.selectionWidgetOffset = _offset;
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

	if (selection.color && selection.color != ClusterSelector.LAST_COLOR && !selection.hasOwnColor) {
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
	var exitSelection = update.exit();
	(function(callback, exit) 
	{
		exit.transition().attr("transform", function(d) {
			return d3.select(this).attr("transform") + ",scale(" + (1e-6) + ")";
		});

		if (callback) {
			exit.each(function(selection) {
				callback(selection);
			});
		}
	})( this.removeSelectionCallback, exitSelection );

	// build color map
	var colorMap = d3.map();
	for (var i=0, N=this.selections.length; i<N; i++) 
	{
		var selection = this.selections[i];
		var members = selection.getMembers();
		for (var j=0, K=members.length; j<K; j++) 
		{
			var interpolator = d3.interpolate( selection.color, "#ffffff" );
			colorMap.set( members[j].id, selection.color == ClusterSelector.LAST_COLOR ? selection.color : interpolator(0.25) );

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

ClusterSelector.prototype.getSelectionOffset = function(selection)
{
	var I = this.getSelectionIndex(selection);
	if (I === null) {
		return null;
	}
	else
	{
		return [0, I * (ClusterSelector.RECT_OFFSET + ClusterSelector.RECT_H) ];
	}
}

ClusterSelector.prototype.getSelectionIndex = function(selection)
{
	for (var i=0, N=this.selections.length; i<N; i++) {
		if (this.selections[i] == selection) {
			return i;
		}
	}
	return null;
}

ClusterSelector.prototype.newSelection = function(members, ownColor)
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
				if (this.updateSelectionCallback) {
					this.updateSelectionCallback( s );
				}
			}
			else
			{
				// cluster is now empty, remove it
				this.selections.splice(i, 1);
				if (s.color && s.color != ClusterSelector.LAST_COLOR && !s.hasOwnColor) 
				{
					// return color to available pool of colors
					ClusterSelector.SELECTION_COLORS.push(s.color);
				}
				i--;
			}
		}
	}

	// add a selection to the cluster group
	var hasOwnColor = false;
	var color = ownColor;
	if (color)
	{
		hasOwn = true;
	}
	else 
	{
		if (ClusterSelector.SELECTION_COLORS.length > 0) {
			color = ClusterSelector.SELECTION_COLORS.pop();
		}
		else {
			color = ClusterSelector.LAST_COLOR;
		}
	}

	// add to selection
	var selection = new Selection(color, members, this); selection.hasOwnColor = hasOwnColor
	this.selections.push( selection );

	// update selections
	this.updateSelections();
}

ClusterSelector.prototype.clearAll = function() 
{
	this.selections = [];
	this.svg.selectAll("g").transition().remove();

	// restore default selection colors
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

ClusterSelector.prototype.beginDragSelection = function(selection)
{
	this.draggedSelection = selection;
}

ClusterSelector.prototype.dragSelection = function(selection)
{
	var mouseSVG = d3.mouse(this.svg.node());
	var coord = [];

	if (!this.dragG)
	{
		var container = selection.getContentContainer();
		this.dragG = d3.select(this.svg.node().parentElement).append("g")
			.attr("class", "exploreDrag");
		this.dragG.html( container.html() );

		var selectionOffset = this.getSelectionOffset(selection);
		var mouseInRect = d3.mouse(container.node());
		coord = [
			this.selectionWidgetOffset[0] + mouseSVG[0] - mouseInRect[0],
			this.selectionWidgetOffset[1] + mouseSVG[1] - mouseInRect[1],	
		];

		this.dragGCoord0 = mouseSVG;
		this.dragGCoord1 = coord;
	}
	else
	{
		coord = [
			this.dragGCoord1[0] - this.dragGCoord0[0] + mouseSVG[0],
			this.dragGCoord1[1] - this.dragGCoord0[1] + mouseSVG[1]
		];

	}
	
	// drag the selection
	this.dragG.attr("transform", "translate(" + coord[0] + "," + coord[1] + ")");

	// do a callback
	if (this.dragCallback)
	{
		this.dragCallback(selection);
	}
}

ClusterSelector.prototype.endDragSelection = function(selection)
{
	if (this.dragG) 
	{
		this.dragG.remove();
		this.dragG = undefined;
	
		if (this.endDragCallback) {
			this.endDragCallback(selection);
		}
	}
	this.draggedSelection = undefined;

}

ClusterSelector.prototype.setDragCallback = function(drag, endDrag) {
	this.dragCallback = drag;
	this.endDragCallback = endDrag;
}
ClusterSelector.prototype.setRemoveSelectionCallback = function(callback) {
	this.removeSelectionCallback = callback;
}
ClusterSelector.prototype.setUpdateSelectionCallback = function(callback) {
	this.updateSelectionCallback = callback;
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
//ClusterSelector.DEFAULT_COLORS = ['#fb8072','#80b1d3','#fdb462','#8dd3c7', '#bebada','#b3de69','#fccde5','#d9d9d9'].reverse();
ClusterSelector.DEFAULT_COLORS = ['#fdbf6f', '#a6cee3','#b2df8a','#cab2d6','#1f78b4',,'#33a02c','#ff7f00','#6a3d9a', /*'#e31a1c',*/'#b15928'];

ClusterSelector.SELECTION_COLORS = null;
ClusterSelector.LAST_COLOR = '#d9d9d9';
ClusterSelector.RECT_W = 140;
ClusterSelector.RECT_H = 37;
ClusterSelector.RECT_PAD = 3;
ClusterSelector.RECT_OFFSET = 2;


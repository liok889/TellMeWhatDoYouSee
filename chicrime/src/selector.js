/* --------------------------------------------
 * Cluster Selector
 * selector.js
 * ============================================
 */

function Selection(svg, color, members, avgTimeseries)
{
	this.members = members;
	this.avgTimeseries = avgTimeseries;

	// create a group and rectangle
	this.g = svg.append("g");
	this.rect = this.g.append("rect")
		.attr("width", ClusterSelector.RECT_W)
		.attr("height", ClusterSelector.RECT_H)
		.attr("fill", color)
		.attr("rx", 3.5)
		.attr("ry", 3.5)
		.attr("stroke", "");

	var PAD = ClusterSelector.RECT_PAD;
	var pathW = ClusterSelector.RECT_W - PAD*2;
	var pathH = ClusterSelector.RECT_H - PAD*2;
	var pathGenerator = this.avgTimeseries.getPathGenerator(pathW, pathH);

	// append the path
	var pathG = this.g.append("g").attr("transform", "translate(" + PAD + "," + PAD + ")");
	pathG.append("path")
		.attr("d", pathGenerator(this.avgTimeseries.getSeries()))
		.attr("stroke", "black")
		.attr("stroke-width", "1px")
		.attr("fill", "none");

	var imgH = ClusterSelector.RECT_H/2-4;
	var imgX = ClusterSelector.RECT_W+ClusterSelector.RECT_PAD;

	this.g.append("image")
		.attr("xlink:href", "assets/cross.png")
		.attr("x", imgX)
		.attr("y", 2)
		.attr("width", imgH)
		.attr("height", imgH);

	this.g.append("image")
		.attr("xlink:href", "assets/show.png")
		.attr("x", imgX)
		.attr("y", 4 + imgH)
		.attr("width", imgH)
		.attr("height", imgH);

}

Selection.prototype.remove = function() {

}

function ClusterSelector(svg, grid)
{
	// initialize to empty selections
	this.selections = [];
	this.selectionMap = d3.map();

	this.svg = svg;
	this.grid = grid;

	// to initialize available set of colors
	this.clearAll();
}

ClusterSelector.prototype.hasColors = function()
{
	return ClusterSelector.SELECTION_COLORS.length > 0;
}

ClusterSelector.prototype.isSelected = function(clusterID) 
{
	return this.selectionMap.get( clusterID );
}

ClusterSelector.prototype.newSelection = function(cluster, members)
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

	// normalize timeseries to get the average
	avgTimeseries.normalize();

	// add a selection to the cluster group
	var color = null;
	if (ClusterSelector.SELECTION_COLORS.length > 0) {
		color = ClusterSelector.SELECTION_COLORS.pop();
	}
	else {
		color = ClusterSelector.LAST_COLOR;
	}

	var yOffset = this.selections.length * (ClusterSelector.RECT_OFFSET + ClusterSelector.RECT_H)
	var g = this.svg.append("g")
		.attr("transform", "translate(0,900)")

	// add to selection
	var selection = new Selection(g, color, members, avgTimeseries);
	this.selections.push( selection );
	this.selectionMap.set( cluster.getID(), selection )

	// pop up from the bottom
	g.transition()
		.attr("transform", "translate(0," + yOffset + ")");
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
}

// constants
// ==========
ClusterSelector.DEFAULT_COLORS = ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2'].reverse();
ClusterSelector.SELECTION_COLORS = null;
ClusterSelector.LAST_COLOR = '#f2f2f2';
ClusterSelector.RECT_W = 140;
ClusterSelector.RECT_H = 37;
ClusterSelector.RECT_PAD = 3;
ClusterSelector.RECT_OFFSET = 2;


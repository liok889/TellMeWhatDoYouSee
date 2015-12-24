/* ------------------------------------------------
 * Pattern visualizer: 
 * summary of patterns in a small-multiples layout
 * ================================================
 */

var MULTIPATTERNS_PAD = 4;
var MULTIPATTERNS_CELL_W = 50;
var MULTIPATTERNS_CELL_H = 30;

function PatternCell(r, c, group)
{
	this.members = [];
	this.group = group;
	this.r = r;
	this.c = c;
}

PatternCell.prototype.getRow = function() { return this.r; }
PatternCell.prototype.getCol = function() { return this.c; }

PatternCell.prototype.addMDSPoint = function(mdsPoint)
{
	this.members.push(mdsPoint);
}

PatternCell.prototype.getAvgTimeseries = function()
{
	if (!this.avgTimeseries) {
		this.calcAvgTimeseries();
	}
	return this.avgTimeseries;
}

PatternCell.prototype.calcAvgTimeseries = function()
{
	this.avgTimeseries = new Timeseries();
	for (var i=0, N=this.members.length; i<N; i++) 
	{
		var m = this.members[i];
		var t = gridAnalysis.getTimeseries( m.getID() );
		this.avgTimeseries.add(t);
	}
	return this.avgTimeseries;
}

/* ----------------------------------
 * PatternVis:
 * generates a small-multipatterns
 * ==================================
 */

function PatternVis(mds, svg, w, h)
{
	this.group = svg.append("g")
		.attr("transform", "translate(" + 0 + "," + 0 + ")");

	this.mds = mds;
	this.w = w;
	this.h = h;
}

PatternVis.prototype.clearAll = function()
{
	this.group.selectAll("g.smallMultipatterns").remove();
}

PatternVis.prototype.setVisibility = function(visible)
{
	this.group.selectAll("g.smallMultipatterns")
		.attr("visibility", visible ? "visible" : "hidden")
}

PatternVis.prototype.remove = function()
{
	this.group.selectAll("g.smallMultipatterns").remove();
}

// creates a simple small-multiples layout of R x C cells
// elements are grouped depending on how do they fall within
// the layout
PatternVis.prototype.makeSimpleLayout = function(R, C)
{
	var group = this.group.selectAll("g.smallMultipatterns");
	if (group.size() == 0) {
		group = this.group.append("g")
			.attr("class", "smallMultipatterns");
	}

	// remove any existing cells
	group.selectAll("g").remove();

	// divide mds points 

	// create layout
	var cellList = [];
	this.layout = [];
	this.R = R; this.C = C;
	this.layout.length = R;
	for (var r=0; r<R; r++) 
	{
		var row = [];
		row.length = C;
		for (var c=0; c<C; c++) 
		{
			var cell = new PatternCell(r, c);
			row[c] = cell;
			cellList.push( cell );
		}
		this.layout[r] = row;
	}

	this.cellW = this.w / C;
	this.cellH = this.h / R;

	// divide mds points into the cells, depending on how they fall
	var mdsPoints = this.mds.getPoints();
	for (var i=0, N=mdsPoints.length; i<N; i++)
	{
		var p = mdsPoints[i];
		var nC = p.getNormalizedCoordinate();
		var r = Math.min(R-1, Math.floor(nC[1] * R));
		var c = Math.min(C-1, Math.floor(nC[0] * C));
		this.layout[r][c].addMDSPoint(p);
	}

	var updateSelection = group.selectAll("g.smallMultipatternsCell").data(cellList);
			
	// put a rectangle
	(function(thisLayout, enter) 
	{

		enter.append("g")
			.attr("class", "smallMultipatternsCell")
			.attr("transform", function(cell) {
				return "translate(" + (cell.getCol()*thisLayout.cellW) + "," + (cell.getRow()*thisLayout.cellH) + ")";
			})
			.each(function(cell) 
			{
				cell.group = d3.select(this);
				cell.group.append("rect")
					.attr("width", thisLayout.cellW)
					.attr("height", thisLayout.cellH)
					.style("stroke-width", "0.5px")
					.style("stroke", "black")
					.style("fill", "none");

				var timeseries = cell.getAvgTimeseries();
				var pathGenerator = timeseries.getPathGenerator(
					thisLayout.cellW, 
					thisLayout.cellH, 
					MULTIPATTERNS_PAD
				);
				cell.path = cell.group.append("path")
					.attr("transform", "translate(" + MULTIPATTERNS_PAD + "," + MULTIPATTERNS_PAD + ")")
					.attr("d", pathGenerator(timeseries.getSeries()))
					.attr("stroke", "black")
					.attr("stroke-width", "1px")
					.attr("fill", "none");
			});
	})(this, updateSelection.enter());
}

PatternVis.prototype.clusterMDS = function()
{
}


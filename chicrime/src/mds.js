/* ===================================
 * MDS projection
 * Code based on
 * ===================================
 */

// constants
var MDS_POINT_RADIUS = 4.5;
var MDS_PADDING = 10;

/* =======================
 * MDSPoint and MDS
 * =======================
 */

function MDSPoint(coordinate, cell, _index) {
	this.coordinate = coordinate;
	this.cell = cell;
	this.p = [];
	this.id = _index;
}

MDSPoint.prototype.getID = function() {
	return this.id;
}

MDSPoint.prototype.getCoordinate = function() {
	return this.coordinate;
}

MDSPoint.prototype.getCell = function() {
	return this.cell;
}

function MDS(svg, width, height)
{
	this.svg = svg;
	this.w = width || +svg.attr("width");
	this.h = height || +svg.attr("height");
	this.colorMap = d3.map();
}

MDS.prototype.setColorMap = function(_colorMap) {
	this.colorMap = _colorMap;
}

MDS.prototype.classic = function(distances, dimensions)
{
	dimensions = dimensions || 2;
	
	// square distances
	var M = numeric.mul(-0.5, numeric.pow(distances, 2));
	
	// double centre the rows/columns
	/*
	function mean(A) { return numeric.div(numeric.add.apply(null, [A]), A.length); }
	var rowMeans = mean(M),
	colMeans = mean(numeric.transpose(M)),
	totalMean = mean(rowMeans);
	*/

	// calculate row, column, and whole means
	var N = M.length;
	var rowMeans = calcRowMeans(M);
	var colMeans = calcColMeans(M);
	var totalMean = calcMean(rowMeans);

	for (var i = 0; i < M.length; ++i) {
		for (var j =0; j < M[0].length; ++j) {
			M[i][j] += totalMean - rowMeans[i] - colMeans[j];
		}
	}

	// take the SVD of the double centred matrix, and return the
	// points from it
	console.log("calculating SVD...");
	var ret = numeric.svd(M),
	eigenValues = numeric.sqrt(ret.S);
	console.log("OK");

	return ret.U.map(function(row) {
		return numeric.mul(row, eigenValues).splice(0, dimensions);
	});
}

MDS.prototype.plotMDS = function(distances, cellIndex, dimensions, gridAnalysis)
{
	// remove an earlier MDS group and create a new one
	this.svg.selectAll("g.mdsPointGroup").remove();
	if (this.brush) 
	{
		// remove brush
		this.brush.clear();
		this.svg.selectAll("g.brush").remove();
		this.brush = undefined;
		this.brushCell = undefined;
	}
	this.brushedMDSPoints = undefined;
	this.brushedIDs = undefined;

	// create a new <g> for the MDS points
	var group = this.svg.append("g")
		.attr("class", "mdsPointGroup");


	// classical MDS projection	
	var positions = this.classic(distances, dimensions);
	var points = [];

	// figure out min/max coordinates and construct scales
	var xDomain = [Number.MAX_VALUE, -Number.MAX_VALUE];
	var yDomain = [Number.MAX_VALUE, -Number.MAX_VALUE];

	for (var i=0, len=positions.length; i <len; i++) {

		var p = positions[i];
		xDomain[0] = Math.min(xDomain[0], p[0]);
		xDomain[1] = Math.max(xDomain[1], p[0]);
		
		yDomain[0] = Math.min(yDomain[0], p[1]);
		yDomain[1] = Math.max(yDomain[1], p[1]);
	
		// put positions into MDSPoint objects so that we can easily link
		// them to their corresponding cell in the map
		points.push( new MDSPoint(p, cellIndex[i], i) );
	}
	var xScale = d3.scale.linear().domain(xDomain).range([0+MDS_PADDING, this.w-MDS_PADDING]);
	var yScale = d3.scale.linear().domain(yDomain).range([0+MDS_PADDING, this.h-MDS_PADDING]);

	(function(grid, g, dataPoints, xS, yS, thisObject) 
	{
		// create circles
		thisObject.mdsPointSelection = g.selectAll("circle").data(dataPoints).enter().append("circle")
			.attr("class", "mdsCircle")
			.attr("cx", function(d) { var x = xS(d.coordinate[0]); d.p[0] = x; return x; })
			.attr("cy", function(d) { var y = yS(d.coordinate[1]); d.p[1] = y; return y; })
			.attr("r", MDS_POINT_RADIUS)
			.attr("id", function(d) { return "mds_circle_" + d.cell[0] + "_" + d.cell[1]; });

		// create the brush, if doesn't already exist
		if (!thisObject.brush) 
		{
			// create a scale for the brush
			var x = d3.scale.identity().domain([0, thisObject.w]);
			var y = d3.scale.identity().domain([0, thisObject.h]);
			
			// create a brush, if one does not already exist
			thisObject.brush = d3.svg.brush();
			thisObject.brush
				.x(x)
				.y(y)
				.on("brushstart", function() {
					thisObject.brushstart();
				})
				.on("brush", function() {
					thisObject.brushmove();
				})
				.on("brushend", function() {
					thisObject.brushend();
				});

			thisObject.svg.append("g").attr("class", "brush").call(thisObject.brush);
			console.log("Adding click to imgAddSelection");
			d3.select("#imgAddSelection")
				.on("click", function() 
				{
					console.log("imgAddSelection click");
					grid.makeBrushSelection(thisObject.brushedIDs);
				})
				.on("mouseover", function() {
					console.log("imgAdd mouse over");
				});

		}
	})(gridAnalysis, group, points, xScale, yScale, this);
	
	// store reference to GridAnalysis
	this.grid = gridAnalysis;
}

MDS.prototype.applyColorMap = function(_excludeMap)
{
	if (_excludeMap && Array.isArray(_excludeMap)) 
	{
		var theMap = d3.map();
		for (var i=0, N=_excludeMap.length; i<N; i++) {
			theMap.set( _excludeMap[i], true );
		}
		_excludeMap = theMap;
	}

	(function(colorMap, mdsPointSelection, excludeMap) {
		mdsPointSelection.each(function(d) 
		{
			var id = d.getID();
			var selectionColor = colorMap.get(id);
			if (selectionColor && !excludeMap.get(id)) 
			{
				d3.select(this).style("fill", selectionColor);
			}
		});
	})(this.colorMap, this.mdsPointSelection, _excludeMap || d3.map());
}

MDS.prototype.restoreColors = function()
{
	if (this.brushedSelection) 
	{
		this.brushmove(true);
	}
	else
	{
		this.mdsPointSelection.style("fill", "");
		this.applyColorMap();
	}	
}

MDS.prototype.brushPoints = function(ids)
{
	if (!ids || ids.length == 0) 
	{
		this.mdsPointSelection.style("fill", "").style("fill-opacity", "").style("stroke", "");

		// restored brushed selection, if any
		this.restoreColors();
		return [];
	}
	else
	{
		// if existing brushed selection, dim down the opacity of those
		if (this.brushedSelection) {
			this.brushedSelection.style("fill-opacity", "0.15").style("stroke", "none");
		}

		// unpack list of of IDs to brush
		var _brushed = [];
		var _idMap = d3.map();
		for (var i=0, len=ids.length; i<len; i++) {
			_idMap.set(ids[i], true);
		}

		// remove highlight for all
		this.mdsPointSelection.style("fill", "");

		// select points that are to be brushed
		var pointSelection = (function(idMap, mdsPointSelection, brushedList, colorMap) {

			var selection = mdsPointSelection.filter(function(d) 
			{
				var id = d.getID();

				if (idMap.get(id)) 
				{
					// remove and put at top
					var n = jQuery(this);
					n.parent().append(n.detach());
					brushedList.push(d);
					return true;
				}
				else {
					var selectionColor = colorMap.get(id);
					if (selectionColor) {
						d3.select(this).style("fill", selectionColor);
					}
					return false;
				}				
			});
			return selection;
		})(_idMap, this.mdsPointSelection, _brushed, this.colorMap);

		if (this.brushedSelection) {
			this.brushedSelection.style("fill", BRUSH_COLOR)
		}

		// points to be brushed
		pointSelection
			.style("fill", BRUSH_COLOR)
			.style("fill-opacity", "")
			.style("stroke", "");
		
		return _brushed;
	}
}

// Clear the previously-active brush, if any.
MDS.prototype.brushstart = function(_brushCell)
{
	if (this.brushCell !== _brushCell) 
	{
		d3.select(this.brushCell).call(this.brush.clear());
		this.brushCell = _brushCell;
	}
	d3.select("#imgAddSelection").style("visibility", "visible");
}

MDS.prototype.brushmove = function(hasNotMoved) 
{
	var e = this.brush.extent();
	
	var brushedPoints = [];
	var brushedIDs = [];
	
	var brushedSelection;
	if (!hasNotMoved) 
	{
		brushedSelection = (function(brushed, ids, svg) 
		{
			
			var selection = svg.selectAll("circle");
			var brushedSelection = selection.filter(function (d) {
				var out = 

					e[0][0] > d.p[0] || d.p[0] > e[1][0] ||
					e[0][1] > d.p[1] || d.p[1] > e[1][1];

				if (out) {
					return false 
				} 
				else 
				{
					brushed.push(d);
					ids.push(d.getID());
					return true;
				}			
			});
			return brushedSelection;
			
		})(brushedPoints, brushedIDs, this.svg);
	}
	else
	{
		brushedIDs = this.brushedIDs;
		brushedSelection = this.brushedSelection;
		brushedPoints = this.brushedMDSPoints;
	}

	// de-highlight all points
	this.svg.selectAll("circle").style("fill", "");

	// highlight only the brushed selection
	brushedSelection.style("fill", BRUSH_COLOR);
	
	if (brushedSelection.size() > 0) 
	{
		this.brushedSelection = brushedSelection;
	}
	else {
		this.brushedSelection = undefined;
	}

	// brush the heatmap and the matrix
	this.grid.highlightHeatmapCell(brushedPoints, true);
	this.grid.brushMatrixElements( brushedIDs );

	// store a list of MDS points we brushed
	this.brushedMDSPoints = brushedPoints;
	this.brushedIDs = brushedIDs;

	// apply selection color
	this.applyColorMap(brushedIDs);

	return brushedIDs;
}

// If the brush is empty, select all circles.
MDS.prototype.brushend = function() 
{
	if (this.brush.empty()) {
		this.svg.selectAll("circle").style("fill", "");		
		this.applyColorMap();
		d3.select("#imgAddSelection").style("visibility", "hidden");
	}
}

// helper functions
function pow(x, y)
{
	return Math.pow(x, y);
}

function calcRowMeans(M)
{
	var N = M.length;
	var means = [];

	for (var i=0; i<N; i++) {

		var t=0;
		for (var j=0; j<N; j++)
		{
			t += M[i][j]
		}
		means.push(t/N);
	}
	return means;
}

function calcColMeans(M)
{
	var N = M.length;
	var means = [];

	for (var i=0; i<N; i++) {

		var t=0;
		for (var j=0; j<N; j++)
		{
			t += M[j][i]
		}
		means.push(t/N);
	}
	return means;
}

function calcMean(A) {
	var m = 0, N=A.length;
	for (var i=0; i<N; i++) {
		m+= A[i];
	}
	return m/N;
}


/* ===================================
 * MDS projection
 * Code based on
 * ===================================
 */

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

var MDS_POINT_RADIUS = 5.5;
var MDS_POINT_HIGHLIGHT_COLOR = "#cc0000"
var MDS_PADDING = 10;

MDS.prototype.plotMDS = function(distances, cellIndex, dimensions, gridAnalysis)
{
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

	// remove an earlier MDS group and create a new one
	this.svg.selectAll("g.mdsPointGroup").remove();
	var group = this.svg.append("g")
		.attr("class", "mdsPointGroup");

	(function(grid, g, dataPoints, xS, yS, thisObject) 
	{
		thisObject.mdsPointSelection = g.selectAll("circle").data(dataPoints).enter().append("circle")
			.attr("class", "mdsCircle")
			.attr("cx", function(d) { var x = xS(d.coordinate[0]); d.p[0] = x; return x; })
			.attr("cy", function(d) { var y = yS(d.coordinate[1]); d.p[1] = y; return y; })
			.attr("r", MDS_POINT_RADIUS);
			/*
			.on("mouseover", function(d) 
			{
				grid.highlightHeatmapCell([d], true);
				console.log("over");
				d3.select(this).style("fill", MDS_POINT_HIGHLIGHT_COLOR);
			})
			.on("mouseout", function(d) {
				grid.highlightHeatmapCell([d], false);
				d3.select(this).style("fill", "");
			});
			*/

	})(gridAnalysis, group, points, xScale, yScale, this);

	var x = d3.scale.identity().domain([0, this.w]),
	y = d3.scale.identity().domain([0, this.h]);

	brush = d3.svg.brush()
		.x(x)
		.y(y)
		.on("brushstart", brushstart)
		.on("brush", brushmove)
		.on("brushend", brushend);
	this.svg.append("g").attr("class", "brush").call(brush);
}

MDS.prototype.brushPoints = function(ids)
{
	if (!ids || ids.length == 0) {
		this.mdsPointSelection.style("fill", "");
		return [];
	}
	else
	{
		var _brushed = [];
		var _idMap = d3.map();
		for (var i=0, len=ids.length; i<len; i++) {
			_idMap.set(ids[i], true);
		}

		(function(idMap, mdsPointSelection, brushed) {

			mdsPointSelection.style("fill", function(d) 
			{
				if (idMap.get(d.getID())) {
					var n = jQuery(this);
					n.parent().append(n.detach());
					brushed.push(d);
					return MDS_POINT_HIGHLIGHT_COLOR;
				}
				else {
					return "";
				}
			});

		})(_idMap, this.mdsPointSelection, _brushed);
		return _brushed;
	}
}

// Clear the previously-active brush, if any.
var brushCell, brush
function brushstart(p)
{
	if (brushCell !== this) 
	{
		d3.select(brushCell).call(brush.clear());
		brushCell = this;
	}
}

// Highlight the selected circles.
var brushedMDSPoints = [];

function brushmove() {
	var e = brush.extent();
	var selection = d3.select("#svgMDS").selectAll("circle");
	
	var brushedPoints = [];
	(function(brushed) {
		selection.style("fill", function(d) 
		{
			var out = 
				e[0][0] > d.p[0] || d.p[0] > e[1][0] ||
				e[0][1] > d.p[1] || d.p[1] > e[1][1];

			if (out) {
				return ""; 
			} 
			else 
			{
				brushed.push(d);
				return MDS_POINT_HIGHLIGHT_COLOR;
			}
		});
	})(brushedPoints);
	gridAnalysis.highlightHeatmapCell(brushedPoints, true);
	brushedMDSPoints = brushedPoints;
}

// If the brush is empty, select all circles.
function brushend() {
	if (brush.empty()) d3.select("#svgMDS").selectAll("circle").style("fill", "");
}

function symmetrizeSimMatrix(matrix)
{
	var n = matrix.length;
	for (var i = 0; i < n; i++) 
	{
		matrix[i].length = n;
		matrix[i][i] = 0;
		for (var j = i+1; j < n; j++) 
		{
			matrix[j][i] *= -1;
			matrix[i][j] = matrix[j][i];
		}
	}
	return matrix;
}


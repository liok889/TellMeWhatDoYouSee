/* ===================================
 * MDS projection
 * Code based on
 * ===================================
 */

// constants
var MDS_POINT_RADIUS = 3.5;
var MDS_PADDING = 20;

/* =======================
 * MDSPoint
 * =======================
 */

function MDSPoint(coordinate, cell, _index) 
{
	this.coordinate = coordinate;
	this.cell = cell;
	this.id = _index;
}

MDSPoint.prototype.getID = function() {
	return this.id;
}

MDSPoint.prototype.getCoordinate = function() {
	return this.coordinate;
}

MDSPoint.prototype.getPixelCoordinate = function() {
	return this.pCoordinate;
}
MDSPoint.prototype.getNormalizedCoordinate = function() {
	return this.nCoordinate;
}

MDSPoint.prototype.getCell = function() {
	return this.cell;
}

/* =======================
 * MDS
 * =======================
 */
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

MDS.prototype.getPoints = function() {
	return this.mdsPoints;
}

MDS.prototype.getMDSDomains = function() {
	return {
		xDomain: this.xDomain,
		yDomain: this.yDomain
	};
}

MDS.prototype.getBrushedIDs = function() {
	return this.brushedIDs;
}

MDS.prototype.getViewport = function() {
	return [this.w - MDS_PADDING*2, this.h - MDS_PADDING*2];
}

MDS.prototype.classic = function(distances, dimensions) {
	dimensions = dimensions || 2;
	
	// square distances
	var M = numeric.mul(-0.5, numeric.pow(distances, 2));
	
	// calculate row, column, and whole means
	var N = M.length;
	var rowMeans = calcRowMeans(M);
	var colMeans = calcColMeans(M);
	var totalMean = calcMean(rowMeans);

	// double centre the rows/columns
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
		return numeric.mul(row, eigenValues); //.splice(0, dimensions);
	});
}


MDS.prototype.createBrush = function()
{
	if (this.brush) {
		return;
	};

	(function(thisObject, grid) {
		
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
	})(this, gridAnalysis);

}
MDS.prototype.deleteBrush = function()
{
	if (this.brush) 
	{
		// remove brush
		this.brush.clear();
		this.svg.selectAll("g.brush").remove();
		this.brush = undefined;
		this.brushCell = undefined;
	}
	d3.select("#imgAddSelection").style("visibility", "hidden");
	this.brushedMDSPoints = undefined;
	this.brushedIDs = undefined;
}

MDS.prototype.plotMDS = function(distances, cellIndex, dimensions, mdsPositions, gridAnalysis)
{
	// remove an earlier MDS group and create a new one
	this.svg.selectAll("g.mdsPointGroup").remove();
	this.deleteBrush();

	// create a new <g> for the MDS points
	var group = this.svg.append("g")
		.attr("class", "mdsPointGroup");


	// classical MDS projection	
	var positions = mdsPositions || this.classic(distances, dimensions);
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
	this.xDomain = xDomain;
	this.yDomain = yDomain;

	var domainLen = [
		xDomain[1]-xDomain[0],
		yDomain[1]-yDomain[0]
	];

	// construct scales
	var xScale = d3.scale.linear().domain(xDomain).range([0+MDS_PADDING, this.w-MDS_PADDING]);
	var yScale = d3.scale.linear().domain(yDomain).range([0+MDS_PADDING, this.h-MDS_PADDING]);

	// set normalized / pixel coordinates
	for (var i=0, N=points.length; i<N; i++) {
		var p = points[i];
		
		// normalized coordinate
		p.nCoordinate = [
			(p.coordinate[0] - xDomain[0]) / domainLen[0],
			(p.coordinate[1] - yDomain[0]) / domainLen[1]
		];

		// pixel coordinate
		p.pCoordinate = [ xScale(p.coordinate[0]), yScale(p.coordinate[1]) ];
	}

	(function(grid, g, dataPoints, thisObject) 
	{
		// create circles
		thisObject.mdsPointSelection = g.selectAll("circle").data(dataPoints).enter().append("circle")
			.attr("class", "mdsCircle")
			.attr("id", function(d) { return "mds_circle_" + d.getCell()[0] + "_" + d.getCell()[1]; })
			.attr("cx", function(d) { return d.getPixelCoordinate()[0]; })
			.attr("cy", function(d) { return d.getPixelCoordinate()[1]; })
			.attr("r", MDS_POINT_RADIUS);
	})(gridAnalysis, group, points, this);

	// create brush
	this.createBrush();
	
	// store reference to GridAnalysis
	this.grid = gridAnalysis;
	this.positions = positions;
	this.distances = distances;

	// store copy of mds points
	this.mdsPoints = points;
}

MDS.prototype.drawConvexHull = function(clusters)
{

	// remove existing hull group
	this.svg.selectAll("g.mdsConvexHullGroup").remove();
	var group = this.svg.append("g")
		.attr("class", "mdsConvexHullGroup");

	var convexHulls = [];
	for (var i=0, K=clusters.length; i<K; i++)
	{
		var cluster = clusters[i];
		var members = cluster.members;
		var hull = new ConvexHullGrahamScan();

		for (var j=0, M=members.length; j<M; j++) 
		{
			var m = members[j];
			var p = this.mdsPoints[m].getPixelCoordinate();
			hull.addPoint(p[0], p[1]);
		}

		// compute the hull and add it to the list of hulls
		var hullPoints = hull.getHull();
		convexHulls.push( hullPoints );
	}

	var pathGenerator = d3.svg.line()
		.x(function(d) { return d.x; })
		.y(function(d) { return d.y; })
		.interpolate("cardinal-closed");

	group.selectAll("path").data(convexHulls).enter().append("path")
		.attr("d", function(d) { return pathGenerator(d); })
		.style("stroke", "#ff9933")
		.style("stroke-width", "2px")
		.style("fill", "#ff9933")
		.style("fill-opacity", "0.1")
		.on("mouseover", function(d) {
			d3.select(this).style("fill-opacity", "")
		})
		.on("mouseout", function(d) {
			d3.select(this).style("fill-opacity", "0.1");
		});
}

MDS.prototype.clearBubbleSets = function()
{
	this.svg.selectAll("g.mdsBubbleSets").remove();	
}

MDS.prototype.drawBubbleSets = function(clusters)
{
	this.svg.selectAll("g.mdsBubbleSets").remove();
	var group = this.svg.append("g")
		.attr("class", "mdsBubbleSets");

	// create positions
	var positions = []; 
	var mdsPoints = this.mdsPoints;
	for (var i=0, N=mdsPoints.length; i<N; i++) 
	{
		var p = mdsPoints[i].getPixelCoordinate();
		positions.push({
			x: p[0],
			y: p[1]
		});
	}

	// create sets
	var sets = [];
	for (var i=0, K=clusters.length; i<K; i++)
	{
		sets.push(clusters[i]);
	}

	var resolution = .3;
	var bubbles = new BubbleSets(sets, positions, this.w, this.h, resolution, [3, 12]);
	var setContours = bubbles.computeAll();

	// add color to contours
	for (var i=0, K=setContours.length; i<K; i++) {
		setContours[i].color = clusters[ setContours[i].set ].color;
	}

	var pathGenerator = d3.svg.line()
		.x(function(d) { return d.x; })
		.y(function(d) { return d.y; })
		.interpolate("cardinal-closed");

	(function(mds, g) {
		g.selectAll("path").data(setContours).enter().append("path")
			.attr("d", function(d) { return pathGenerator(d.contours[0]); })
			.style("stroke", function(d, i) { return d.color; })
			.style("fill", function(d, i) { return d.color; })
			.style("stroke-width", (2*resolution) + "px")
			.style("fill-opacity", "0.1")
			.attr("transform", "scale(" + (1/resolution) + "," + (1/resolution) +")")
			.on("mouseover", function(d) 
			{
				d3.select(this).style("fill-opacity", "");
				if (mds.bubbleBrushCallback) {
					mds.bubbleBrushCallback(d.members);
				}
			})
			.on("mouseout", function(d) {
				d3.select(this).style("fill-opacity", "0.3");
				if (mds.bubbleBrushCallback) {
					mds.bubbleBrushCallback([]);
				}
			});
	})(this, group);
}

MDS.prototype.setBubbleBrushCallback = function(callback)
{
	this.bubbleBrushCallback = callback;
}

MDS.prototype.setVisibility = function(visible)
{
	if (!visible) {
		this.deleteBrush();
		this.svg.attr("visibility", "hidden");
	}
	else {
		this.createBrush();
		this.svg.attr("visibility", "visible");
	}
}

MDS.prototype.calcStress = function(_distances, _positions)
{
	var distances = _distances || this.distances;
	var positions = _positions || this.positions;


	var dE = [Number.MAX_VALUE, -Number.MAX_VALUE];
	var pE = [Number.MAX_VALUE, -Number.MAX_VALUE];
	var N = distances.length;
	var mdsDistances = [];
	mdsDistances.length = N;

	for (var i=0; i<N; i++)
	{
		var p1 = positions[i];
		var mdsDistRow = [];
		mdsDistRow.length = i;

		for (var j=0; j<i; j++) 
		{

			dE[0] = Math.min(dE[0], distances[i][j]);
			dE[1] = Math.max(dE[1], distances[i][j]);
			
			// calc euclidean distance between i and j
			var p2 = positions[j];
			var dX = p1[0]-p2[0];
			var dY = p1[1]-p2[1];
			var dist = Math.sqrt(dX*dX + dY*dY);

			pE[0] = Math.min(pE[0], dist);
			pE[1] = Math.max(pE[1], dist);
			mdsDistRow[j] = dist;
		}
		mdsDistances[i] = mdsDistRow;
	}

	dE[1] = dE[1]-dE[0];
	pE[1] = pE[1]-pE[0];

	var stress = 0;
	for (var i=1; i<N; i++) {
		for (var j=0; j<i; j++) {
			var s = 
				1*(distances[i][j]-dE[0]) / dE[1] -
				1*(mdsDistances[i][j]-pE[0]) / pE[1];
			stress += s;
		}
	}
	console.log("MDS stress: " + stress + ", for N=" + N);
	return stress;
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
		if (this.mdsPointSelection) {
			this.mdsPointSelection.style("fill", "");
			this.applyColorMap();
		}
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
					// remove node and put at top
					putNodeOnTop(this);
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
	if (!this.brush) { 
		return; 
	}
	var e = this.brush.extent();
	
	var brushedPoints = [];
	var brushedIDs = [];
	
	var brushedSelection;
	if (!hasNotMoved) 
	{
		brushedSelection = (function(brushed, ids, svg) 
		{
			
			var selection = svg.selectAll("circle");
			var brushedSelection = selection.filter(function (d) 
			{
				var p = d.getPixelCoordinate();
				var out = 

					e[0][0] > p[0] || p[0] > e[1][0] ||
					e[0][1] > p[1] || p[1] > e[1][1];

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

	// brush exploratin pane
	if (brushedIDs) {
		this.grid.brushExplore( brushedIDs );

		// brush the heatmap and the matrix
		this.grid.highlightHeatmapCell(brushedPoints, true);
		this.grid.brushMatrixElements( brushedIDs );

		// store a list of MDS points we brushed
		this.brushedMDSPoints = brushedPoints;
		this.brushedIDs = brushedIDs;

		// apply selection color
		this.applyColorMap(brushedIDs);
	}
	return brushedIDs;
}

// If the brush is empty, select all circles.
MDS.prototype.brushend = function() 
{
	if (this.brush && this.brush.empty()) {
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


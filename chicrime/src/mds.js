/* ===================================
 * MDS projection
 * Code based on
 * ===================================
 */

// constants
var MDS_POINT_RADIUS 			= 3.5;
var MDS_PADDING 				= 20;
var MDS_DOUBLE_BRUSH_OPACITY	= 0.2;
var BUBBLE_OPACITY				= 0.15;

// selection modes
var SELECTION_MODE_SQUARE		= 1;
var SELECTION_MODE_MAGIC		= 2;

// magic selection, min/max parameters
var MAX_MAGIC_THRESHOLD = 0.6;
var MIN_MAGIC_THRESHOLD = 0.0;
var THRESHOLD_RATE = 0.005 * 0.7;

/* =======================
 * MDSPoint
 * =======================
 */

function MDSPoint(coordinate, cell, _index) 
{
	this.coordinate = coordinate;
	this.cell = cell;
	this.id = cellToStr(cell);
	this.index = _index
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

	// selection mode
	this.selectionMode = SELECTION_MODE_SQUARE;

	// threshold for magic selection
	this.magicThreshold = 0.15;



	(function(mds) 
	{
		function addGuidelineCircle(mouse)
		{
			var MAX_R = 35;
			var MIN_R = 10;

			var threshold = mds.magicThreshold
			var nR = (threshold-MIN_MAGIC_THRESHOLD) / (MAX_MAGIC_THRESHOLD-MIN_MAGIC_THRESHOLD);
			var r = MIN_R + (MAX_R-MIN_R)*nR

			var guideCircle = mds.svg.selectAll("circle.guide");
			if (guideCircle.size() == 0) {

				mds.svg.append("circle")
					.attr("id", "adjustableGuideCircle")
					.attr("class", "guide")
					.style("pointer-events", "none")
					.style("fill", "white")
					.style("stroke", "#555555")
					.style("fill-opacity", "0.7")
					.attr("cx", mouse[0]).attr("cy", mouse[1]);

				mds.svg.append("circle")
					.attr("class", "guide")
					.attr("r", MAX_R)
					.style("pointer-events", "none")
					.style("fill", "none")
					.style("stroke", "red")
					.attr("stroke-dasharray", "2, 2")
					.attr("cx", mouse[0]).attr("cy", mouse[1]);

				guideCircle = mds.svg.selectAll("circle.guide");

				mds.svg.on("mousemove.circleGuide", function() 
				{
					var mouse = d3.mouse(this);
					mds.svg.selectAll("circle.guide")
						.attr("cx", mouse[0]).attr("cy", mouse[1]);

				})
			}
			mds.svg.select("#adjustableGuideCircle")
				.attr("r", r)
				.attr("cx", mouse[0]).attr("cy", mouse[1]);


			mds.circleDate = new Date();

			// add a timeout
			if (mds.circleTimeout) {
				clearTimeout(mds.circleTimeout);
				mds.circleTimeout = undefined;
			}

			mds.circleTimeout = setTimeout(function() {
				mds.svg.selectAll("circle.guide").transition().duration(150).attr("r", 0.0001).remove();
				mds.svg.on("mousemove.circleGuide", null);
				mds.circleTimeout = undefined;
			}, 2000);
		}

		function mouseInSVG() {
			var mouse = d3.mouse(mds.svg.node());
			return (mouse[0] >= 0 && mouse[0] <= mds.w && mouse[1] >= 0 && mouse[1] <= mds.h);
		}

		// register mouse wheel event and use to adjust magicThreshold
		d3.select(window).on("wheel.mds", function() 
		{
			var mouse = d3.mouse(mds.svg.node());
			if (mds.selectionMode == SELECTION_MODE_MAGIC && mouseInSVG()) 
			{
				if (d3.event.deltaY < 0 && mds.magicThreshold < MAX_MAGIC_THRESHOLD) 
				{
					mds.magicThreshold = Math.min(MAX_MAGIC_THRESHOLD, mds.magicThreshold + THRESHOLD_RATE);
					addGuidelineCircle(mouse);

				}
				else if (d3.event.deltaY > 0 && mds.magicThreshold > MIN_MAGIC_THRESHOLD) {
					mds.magicThreshold = Math.max(MIN_MAGIC_THRESHOLD, mds.magicThreshold - THRESHOLD_RATE);
					addGuidelineCircle(mouse);
				}
				mds.pickMagicPoint(null)
			}
		});

	})(this);
}

MDS.prototype.setColorMap = function(_colorMap) 
{
	// translate indices in color maps to real IDs
	this.colorMap = d3.map();
	(function(mds, _colorMap, actualColorMap)
	{
		_colorMap.forEach(function(key, value) {
			var id = cellToStr(mds.grid.index2ij[key]);
			actualColorMap.set(id, value);
		});
	})(this, _colorMap, this.colorMap);
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

MDS.prototype.setSelectionMode = function(newMode)
{
	var oldMode = this.selectionMode;
	this.selectionMode = newMode;
	
	if (oldMode != newMode)
	{
		switch (newMode) 
		{
			case SELECTION_MODE_MAGIC:
				this.deleteBrush();
				break;
			case SELECTION_MODE_SQUARE:
				this.createBrush();
				break;
		}
	}
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

		this.mdsPointSelection.style("fill", "");
	}

	d3.select("#imgAddSelection").style("visibility", "hidden");
	this.brushedMDSPoints = undefined;
	this.brushedIDs = undefined;
}

MDS.prototype.plotMDS = function(distances, cellIndex, dimensions, mdsPositions, gridAnalysis)
{
	// remove exiting brush
	this.deleteBrush();

	var group = this.svg.selectAll("g.mdsPointGroup");

	// create a new <g> for the MDS points
	if (group.size() == 0) {
		group = this.svg.append("g")
			.attr("class", "mdsPointGroup");
	}
	var pathGroup = this.svg.selectAll("g.mdsPathGroup").remove();
	pathGroup = this.svg.append('g').attr('class', 'mdsPathGroup');

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
	this.pixelPositions = []; this.pixelPositions.length= points.length;
	for (var i=0, N=points.length; i<N; i++) {
		var p = points[i];
		
		// normalized coordinate
		p.nCoordinate = [
			(p.coordinate[0] - xDomain[0]) / domainLen[0],
			(p.coordinate[1] - yDomain[0]) / domainLen[1]
		];

		// pixel coordinate
		p.pCoordinate = [ xScale(p.coordinate[0]), yScale(p.coordinate[1]) ];

		this.pixelPositions[i] = p.pCoordinate;
	}

	(function(grid, g, dataPoints, thisObject, pathGroup) 
	{
		// bind
		var updateSelection = g.selectAll("circle")
			.data(dataPoints, function(d) { return d.getCell()[0] + "_" + d.getCell()[1]; });
		
		// enter
		updateSelection.enter().append("circle")
			.attr("class", "mdsCircle")
			.attr("id", function(d) { return "mds_circle_" + d.getCell()[0] + "_" + d.getCell()[1]; })
			.attr("cx", function(d) { return d.getPixelCoordinate()[0]; })
			.attr("cy", function(d) { return d.getPixelCoordinate()[1]; })
			.attr("r", 0.00000001);

		// update
		updateSelection.transition().duration(350)
			.attr("cx", function(d) { return d.getPixelCoordinate()[0]; })
			.attr("cy", function(d) { return d.getPixelCoordinate()[1]; })
			.attr("r", MDS_POINT_RADIUS);

		// exit
		updateSelection.exit().transition().attr("r", 0.00000001).remove();

		// store selection
		thisObject.mdsPointSelection = updateSelection;

		// calculate voronoi geometry to enable magic picking
		var voronoi = d3.geom.voronoi();
		var paths = voronoi(thisObject.pixelPositions);

		// attach invisible paths to it
		pathGroup.selectAll("path").data(paths).enter().append("path")
			.attr("d", function(d) { return "M" + d.join(",") + "Z";})
			.style("fill", "white")
			.style("fill-opacity", "0.0")
			.style("stroke", "none")
			.on("mouseenter", function(d, i) {
				thisObject.pickMagicPoint(i);
			})
			.on("mouseout", function(d, i) {
				thisObject.unpickMagicPoint(i);
			});

	})(gridAnalysis, group, points, this, pathGroup);

	// create brush
	if (this.selectionMode == SELECTION_MODE_SQUARE) {
		this.createBrush();
	}

	// store reference to GridAnalysis
	this.grid = gridAnalysis;
	this.positions = positions;
	this.distances = distances;

	// store copy of mds points
	this.mdsPoints = points;
}

MDS.prototype.pickMagicPoint = function(i)
{
	var MAX_GEOM_DISTANCE = null; //Math.pow(100,2);

	if (this.selectionMode != SELECTION_MODE_MAGIC) {
		return;
	}

	if (i === null || i === undefined) {
		i = this.magicPoint;
	}
	if (i === null || i === undefined) {
		return;
	}
	this.magicPoint = i;

	// cancel unpick events
	if (this.unpickTimer) {
		clearTimeout(this.unpickTimer);
		this.unpickTimer = undefined;
	}

	// base time series
	var magicPoint = this.mdsPoints[i];
	var ts = this.grid.getTimeseries(magicPoint.id); 
	
	// list of poinst to be ultimately brushed (based on their similarity to rs)
	var brushedIDs = [];
	var brushedPoints = [];

	// perform similarity test on all nodes
	var WORK = {work: 0};
	var pickedPoints = (function(mds, ts, maxDistance, brushedIDs, brushedPoints, magicPoint, WORK)
	{
		function pDistanceSq(p1, p2) {
			var pp1 = p1.pCoordinate;
			var pp2 = p2.pCoordinate;
			return Math.pow(pp1[0]-pp2[0], 2) + Math.pow(pp1[1]-pp2[1], 2);
		}

		return mds.mdsPointSelection.filter(function(d, i) 
		{
			// test geometric distance first
			if (!MAX_GEOM_DISTANCE || pDistanceSq(magicPoint, d) < MAX_GEOM_DISTANCE)
			{
				var ts2 = mds.grid.getTimeseries(d.id);
				var distance = mds.distances[d.index][magicPoint.index] / maxDistance;
				if (distance <= mds.magicThreshold)
				{
					// add to lists of brushed points
					brushedIDs.push(d.id);
					brushedPoints.push(d);

					// place node on top
					putNodeOnTop(this);

					return true;
				}
				else
				{
					d3.select(this).style("fill", "");
					return false;
				}
			}
			else
			{
				d3.select(this).style("fill", "");
				return false;
			}
		});
	})(this, ts, this.grid.getMaxTimeseriesDistance(), brushedIDs, brushedPoints, magicPoint, WORK);

	// brush this cell
	pickedPoints.style("fill", BRUSH_COLOR);

	// store selection of all brushed points
	this.brushedSelection = pickedPoints;
	
	// propagate brush event to the rest of the visualization
	this.propagateBrushEvent(brushedIDs, brushedPoints);
}

MDS.prototype.unpickMagicPoint = function(i)
{	
	if (this.selectionMode != SELECTION_MODE_MAGIC) 
	{
		return;
	}

	(function(mds) 
	{
		mds.unpickTimer = setTimeout(function() 
		{
			mds.mdsPointSelection.style("fill", "");
			
			mds.brushedSelection = undefined;
			mds.magicPoint = undefined;

			// propagate un-brush event
			mds.propagateBrushEvent([], []);
		}, 50);
	})(this)
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
			.style("fill-opacity", BUBBLE_OPACITY)
			.attr("transform", "scale(" + (1/resolution) + "," + (1/resolution) +")")
			.on("mouseover", function(d) 
			{
				d3.select(this).style("fill-opacity", "");
				if (mds.bubbleBrushCallback) {
					mds.bubbleBrushCallback(d.members);
				}
			})
			.on("mouseout", function(d) {
				d3.select(this).style("fill-opacity", BUBBLE_OPACITY);
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
			this.brushedSelection.style("fill-opacity", MDS_DOUBLE_BRUSH_OPACITY).style("stroke", "none");
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
	if (brushedIDs) 
	{
		this.propagateBrushEvent( brushedIDs, brushedPoints )
	}
	return brushedIDs;
}

// propagates brush event to other components of the visualization
MDS.prototype.propagateBrushEvent = function(brushedIDs, brushedPoints)
{
	// brush explorer pane
	var avgTimeseries = this.grid.brushExplore( brushedIDs );

	// brush the heatmap and the matrix
	this.grid.highlightHeatmapCell(brushedPoints, true);
	this.grid.brushMatrixElements( brushedIDs, true );

	// store a list of MDS points we brushed
	this.brushedMDSPoints = brushedPoints;
	this.brushedIDs = brushedIDs;

	// apply selection color
	this.applyColorMap(brushedIDs);

	// capture "flow"
	if (this.grid.isRecording()) {
		this.grid.captureFlow( avgTimeseries );
	}
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


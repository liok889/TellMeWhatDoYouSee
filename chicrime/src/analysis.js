/* --------------------------------------------
 * Grid-based analysis
 * ============================================
 */
var HEATMAP_COLOR = ['#a50026','#d73027','#f46d43','#fdae61','#fee090','#ffffbf','#e0f3f8','#abd9e9','#74add1','#4575b4','#313695'].reverse();
var HEATMAP_OPACITY = 0.75;

var SHOW_MDS = 1;
var SHOW_SMALL_MULTIPATTERNS = 2;

function GridAnalysis(theMap, svgExplore)
{
	// cache to store rendered similarity matrices
	this.cache = d3.map();

	// store reference to the map
	this.map = theMap;
	this.svgExplore = svgExplore;

	// create a selection object
	var xOffset = +this.svgExplore.attr("width") - (2*ClusterSelector.RECT_OFFSET + ClusterSelector.RECT_W + ClusterSelector.RECT_H/2-8);
	var yOffset = ClusterSelector.RECT_OFFSET + 12;
	var gSelector = this.svgExplore.append("g").attr("transform", "translate(" + xOffset + "," + yOffset + ")");
	this.selector = new ClusterSelector(gSelector, this, [xOffset, yOffset]);

	// add exploration pane
	var exploreOffset = getCoords(this.svgExplore.node());
	var gExplore = this.svgExplore.append("g");
	this.explore = new Explore(gExplore, {xOffset: exploreOffset.left, yOffset: exploreOffset.top});

	// initialize callbacks for explore pane
	(function(grid) 
	{
		grid.selector.setSelectionBrushCallback(function(ids, avgTimeseries) {
			grid.brushSelectionMembers(ids, avgTimeseries);
		});
	
		grid.selector.setDragCallback(
			function(selection) {
				grid.explore.dragSelection(selection);
			},
			function(selection) {
				grid.explore.endDragSelection(selection);
			}
		);

		grid.selector.setRemoveSelectionCallback(
			function(selection) {
				grid.explore.removeSelection(selection);
			}
		);

		grid.selector.setUpdateSelectionCallback(
			function(selection) {
				grid.explore.updateSelectionCallback(selection);
			}
		);
	})(this);

	// create MDS
	var svgMDS = d3.select("#svgMDS"); var w = +svgMDS.attr("width"), h = +svgMDS.attr("height");
	var MDSGroup = svgMDS.append("g")
		.attr("class", "MDSGroup");

	this.mds = new MDS(
		MDSGroup,
		w, h
	);
	(function(thisGrid) {
		thisGrid.mds.setBubbleBrushCallback(function(members) 
		{
			thisGrid.brushSelectionMembers(members);
		})
	})(this);

	// link MDS with selector
	this.mds.setColorMap( this.selector.getColorMap() );
	this.selector.setMDS(this.mds);

	// create Small-MultiPatterns ()
	var groupSmallMultipatterns = svgMDS.append("g").attr("class", "groupSmallMultipatterns");
	this.smallMultipatterns = new PatternVis(
		this.mds,
		groupSmallMultipatterns,
		w, h
	);

	// set MDS panel mode
	this.mdsView = SHOW_MDS;

	// buttons to switch MDS view form MDS points to Small-Multipatterns
	(function(thisGrid) {
		var buttonCallbacks = [
			{
				id: "imgShowMDS", 
				callback: function() {
					thisGrid.switchMDSPanel(SHOW_MDS);
					toggleButton(d3.select(this), ["imgShowSmallMultipatterns"]);
				}
			},
			
			{
				id: "imgShowClusters", 
				callback: function() {
					thisGrid.kMedoids();
				}
			},

			{
				id: "imgShowSmallMultipatterns", 
				callback: function() {
					thisGrid.switchMDSPanel(SHOW_SMALL_MULTIPATTERNS);
					toggleButton(d3.select(this), ["imgShowMDS"]);

				}
			},
			{
				id: "imgMagicSelection",
				callback: function() 
				{
					thisGrid.mds.setSelectionMode(SELECTION_MODE_MAGIC);
					toggleButton(d3.select(this), ["imgSquareSelection"]);
				}
			},
			{
				id: "imgSquareSelection",
				callback: function() 
				{
					thisGrid.mds.setSelectionMode(SELECTION_MODE_SQUARE);
					toggleButton(d3.select(this), ["imgMagicSelection"]);
				}
			},

			{
				id: "imgAddSelection", 
				callback: function() {
					var brushedIDs = thisGrid.mds.getBrushedIDs();
					thisGrid.makeBrushSelection(brushedIDs);
				}
			}
		];

		activateButtons(buttonCallbacks);
		toggleButton("imgShowMDS");
		toggleButton("imgSquareSelection");

	})(this);
}

GridAnalysis.prototype.switchMDSPanel = function(view)
{

	var svg = d3.select("#svgMDS");
	if (!view) {
		view = this.mdsView;
	}

	switch (view)
	{
	case SHOW_MDS:
		this.mds.setVisibility(true);
		this.smallMultipatterns.setVisibility(false);

		break;

	case SHOW_SMALL_MULTIPATTERNS:
		this.mds.setVisibility(false);
		this.smallMultipatterns.setVisibility(true);

		break;
	}
}

GridAnalysis.prototype.initGrids = function(w, h, minGridLineCount, maxGridLineCount)
{
	// map to store all grid
	this.allGrids = d3.map();

	// move map to default center / zoom-level
	var center = this.map.getCenter();
	var zoom = this.map.getZoom();
	this.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

	for (var i=minGridLineCount; i<=maxGridLineCount; i++)
	{
		var cellSize = h / i;
		var gridRows = Math.ceil(h / cellSize);
		var gridCols = Math.ceil(w / cellSize);

		var rows = d3.range(1*cellSize, gridRows*cellSize, cellSize * (1.0-GRID_OVERLAP));
		var cols = d3.range(1*cellSize, gridCols*cellSize, cellSize * (1.0-GRID_OVERLAP));
				
		// construct the grid
		var grid = this.constructGrid(cellSize, cellSize, rows.length+1, cols.length+1, GRID_OVERLAP);
		this.allGrids.set(i, grid);
	}

	// restore
	this.map.setView(center, zoom);
}


GridAnalysis.prototype.loadGrid = function(gridLineCount)
{
	this.analysisRequest = this.allGrids.get(gridLineCount);
}

GridAnalysis.prototype.constructGrid = function(pCellW, pCellH, rows, cols, overlap)
{
	// construct a grid matrix hich contains
	// lat,long coordinates (both min and max) of every individual cell in the grid
	var grid = [];
	
	// calculate the offest of the window
	if (!overlap) overlap = 0.0;
	var xOffset = (1.0 - overlap) * pCellW;
	var yOffset = (1.0 - overlap) * pCellH;

	// keep track of the global min/max lat/lon
	var gridMax = { lat: -Number.MAX_VALUE, lon: -Number.MAX_VALUE };
	var gridMin = { lat: Number.MAX_VALUE, lon: Number.MAX_VALUE };

	// start with the top-left pixel in the grid and work your way to the bottom left
	var yP = 0;	
	for (var i=0; i<rows; i++) 
	{
		var newRow = [];
		var xP = 0;
		for (var j=0; j<cols; j++) 
		{
			var tL = this.map.containerPointToLatLng([xP, yP]);
			var bR = this.map.containerPointToLatLng([xP+xOffset, yP+yOffset]);
			
			// grid min/max lat,lon
			gridMax.lat = Math.max( Math.max(gridMax.lat, tL.lat), bR.lat);
			gridMax.lon = Math.max( Math.max(gridMax.lon, tL.lng), bR.lng);			
			gridMin.lat = Math.min( Math.min(gridMin.lat, tL.lat), bR.lat);
			gridMin.lon = Math.min( Math.min(gridMin.lon, tL.lng), bR.lng);

			// add row to grid
			newRow.push([tL.lat, tL.lng, bR.lat, bR.lng]);

			xP += xOffset;
		}

		yP += yOffset;
		grid.push(newRow);
	}

	// calculate cellOffset, which is an approximatino of how many lat,lon degrees
	// exist between two consecutive cells in the grid. We measure this by calculating
	// the different in borders for cell[0][0]
	var cell0 = grid[0][0];
	var cellOffset = {
		lat: (cell0[2]-cell0[0]),
		lon: (cell0[3]-cell0[1])
	}

	// store data in a JSON object
	this.analysisRequest = 
	{
		// query type, for now we'll aggregate crime counts over grid
		query: 'aggregateCrimeCountOverGrid',

		grid: grid,
		gridMin: gridMin,
		gridMax: gridMax,
		cellOffset: cellOffset,
		gridCols: cols,
		gridRows: rows,
	};

	return this.analysisRequest;
}

GridAnalysis.prototype.setRangeLimit = function(range) {
	this.analysisRequest.yearRange = range;
	this.analysisRequest.limitYear = undefined;
}

GridAnalysis.prototype.setSingleYear = function(singleYear) {
	this.analysisRequest.limitYear = singleYear;
	this.analysisRequest.yearRange = undefined;
}

// sets the level of aggregation for our signal
GridAnalysis.prototype.setSignalAggregate = function(signalAggregate)
{
	this.analysisRequest.signalAggregate = signalAggregate;
}

GridAnalysis.prototype.setSignalFilter = function(filters)
{
	for (var i=0, N=filters.length; i<N; i++) {
		var filter = filters[i];
		this.analysisRequest[ filter.filter ] = filter.value;
	}
}

GridAnalysis.prototype.getAnalysisResults = function() {
	return this.analysisResults;
}

GridAnalysis.prototype.resetView = function() 
{
	this.selector.clearAll();
	this.explore.clearAll(this.analysisRequest.signalAggregate);
	this.smallMultipatterns.clearAll();
}

// send the analysis reuest as a JSON request
GridAnalysis.prototype.sendRequest = function(_callback)
{
	// post the request to the server
	(function(startTime, jsonRequest, gridAnalysis, callback) {
		$.ajax({
			type: 'POST',
			url: 'http://localhost:12345/grid',
			async: true,
			dataType: 'text',
			data: JSON.stringify(jsonRequest),
			success: function(response, textStatus, xhr) 
			{
				// parse the JSON reponse we received
				var results = JSON.parse(response)
				var received = results.originalQuery;
				var expected = gridAnalysis.analysisRequest;

				// only react to latest data
				if (received !== undefined &&
					received.signalAggregate 	=== expected.signalAggregate &&
					received.limitYear 			=== expected.limitYear &&
					(
						(received.crimeType		=== expected.crimeType) ||
						(Array.isArray(received.crimeType) && Array.isArray(expected.crimeType))
					) &&
					(
						(Array.isArray(received.yearRange) && Array.isArray(expected.yearRange) &&
						received.yearRange[0] == expected.yearRange[0] && 
						received.yearRange[1] == expected.yearRange[1]) ||
						(received.yearRange === expected.yearRange)
					)
				) {

					// store results
					gridAnalysis.analysisResults = results;

					// data ready
					gridAnalysis.data_ready();

					// callback to UI
					if (callback) {
						callback(true);
					}
				}
				else
				{
					//console.log("Older results.");
				}
			},

			error: function(xhr, textStatus, errorThrown) {
				console.error("Error with Ajax GridAnalysis: " + textStatus);
				if (callback) {
					callback(false);
				}
			} 
		})
	})(Date.now(), this.analysisRequest, this, _callback)
};

GridAnalysis.prototype.data_ready = function()
{
	var analysisResults = this.analysisResults;
	analysisResults.distanceMatrix = symmetrizeSimMatrix(this.analysisResults.simMatrix);
	
	// make an index to translate form geocoordinate to timeseries index
	var ij2index = [];
	var index2ij = [];

	// loop through all IDs
	for (var i=0, len = analysisResults.tsIndex.length; i < len; i++) 
	{
		var index = analysisResults.tsIndex[i];
		var r = index[0];
		var c = index[1];

		if (!ij2index[r]) 
		{
			ij2index[r] = [];
		}
		ij2index[r][c] = i;
		index2ij.push([r, c]);
	}
	
	this.ij2index = ij2index;
	this.index2ij = index2ij;

	// reset the view
	this.resetView();
	
	// make heatmap
	this.makeHeatmap(
		analysisResults.aggregate, 		// aggregate crime couts for each cell
		analysisResults.timeseries 		// crime time series for each cell
	);

	// clustering and render similarity matrix
	this.clustering = new Clustering(analysisResults.distanceMatrix);
	var clustering = this.clustering;
	var cacheKey = this.getRequestKey();
	var cached = this.cache.get(cacheKey);

	if (cached)
	{
		// already have a cached version
		console.log("* hclustering and matrix view found in cache.")
		clustering.setHierarchicalClusters(cached.clusteringResults);
	}
	/*
	else if (analysisResults.hclusters) 
	{
		// hierarchical clustering already done by server
		clustering.setHierarchicalClusters( analysisResults.hclusters )
	}
	*/
	else {
		// do clustering
		clustering.hierarchical();
	}

	// render matrix
	var clusteringResults = {
		simMatrix: 	clustering.getClusteredSimMatrix(),	// similarity matrix
		clusters: 	clustering.getHClusters(),			// clusters
		hclusters:  clustering.getHClusters(),
		data2ij: 	clustering.get_data2ij(),			// indices
		ij2data: 	clustering.get_ij2data(),
		canvas:  	cached ? cached.canvas : undefined
	};
	this.renderSimMatrix(clusteringResults);

	// store in cache, if no already cached
	if (!cached)
	{
		this.cache.set(cacheKey, {
			canvas: 				this.offscreenCanvas,
			clusteringResults: 		clusteringResults
		});
	}

	// MDS analysis
	this.drawMDS();

	// Small-Multipatterns
	this.smallMultipatterns.makeSimpleLayout(9, 6);

	// activate view
	this.switchMDSPanel();
}

GridAnalysis.prototype.kMedoids = function()
{
	// calculate K mediuds
	this.kClusters = this.clustering.kMedoids(K_CLUSTER_COUNT);

	// clear all previous selections
	this.selector.clearAll();

	// assign colors to clusters, and make new selections from them
	var colorSets = ['#e41a1c','#377eb8','#4daf4a','#984ea3','#ff7f00','#ffff33','#a65628','#f781bf','#999999'];
	for (var i=0, K=this.kClusters.length; i<K; i++) 
	{
		this.kClusters[i].color = colorSets[ Math.min(i, colorSets.length-1) ];
		this.makeBrushSelection( this.kClusters[i].members, /*this.kClusters[i].color*/ null );
	}

	this.mds.clearBubbleSets();

	// visualize the results as bubble groups
	//this.mds.drawBubbleSets(this.kClusters);
}

GridAnalysis.prototype.lookupCell = function(tsIndex)
{
	return this.index2ij[tsIndex];
}

GridAnalysis.prototype.getTimeseriesCount = function()
{
	return this.analysisResults.tsIndex.length;
}

GridAnalysis.prototype.getTimeseries = function(index) 
{
	var cell = Array.isArray(index) ? index : typeof index === "string" ? strToCell(index) : this.analysisResults.tsIndex[index];
	return this.getGeoRect(cell).getTimeseries();
}

GridAnalysis.prototype.getGeoRect = function(c) {
	return this.geoRectMap[ c[0] ][ c[1] ];
}


function GeoRect(_nValue, _timeseries, cell, _tL, _bR) {
	this.nValue = _nValue;
	this.timeseries = _timeseries;
	this.tL = _tL;
	this.bR = _bR;
	this.cell = cell;
}

GeoRect.prototype.getCell = function() {
	return this.cell;
}


GeoRect.prototype.getValue = function() {
	return this.nValue;
}

GeoRect.prototype.getTimeseries = function() {
	return this.timeseries;
}

GeoRect.prototype.projectSelfPath = function()
{
	var ptL = theMap.latLngToContainerPoint(this.tL)
	var pbR = theMap.latLngToContainerPoint(this.bR)
	return "M" + ptL.x + "," + ptL.y + " " + pbR.x + "," + ptL.y + " " + pbR.x + "," + pbR.y + " " + ptL.x + "," + pbR.y + " Z";
}

GridAnalysis.GRAPH_W = 175;
GridAnalysis.GRAPH_H = 55;
GridAnalysis.FULL_MATRIX = true;
GridAnalysis.MATRIX_ELEMENT_BRUSH = 0;

function drawTimeseries(timeseries, group)
{

	// figure out the min/max of the time series
	var extent = timeseries.extent();
	var data = [];
	for (var i=0, len=timeseries.size(); i < len; i++) {
		data.push({
			x: i / (len-1),
			y: timeseries.get(i) / extent[1]
		});
	}

	// create a rectangle to serve as the background of the linechart
	group.append("rect")
		.attr("width", GridAnalysis.GRAPH_W+10)
		.attr("height", GridAnalysis.GRAPH_H+10)
		.attr("x", "-5")
		.attr("y", "-5")
		.style("fill", "white");

	// create a line projection to show the shape of the heatmap
	var lineFunction = d3.svg.line()
		.x(function(d, i) { return d.x * GridAnalysis.GRAPH_W; })
		.y(function(d, i) { return (1.0-d.y) * GridAnalysis.GRAPH_H; })
		.interpolate("linear");

	// create a line projection
	var zeroHeightLineFunction = d3.svg.line()
		.x(function(d, i) { return d.x * GridAnalysis.GRAPH_W; })
		.y(function(d, i) { return GridAnalysis.GRAPH_H; })
		.interpolate("cardinal");

	// path drawing the actual line chart
	group.append("path")
		.attr("d", lineFunction(data))
		.attr("stroke", "black")
		.style("stroke-width", "1px")
		.style("fill", "none");
}

GridAnalysis.prototype.drawMDS = function()
{
	var startTime = new Date();

	// draw the MDS visualization
	this.mds.plotMDS(
		this.analysisResults.distanceMatrix,
		this.analysisResults.tsIndex, 
		2, 
		this.analysisResults.mdsPositions, this
	);

	// measure time needed for MDS
	var processTime = (new Date) - startTime;
	if (!this.analysisResults.mdsPositions) {
		console.log("MDS projection took: " + ((processTime/1000).toFixed(1)) + " seconds.");
	}
}

// returns the size (length) of the first time series 
// (we assume that all series have the same length)
GridAnalysis.prototype.getTimeseriesSize = function()
{
	var timeseries = this.getTimeseries(0);
	return timeseries.size();
}

GridAnalysis.prototype.getMaxTimeseriesDistance = function()
{
	// max timeseries distance (based on EDR; M+N)
	return 2*this.getTimeseriesSize();
}

GridAnalysis.prototype.getRequestKey = function()
{
	if (this.analysisRequest)
	{
		var query = this.analysisRequest;
		var theKey = "";

		if (query.signalAggregate) {
			theKey += query.signalAggregate + "_";
		}

		if (query.limitYear) {
			theKey += query.limitYear + "_";
		}

		if (query.yearRange) {
			theKey += query.yearRange[0] + "_" + query.yearRange[1] + "_";
		}

		if (query.crimeType) {
			theKey += query.crimeType;
		}

		return theKey + "_" + GRID_LINE_COUNT;
	}
	else
	{
		return null;
	}
}

GridAnalysis.prototype.renderSimMatrix = function(hcluster)
{
	// set dimensions for matrix elements / dendogram, based on dimensions of the canvas
	this.onscreenCanvas = document.getElementById('canvasMatrix');
	var dim = Math.min(+this.onscreenCanvas.width, +this.onscreenCanvas.height);
	dim -= GridAnalysis.MATRIX_ELEMENT_BRUSH;

	SIMMAT_ELEMENT_SIZE = dim / hcluster.simMatrix.length;
	SIMMAT_ELEMENT_BORDER = "none";
	DENDOGRAM_NODE_HEIGHT = 5;

	// remove any previous dendogram
	d3.select("#svgDendogram").selectAll("g.dendogramGroup").remove();

	// create a group for the dendogram
	var matrixGroup = d3.select("#svgDendogram").append("g").attr("class", "dendogramGroup");
	matrixGroup.attr("transform", "translate(" + d3.select("#svgDendogram").attr("width") + ",0)");
	this.simMatrix = new SimilarityMatrix(matrixGroup);
	this.simMatrix.setMatrixVisibility(false);
	this.simMatrix.setDendogramVisibility(true);
	
	// limit how deep the dendogram goes
	// this.simMatrix.dendogramLimit = 3;
			
	// set callbacks
	(function(grid, simMatrix) 
	{
		// create cluster brush callbacks
		grid.simMatrix.setClusterBrushCallback(
			function(cluster) { grid.brushCluster(cluster); },
			function(cluster) { grid.unbrushCluster(cluster); }
		);

		// a callback when clusters are double clicked
		grid.simMatrix.setClusterDblClickCallback( function(cluster) {
			grid.makeClusterSelection( cluster );
		})

	})(this);

	// update similarity matrix
	this.simMatrix.updateMatrixWithResults(hcluster);

	if (hcluster.canvas)
	{
		this.offscreenCanvas = hcluster.canvas;		
	}
	else
	{

		// update the similarity matrix
		this.simMatrix.updateMatrixWithResults(hcluster)

		// create an offscreen-canvas
		this.offscreenCanvas = document.createElement('canvas');
		this.offscreenCanvas.width = this.onscreenCanvas.width;
		this.offscreenCanvas.height = this.onscreenCanvas.height;
		
		var startTime = new Date();
		
		// render the matrix to offscreenCanvas
		this.simMatrix.drawToCanvas( this.offscreenCanvas, null, GridAnalysis.FULL_MATRIX );

		// measure time needed to render
		var endTime = new Date();
		var processTime = (endTime.getTime() - startTime.getTime())/1000;
		console.log("Matrix rendering took: " + processTime.toFixed(1) + " seconds.");		
	}		

	// draw actual image on screen
	this.onscreenCanvas.getContext("2d").drawImage(this.offscreenCanvas, 0, 0);
}

GridAnalysis.prototype.isRecording = function()
{
	return this.recording;
}
GridAnalysis.prototype.startRecording = function()
{
	this.recording = true;
	this.recordedPath = [];
	this.flow = [];
	this.explore.showFlow(null);
}
GridAnalysis.prototype.stopRecording = function()
{
	this.recording = false;
}

GridAnalysis.prototype.captureFlow = function(timeseries)
{
	if (this.recording) 
	{
		// add current time series
		this.recordedPath.push(timeseries);
		
		// construct flow
		var flow = this.constructFlow();
		
		// show it in the exploration pane
		this.explore.showFlow(flow);
		return true;
	}
	else
	{
		this.explore.showFlow(null)
		return false;
	}
}
GridAnalysis.prototype.constructFlow = function()
{
	var SNAPSHOT_COUNT = 6;
	var SNAPSHOT_COLORS = ['#fee5d9','#fcae91','#fb6a4a','#de2d26','#a50f15'];

	if (this.recordedPath.length < 2) {
		return;
	}

	var snapshotCount = this.recordedPath.length < SNAPSHOT_COUNT ? this.recordedPath.length : SNAPSHOT_COUNT;
	var snapshots = [];
	
	for (var i=0; i<snapshotCount; i++) 
	{
		var n = i/(snapshotCount-1);
		var n_1 = snapshotCount < 2 ? 0 : i/(snapshotCount-2);

		var dataIndex = Math.floor(n * (this.recordedPath.length-1));
		var colorIndex = Math.floor(n * (SNAPSHOT_COLORS.length-1));

		snapshots.push({
			timeseries: this.recordedPath[ dataIndex ],
			color: i < snapshotCount-1 ? SNAPSHOT_COLORS[ colorIndex ] : undefined
		});
	}

	return snapshots;	
}

GridAnalysis.prototype.makeClusterSelection = function(cluster) 
{
	var members = [];
	for (var i=0, N=cluster.members.length; i<N; i++) 
	{
		var id = cluster.members[i];
		var rc = isNaN(id) ? strToCell(id) : this.index2ij[id];
		var geoRect = this.getGeoRect(rc);

		members.push({
			id: cluster.members[i],
			timeseries: geoRect.getTimeseries(),
			geoRect: geoRect
		});
	}
	this.selector.newSelection(members);
}

GridAnalysis.prototype.makeBrushSelection = function(ids, ownColor)
{
	if (ids.length > 0)
	{
		var members = [];
		for (var i=0, N=ids.length; i<N; i++) 
		{
			var id = ids[i];
			var rc = isNaN(id) ? strToCell(id) : this.index2ij[id];
			var geoRect = this.getGeoRect(rc);

			members.push({
				id: id,
				timeseries: geoRect.getTimeseries(),
				geoRect: geoRect
			});
		}
		this.selector.newSelection(members, ownColor);
	}
}

GridAnalysis.prototype.brushSelectionMembers = function(ids, avgTimeseries)
{
	// get cell ids for brushed cells
	var cells = []; cells.length = ids.length;
	for (var i=0, N=ids.length; i<N; i++) 
	{
		var cell = this.index2ij[ids[i]];
		cells[i] = cell;
	}
	this.highlightHeatmapCell(cells);

	// translate ids to matrix indices
	var actualIDs = []; actualIDs.length = cells.length;
	for (var i=0, N=cells.length; i<N; i++) 
	{
		var cell = cells[i];
		actualIDs[i] = cellToStr(cell);
	}

	// matrix
	this.brushMatrixElements(ids);

	// MDS
	this.mds.brushPoints(actualIDs);

	// explorer
	this.explore.brushDataPoints(avgTimeseries !== undefined ? [{ timeseries: avgTimeseries}] : []);

}

GridAnalysis.prototype.highlightHeatmapCell = function(cells)
{
	if (cells && cells.length > 0) {

		var highlightMap = d3.map();
		for (var i = 0, len = cells.length; i < len; i++) {
			var c = Array.isArray(cells[i]) ? cells[i] : cells[i].getCell();
			highlightMap.set(c[0] + "_" + c[1], true);
		}

		(function(hm, grid) {
			
			grid.heatmapSelection.filter(function(d) {
				return hm.get(d.cell[0] + "_" + d.cell[1]) === true;
			}).style("fill-opacity", HEATMAP_OPACITY);


			grid.heatmapSelection.filter(function(d) {
				return !hm.get(d.cell[0] + "_" + d.cell[1]);
			}).transition().duration(120)
				.style("fill-opacity", function(d) {
					return 0.0;
				});
		})(highlightMap, this);
	}
	else {
		this.heatmapSelection.style("fill-opacity", HEATMAP_OPACITY);
	}
}	

// given an example (edited) time series, plot similarity to it
GridAnalysis.prototype.showDistanceToExample = function(example)
{
	var maxDistance = this.getMaxTimeseriesDistance();

	if (!example) {
		// no example provided, return display to normal
		(function(heatmapSelection, colorScale, logScale) 
		{
			heatmapSelection.style("fill", function(d) { return colorScale(logScale(d.nValue+1)); });
		})(this.heatmapSelection, this.colorScale, this.logScale);
	}
	else
	{
		// calculate the distance of this example to all time series in our dataset
		var N = this.getTimeseriesCount();
		var distanceList = [];
		for (var i=0; i<N; i++) 
		{
			var ts = this.getTimeseries(i);
			var distance = ts.distanceEDR(example);
			distanceList.push( distance );
		}

		// plot distance heatmap
		this.showDistanceHeatmap( distanceList, maxDistance );
	}
}

GridAnalysis.prototype.showDistanceHeatmap = function(distanceList, maxDistance)
{
	// figure out min/max in distance list
	var minD = Number.MAX_VALUE, maxD = -Number.MAX_VALUE;
	for (var i=0, N=distanceList.length; i<N; i++) {
		var d=distanceList[i];
		if (d < minD) {
			minD = distanceList[i];
		}
		if (d > maxD) {
			maxD = distanceList[i];
		}
	}
	console.log("\tDistance profile: " + minD + ", " + maxD);


	// make color scale
	//var DISTANCE_COLOR = ['#f2f0f7','#dadaeb','#bcbddc','#9e9ac8','#807dba','#6a51a3','#4a1486'].reverse();
	//var DISTANCE_COLOR = ['#b35806','#f1a340','#fee0b6','#f7f7f7','#d8daeb','#998ec3','#542788'].reverse();
	var DISTANCE_COLOR = ['#feebe2','#fcc5c0','#fa9fb5','#f768a1','#dd3497','#ae017e','#7a0177'].reverse();

	var _logScale = d3.scale.log().domain([1, (maxDistance ? maxDistance : maxD)+1]).range([0, 1]);
	var simColorScale = d3.scale.quantize().domain([0, maxD]).range(DISTANCE_COLOR);
	
	(function(ij2index, heatmapSelection, colorScale, logScale, distances) 
	{

		heatmapSelection.style("fill", function(d) 
		{
			var index = ij2index[ d.cell[0] ][ d.cell[1] ];
			return colorScale( (distances[index] + 0) );
		})
	})(this.ij2index, this.heatmapSelection, simColorScale, _logScale, distanceList);
}

GridAnalysis.prototype.brushMatrixElements = function(brushedIDs, translate)
{
	if (translate) 
	{
		var matrixIDs = []; matrixIDs.length = brushedIDs.length;
		for (var i=0, N=brushedIDs.length; i<N; i++) {
			var id = brushedIDs[i];
			var cell = strToCell(id);
			matrixIDs[i] = this.ij2index[cell[0]][cell[1]];
		}
		this.simMatrix.brushElements(matrixIDs, BRUSH_COLOR);
	}
	else
	{
		this.simMatrix.brushElements(brushedIDs, BRUSH_COLOR);
	}
}

GridAnalysis.prototype.brushExplore = function(brushedIDs)
{
	var timeseries = [];
	for (var i=0, N=brushedIDs.length; i<N; i++) {
		timeseries.push({
			id: brushedIDs[i],
			timeseries: this.getTimeseries(brushedIDs[i])
		});
	}
	return this.explore.brushDataPoints(timeseries);
}

GridAnalysis.prototype.makeHeatmap = function(heatmap, timeseries)
{
	var minValue =  Number.MAX_VALUE;
	var maxValue = -Number.MAX_VALUE;

	// scan and make sure everything is in order
	var rows = this.analysisRequest.gridRows;
	var cols = this.analysisRequest.gridCols;

	var geoRects = [];
	var geoRectMap = [];

	for (var i=0; i < rows; i++) 
	{
		if (!heatmap[i]) 
		{
			continue;
		}
		else
		{
			geoRectMap[i] = [];
		}

		for (var j=0; j<cols; j++) 
		{
			if (heatmap[i][j]) 
			{
				maxValue = Math.max(heatmap[i][j], maxValue);
				minValue = Math.min(heatmap[i][j], minValue);

				var geoCoord = this.analysisRequest.grid[i][j]
				var count = heatmap[i][j];
				var _timeseries = timeseries[i][j] ? (new Timeseries( timeseries[i][j] )).normalize() : null;
			
				var cell = new GeoRect(
					count,
					_timeseries,
					[i, j],
					{ lat: geoCoord[0], lng: geoCoord[1] },
					{ lat: geoCoord[2], lng: geoCoord[3] }
				);

				// add the geo rect to the map
				geoRectMap[i][j] = cell;
				geoRects.push( cell );
			}
		}
	}

	// register georects to this object
	this.geoRectMap = geoRectMap;
	this.geoRects = geoRects;

	// make color scales
	var _logScale = d3.scale.log().domain([minValue+1, maxValue+1]).range([0, 1]);
	var _colorScale = d3.scale.quantize().domain([0, 1]).range(HEATMAP_COLOR);
	
	// store color scales
	this.logScale = _logScale;
	this.colorScale = _colorScale;

	svg.selectAll("g.heatmap").remove();
	
	var parentGroup = svg.append("g").attr('class', 'heatmap').attr('id', 'heatmap');
	var overlayGroup = svg.append("g").attr('class', 'heatmap');

	(function(svg, colorScale, logScale, heatmapGroup, overlayGroup, grid) 
	{
		var selection = heatmapGroup.selectAll("path").data(grid.geoRects);
		selection.enter().append("path")
			.attr("id", function(d) {
				var cell = d.getCell();
				return "heatmap_cell_" + cell[0] + "_" + cell[1]; 
			})
			.attr("d", function(d) 
			{
				return d.projectSelfPath();
			})
			.style("fill", function(d) {
				return colorScale(logScale(d.nValue+1));
			})
			.style("fill-opacity", function(d) {
				if (d.getValue() <= 1) return 0.0; else return HEATMAP_OPACITY;
			})
			.attr('class', function(d) { return d.getValue() <= 1 ? 'delete' : ''})
			.on("mouseenter", function(d, i) 
			{
				var ts = d.getTimeseries();
				if (ts && ts.size() > 1) 
				{
					var cell = d.getCell();
					var mouse = d3.mouse(svg.node());
					var g = overlayGroup.append('g')
						.attr("id", "heatmapTimeseriesPopup")
						.attr("transform", "translate(" + (10+mouse[0]) + "," + (mouse[1] - (GridAnalysis.GRAPH_H+10)) + ")");
						drawTimeseries(d.getTimeseries(), g);
					
					// cancel unbrush timeout if any
					if (grid.brushCellTimeout) 
					{
						clearTimeout(grid.brushCellTimeout);
						grid.brushCellTimeout = undefined;	
					}

					// propagate event
					grid.brushCells([ cell ]);
				}

				d3.select(this).attr("class", "strokedHeatmapCell");

				// remove and append to the top
				var n = jQuery(this);
				n.parent().append(n.detach());
			})
			.on("mouseout", function() {
				d3.select("#heatmapTimeseriesPopup").remove();
				d3.select(this).attr("class", "");
				grid.brushCellTimeout = setTimeout(function() {
					grid.brushCells([]);
				}, 150);
			});
		grid.heatmapSelection = selection;

		// remove cells that don't have any value associsted
		parentGroup.selectAll('path.delete').remove();

		// add geo object
		addGeoObject({
			group: parentGroup,
			type: "selfproject",
			selection: selection
		}, "heatmap");

	})(svg, _colorScale, _logScale, parentGroup, overlayGroup, this);
}

GridAnalysis.prototype.brushCells = function(cells)
{
	var actualIDs = [], matrixIDs = [], dataPoints = [];
	for (var i=0, len=cells.length; i < len; i++)
	{
		var cell = cells[i];
		var index = this.ij2index[ cell[0] ][ cell[1] ];
		actualIDs.push( cellToStr(cell) );
		matrixIDs.push( index );

		dataPoints.push({
			index: index,
			timeseries: this.getTimeseries(index)
		});

	}

	// brush explore pane
	this.explore.brushDataPoints( dataPoints );

	// brush similarity matrix as well
	this.simMatrix.brushElements(matrixIDs, BRUSH_COLOR);

	// brush MDS plot
	this.mds.brushPoints(actualIDs);
}

GridAnalysis.prototype.brushCluster = function(cluster) 
{
	// collect data points with timeseries
	var dataPoints = [];

	// cancel any de-highlight after this
	this.unbrushReset = undefined;
	this.newClusterBrush = cluster;

	// draw rectangle around the cluster in the matrix view
	var r = this.simMatrix.getSize();
	var s = -1;
	var brushedIDs = [];

	for (var k=0, len=cluster.members.length; k<len; k++)
	{
		var index = cluster.members[k];
		var i = this.simMatrix.data2ij[cluster.members[k]];
		if (r > i) r=i;
		if (s < i) s=i;
		
		var id = isNaN(index) ? index : cellToStr(this.index2ij[index]);
		dataPoints.push({
			id: id,
			index: index,
			timeseries: this.getTimeseries(index)
		});

		// add to brushed IDs
		brushedIDs.push(id);
	}

	// brush the similarity matrix
	r *= SIMMAT_ELEMENT_SIZE;
	s *= SIMMAT_ELEMENT_SIZE;

	if (!this.offscreenCanvas) return;
	var ctx = document.getElementById("canvasMatrix").getContext("2d");
	ctx.strokeStyle = "black";
	ctx.lineWidth = 1;
				
	if (GridAnalysis.FULL_MATRIX) 
	{
		ctx.strokeRect(r, r, s-r+SIMMAT_ELEMENT_SIZE, s-r+SIMMAT_ELEMENT_SIZE);
	}
	else
	{
		ctx.beginPath();
		ctx.moveTo(r, r);
		ctx.lineTo(r, s);
		ctx.lineTo(s, s);
		ctx.closePath();
		ctx.stroke();
	}

	// brush explore pane
	this.explore.brushDataPoints(dataPoints);

	// brush dendogram
	this.simMatrix.highlightCluster(cluster, BRUSH_COLOR);

	// brush the MDS points and then the heatmap
	this.highlightHeatmapCell(
		this.mds.brushPoints(brushedIDs)
	);
}


GridAnalysis.prototype.unbrushCluster = function(cluster) 
{
	// redraw matrix from offscreen buffer
	if (this.offscreenCanvas) {
		var matrixCanvas = document.getElementById("canvasMatrix");
		var context = matrixCanvas.getContext("2d");
		context.clearRect(0, 0, matrixCanvas.width, matrixCanvas.height);
		context.drawImage(this.offscreenCanvas, 0, 0);
	}

	// unbrush explore pane
	this.explore.brushDataPoints([]);

	// unbrush dendogram
	this.simMatrix.unhighlightCluster(cluster);

	// unbrush the reset after a timeout (to avoid flickering, in case we got another brush event)
	(function(grid, cluster) 
	{
		grid.unbrushReset = true;

		setTimeout(function() 
		{
			// if we got another cluster brush event, cancel the dehighlight
			if (!grid.unbrushReset) return;

			// unbrush the geographical heatmap
			grid.highlightHeatmapCell();

			// unbrush the MDS points
			grid.mds.brushPoints();

		}, 200);
	})(this, cluster);
}

// ============================
// Helper functions
// ============================
function symmetrizeSimMatrix(matrix)
{
	var n = matrix.length;
	for (var i = 0; i < n; i++) 
	{
		matrix[i].length = n;
		matrix[i][i] = 0;
		for (var j = i+1; j < n; j++) 
		{
			var e = Math.abs(matrix[j][i]);
			matrix[j][i] = e;
			matrix[i][j] = e;
		}
	}
	return matrix;
}

function strToCell(str)
{
	var tokens = str.split("_");
	return [+tokens[0], +tokens[1]];
}

function cellToStr(cell)
{
	return cell[0] + "_" + cell[1];
}
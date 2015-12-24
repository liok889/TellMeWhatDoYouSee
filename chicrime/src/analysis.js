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
	// store reference to the map
	this.map = theMap;
	this.svgExplore = svgExplore;

	// create a selection object
	var xOffset = +this.svgExplore.attr("width") - (2*ClusterSelector.RECT_OFFSET + ClusterSelector.RECT_W + ClusterSelector.RECT_H/2);
	var yOffset = ClusterSelector.RECT_OFFSET + 12;
	var gSelector = this.svgExplore.append("g").attr("transform", "translate(" + xOffset + "," + yOffset + ")");
	this.selector = new ClusterSelector(gSelector, this, [xOffset, yOffset]);

	// add exploration pane
	var gExplore = this.svgExplore.append("g");
	this.explore = new Explore(gExplore);

	// initialize callbacks for explore pane
	(function(grid) 
	{
		grid.selector.setSelectionBrushCallback(function(ids) {
			grid.brushSelectionMembers(ids);
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
				}
			},
			
			{
				id: "imgShowSmallMultipatterns", 
				callback: function() {
					thisGrid.switchMDSPanel(SHOW_SMALL_MULTIPATTERNS);
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

		// active buttons
		for (var i=0, N=buttonCallbacks.length; i<N; i++) {
			var b = buttonCallbacks[i];
			d3.select("#" + b.id)
				.style("padding", "2px")
				.on("click", b.callback)
				.on("mouseover", function() { 
					d3.select(this)
						.style("border", "solid 1.5px red"); 
				})
				.on("mouseout", function() { d3.select(this).style("border", "")});
		}
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
	this.analysisRequest = {
		// query type, for now we'll aggregate crime counts over grid
		query: 'aggregateCrimeCountOverGrid',

		grid: grid,
		gridMin: gridMin,
		gridMax: gridMax,
		cellOffset: cellOffset,
		gridCols: cols,
		gridRows: rows,

		// for now, we'll concern ourselves with year 2014
		limitYear: 2014
	};
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
				gridAnalysis.analysisResults = JSON.parse(response);

				// data ready
				gridAnalysis.data_ready();

				// callback to UI
				if (callback) {
					callback(true);
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
	if (analysisResults.hclusters) {
		// hierarchical clustering already done by server
		clustering.setHierarchicalClusters( analysisResults.hclusters )
	}
	else {
		// do clustering
		clustering.hierarchical();
	}

	// render matrix
	this.renderSimMatrix(
	{
		simMatrix: 	clustering.getClusteredSimMatrix(),	// similarity matrix
		clusters: 	clustering.getHClusters(),			// clusters
		data2ij: 	clustering.get_data2ij(),			// indices
		ij2data: 	clustering.get_ij2data()
	});

	// MDS analysis
	this.drawMDS();

	// Small-Multipatterns
	this.smallMultipatterns.makeSimpleLayout(7, 6);

	// activate view
	this.switchMDSPanel();
}

GridAnalysis.prototype.getTimeseries = function(index) 
{
	var cell = Array.isArray(index) ? index : this.analysisResults.tsIndex[index];
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
	(function(mds, matrix, tsIndex, dimensions, mdsPositions, grid) 
	{
		// async MDS analysis
		var q = queue();
		q.defer(function(_callback) 
		{
			var startTime = new Date();
			mds.plotMDS(matrix, tsIndex, dimensions, mdsPositions, grid);
			var processTime = (new Date) - startTime;
			console.log("MDS projection took: " + ((processTime/1000).toFixed(1)) + " seconds.");
			_callback(null);
		});

	})(
		this.mds, 
		this.analysisResults.distanceMatrix,
		this.analysisResults.tsIndex,
		2,
		this.analysisResults.mdsPositions,
		this
	);
}

GridAnalysis.prototype.drawSmallMultipatterns = function()
{
	this.smallMultipatterns.make
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
	//this.simMatrix.dendogramLimit = 3;
			
	// update the similarity matrix
	this.simMatrix.updateMatrixWithResults(hcluster)

	// render queue
	var canvasQ = queue();
	
	if (!this.offscreenCanvas) {
		// create an offscreen-canvas
		this.offscreenCanvas = document.createElement('canvas');
		this.offscreenCanvas.width = this.onscreenCanvas.width;
		this.offscreenCanvas.height = this.onscreenCanvas.height;
	}		
	
	(function(onscreenCanvas, offscreenCanvas, simMatrix, grid) 
	{
		// render the matrix
		canvasQ.defer(function(_callback) 
		{
			var startTime = new Date();
			simMatrix.drawToCanvas( offscreenCanvas, null, GridAnalysis.FULL_MATRIX );

			// measure time
			var endTime = new Date();
			var processTime = (endTime.getTime() - startTime.getTime())/1000;
			console.log("Matrix rendering took: " + processTime.toFixed(1) + " seconds.");
			onscreenCanvas.getContext("2d").drawImage(offscreenCanvas, 0, 0);
			_callback(null);
		});

		// create cluster brush callbacks
		simMatrix.setClusterBrushCallback(
			function(cluster) { grid.brushCluster(cluster); },
			function(cluster) { grid.unbrushCluster(cluster); }
		);

		// a callback when clusters are double clicked
		simMatrix.setClusterDblClickCallback( function(cluster) {
			grid.makeClusterSelection( cluster );
		})

	})(this.onscreenCanvas, this.offscreenCanvas, this.simMatrix, this)
}

GridAnalysis.prototype.makeClusterSelection = function(cluster) 
{
	var members = [];
	for (var i=0, N=cluster.members.length; i<N; i++) 
	{
		var id = cluster.members[i];
		var rc = this.index2ij[id];
		var geoRect = this.getGeoRect(rc);

		members.push({
			id: cluster.members[i],
			timeseries: geoRect.getTimeseries(),
			geoRect: geoRect
		});
	}
	this.selector.newSelection(members);
}

GridAnalysis.prototype.makeBrushSelection = function(ids)
{
	if (ids.length > 0)
	{
		var members = [];
		for (var i=0, N=ids.length; i<N; i++) 
		{
			var id = ids[i];
			var rc = this.index2ij[id];
			var geoRect = this.getGeoRect(rc);

			members.push({
				id: id,
				timeseries: geoRect.getTimeseries(),
				geoRect: geoRect
			});
		}
		this.selector.newSelection(members);
	}
}

GridAnalysis.prototype.brushSelectionMembers = function(ids)
{
	// get cell ids for brushed cells
	var cells = [];
	for (var i=0, N=ids.length; i<N; i++) {
		var cell = this.index2ij[ids[i]];
		cells.push(cell);
	}
	this.highlightHeatmapCell(cells);

	// matrix
	this.brushMatrixElements(ids);

	// MDS
	this.mds.brushPoints(ids);
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
			grid.heatmapSelection
				.style("fill-opacity", function(d) {
					var c = d.getCell();
					var highlighted = hm.get(c[0] + "_" + c[1]);
					return (highlighted ? HEATMAP_OPACITY : 0.0);
				});
		})(highlightMap, this);
	}
	else {
		this.heatmapSelection.style("fill-opacity", HEATMAP_OPACITY);
	}
}

GridAnalysis.prototype.brushMatrixElements = function(brushedIDs)
{
	this.simMatrix.brushElements(brushedIDs, BRUSH_COLOR);
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
	this.explore.brushDataPoints(timeseries);
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

	// produce color for the heatmap
	var _logScale = d3.scale.log().domain([minValue+1, maxValue+1]).range([0, 1]);
	var _colorScale = d3.scale.quantize([0, 1]).range(HEATMAP_COLOR);

	svg.selectAll("g.heatmap").remove();
	
	var parentGroup = svg.append("g").attr('class', 'heatmap').attr('id', 'heatmap');
	var overlayGroup = svg.append("g").attr('class', 'heatmap');

	(function(svg, colorScale, logScale, heatmapGroup, overlayGroup, grid) 
	{
		var selection = heatmapGroup.selectAll("path").data(grid.geoRects).enter().append("path")
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
					grid.brushCellOut = undefined;
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
				grid.brushCellOut = true;
				setTimeout(function() {
					if (grid.brushCellOut) {
						grid.brushCells([]);
					}
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
	var brushedIDs = [], dataPoints = [];
	for (var i=0, len=cells.length; i < len; i++)
	{
		var cell = cells[i];
		var index = this.ij2index[ cell[0] ][ cell[1] ];
		brushedIDs.push( index );
		dataPoints.push({
			index: index,
			timeseries: this.getTimeseries(index)
		});

	}

	// brush explore pane
	this.explore.brushDataPoints( dataPoints );

	// brush similarity matrix as well
	this.simMatrix.brushElements(brushedIDs, BRUSH_COLOR);

	// brush MDS plot
	this.mds.brushPoints(brushedIDs);

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
		brushedIDs.push(index);
		dataPoints.push({
			id: index,
			timeseries: this.getTimeseries(index)
		});
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
			matrix[j][i] *= -1;
			matrix[i][j] = matrix[j][i];
		}
	}
	return matrix;
}

function invertSimMatrix(matrix)
{
	var n = matrix.length;
	for (var i=0; i<n; i++) 
	{
		for (var j=0; j<i; j++) 
		{
			matrix[i][j] *= -1;
		}
	}
	return matrix;	
}

function testSymmetry(matrix) {

	for (var i=0, len=matrix.length; i<len; i++) {
		for (var j=0; j < i; j++) {
			if (matrix[i][j] !== matrix[j][i])
			{
				console.error("** MATRIX not symmetric at " + i + " x " + j);
				return false;
			}
		}
	}
	return true;
}


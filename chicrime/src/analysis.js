/* --------------------------------------------
 * Grid-based analysis
 * ============================================
 */

var HEATMAP_COLOR = ['#67001f','#b2182b','#d6604d','#f4a582','#fddbc7','#ffffff','#e0e0e0','#bababa','#878787','#4d4d4d','#1a1a1a'].reverse();
//var HEATMAP_COLOR = ['#fee5d9','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#99000d'];
//var HEATMAP_COLOR = ['rgb(255,247,236)','rgb(254,232,200)','rgb(253,212,158)','rgb(253,187,132)','rgb(252,141,89)','rgb(239,101,72)','rgb(215,48,31)','rgb(179,0,0)','rgb(127,0,0)'].reverse();
//var HEATMAP_COLOR = ['rgb(178,24,43)','rgb(214,96,77)','rgb(244,165,130)','rgb(253,219,199)','rgb(247,247,247)','rgb(209,229,240)','rgb(146,197,222)','rgb(67,147,195)','rgb(33,102,172)'].reverse();
function GridAnalysis(theMap)
{
	this.map = theMap;
}
var GRID_OPACITY = 0.6;

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
	
	//console.log("making: " + rows + " x " + cols + " grid.")
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

function testSymmetry(matrix) {

	for (var i=0, len=matrix.length; i<len; i++) {
		for (var j=0; j < i; j++) {
			if (matrix[i][j] !== matrix[j][i])
			{
				console.log("** MATRIX not symmetric at " + i + " x " + j);
				return false;
			}
		}
	}
	return true;
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
				jsonResponse = JSON.parse(response);
				gridAnalysis.analysisResults = jsonResponse;

				// ma∂ke a proper (complete) distance matrix from
				// the similarity matrix we received
				gridAnalysis.analysisResults.distanceMatrix = symmetrizeSimMatrix(gridAnalysis.analysisResults.simMatrix);

				// make an index to translate form row,col to id
				ij2index = [];

				// loop through all IDs
				for (var i=0, len = jsonResponse.tsIndex.length; i < len; i++) 
				{
					var index = jsonResponse.tsIndex[i];
					var r = index[0];
					var c = index[1];

					if (!ij2index[r]) 
					{
						ij2index[r] = [];
					}
					ij2index[r][c] = i;
				}
				gridAnalysis.ij2index = ij2index;

				// make a callback
				if (callback) callback(jsonResponse);
			},

			error: function(xhr, textStatus, errorThrown) {
				console.error("Error with Ajax GridAnalysis: " + textStatus);
			} 
		})
	})(Date.now(), this.analysisRequest, this, _callback)
};


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
GridAnalysis.GRAPH_H = 75;
GridAnalysis.FULL_MATRIX = true;
GridAnalysis.MATRIX_ELEMENT_BRUSH = 0;

function drawTimeseries(timeseries, group)
{

	// figure out the min/max of the time series
	var extent = d3.extent(timeseries);
	var data = [];
	for (var i=0, len=timeseries.length; i < len; i++) {
		data.push({
			x: i / (len-1),
			y: timeseries[i] / extent[1]
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
/*		.transition()
		.attr("d", lineFunction(data)); */
}


GridAnalysis.prototype.drawMDS = function(svg, width, height)
{
	// create a new MDS project object
	this.mds = new MDS(svg);
	(function(mds, matrix, tsIndex, dimensions, grid) 
	{
		// async MDS analysis
		var q = queue();
		q.defer(function(_callback) 
		{
			var startTime = new Date();
			mds.plotMDS(matrix, tsIndex, dimensions, grid);
			var processTime = (new Date) - startTime;
			console.log("MDS projection took: " + ((processTime/1000).toFixed(1)) + " seconds.");
			_callback(null);
		});

	})(
		this.mds, 
		this.analysisResults.distanceMatrix,
		this.analysisResults.tsIndex,
		2,
		this
	);

}

GridAnalysis.prototype.hClustering = function()
{
	console.log("h clustering...");

	// normalize matrix
	var matrix = this.analysisResults.distanceMatrix;
	var nMatrix = [];

	// figure extents
	var maxDistance = -Number.MAX_VALUE;
	var minDistance = Number.MAX_VALUE;

	for (var i=0, len=matrix.length; i<len; i++) {
		var row = [];
		for (var j=0; j<len; j++) {
			if (i == j) {
				row.push(0);
			}
			else
			{
				var v = matrix[i][j];
				if (maxDistance < v) maxDistance = v;
				if (minDistance > v) minDistance = v;
				row.push(v);
			}
		}
		nMatrix.push(row);
	}

	var diffDistance = maxDistance - minDistance;
	console.log("distances: " + maxDistance + ", " + minDistance)

	for (var i=0, len=nMatrix.length; i<len; i++) 
	{
		for (var j=0; j<len; j++) 
		{
			// simiarity = 1.0 - distance
			nMatrix[i][j] = 1.0 - ((nMatrix[i][j]-minDistance) / diffDistance);
		}
		nMatrix[i][i] = 1.0;
	}

	// set dimensions for matrix elements / dendogram, based on dimensions of the canvas
	this.onscreenCanvas = document.getElementById('canvasMatrix');
	var dim = Math.min(+this.onscreenCanvas.width, +this.onscreenCanvas.height);
	dim -= GridAnalysis.MATRIX_ELEMENT_BRUSH;

	SIMMAT_ELEMENT_SIZE = dim / nMatrix.length;
	console.log("SimMatrix element size: " + SIMMAT_ELEMENT_SIZE);
	SIMMAT_ELEMENT_BORDER = "none";
	DENDOGRAM_NODE_HEIGHT = 5;
		//simMatrix.getDendogramDepth() / (d3.select("#svgDendogram").attr("width") - 15);
		//4*SIMMAT_ELEMENT_SIZE/2 + 1;

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
	this.simMatrix.updateMatrix(nMatrix);

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
			console.log("matrix rendering took: " + processTime.toFixed(1) + " seconds.");
			onscreenCanvas.getContext("2d").drawImage(offscreenCanvas, 0, 0);
			_callback(null);
		});

		// create cluster brush callbacks
		simMatrix.setClusterBrushCallback(
			function(cluster) { grid.brushCluster(cluster); },
			function(cluster) { grid.unbrushCluster(cluster); }
		);

	})(this.onscreenCanvas, this.offscreenCanvas, this.simMatrix, this)
	console.log("done.");
}

GridAnalysis.prototype.highlightHeatmapCell = function(cells)
{
	if (cells && cells.length > 0) {

		highlightMap = d3.map();
		for (var i = 0, len = cells.length; i < len; i++) {
			var c = cells[i].getCell();
			highlightMap.set(c[0] + "_" + c[1], true);
		}

		(function(hm, grid) {
			grid.heatmapSelection
				.style("fill-opacity", function(d) {
					var c = d.getCell();
					var highlighted = hm.get(c[0] + "_" + c[1]);
					return (highlighted ? GRID_OPACITY : 0.0);
				});
		})(highlightMap, this);
	}
	else {
		this.heatmapSelection.style("fill-opacity", GRID_OPACITY);
	}
}

GridAnalysis.prototype.brushMatrixElements = function(brushedIDs)
{
	this.simMatrix.brushElements(brushedIDs, MDS_POINT_HIGHLIGHT_COLOR);
}

GridAnalysis.prototype.makeHeatmap = function(heatmap, timeseries)
{
	var minValue =  Number.MAX_VALUE;
	var maxValue = -Number.MAX_VALUE;

	// scan and make sure everything is in order
	var rows = this.analysisRequest.gridRows;
	var cols = this.analysisRequest.gridCols;

	var geoRects = [];
	for (var i=0; i < rows; i++) 
	{
		if (!heatmap[i]) continue;
		for (var j=0; j<cols; j++) 
		{
			if (heatmap[i][j]) 
			{
				maxValue = Math.max(heatmap[i][j], maxValue);
				minValue = Math.min(heatmap[i][j], minValue);

				var geoCoord = this.analysisRequest.grid[i][j]
				var count = heatmap[i][j];
				
				geoRects.push(new GeoRect(
					count,
					timeseries[i][j],
					[i, j],
					{ lat: geoCoord[0], lng: geoCoord[1] },
					{ lat: geoCoord[2], lng: geoCoord[3] }
				));
			}
		}
	}

	// produce color for the heatmap
	var _logScale = d3.scale.log().domain([minValue+1, maxValue+1]).range([0, 1]);
	var _colorScale = d3.scale.quantize([0, 1]).range(HEATMAP_COLOR);

	svg.selectAll("g.heatmap").remove();
	
	var parentGroup = svg.append("g").attr('class', 'heatmap').attr('id', 'heatmap');
	var overlayGroup = svg.append("g").attr('class', 'heatmap');

	(function(svg, colorScale, logScale, heatmapGroup, overlayGroup, grid) 
	{
		var selection = heatmapGroup.selectAll("path").data(geoRects).enter().append("path")
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
				if (d.getValue() <= 1) return 0.0; else return GRID_OPACITY;
			})
			.attr('class', function(d) { return d.getValue() <= 1 ? 'delete' : ''})
			.on("mouseenter", function(d, i) 
			{
				var ts = d.getTimeseries();
				if (ts && ts.length > 1) 
				{
					var cell = d.getCell();
					var mouse = d3.mouse(svg.node());
					var g = overlayGroup.append('g')
						.attr("id", "heatmapTimeseriesPopup")
						.attr("transform", "translate(" + (10+mouse[0]) + "," + (mouse[1] - (GridAnalysis.GRAPH_H+10)) + ")");
						drawTimeseries(d.getTimeseries(), g);
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
				grid.brushCells([]);
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
	var brushedIDs = [];
	for (var i=0, len=cells.length; i < len; i++)
	{
		var cell = cells[i];
		brushedIDs.push(  this.ij2index[ cell[0] ][ cell[1] ]  );
	}

	// brush MDS plot
	this.mds.brushPoints(brushedIDs);

	// brush similarity matrix as well
	this.simMatrix.brushElements(brushedIDs, MDS_POINT_HIGHLIGHT_COLOR);
}

GridAnalysis.prototype.brushCluster = function(cluster) 
{
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

	// brush dendogram
	this.simMatrix.highlightCluster(cluster, MDS_POINT_HIGHLIGHT_COLOR);

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

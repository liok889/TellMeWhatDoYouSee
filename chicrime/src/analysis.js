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
				jsonResponse = JSON.parse(response);
				gridAnalysis.analysisResults = jsonResponse;
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
	var mds = new MDS(svg);
	var matrix = symmetrizeSimMatrix(this.analysisResults.simMatrix);
	mds.plotMDS(matrix, this.analysisResults.tsIndex, 2, this);
}

GridAnalysis.prototype.highlightHeatmapCell = function(cell, highlight)
{
	if (Array.isArray(cell))
	{
		cell.forEach(function(co) 
		{
			var c = co.getCell();
			d3.select("#heatmap_cell_" + c[0] + "_" + c[1])
				.style("stroke", highlight ? "black" : "")
				.style("stroke-width", highlight ? "2px" : "");
		});	
	}
	else
	{
		d3.select("#heatmap_cell_" + cell[0] + "_" + cell[1])
			.style("stroke", highlight ? "black" : "")
			.style("stroke-width", highlight ? "2px" : "");
	}
}

GridAnalysis.prototype.makeHeatmap = function(heatmap, timeseries)
{
	var minValue = Number.MAX_VALUE;
	var maxValue = Number.MIN_VALUE;

	// scan and make sure everything is in order
	var rows = this.analysisRequest.gridRows;
	var cols = this.analysisRequest.gridCols;

	for (var i=0; i < rows; i++) 
	{
		if (!heatmap[i]) heatmap[i] = [];

		for (var j=0; j < cols; j++) 
		{
			if (!heatmap[i][j]) heatmap[i][j] = 0;
			minValue = Math.min(heatmap[i][j], minValue);
			maxValue = Math.max(heatmap[i][j], maxValue);
		}
	}

	var geoRects = [];
	for (var i=0; i < rows; i++) 
	{
		for (var j=0; j<cols; j++) 
		{
			var geoCoord = this.analysisRequest.grid[i][j]
			var count = heatmap[i][j];
			
			if (count > 0) {
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
	var _logScale = d3.scale.log().domain([1, maxValue+1]).range([0, 1]);
	var _colorScale = d3.scale.quantize([0, 1]).range(HEATMAP_COLOR);

	svg.selectAll("g.heatmap").remove();
	
	var parentGroup = svg.append("g").attr('class', 'heatmap').attr('id', 'heatmap');
	var overlayGroup = svg.append("g").attr('class', 'heatmap');

	(function(svg, colorScale, logScale, heatmapGroup, overlayGroup) 
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
				if (d.getValue() <= 1) return 0.0; else return 0.6;
			})
			.attr('class', function(d) { return d.getValue() <= 1 ? 'delete' : ''})
			.on("mouseenter", function(d, i) 
			{
				var ts = d.getTimeseries();
				if (ts && ts.length > 1) 
				{
					var mouse = d3.mouse(svg.node());
					var g = overlayGroup.append('g')
						.attr("id", "heatmapTimeseriesPopup")
						.attr("transform", "translate(" + (10+mouse[0]) + "," + (mouse[1] - (GridAnalysis.GRAPH_H+10)) + ")");
						drawTimeseries(d.getTimeseries(), g);
				}

				d3.select(this).attr("class", "strokedHeatmapCell");

				// remove and append to the top
				var n = jQuery(this);
				n.parent().append(n.detach());
			})
			.on("mouseout", function() {
				d3.select("#heatmapTimeseriesPopup").remove();
				d3.select(this).attr("class", "");
			});

		// remove cells that don't have any value associsted
		parentGroup.selectAll('path.delete').remove();

		// add geo object
		addGeoObject({
			group: parentGroup,
			type: "selfproject",
			selection: selection
		}, "heatmap");

	})(svg, _colorScale, _logScale, parentGroup, overlayGroup);

}

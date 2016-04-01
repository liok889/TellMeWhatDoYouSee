/* =============================
 * cluster stats
 * =============================
 */

var STATS_BIN_COUNT = 30;
var CHART_W = 80;
var CHART_H = 40;
var STATS_BIN_WIDTH = CHART_W / STATS_BIN_COUNT;
var CHART_OFFSET = 45;

function ClusterStats(group)
{
	this.group = group.append("g").attr("transform", "translate(20,0)");
	
	// distance to centroid chart
	this.centroidDistanceG = this.group.append("g")
		.attr("transform", "translate(0,20)");
	this.centroidDistanceG.append("g").attr("class", "chartGroup").attr("transform", "translate(0,20)");
	this.centroidDistanceG.append("line").attr("transform", "translate(0,20)")
		.attr("x1", 0).attr("x2", CHART_W)
		.attr("y1", CHART_H).attr("y2", CHART_H)
		.style("stroke", "black").style("stroke-width", "0.5px");
	this.centroidDistanceG.append("text")
		.attr("text-anchor", "start")
		.attr("x", 0).attr("y", 13).attr("class", "statsChartTitle").html("distance to centroid");

	// pairwise distance chart	
	this.pairwiseDistanceG = this.group.append("g")
		.attr("transform", "translate(0," + (20 + CHART_H+CHART_OFFSET) + ")");

	this.pairwiseDistanceG.append("g").attr("class", "chartGroup").attr("transform", "translate(0,20)");
	this.pairwiseDistanceG.append("line").attr("transform", "translate(0,20)")
		.attr("x1", 0).attr("x2", CHART_W)
		.attr("y1", CHART_H).attr("y2", CHART_H)
		.style("stroke", "black").style("stroke-width", "0.5px");
	this.pairwiseDistanceG.append("text")
		.attr("text-anchor", "start")
		.attr("x", 0).attr("y", 13).attr("class", "statsChartTitle").html("pairwise variability");

	// hide for now
	this.drawClusterStats();
}


ClusterStats.prototype.drawClusterStats = function(ids, avgTimeseries)
{
	if (!avgTimeseries || !ids || ids.length == 0)
	{
		this.centroidDistanceG.style("visibility", "hidden");
		this.pairwiseDistanceG.style("visibility", "hidden");
	}
	else
	{
		var maxDistance = gridAnalysis.getMaxDistance() / 2.2;
		var distanceMatrix = gridAnalysis.getDistanceMatrix();

		// calcuate distance distances to centroid
		var distanceToCentroid = [];
		var pairwiseDistance = [];

		// evaluate distance to cluster centroid (i.e., average pattern)
		for (var i=0, N=ids.length; i<N; i++) 
		{	
			var ts = gridAnalysis.getTimeseries(ids[i]);
			distanceToCentroid.push(avgTimeseries.distance(ts));
		}

		// evaluate pairwise distance
		for (var i=0, N=ids.length; i<N; i++) {
			for (var j=0; j<i; j++) {
				pairwiseDistance.push(distanceMatrix[ids[i]][ids[j]]);
			}
		}
		
		var centroidDistribution = calcDistribution(0, maxDistance, distanceToCentroid);
		var pairwiseDistribution = calcDistribution(0, maxDistance, pairwiseDistance);

		drawDistribution(
			this.centroidDistanceG.select("g.chartGroup"), 
			centroidDistribution.distribution, 
			centroidDistribution.maxBinHeight
		);

		drawDistribution(
			this.pairwiseDistanceG.select("g.chartGroup"), 
			pairwiseDistribution.distribution, 
			pairwiseDistribution.maxBinHeight
		);

		// show the charts
		this.centroidDistanceG.style("visibility", "visible");
		this.pairwiseDistanceG.style("visibility", "visible");

	}
}

function drawDistribution(group, distribution, maxBinHeight)
{
	// normalize distribution height
	if (maxBinHeight > 0) {
		for (var i=0, N=distribution.length; i<N; i++) {
			distribution[i] /= maxBinHeight;
		}
	}

	var update = group.selectAll("rect").data(distribution);
	update.enter().append("rect").attr("class", "rectStatsChart");
	update
		.attr("x", function(d, i) { return i*STATS_BIN_WIDTH; })
		.attr("y", function(d) { return CHART_H * (1.0-d) })
		.attr("height", function(d) { 
			var h = d*CHART_H;
			return h >= 1 ? h : 0;
		})
		.attr("width", STATS_BIN_WIDTH);

	update.exit().remove();
}

function calcDistribution(minVal, maxVal, values)
{
	var distribution = [];
	var len = maxVal-minVal;
	var maxBinHeight = 0;

	distribution.length = STATS_BIN_COUNT;
	for (var i=0; i<STATS_BIN_COUNT; i++) {
		distribution[i] = 0;
	}

	for (var i=0, N=values.length; i<N; i++) {
		var v = values[i];
		var d = (v-minVal) / len;
		var binI = Math.min(STATS_BIN_COUNT-1, Math.floor(d * STATS_BIN_COUNT));
		var binHeight = ++distribution[binI];
		if (binHeight > maxBinHeight) {
			maxBinHeight = binHeight;
		}
	}

	return {
		maxBinHeight: maxBinHeight,
		distribution: distribution
	};
}


/* --------------------------------------------
 * Clustering
 * cluster.js
 * ============================================
 */

var DEFAULT_K = 10;
var MAX_ITERATIONS = 1000;		// max number of iterations
var STABLE_ITERATIONS = 25;		// number of iterations before declaring stable (local minima) config

function Clustering(distanceMatrix)
{
	var minD = Number.MAX_VALUE;
	var maxD = -Number.MAX_VALUE;


	// normalize distance matrix
	var N = distanceMatrix.length;
	var nDistanceMatrix = [];
	nDistanceMatrix.length = N;

	for (var i=0; i<N; i++) 
	{
		var row = [];
		row.length = N;
		for (var j=0; j<i; j++) 
		{
			var d = distanceMatrix[i][j];
			if  (d > maxD) {
				maxD = d;
			} else if (d < minD) {
				minD = d;
			}
			//row[j] = d;
		}
		nDistanceMatrix[i] = row;
	}
	var diffD = maxD-minD;

	for (var i=0; i<N; i++) 
	{
		for (var j=0; j<i; j++) {
			nDistanceMatrix[i][j] = (distanceMatrix[i][j]-minD) / diffD;
		}
		nDistanceMatrix[i][i] = 0;
		for (var j=i+1; j<N; j++) {
			nDistanceMatrix[i][j] = (distanceMatrix[j][i]-minD) / diffD;
		}
	}

	this.originalDistance = distanceMatrix;
	this.distanceMatrix = nDistanceMatrix;
	this.maxD = maxD;
	this.minD = minD;
}

// accessors
Clustering.prototype.getHClusters = function() { return this.hclusters; }
Clustering.prototype.get_data2ij = function() { return this.data2ij; }
Clustering.prototype.get_ij2data = function() { return this.ij2data; }
Clustering.prototype.getClusteredSimMatrix = function() { return this.clusteredMatrix; }
Clustering.prototype.getDistanceExtent = function() {
	return [ this.minD, this.maxD ];
}

// setter
Clustering.prototype.setHierarchicalClusters = function(config)
{
	this.hclusters = config.hclusters;
	this.data2ij = config.data2ij;
	this.ij2data = config.ij2data;
	this.makeClusteredSimMatrix();
}

/* Hierarchical clustering */
Clustering.prototype.hierarchical = function()
{
	function selectMin(distance)
	{
		var theMin = [1, 0];
		var minD = distance[1][0];
		for (var i = 2, len = distance.length; i < len; i++) 
		{
			for ( var j = 0; j < i; j++)
			{
				var d = distance[i][j];
				if (d < minD) 
				{
					minD = d;
					theMin = [i, j];
				}
			}
		}
		theMin.push(minD);
		return theMin;
	}

	// this assumes i is larger than j
	function removeTwoColumn(m, i, j)
	{
		for (var k = j+1, len = m.length; k < len; k++) 
		{
			if (k > i) {
				m[k].splice(i, 1);
			}
			m[k].splice(j, 1);
		}
	}

	// measure time
	var startTime = new Date();

	// initialize cluster matrix at L=0 which shall contain the initial elements
	var clusterList = [];
	var clusterDistance = [];
	var N = this.distanceMatrix.length;

	for (var i=0; i<N; i++)
	{
		var C = { members: [i], l: 0 };
		clusterList.push( C );
		clusterDistance.push([]);
		for (var j=0; j<i; j++)
		{
			// distance is inverse of similarity
			clusterDistance[i].push( this.distanceMatrix[i][j] );
		}
	}

	iteration = 1;
	while (clusterList.length > 1)
	{
		// select two cluster of the lowest distance
		var merger = selectMin(clusterDistance);

		// combine the two lists
		var i = merger[0];
		var j = merger[1];

		// add a new row to clusterDistance to
		// reflect the distance to the new cluster
		var newDRow = [];
		for (var k = 0, len = clusterList.length-2; k < len; k++) 
		{
			// jump over i and j
			var m = k;
			if (m >= j) m++;
			if (m >= i) m++;

			var d1 = clusterDistance[Math.max(m,i)][Math.min(m,i)];
			var d2 = clusterDistance[Math.max(m,j)][Math.min(m,j)];
			
			// this new cluster's distance to m is the maximum of i & j
			newDRow.push(Math.max(d1, d2));
		}

		// remove two old columns
		removeTwoColumn(clusterDistance, i, j);

		// remove two old rows from distance matrix
		clusterDistance.splice(i, 1);
		clusterDistance.splice(j, 1);
		
		// add new line
		clusterDistance.push(newDRow);

		// remove old clusters from cluster list and add new one
		var c1 = clusterList.splice(i, 1)[0];
		var c2 = clusterList.splice(j, 1)[0];
		
		// add newly created cluster
		var newCluster = { members: [], l: iteration++ };
		clusterList.push(newCluster);

		// mark parent / child relationship between newly formed clusters and its predecessors
		// larger clusters are placed first
		// merge by seniority (# of members)
		if (c1.members.length >= c2.members.length) 
		{
			newCluster.children = [c1, c2];
			newCluster.members = c1.members.concat(c2.members);
		}
		else 
		{
			newCluster.children = [c2, c1];
			newCluster.members = c2.members.concat(c1.members)
		}
	
		c1.parent = newCluster;
		c2.parent = newCluster;
	}

	this.hclusters = clusterList[0];

	this.data2ij = []; this.data2ij.length = N;
	this.ij2data = []; this.ij2data.length = N;

	// layout the matrix
	this.layoutSimMatrix(this.hclusters, 0);

	// unpack similarity matrix
	this.makeClusteredSimMatrix();
	
	// measure time took for clustering
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("\thierarchical clustering took: " + processTime.toFixed(1) + " seconds.");
	
	return this.clusters;
}

Clustering.prototype.layoutSimMatrix = function(cluster, order)
{
	var children = cluster.children;
	if (children)
	{
		// layout my children
		return this.layoutSimMatrix(children[1], this.layoutSimMatrix(children[0], order));
	}
	else
	{
		// has to be a singleton cluster
		this.data2ij[cluster.members[0]] = order;
		this.ij2data[order] = cluster.members[0];
		return order+1;
	}
}

Clustering.prototype.makeClusteredSimMatrix = function()
{
	var N = this.distanceMatrix.length;

	// fill in  similarity matrix based on clustering config	
	this.clusteredMatrix = [];
	this.clusteredMatrix.length = N;
	for (var i=0; i<N; i++) 
	{
		var r = this.ij2data[i];
		var row = []; row.length = i;
		for (var j=0; j<i; j++)
		{
			var c = this.ij2data[j];
			row[j] = 1.0 - (i == j ? 0 : this.distanceMatrix[Math.max(r,c)][Math.min(r,c)]);
		}
		this.clusteredMatrix[i] = row;
	}
}

Clustering.prototype.kMedoids = function(_K)
{
	var distanceMatrix = this.distanceMatrix;
	var K = Math.min(_K || DEFAUKT_K, distanceMatrix.length);
	var startTime = new Date();

	// initial cluster list and unassigned members
	var clusterList = [];
	var unassigned = [];

	// populate unassigned list with all data points
	unassigned.length = distanceMatrix.length;
	for (var i=0; i<distanceMatrix.length; i++) {
		unassigned[i] = i;
	}

	// assign data points to the initial K clusters
	while (clusterList.length < K) 
	{
		var i = Math.min(unassigned.length-1, Math.floor(Math.random() * unassigned.length));
		var e = unassigned.splice(i, 1)[0];
		clusterList.push({ medoid: e, members: [] });
	}

	// assign rest of the points to cluster with closest medoid
	for (var i=0, M=unassigned.length; i<M; i++) 
	{
		var e = unassigned[i];
		var minI = 0;
		var minC = clusterList[0];
		var minD = distanceMatrix[minC.medoid][e];

		for (var c=1; c < K; c++) 
		{
			var cluster = clusterList[c];
			var d = distanceMatrix[cluster.medoid][e];
			if (d < minD || (d == minD && Math.random() > 0.5))
			{
				minC = cluster; minD = d;
				minI = c;
			}
		}
		minC.members.push(e);
	}
	unassigned = [];

	var oldCost = null, totalCost = null, costDeltaStable = 0, totalMedoidShift = 0;
	var iteration = 0;

	while (iteration++ < MAX_ITERATIONS) 
	{
		var medoidShifted = 0;		// how many medoids have shifted
		var moves = 0;				// how many elements moved to different clusters
		totalCost = 0;

		// loop through all clusters and elect a new medoid
		for (var c=0; c < K; c++) 
		{
			var cluster = clusterList[c];
			var allMembers = cluster.members.concat([cluster.medoid]);
			var minCost = null, minI = null;
			var comparisons = 0;

			for (var i=0, len=allMembers.length; i<len; i++) 
			{
				var m = allMembers[i];
				var cost = 0;
				for (var j=0; j<len; j++) 
				{
					cost += i == j ? 0 : distanceMatrix[m][allMembers[j]];
					comparisons++;
				}
				if (minCost === null || cost < minCost) 
				{
					minI = i;
					minCost = cost;
				}
			}

			// elect a new medoid
			var medoid = allMembers[minI];
			if (cluster.medoid != medoid) 
			{
				allMembers.splice(minI, 1);
				cluster.medoid = medoid;
				cluster.members = allMembers;

				medoidShifted++;
			}

			totalCost += minCost;
		}

		// loop through all clusters and try to find a new home for peripheral members
		var moveList = [];
		for (var c=0; c < K; c++) 
		{
			var cluster = clusterList[c];
			var members = cluster.members;

			// loop through members of cluster
			for (var i=0; i < members.length; i++) 
			{
				// see if there's a better home for this member
				var m = members[i];
				var oldD = distanceMatrix[cluster.medoid][m];
				var curD = oldD;
				var newHome = null;

				// loop through all other clusters
				for (var j=0; j<K; j++) 
				{
					if (j != c) 
					{
						var otherCluster = clusterList[j];
						var d = distanceMatrix[otherCluster.medoid][m];

						if (d < curD || (d == curD && Math.random() > 0.5)) 
						{
							curD = d;
							newHome = otherCluster;
						}
					}
				}

				if (newHome) 
				{
					// add to move list
					moveList.push(
					{
						to: newHome,
						member: m
					});

					// move from current 
					members.splice(i, 1);
					i--;

					// adjust total cost
					totalCost = totalCost - oldD + curD;
					moves++;
				}
			}
		}

		// deal with moves
		for (var i=0, len = moveList.length; i < len; i++) 
		{
			var move = moveList[i];
			move.to.members.push( move.member );
		}
	
		// keep track of how many total medoids have shifted during the run
		totalMedoidShift += medoidShifted;

		// check old cost vs. new cost
		if (oldCost) 
		{
			var costDelta = totalCost - oldCost;
			
			/*
			// print information to console
			console.log(iteration + ":\t delta: " + 
				(costDelta >= 0 ? " " : "") + costDelta.toFixed(3) + 
				", total: " + totalCost.toFixed(3) + 
				", medoids: " + medoidShifted + 
				", moves: " + moves
			);
			*/

			if (Math.abs(costDelta) < 0.005) {
				costDeltaStable++;
			} else {
				costDeltaStable = 0;
			}

			if (costDeltaStable > STABLE_ITERATIONS) {
				break;
			}
		}
		oldCost = totalCost;
	}
	console.log("mediod shifts: " + totalMedoidShift);
	console.log("k-medoids took: " + (((new Date()).getTime() - startTime.getTime())/1000).toFixed(1) + " seconds.");
	return totalCost;
}

// export Clustering if within NodeJS
if (typeof module !== 'undefined') {
	module.exports = Clustering;
}

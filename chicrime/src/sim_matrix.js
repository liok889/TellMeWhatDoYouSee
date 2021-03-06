/* --------------------------------------------
 * Similarity Matrix
 * sim_matrix.js
 * ============================================
 */
var SIMMAT_ELEMENT_SIZE = 20;
var SIMMAT_ELEMENT_BORDER = "#eeeeee";
var DENDOGRAM_NODE_HEIGHT = SIMMAT_ELEMENT_SIZE/2;
var DENDOGRAM_COLOR = "#757575";
var DENDOGRAM_STROKE_WIDTH = "0.5px";

var MATRIX_COLOR_SCALE = 
	
	// green to red
	//['#a50026','#d73027','#f46d43','#fdae61','#fee08b','#ffffbf','#d9ef8b','#a6d96a','#66bd63','#1a9850','#006837'].reverse();

	// black to white
	//['#f7f7f7','#d9d9d9','#bdbdbd','#969696','#737373','#525252','#252525'].reverse();

	// grey to red
	//['#b2182b','#ef8a62','#fddbc7','#ffffff','#e0e0e0','#999999','#4d4d4d'].reverse();
	['#ca0020','#f4a582','#ffffff','#bababa','#404040'].reverse();	// same as above but fewer classes

function SimilarityMatrix(_svg, _floatingLenses)
{
	this.svg = _svg;
	this.offset = [0, 0];
	this.clusterBrushCallback = null;
	this.clusterUnbrushCallback = null;
	this.floatingLenses = _floatingLenses;

	this.matrixVisibility = true;
	this.dendogramVisibility = true;
	this.translateMatrix = false;
	this.fitDendogramToSVG = true;
}

SimilarityMatrix.prototype.drawToCanvas = function(canvas, maxElements, fullMatrix)
{
	// render half of the matrix only
	var simMatrix = this.clusteredMatrix || this.matrix;
	var matrixLen = maxElements ? Math.min(maxElements, simMatrix.length) : simMatrix.length;
	var ctx = canvas.getContext("2d");
	var colorScale = d3.scale.quantize().domain([this.minSimilarity,1]).range(MATRIX_COLOR_SCALE);
	
	/* // Use log/power scale instead of linear ramp
	var logScale = d3.scale.pow().domain([(this.minSimilarity)*1, (1)*1]).range([0, 1]);
	var colorScale = d3.scale.quantize().domain([0, 1]).range(MATRIX_COLOR_SCALE);
	*/

	var y = 0;
	for (var i = 0; i < matrixLen; i++, y += SIMMAT_ELEMENT_SIZE) 
	{
		var fence = fullMatrix ? matrixLen : i;
		var x = 0;
		for (var j = 0; j < fence; j++, x += SIMMAT_ELEMENT_SIZE) 
		{
			ctx.fillStyle = colorScale(i == j ? 1.0 : i > j ? simMatrix[i][j] : simMatrix[j][i]);
			ctx.fillRect(x, y, SIMMAT_ELEMENT_SIZE, SIMMAT_ELEMENT_SIZE);
		}
	}
}

SimilarityMatrix.prototype.getDendogramDepth = function()
{
	return this.clusters.dendogram.depth;
}

SimilarityMatrix.prototype.draw = function()
{
	var transform = null;
	var brushCode = this.brushGroup ? this.brushGroup.html() : "";
	var simMatrix = this.clusteredMatrix ? this.clusteredMatrix : this.matrix;
	
	var colorScale = d3.scale.quantize().domain([this.minSimilarity,1]).range(MATRIX_COLOR_SCALE);
	
	if (this.matrixVisibility) 
	{
		(function(thisObject) {

			thisObject.g.selectAll("g").data(simMatrix).enter().append("g")
				.attr("transform", function(d, i) { return "translate(0," + (i*SIMMAT_ELEMENT_SIZE) + ")";})
				.selectAll("rect")
				.data(function(row, i) 
				{
					var theRow = [];
					for (var k=0, rowLen = row.length; k < rowLen; k++)
						theRow.push({ rowNum: i, data: row[k]});
					return theRow;
				})
					.enter().append("rect")
					.style("fill", function(d) { return colorScale(d.data);})
					.style("stroke-width", "0.5px")
					.style("stroke", SIMMAT_ELEMENT_BORDER)
					.attr("x", function(d, i) { return i*SIMMAT_ELEMENT_SIZE; })
					.attr("width", SIMMAT_ELEMENT_SIZE)
					.attr("height", SIMMAT_ELEMENT_SIZE)
					.on("mouseover", function(d, j) 
					{
						if (thisObject.floatingLenses)
							thisObject.floatingLenses.brushBoxes([ thisObject.ij2data[d.rowNum], thisObject.ij2data[j] ]);
					})
					.on("mouseout", function(d, i) 
					{
						if (thisObject.floatingLenses)
							thisObject.floatingLenses.unbrushBoxes();
					});
		})(this);

		if (this.translateMatrix) {
			this.g.attr("transform", "translate(" + (+this.svg.attr("width")-SIMMAT_ELEMENT_SIZE*simMatrix.length+this.offset[0]) + "," + this.offset[1]+")");
		}
	}
	else 
	{
		if (this.translateMatrix) {
			this.g.attr("transform", "translate(" + (+this.svg.attr("width")) + "," + this.offset[1]+")");
		}
	}

	
	this.brushGroup = this.g.append("g").attr("id", "matrixBrush").html(brushCode);
}

// *****************************************
// SimilarityMatrix
// -----------------------------------------
SimilarityMatrix.prototype.clusterMatrix = function()
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

	// initialize cluster matrix at L=0 which shall contain the initial elements
	var entryClusters = d3.map();
	var clusterList = [];
	var clusterDistance = [];
	var lensAccessor = typeof this.lensAccessor === 'function' ? this.lensAccessor : null;

	var startTime = new Date();
	for (var i = 0, len = this.matrix.length; i < len; i++)
	{
		var C = new Cluster([i]);
		entryClusters.set(i, C);
		C.l = 0; 
		C.lens = lensAccessor ? lensAccessor(i) : undefined;

		clusterList.push( C );
		clusterDistance.push([]);
		for (var j = 0; j < i; j++)
		{
			// distance is inverse of similarity
			clusterDistance[i].push( 1.0 - this.matrix[i][j] );
		}
	}

	iteration = 1;
	while (clusterList.length > 1)
	{
		/*
		console.log("\t distance matrix BEFORE merge: ");
		for (var r=0, len=clusterDistance.length; r<len; r++) {
			var line = "\t\t" + "[" + r + "," + clusterDistance[r].length + "]: ";
			for (var s=0; s<r; s++) {
				line += (clusterDistance[r][s] === undefined ? "X.XXX" : clusterDistance[r][s].toFixed(3)) + "\t";
			}
			console.log(line);
		}
		*/

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
		var newCluster = new Cluster([]);
		newCluster.l = iteration++;
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
		if (lensAccessor) {
			newCluster.lens = c1.lens.aggregate(c2.lens);
		}
		
		/*
		console.log("\t distance matrix AFTER merge: ");
		for (var r=0, len=clusterDistance.length; r<len; r++) {
			var line = "\t\t" + "[" + r + "," + clusterDistance[r].length + "]: ";
			for (var s=0; s<r; s++) {
				line += (clusterDistance[r][s] === undefined ? "X.XXX" : clusterDistance[r][s].toFixed(3)) + "\t";
			}
			console.log(line);
		}
		*/

		//console.log("\t merged " + i + ", " + j + ", distance: " + merger[2] + ", members: " + newCluster.members);
		c1.parent = newCluster;
		c2.parent = newCluster;
	}

	this.clusters = clusterList[0];
	this.entryClusters = entryClusters;

	// layout the matrix
	this.layoutMatrix(this.clusters, 0);
	this.layoutDendogram(this.clusters, 0);
	
	this.clusteredMatrix = [];
	for (var i=0, len=this.matrix.length; i < len; i++) 
	{
		var r = this.ij2data[i];
		this.clusteredMatrix.push([]);
		for (var j = 0; j < len; j++)
		{
			var c = this.ij2data[j];
			this.clusteredMatrix[i].push( this.matrix[r][c] );
		}
	}
	var endTime = new Date();
	var processTime = (endTime.getTime() - startTime.getTime())/1000;
	console.log("clustering took: " + processTime.toFixed(1) + " seconds.");
	return this.clusters;
}

SimilarityMatrix.prototype.getClusters = function() {
	return this.clusters;
}

SimilarityMatrix.prototype.getEntryClusters = function() {
	return this.entryClusters;
}

SimilarityMatrix.prototype.setDendogramEvents = function(_dendogramEvents)
{
	this.dendogramEvents = _dendogramEvents;
}

SimilarityMatrix.prototype.setLensAccessor = function(_lensAccessor) {
	this.lensAccessor = _lensAccessor;
}

SimilarityMatrix.prototype.brush = function(i)
{
	var matrixSize = this.getSize();
	if (matrixSize > 0)
	{
		// row
		if (i[0] !== undefined && i[0] !== null)
			d3.select("#matrixBrush").append("rect")
				.style("fill", "none")
				.style("stroke-width", "1px")
				.style("stroke", "red")
				.attr("x", "0")
				.attr("y", this.data2ij[i[0]] * SIMMAT_ELEMENT_SIZE)
				.attr("width", matrixSize * SIMMAT_ELEMENT_SIZE)
				.attr("height", SIMMAT_ELEMENT_SIZE);
			
		if (i[1] !== undefined && i[1] !== null)
			d3.select("#matrixBrush").append("rect")
				.style("fill", "none")
				.style("stroke-width", "1px")
				.style("stroke", "red")
				.attr("y", "0")
				.attr("x", this.data2ij[i[1]] * SIMMAT_ELEMENT_SIZE)
				.attr("height", matrixSize * SIMMAT_ELEMENT_SIZE)
				.attr("width", SIMMAT_ELEMENT_SIZE);
	}
}

SimilarityMatrix.prototype.brushElements = function(elementList, color)
{
	var elements = elementList || [];
	if (this.svg) {

		var elementLayout = [];

		for (var i = 0, len = elements.length; i < len; i++) {
			elementLayout.push(this.data2ij[ elements[i] ]);
		}

		this.svg.selectAll("g.elementBrush").remove();
		var g = this.svg.append("g")
			.attr("class", "elementBrush");
		g.selectAll("circle").data(elementLayout).enter().append("circle")
			.attr("cx", +this.svg.attr("width") - 5)
			.attr("cy", function(d) {
				return d * SIMMAT_ELEMENT_SIZE + SIMMAT_ELEMENT_SIZE/2;
			})
			.attr("r", "3.5")
			.style("fill", color ? color : "#222222")
			.style("fill-opacity", "0.35")
			.style("stroke", "none");
	}
}

SimilarityMatrix.prototype.brushCluster = function(cluster)
{
	if (this.floatingLenses) {
		this.floatingLenses.brushBoxes(cluster.members, true);
	}

	// determine ij extents
	var r = this.matrix.length;
	var s = -1;
	for (var k=0, len=cluster.members.length; k<len; k++)
	{
		var i = this.data2ij[cluster.members[k]];
		if (r > i) r=i;
		if (s < i) s=i;
	}

	// create a rectangular brush
	if (s >= r)
	{
		var rectSize = (s-r+1) * SIMMAT_ELEMENT_SIZE;
		var rectXY = r * SIMMAT_ELEMENT_SIZE;
		
		if (this.matrixVisibility)
		{
			this.brushGroup.append("rect")
				.attr("x", rectXY)
				.attr("y", rectXY)
				.attr("width", rectSize)
				.attr("height", rectSize)
				.attr("stroke", "black")
				.attr("stroke-width", "2px")
				.attr("fill", "none");
		}
	}
}

SimilarityMatrix.prototype.unbrushCluster = function()
{
	if (this.floatingLenses)
		this.floatingLenses.unbrushBoxes(true);
	if (this.matrixVisibility)
		this.brushGroup.html("");
}

SimilarityMatrix.prototype.unbrush = function()
{
	if (this.brushGroup)
		this.brushGroup.html("");
}

SimilarityMatrix.prototype.getSize = function()
{
	if (this.matrix)
		return this.matrix.length;
	else
		return 0;
}

SimilarityMatrix.prototype.setMatrixVisibility = function(v)
{
	this.matrixVisibility = v;
}

SimilarityMatrix.prototype.setDendogramVisibility = function(v)
{
	this.dendogramVisibility = v;
}

SimilarityMatrix.prototype.updateMatrixWithResults = function(hcluster)
{
	this.matrix = hcluster.simMatrix;
	this.clusters = hcluster.clusters;
	this.minSimilarity = (hcluster.minSimilarity !== undefined) ? hcluster.minSimilarity : 0;
	this.data2ij = hcluster.data2ij;
	this.ij2data = hcluster.ij2data;

	// layout dendogrm
	this.layoutDendogram(this.clusters, 0);

	// draw
	if (this.svg) {
		this.drawMatrix();
	}
}

SimilarityMatrix.prototype.updateMatrix = function(matrix, _minSimilarity)
{
	this.matrix = matrix;
	this.minSimilarity = (_minSimilarity !== undefined) ? _minSimilarity : 0;

	this.data2ij = [];
	this.ij2data = [];

	// direct mapping
	for (var i=0, len=this.matrix.length; i < len; i++)
	{
		this.data2ij[i] = i;
		this.ij2data[i] = i;
	}

	// cluster
	this.clusterMatrix();

	// draw
	if (this.svg) {
		this.drawMatrix();
	}
}

SimilarityMatrix.prototype.drawMatrix = function()
{
	if (this.g) 
	{
		this.g.remove();
	}

	// create an SVG group to put the matrix under
	this.g = this.svg.append("g");

	// draw the matrix
	if (this.matrixVisibility)
		this.draw();

	if (this.dendogramVisibility) 
	{
		if (this.dendogramGroup) 
		{
			this.dendogramGroup.remove();
			this.dendogramGroup = undefined;
		}

		if (this.fitDendogramToSVG && this.svg) 
		{
			var svg = d3.select(getSVG( this.svg.node() ));
			var w = +svg.attr("width");
			DENDOGRAM_NODE_HEIGHT = w / (this.clusters.dendogram.depth + 1);
		}
		var xOffset = -1 * (this.clusters.dendogram.depth + .5) * DENDOGRAM_NODE_HEIGHT;
		this.dendogramGroup = this.g.append("g")
			.attr("transform", "translate(" + xOffset + ",0)");
		this.drawDendogram(this.clusters, this.dendogramLimit)[0];
	}
}

// a depth first layout function
SimilarityMatrix.prototype.layoutMatrix = function(cluster, order)
{
	if (cluster.lens)
		cluster.lens.normalize();
	
	var children = cluster.children;
	if (children)
	{
		// layout my children
		return this.layoutMatrix(children[1], this.layoutMatrix(children[0], order));
	}
	else
	{
		// has to be a single element
		this.data2ij[cluster.members[0]] = order;
		this.ij2data[order] = cluster.members[0];
		return order+1;
	}
}

SimilarityMatrix.prototype.highlightCluster = function(cluster, theColor)
{
	if (cluster.dendogram.lines)
		cluster.dendogram.lines.attr("stroke", theColor)
	if (cluster.dendogram.circle)
		cluster.dendogram.circle.attr("fill", theColor);

	// do my children
	var children = cluster.children;
	if (children) 
	{
		this.highlightCluster(children[0], theColor);
		this.highlightCluster(children[1], theColor);
	}
}

SimilarityMatrix.prototype.unhighlightCluster = function(cluster)
{
	this.highlightCluster(cluster, DENDOGRAM_COLOR);
}

SimilarityMatrix.prototype.setClusterBrushCallback = function(brush, unbrush)
{
	this.clusterBrushCallback = brush;
	this.clusterUnbrushCallback = unbrush;
}
SimilarityMatrix.prototype.setClusterDblClickCallback = function(callback) {
	this.clusterDblClickCallback = callback;
}

SimilarityMatrix.prototype.drawDendogram = function(cluster, limit)
{
	// invert depth
	var overallDepth = this.clusters.dendogram.depth;
	var myX = (overallDepth - cluster.dendogram.depth) * DENDOGRAM_NODE_HEIGHT;
	var myY = cluster.dendogram.centroid * SIMMAT_ELEMENT_SIZE + SIMMAT_ELEMENT_SIZE/2;

	if (limit !== null && limit !== undefined && cluster.dendogram.depth <= limit)
		return [myX, myY];

	if (cluster.children)
	{
		// append an invisible rectangle for events
		(function(thisCluster, thisMatrix, _myX)
		{
			var children = thisCluster.children;
			var child1 = children[0];
			var child2 = children[1];

			var cc1 = [
				(overallDepth - child1.dendogram.depth) * DENDOGRAM_NODE_HEIGHT,
				child1.dendogram.centroid * SIMMAT_ELEMENT_SIZE + SIMMAT_ELEMENT_SIZE/2
			];

			var cc2 = [
				(overallDepth - child2.dendogram.depth) * DENDOGRAM_NODE_HEIGHT,
				child2.dendogram.centroid * SIMMAT_ELEMENT_SIZE + SIMMAT_ELEMENT_SIZE/2
			];

			var rW = (thisCluster.dendogram.depth) * DENDOGRAM_NODE_HEIGHT;
			var rH = cc2[1]-cc1[1];

			if (rH > 1 && rW > 1) {
				var branchPlaceholder = thisMatrix.dendogramGroup.append("rect")

					.attr("x", _myX)
					.attr("y", cc1[1])
					.attr("width", rW)
					.attr("height", rH)
					.attr("stroke", "none")
					.attr("fill", "rgba(255, 255, 255, 0.0)")
					.on("mouseover", function() 
					{
						if (thisMatrix.clusterBrushCallback) {
							thisMatrix.clusterBrushCallback(thisCluster);
						}
					})
					.on("mouseout", function() 
					{
						if (thisMatrix.clusterUnbrushCallback) {
							thisMatrix.clusterUnbrushCallback(thisCluster);
						}
					})
					.on("dblclick", function() {
						if (thisMatrix.clusterDblClickCallback) {
							thisMatrix.clusterDblClickCallback(thisCluster);
						}
					});

				if (thisMatrix.dendogramEvents) 
				{
					thisMatrix.dendogramEvents.forEach(function(eventName, __callback) 
					{
						branchPlaceholder.on(eventName, function() {
							__callback(thisCluster);
						});
					});
				}
			}
				
		})(cluster, this, myX);
		
		// draw my children
		var children = cluster.children;
		var c1 = this.drawDendogram(children[0], limit);
		var c2 = this.drawDendogram(children[1], limit);

		var lines = [
			{x1: myX, y1: c1[1], x2: c1[0], y2: c1[1]},
			{x1: myX, y1: c2[1], x2: c2[0], y2: c2[1]},
			{x1: myX, y1: c1[1], x2: myX, y2: c2[1]}
		];

		// connect my children with lines
		(function(thisCluster, thisMatrix) 
		{
			var g = thisMatrix.dendogramGroup.append("g");
			thisCluster.dendogram.lines = g.selectAll("line")
				.data(lines).enter().append("line")
				.attr("x1", function(d) { return d.x1} )
				.attr("y1", function(d) { return d.y1} )
				.attr("x2", function(d) { return d.x2} )
				.attr("y2", function(d) { return d.y2} )
				.attr("stroke", DENDOGRAM_COLOR)
				.attr("stroke-width", DENDOGRAM_STROKE_WIDTH)
				.on("mouseover", function() 
				{
					if (thisMatrix.clusterBrushCallback) {
						thisMatrix.clusterBrushCallback(thisCluster);
					}
				})
				.on("mouseout", function() 
				{
					if (thisMatrix.clusterUnbrushCallback) {
						thisMatrix.clusterUnbrushCallback(thisCluster);
					}
				})
				.on("dblclick", function() 
				{
					if (thisMatrix.clusterDblClickCallback) {
						thisMatrix.clusterDblClickCallback(thisCluster);
					}
				});


		})(cluster, this);
	}
			
	return [myX, myY];
}

SimilarityMatrix.prototype.layoutDendogram = function(cluster, depth)
{
	var children = cluster.children;
	if (children)
	{
		var c1 = this.layoutDendogram(children[0], depth);
		var c2 = this.layoutDendogram(children[1], depth);
		cluster.dendogram = {
			centroid: (c1.centroid + c2.centroid) / 2, 
			depth: Math.max(c1.depth, c2.depth)+1
		};
	}
	else
	{
		cluster.dendogram = {
			centroid: this.data2ij[cluster.members[0]],
			depth: depth
		};
	}
	return cluster.dendogram;
}


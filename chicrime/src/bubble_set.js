/* ===================================
 * Bubble Sets
 * A crude JavaScript implementation
 * ===================================
 */


var R0 = 10;
var R1 = 25;
var MAX_REROUTE_ITERATIONS = 48;	// note: solution-space cycles after 48 iterations
var MAX_REROUTES = 50;				// max attempts at re-routing an edge

function BubbleSets(sets, positions, w, h, r, R)
{
	// algorithm parameters
	this.resolution	= r;
	this.R0 		= R ? R[0] : R0;
	this.R1 		= R ? R[1] : R1;
	this.R0Sq 		= Math.pow(this.R0, 2);
	this.R1Sq 		= Math.pow(this.R1, 2);
	this.R1R0 		= this.R1-this.R0;
	this.R1R0Sq 	= Math.pow(this.R1-this.R0, 2);

	// initialize sets and transform their positions
	// to pixel coordinate
	this.sets = [];
	for (var i=0, N=sets.length; i<N; i++) 
	{
		var members = sets[i].members;
		if (members.length == 0) 
		{
			// ignore empty sets
			console.log("Ignored set with empty members");
			continue;
		}

		var bubbleSet = {
			members: [],
			vertices: [],
			obstacles: []
		};

		for (var j=0, M=members.length; j<M; j++) 
		{
			var m = members[j];
			var p = positions[m];
			bubbleSet.members.push({
				x: p[0] || p.x,
				y: p[1] || p.y,
				m: m
			});
			bubbleSet.vertices.push(m);
		}
		this.sets.push(bubbleSet)
	}
	
	// make a buffer for the energy field
	this.w = Math.ceil(w * r);
	this.h = Math.ceil(h * r);
	this.energyBuffer = new ArrayBuffer(this.w * this.h * 2);
	this.energy = new Int16Array(this.energyBuffer);

	// mark obstacles
	this.calcBoundingBox();
	this.addObstacles();
}

BubbleSets.prototype.computeBubbleSet = function(set)
{
	// connect sets
	var vEdges = this.findConnectivity( set );

	// recalculate bounding box; 
	// it might have expanded if new joint nodes were added
	this.calcBoundingBox( set );

	// calculate energy
	this.calcEnergy( set );

	return vEdges;
}

BubbleSets.prototype.computeAll = function()
{
	this.contours = [];
	for (var i=0, N=this.sets.length; i<N; i++) 
	{
		// compute bubble outline
		this.computeBubbleSet(this.sets[i]);

		// extract contour
		var contour = this.extractBubbleContour(this.sets[i]);
		
		// if has contour, draw it
		if (contour) 
		{
			this.contours.push
			({
				set: i,
				members: getMemberList(this.sets[i].members),
				contours: contour.contour
			});
		}
	}

	function getMemberList(arr) {
		var members = [];
		for (var i=0, N=arr.length; i<N; i++) {
			members.push(arr[i].m);
		}
		return members;
	}

	return this.contours;
}

BubbleSets.prototype.getSet = function(index)
{
	return this.sets[index];
}

BubbleSets.prototype.calcBoundingBox = function(oneSet)
{
	var R1 = this.R1;
	var sets = oneSet ? [oneSet] : this.sets;
	
	for (var i=0, N=sets.length; i<N; i++) 
	{
		var set = sets[i];
		var bb = {
			x: [Number.MAX_VALUE, -Number.MAX_VALUE],
			y: [Number.MAX_VALUE, -Number.MAX_VALUE]
		}

		// loop through all members of set
		for (var j=0, M=set.members.length; j<M; j++) 
		{
			var m = set.members[j];
			var pRX0 = m.x-R1;
			var pRX1 = m.x+R1;
			var pRY0 = m.y-R1;
			var pRY1 = m.y+R1;

			if (bb.x[0] > pRX0) {
				bb.x[0] = pRX0;
			}
			if (bb.x[1] < pRX1) {
				bb.x[1] = pRX1;
			}
			if (bb.y[0] > pRY0) {
				bb.y[0] = pRY0;
			}
			if (bb.y[1] < pRY1) {
				bb.y[1] = pRY1;
			} 
		}
		bb.left 	= bb.x[0];
		bb.right 	= bb.x[1];
		bb.top 		= bb.y[0];
		bb.bottom 	= bb.y[1];
		set.boundingBox = bb;
	}
}

BubbleSets.prototype.addObstacles = function()
{
	var R1Sq = this.R1Sq;
	var overlapThreshold = Math.pow(this.R0 * .25, 2);

	// identify obstacles for each set
	for (var i=0, N=this.sets.length; i < N; i++)
	{
		var set = this.sets[i];
		for (var j=0; j < N; j++) 
		{
			if (i != j) 
			{
				// see if the sets intersect at all
				var otherSet = this.sets[j];
				if (BoxBoxIntersect(set.boundingBox, otherSet.boundingBox)) 
				{
					// test all members of otherSet against set's bounding box
					var bb = set.boundingBox;
					var members = otherSet.members;
					for (var m=0, M=members.length; m<M; m++) 
					{
						var circle = members[m];
						if (BoxCircleIntersect(bb, circle, R1Sq)) 
						{
							/*
							// The following test seems un-necessary
							//
							// make sure the proposed obstacle have no overlap with any
							// of our members, otherwise there wouldn't be a solution
							var myMembers = set.members;
							var safe = true;
																	
							for (var k=0, K=myMembers.length; k<K; k++) 
							{
								var member = myMembers[k];
								d = Math.pow(circle.x-member.x, 2) + Math.pow(circle.y-member.y, 2);
								if (d < overlapThreshold) 
								{
									safe = false;
									break;
								}
							}
							*/

							// add obstacle
							set.obstacles.push({
								x: circle.x,
								y: circle.y,
								m: circle.m,
								/*
								overlapping: !safe	// mark obstacles overlapping with set members
													// so that we can ignore them in edge intersection
													// but still use them in energy field calculation
								*/
							});
						}
					}
				}
			}
		}
	}
}

BubbleSets.prototype.findConnectivityStep = function(set, lastStep)
{
	// intersection paramteres
	var R1 = this.R1;
	var R0 = this.R0;
	var R0Sq = this.R0Sq;

	// get list of members and obstacles
	var members = set.members;
	var obstacles = set.obstacles;

	// make a list of vertices for MST calculation
	var vertices = [];
	for (var i=0, M=members.length; i<M; i++) {
		vertices.push(i);
	}

	// calculate MST
	if (!set.mst)
	{
		var mst = (function(v, theSet) {
			return KruskalMST(v, function(a, b) 
			{
				var pA = theSet.members[a];
				var pB = theSet.members[b];
				return Math.pow(pA.x-pB.x, 2) + Math.pow(pA.y-pB.y, 2);
			});
		})(vertices, set);

		// store minimum spanning tree
		set.mst = mst;
	} else {
		mst = set.mst;
	}

	// build virtual edges from MST, re-routing them if necessary
	var vEdges = [];
	var reRouteCount = 0;
	for (var i=lastStep || 0; i < mst.length; i++)
	{
		var edge = mst[i];
		var u = members[edge.u];
		var v = members[edge.v];
		var collisions = false;

		for (var j=0, O=obstacles.length; j<O; j++) 
		{
			var obstacle = obstacles[j];
			var intersection = this.edgeCollisionTest(u, v, obstacle);
			if (intersection && reRouteCount < MAX_REROUTES) 
			{
				var newEdges = this.reRoute(set, edge, obstacle, intersection);
				reRouteCount++;

				// add the new edges to MST
				if (newEdges) {
					mst.extend(newEdges);
				}
				collisions = obstacle;
			}
			else if (reRouteCount >= MAX_REROUTES) 
			{
				console.log("* reached max rerouting counts: " + MAX_REROUTES);
				return vEdges;
			}
		}
		
		if (collisions)
		{
			mst.splice(i, 1);
		}
		return {
			lastStep: i+1,
			obstacle: collisions
		};
	}
}

BubbleSets.prototype.edgeCollisionTest = function(u, v, obstacle)
{	
	var intersection = circleLineSegmentIntersect(u, v, obstacle, this.R0, this.R0Sq);
	var collisionTest = 

		intersection.intersects == 1 ||		// edge touches the obstacle in one point
		intersection.intersects == 2 &&		// edge intersects obstacle in two points
		intersection.points.length != 1;	// this excludes obstacles that completetly engulfs u or v 
											// (can't do anything about 'em)
	if (collisionTest) 
	{
		return intersection;
	}
	else
	{
		return null;
	}
}


BubbleSets.prototype.findConnectivity = function(set)
{
	// intersection parameteres
	var R1 = this.R1;
	var R0 = this.R0;
	var R0Sq = this.R0Sq;

	// get list of members and obstacles
	var members = set.members;
	var obstacles = set.obstacles;

	// make a list of vertices for MST calculation
	var vertices = [];
	for (var i=0, M=members.length; i<M; i++) {
		vertices.push(i);
	}

	// calculate MST
	var mst = (function(v, theSet) {
		return KruskalMST(v, function(a, b) 
		{
			var pA = theSet.members[a];
			var pB = theSet.members[b];
			return Math.pow(pA.x-pB.x, 2) + Math.pow(pA.y-pB.y, 2);
		});
	})(vertices, set);

	// store minimum spanning tree
	set.mst = mst;

	// build virtual edges from MST, re-routing them if necessary
	set.vEdges = []
	var vEdges = set.vEdges;
	var reRouteCount = 0;
	for (var i=0; i < mst.length; i++)
	{
		var edge = mst[i];
		var u = members[edge.u];
		var v = members[edge.v];
		var hasCollision = false;

		for (var j=0, O=obstacles.length; j<O; j++) 
		{
			var obstacle = obstacles[j];
			if (obstacle.overlapping) 
			{
				// ignore this obstacle; it overlaps with the node
				// and it would be very difficult to reroute the edge around it
				continue;
			}

			// test edge againt obstacle
			var intersection = this.edgeCollisionTest(u, v, obstacle);
			if (intersection) 
			{
				// flag collision
				hasCollision = true;

				if (reRouteCount < MAX_REROUTES) 
				{
					var newEdges = this.reRoute(set, edge, obstacle, intersection);
					reRouteCount++;

					// add the new edges to MST
					if (newEdges) {
						mst.push(newEdges[0]);
						mst.push(newEdges[1]);
					}
				}
				else 
				{
					console.log("* Can not re-route edge: reached max limit of " + MAX_REROUTES);
				}
				break;
			}
		}
		
		if (!hasCollision)
		{
			// no collisions; this edge is OK
			vEdges.push({ u: u, v: v });
		}
	}
	return vEdges;
}

var COS_THETA = Math.cos(45 * Math.PI / 180);
var SIN_THETA = Math.sin(45 * Math.PI / 180);

BubbleSets.prototype.reRoute = function(set, edge, obstacle, collision)
{
	// amount to push out edge by
	var PUSH_OUT = this.R0 * 1.9;

	// start with a vector going from the center
	// of the obstacle to the point that's perpendicular to the edge
	var V = { 
		x: collision.pointOnLine.x - obstacle.x, 
		y: collision.pointOnLine.y - obstacle.y 
	};

	// if zero-vector, randomize
	if (V.x == 0 && V.y == 0) 
	{
		randomVector = true;
		V = {x: Math.random(), y: Math.random()};
	}
	normalize2(V);

	var solution = null;
	var iteration = 0;
	var maxIterations = MAX_REROUTE_ITERATIONS;

	while (iteration < maxIterations)
	{
		var joint = {
			x: obstacle.x + PUSH_OUT * V.x,
			y: obstacle.y + PUSH_OUT * V.y
		};

		// test joint against all other obstacles
		var badJoint = false;
		for (var i=0, O=set.obstacles.length; i<O; i++) 
		{
			var obstacle = set.obstacles[i];
			if (!obstacle.overlapping && pointInCircle(joint, set.obstacles[i], this.R0Sq))
			{
				badJoint = true;
				break;
			}
		}
		if (!badJoint && solution == null) {
			solution = {
				x: joint.x, y: joint.y
			};
		}

		var badEdge = false;
		if (!badJoint)
		{
			// test the new proposed edges against obstacles
			
			var u = set.members[edge.u];
			var v = set.members[edge.v];

			for (var i=0, O=set.obstacles.length; i<O; i++) 
			{
				var obstacle = set.obstacles[i];
				if (obstacle.overlapping) {
					continue;
				}
				if (
					this.edgeCollisionTest(u, joint, obstacle) !== null ||
					this.edgeCollisionTest(v, joint, obstacle) !== null
				) 
				{
					badEdge = true;
					break;
				}
			}
		}

		if (badEdge && solution && !solution.itrLimited) 
		{
			// reduce the number of iterations here, since 
			// this is an exploratory, early-fix approach
			// which can sometimes be fixed better in 
			// a separate reRoute invole
			maxIterations = iteration + 4*3;
			solution.itrLimited = true;
		}

		if (!badJoint && !badEdge)
		{
			// we have a solution
			solution = joint;
			break;
		}
		else
		{
			if (iteration % 4 == 0) 
			{
				// increase push out
				PUSH_OUT *= 1.5;
			}
			else if (iteration % 4 == 1)
			{
				// flip
				V.x *= -1;
				V.y *= -1;
				PUSH_OUT /= 1.5;
			}
			else if (iteration % 4 == 2)
			{
				// increase push out
				PUSH_OUT *= 1.5;
			}
			else if (iteration % 4 == 3)
			{
				// rotate
				PUSH_OUT /= 1.5;
				var vRotated = {
					x: V.x * COS_THETA - V.y * SIN_THETA,
					y: V.x * SIN_THETA + V.y * COS_THETA
				};
				V = vRotated;
			}
		}
		iteration++;
	}

	if (solution)
	{
		// add two new edges
		solution.m = set.members.length;
		solution.joint = true;
		set.members.push(solution);

		// add two new edges
		return [{
			u: edge.u,
			v: solution.m
		},
		{
			u: solution.m,
			v: edge.v
		}];
	}
	else
	{
		// faiure to re-route
		return null;
	}
}

BubbleSets.prototype.calcEnergy = function(set)
{
	// calculate pixel-based active area
	var R1 = this.R1;
	var R1Sq = this.R1Sq;
	var R1R0Sq = this.R1R0Sq;
	var vEdges = set.vEdges;

	var EDGE_W 		=  1.2;
	var MEMBER_W 	=  1.0;
	var JOINT_W 	=  0.5;
	var OBSTACLE_W 	= -1.0; 

	var r = this.resolution;
	var iR = 1/r;

	var w = this.w;
	var h = this.h;
	var bb = set.boundingBox;
	
	// pixel-based bounding box
	var pBB = 
	{
		left: 		Math.max(0,  	Math.floor(	bb.left*r)),
		right: 		Math.min(w-1,	Math.ceil(	bb.right*r)),
		top: 		Math.max(0,		Math.floor(	bb.top*r)),
		bottom: 	Math.min(h-1,	Math.floor(	bb.bottom*r))
	};
	set.pBB = pBB;

	var energyField = this.energy;
	var setMembers = set.members;
	var setObstacles = set.obstacles;
	var M = setMembers.length;

	// clear energy buffer
	this.clearEnergyBuffer(pBB);

	// loop through all pixels
	for (var row=pBB.top, bottom = pBB.bottom; row <= bottom; row++)
	{
		var pY = (row+.5) * iR;
		var rowOffset = row * w;
		var hitMap = {};			// map of nodes we hit

		for (var col=pBB.left, right=pBB.right; col <= right; col++)
		{
			var pX = (col+.5) * iR;
			var E = 0;

			// accumilate contribution from set members
			for (var i=0; i<M; i++) 
			{
				var member = setMembers[i];
				/*
				if (member.joint)
				{
					// this is just a joint, skip
					continue;
				}
				*/

				var d = Math.pow(pX-member.x, 2) + Math.pow(pY-member.y, 2);
				if (d < R1Sq) 
				{

					// evaluate energy field
					d = Math.sqrt(d);
					E += (member.joint ? JOINT_W : MEMBER_W) * Math.pow(R1-d, 2) / R1R0Sq;
					hitMap[ member ] = d;
				}
			}

			// accumilate contribution from the closest virtual edge to this pixel
			var minEdge = null, minD = null;
			for (var i=0, N=vEdges.length; i<N; i++) 
			{
				var edge = vEdges[i];

				// see how far this edge is from the pixel
				var collision = circleLineSegmentIntersect(edge.u, edge.v, {x: pX, y: pY}, R1, R1Sq);
				if (collision.intersects > 0 && (minD === null || (minD > collision.distanceToLine))) 
				{
					minD = collision.distanceToLine;
					minEdge = edge;
				}
				else if (collision.intersects == 0) 
				{
					// test the nodes themselves as hiy for edges
					var uHit = hitMap[edge.u];
					var vHit = hitMap[edge.u];
					if (uHit !== undefined && uHit < minD) {
						minD = uHit;
						minEdge = edge;
					}
					if (vHit !== undefined && vHit < minD) {
						minD = vHit;
						minEdge = edge;
					}
				}

			}
			if (minEdge) 
			{
				E += EDGE_W * Math.pow(R1 - minD, 2) / R1R0Sq;
			}

			if (E > 0) 
			{
				// accumilate negative contribution from obstacles
				for (var i=0, N=setObstacles.length; i<N; i++) {
					var obstacle = setObstacles[i];
					var d = Math.pow(pX-obstacle.x, 2) + Math.pow(pY-obstacle.y, 2);
					if (d < R1Sq) {
						E += OBSTACLE_W * Math.pow(R1-Math.sqrt(d), 2) / R1R0Sq;
					}
				}
			}

			if (E > 0) 
			{
				energyField[rowOffset + col] = Math.floor(100 * E + .5);
			}
		}
	}
	return pBB;
}

BubbleSets.prototype.clearEnergyBuffer = function()
{
	// clear the buffer
	for (var i=0, N=this.w * this.h; i < N; i++) {
		this.energy[i] = 0;
	}	
}

BubbleSets.prototype.extractBubbleContour = function(set, step)
{
	var MAX_THRESHOLD = 120;
	var MIN_THRESHOLD = 20;
	var STEP = -1 * (step || 10);
	var threshold = MAX_THRESHOLD;

	var bestSolution = null;
	var bestHitCount = null;

	// make a hit list of set members to see whether
	// we're reaching all
	var hitList = [];
	for (var i=0, N=set.members.length; i<N; i++) 
	{
		hitList.push(
		{
			x: set.members[i].x,
			y: set.members[i].y,
		});
	}

	// loop interactively until we get all items hit (or run out of range)
	while (MAX_THRESHOLD >= threshold && threshold >= MIN_THRESHOLD)
	{
		// flood fill
		var floodMask = this.floodFill(set, threshold, hitList);
		
		// count hits, maintain list of missed hits
		var result = {
			hitCount:  0, 
			misses: []
		};
		(function(hList, r) 
		{
			hList.forEach(function(target, i) {
				if (target.hit) {
					r.hitCount++;
				} else {
					r.misses.push(i);
				}
			});
		})(hitList, result);

		if (bestSolution === null || (bestHitCount < result.hitCount)) 
		{
			bestSolution = floodMask;
			bestHitCount = result.hitCount;
		}

		if (result.hitCount == set.members.length) {
			// optimal solution!
			break;
		}
		else
		{
			threshold += STEP;
		}
	}

	var contour = null;
	if (bestSolution)
	{
		contour = this.marchingSquares(bestSolution, set.pBB, threshold);
	}

	if (contour)
	{
		return {
			contour: contour,
			hits: bestHitCount
		};
	}
	else
	{
		return null
	}
}

BubbleSets.prototype.floodFill = function(set, eThreshold, hitList)
{
	var pBB = set.pBB;
	var w0 = pBB.left;
	var h0 = pBB.top;
	var w1 = pBB.right;
	var h1 = pBB.bottom;
	var w   = this.w;

	var maskW = w1-w0+1;
	var maskH = h1-h0+1;
	var maskBuffer = new ArrayBuffer(maskW * maskH);
	var mask = new Int8Array(maskBuffer);
	var filled = [];


	// choose an arbitrary member of the set
	var sX = Math.floor(set.members[0].x * this.resolution);
	var sY = Math.floor(set.members[0].y * this.resolution);
	var startP = {
		x: sX,
		y: sY,
		I: sX-w0 + (sY-h0)*maskW
	};

	// energy field
	var energy = this.energy;

	// flood starting from startO
	var q = [];
	q.push(startP);

	var iterations = 0;
	while (q.length > 0) 
	{
		iterations++;
		var p = q.pop();
		var x = p.x, y = p.y, I = p.I;

		// make sure pixel has not been visited before
		if (mask[I] != 0) {
			continue;
		}
		
		// evaluate energy
		var E = energy[y * w + x];
		mask[I] = E >= eThreshold ? 1 : -1;

		if (E >= eThreshold) 
		{
			filled.push(p);

			// determine legal moves
			var Xm = x > w0 ?  x-w0-1 			: null;
			var Xp = x < w1 ?  x-w0+1 			: null;
			var Ym = y > h0 ? (y-h0-1)*maskW  	: null;
			var Yp = y < h1 ? (y-h0+1)*maskW  	: null;
			var X =  x-w0;
			var Y = (y-h0)*maskW;
			
			var v = [
				Yp !== null &&    true    ,
				Yp !== null && Xm !== null,
				    true    && Xm !== null,
				Ym !== null && Xm !== null,
				Ym !== null &&    true    ,
				Ym !== null && Xp !== null,
				    true    && Xp !== null,
				Yp !== null && Xp !== null
			];


			// next moves (do only 4 neighbors)
			var nI;
			nI = Yp + X ; if (v[0] && mask[nI]==0) q.push({ x: x  , y: y+1, I: nI });
			//nI = Yp + Xm; if (v[1] && mask[nI]==0) q.push({ x: x-1, y: y+1, I: nI });
			nI = Y  + Xm; if (v[2] && mask[nI]==0) q.push({ x: x-1, y: y  , I: nI });
			//nI = Ym + Xm; if (v[3] && mask[nI]==0) q.push({ x: x-1, y: y-1, I: nI });
			nI = Ym + X ; if (v[4] && mask[nI]==0) q.push({ x: x  , y: y-1, I: nI });
			//nI = Ym + Xp; if (v[5] && mask[nI]==0) q.push({ x: x+1, y: y-1, I: nI });
			nI = Y  + Xp; if (v[6] && mask[nI]==0) q.push({ x: x+1, y: y  , I: nI });
			//nI = Yp + Xp; if (v[7] && mask[nI]==0) q.push({ x: x+1, y: y+1, I: nI });
		}
	}
	//console.log("Flood fill iterations: " + iterations);
	
	// if hitList is provided, check whether we hit targets of the list
	if (hitList)
	{
		for (var i=0, N=hitList.length; i<N; i++) 
		{
			var target = hitList[i];
			var xP = Math.floor(target.x * this.resolution);
			var yP = Math.floor(target.y * this.resolution);
			var I = xP-w0 + (yP-w0) * maskW;
			target.hit = (mask[I] !== 0);
		}
	}

	/*
	if (svg) {
		svg.selectAll("rect.contour").data(filled).enter().append("rect")
			.attr("x", function(d) { return d.x / resolution; })
			.attr("y", function(d) { return d.y / resolution; })
			.style("fill", "black")
			.attr("width", 1/resolution)
			.attr("height", 1/resolution)
	}
	*/

	return mask;
}

BubbleSets.prototype.marchingSquares = function(mask, pBB, threshold)
{

	// contour state
	var CONTOUR_STATE = {};
	CONTOUR_STATE[ (0 << 0) + (0 << 1) + (0 << 2) + (0 << 3) ] = null;
	CONTOUR_STATE[ (1 << 0) + (0 << 1) + (0 << 2) + (0 << 3) ] = [1,4];
	CONTOUR_STATE[ (1 << 0) + (1 << 1) + (0 << 2) + (0 << 3) ] = [2,4];
	CONTOUR_STATE[ (1 << 0) + (0 << 1) + (1 << 2) + (0 << 3) ] = [1,3];
	CONTOUR_STATE[ (1 << 0) + (0 << 1) + (0 << 2) + (1 << 3) ] = [1,2,3,4, 2,3,4,1];	// 9 (1010)
	CONTOUR_STATE[ (0 << 0) + (1 << 1) + (0 << 2) + (0 << 3) ] = [1,2];
	CONTOUR_STATE[ (0 << 0) + (1 << 1) + (1 << 2) + (0 << 3) ] = [2,3,1,4, 1,2,4,1];	// 6 (0101)
	CONTOUR_STATE[ (0 << 0) + (1 << 1) + (0 << 2) + (1 << 3) ] = [1,3];
	CONTOUR_STATE[ (0 << 0) + (0 << 1) + (1 << 2) + (0 << 3) ] = [3,4];
	CONTOUR_STATE[ (0 << 0) + (0 << 1) + (1 << 2) + (1 << 3) ] = [2,4];
	CONTOUR_STATE[ (0 << 0) + (0 << 1) + (0 << 2) + (1 << 3) ] = [2,3];
	CONTOUR_STATE[ (1 << 0) + (1 << 1) + (1 << 2) + (0 << 3) ] = [2,3];
	CONTOUR_STATE[ (1 << 0) + (1 << 1) + (0 << 2) + (1 << 3) ] = [3,4];
	CONTOUR_STATE[ (1 << 0) + (0 << 1) + (1 << 2) + (1 << 3) ] = [1,2];
	CONTOUR_STATE[ (0 << 0) + (1 << 1) + (1 << 2) + (1 << 3) ] = [1,4];
	CONTOUR_STATE[ (1 << 0) + (1 << 1) + (1 << 2) + (1 << 3) ] = null;

	var CONTOUR_EDGE_CENTER = [
		null,
		{x: 0.5, y: 0.0},
		{x: 1.0, y: 0.5},
		{x: 0.5, y: 1.0},
		{x: 0.0, y: 0.5}
	];

	var done = false;

	// boundaries
	var maskW = pBB.right - pBB.left + 1;
	var maskH = pBB.bottom - pBB.top + 1;

	// contour vertices
	var contourVertices = [];

	// iso-contours
	var contourMap = {};
	var startP = null;

	for (var y=0, yBound=maskH-1; y <= yBound; y++)
	{
		var yOffset = maskW * y;
		for (var x=0, xBound=maskW-1; x <= xBound; x++)
		{
			var bitIndex = 0;
			var Y = y << 16;

			bitIndex += 		(mask[yOffset + x] 					> 0 ? 1 : 0);
			bitIndex += 		(mask[yOffset + x+1] 				> 0 ? 1 : 0) << 1;
			bitIndex +=			(mask[yOffset + x   + maskW] 		> 0 ? 1 : 0) << 2;
			bitIndex +=			(mask[yOffset + x+1 + maskW] 		> 0 ? 1 : 0) << 3;

			// look up trajectory index
			var state = CONTOUR_STATE[ bitIndex ]
			if (state) 
			{
				if (state.length == 8)
				{
					console.log("\tSaddle point");
					// disambiguiate sadle point
					var w = this.w;
					var E = 
						this.energy[ w*(pBB.top+y)   + pBB.left + x   ] +
						this.energy[ w*(pBB.top+y+1) + pBB.left + x   ] +
						this.energy[ w*(pBB.top+y)   + pBB.left + x+1 ] +
						this.energy[ w*(pBB.top+y+1) + pBB.left + x+1 ];
					
					if (E >= threshold) 
					{
						// mid point is black, select the first 4
						var newState = [state[0], state[1], state[2], state[3]] 
						state = newState;
					}
					else
					{
						var newState = [state[4], state[5], state[6], state[7]];
						state = newState;
					}
								
				}

				var vertices = [];
				var lastE = null, lastV = null;;
				for (var i=0; i<state.length; i++) 
				{
					var e = CONTOUR_EDGE_CENTER[ state[i] ];
					var v = {
						x: x + e.x + pBB.left, 
						y: y + e.y + pBB.top , 
					};

					if (i % 2 > 0) 
					{
						v.dX = e.x - lastE.x;
						v.dY = e.y - lastE.y;

						lastV.dX = v.dX;
						lastV.dY = v.dY;
					}


					// add vertices
					contourVertices.push(v);
					vertices.push(v);

					// maintain memory to last Edge / vertex
					lastE = e;
					lastV = v;
				}
				
				// add to contour map
				contourMap[x+Y] = vertices;

				if (!startP) {
					startP = {x: x, y: y, v: vertices};
				}
			}
		}
	}

	console.log("contour vertices after marching squares: " + contourVertices.length);

	/*
	if (svg) {
		svg.selectAll("line.contourEdge").data(contourVertices).enter().append("line")
			.attr("x1", function(d) { return d.x / resolution; })
			.attr("y1", function(d) { return d.y / resolution; })
			.attr("x2", function(d) { return (d.x+d.dX) / resolution; })
			.attr("y2", function(d) { return (d.y+d.dY) / resolution; })
			.style("stroke", "red")
			//.attr("width", 1/resolution)
			//.attr("height", 1/resolution);
	}
	*/

	// detect contour edges
	if (contourVertices.length > 0) 
	{
		var allContours = traceAllContours(startP, contourVertices, contourMap, pBB);
		return allContours;
	}
	else
	{
		return null;
	}

}


function traceAllContours(startP, contourVertices, contourMap, pBB)
{
	// contours; this is where we will store results

	// boundaries
	var w_0 = 0; pBB.left;
	var h_0 = 0; pBB.top;
	var w_1 = Number.MAX_VALUE;
	var h_1 = Number.MAX_VALUE;

	var contours = [];			// all contours we discovered so far
	var curContour = [];		// current contour we're building
	var curActiveList = [];		// vertices that we suspect will eventually form a contour
	
	var p = startP;
	var lastV = null;

	// deal with startP if it's a saddle point
	if (startP.v.length > 2) 
	{
		curActiveList.push({
			x: startP.x,
			y: startP.y,
			v: startP.v.splice(2, 2)
		});
	}

	var lastPixel = null;
	var firstSwitch = true;
	var lastStep = 0;
	while ( p !== null || curActiveList.length > 0)
	{
		if (p === null) 
		{
			p = curActiveList.pop();
		}

		// add contour point
		curContour.push( p.v[0] );
		if (p.v.length > 1) 
		{
			curContour.push( p.v[1] );
			lastV = p.v[1];
		}
		else
		{
			lastV = p.v[0];
		}

		var x = p.x, y = p.y;
		var X = x, Y = y << 16;
		var I = X+Y;
		contourMap[I] = null;

		/*
		if (svg && p !== null) {
			var update = svg.append("rect")
				.attr("class", "selector")
				.attr("width", 1/resolution)
				.attr("height", 1/resolution)
				.style("fill", "red")
				.attr("x", (pBB.left + p.x)/resolution)
				.attr("y", (pBB.top + p.y)/resolution)

			if (lastPixel) {
				lastPixel.style("fill", firstSwitch ? "blue" : "green");
				firstSwitch = false;
			}
			lastPixel = update;
		}
		*/

		// trace the contour
		var Xm = x > w_0 ?  x-1 		: null;
		var Xp = x < w_1 ?  x+1 		: null;
		var Ym = y > h_0 ? (y-1) << 16 	: null;
		var Yp = y < h_1 ? (y+1) << 16 	: null;
		
		// legal moves
		var v = [
			Yp !== null &&    true    ,
			Yp !== null && Xm !== null,
			    true    && Xm !== null,
			Ym !== null && Xm !== null,
			Ym !== null &&    true    ,
			Ym !== null && Xp !== null,
			    true    && Xp !== null,
			Yp !== null && Xp !== null
		];

		var II = [
			Yp + X, 
			Yp + Xm,
			Y  + Xm,
			Ym + Xm,
			Ym + X, 
			Ym + Xp,
			Y  + Xp,
			Yp + Xp
		];
		var ii = [
			{ x: x  , y: y+1}, 
			{ x: x-1, y: y+1}, 
			{ x: x-1, y: y  }, 
			{ x: x-1, y: y-1}, 
			{ x: x  , y: y-1}, 
			{ x: x+1, y: y-1}, 
			{ x: x+1, y: y  }, 
			{ x: x+1, y: y+1} 
		];

		// make next move
		var splicedV = null;
		var danglingV = null;
		p = null;

		var index = lastStep - 4;
		if (index < 0) index = 8+index;

		for (var n=0; n<8; n++, index = (index+1)%8) 
		{
			if (v[index] && testContour(II[index], contourMap)) 
			{
				var nextPixel = ii[index];
				p = { x: nextPixel.x, y: nextPixel.y, v: splicedV };
				lastStep = index;

				break;
			}
		}

		if (p !== null)
		{

			// deal with any dangling edges
			if (danglingV) 
			{
				curActiveList.push({
					x: x, 
					y: y,
					vertices: danglingV
				});
			}
		}
		else
		{
			// add contour to list of contours
			if (curContour.length > 2) {
				contours.push( curContour );
			}
			curContour = [];
			lastV = null;
		}

		function testContour(I, contourMap) 
		{
			var vertices = contourMap[I];
			if (vertices)
			{
				// test all vertices
				var connected = false;
				var dangling = [];

				if (vertices.length == 2)
				{
					splicedV = [vertices[1]];
					vertices.splice(0, 2);
					return true;
				}
				else
				{
					console.log(" *** testContour: not sure what to do here!");
					for (var i=0, len=vertices.length; i<len; i += 2) 
					{
						var v1 = vertices[i];
						var v2 = vertices[i+1];

						// test to see if we have a connection with the current contour
						if (true || (!connected && v1.x == lastV.x && v1.y == lastV.y)) 
						{
							vertices.splice(i, 2);
							splicedV = [v2];
							connected = true;
						}
						else if (!connected && v2.x == lastV.x && v2.y == lastV.y)
						{
							vertices.splice(i, 2);
							splicedV = [v1];
							connected = true;
						}
						else
						{
							dangling.push(v1); dangling.push(v2);
						}
					}

					if (connected) 
					{
						//danglingV = dangling.length > 0 ? dangling : null;
						return true;
					}
					else 
					{
						return false;
					}
				}
			}
			else
			{
				return false;
			}
		}
	}

	if (curContour.length > 1) {
		contours.push( curContour );
	}

	return contours;
}

function detectMaskEdge(mask, pBB)
{
	var maskW = pBB.right - pBB.left + 1;
	var maskH = pBB.bottom - pBB.top + 1;
	var w0 = pBB.left;
	var h0 = pBB.top;

	// contour data
	var contourVertices = [];
	var contourMap = {};
	var lowestRight = null;		// lowest, right-most point in the contour
	var prevContourState = null;

	for (var y=0; y < maskH; y++)
	{
		var inContour = false;
		var rowOffset = y * maskW;
		var contourState = [];

		for (var x=0; x < maskW; x++)
		{
			contourState.push(inContour);
			var m = mask[rowOffset + x];
			var p = null;
			if (m>0 && !inContour) 
			{
				p = { x: x + w0, y: y + h0 };
				inContour = !inContour;
			}
			else if (m<0 && inContour) 
			{
				p = { x: x + w0, y: y + h0 };
				inContour = !inContour;	
			}
			else if (m>0 && inContour && (y == 0 || mask[ (y-1)*maskW + x]<1))
			{
				p = {
					x: x + w0, y: y + h0
				};				
			}

			if (y>0 && prevContourState[x] && !inContour) {
				p = {
					x: x + w0, y: y + h0
				};					
			}
			
			
			else if (m<0 && !inContour && (y > 0 && mask[ (y-1)*maskW + x]<1))
			{
				p = {
					x: x + w0, y: y + h0
				};					
			}
			

			if (p !== null)
			{
				contourVertices.push(p);
				if (lowestRight === null ) {
					lowestRight = p;
				}
				else if (lowestRight.x > p.x) {
					lowestRight = p;
				}
				else if (lowestRight.x == p.x && lowestRight.y < p.y)
				{
					lowestRight = p;
				}
			}

		}
		prevContourState = contourState;

		// make sure right edges are connected to their top
		/*
		if (y > 0) {
			for (var i=0, E=rightEdges.length; i<E; i++)
			{
				var p = rightEdges[i];
				for (var x=p.x+1; x < maskW; x++) {
					if (mask[(y-1) * maskW + x]<1) {

					}
				}
			}
		}
		*/

	}

	// draw contour
	/*
	if (svg) {
		svg.selectAll("rect.contour").data(contourVertices).enter().append("rect")
			.attr("x", function(d) { return d.x / resolution; })
			.attr("y", function(d) { return d.y / resolution; })
			.style("fill", "red")
			.attr("width", 1/resolution)
			.attr("height", 1/resolution)
	}
	*/
	console.log("Edge detect: v: " + contourVertices.length + ", lowestRight: " + lowestRight.x + ", " + lowestRight.y);
	return { contourVertices: contourVertices, lowestRight: lowestRight };
}

function traceContour(start, contourVertices, pBB, engulfTest)
{
	var w_0 = pBB.left;
	var h_0 = pBB.top;
	var w_1 = pBB.right;
	var h_1 = pBB.bottom;

	// convert list of vertices to a map
	var contourMap = {};
	for (var i=0, N=contourVertices.length; i<N; i++) 
	{
		v = contourVertices[i];
		contourMap[ v.x + (v.y << 16) ] = true;
	}

	// area (bounding box) contour has engulfed so far
	var contourEngulf = {
		left:    Number.MAX_VALUE,
		right:  -Number.MAX_VALUE,
		top:     Number.MAX_VALUE,
		bottom: -Number.MAX_VALUE 
	};

	// contour map to build	
	var contour = [];
	var backtrack = [];

	// set starting coordinate
	var p = start;
	var consumed = 0;
	var backtracked = 0;

	while ((p !== null || backtrack.length > 0))
	{
		var visited = false;
		if (p === null) 
		{
			if (backtrack.length > 0) 
			{
				p = backtrack.pop();
				contour.pop();
				visited = true;
				backtracked++;
			}
			else {
				// nothing to backtrack to
				break;	
			}
		}
		var x = p.x, y = p.y;
		var X = x, Y = y << 16;
		var I = X+Y;

		if (!visited) {
			contour.push(p);
			contourEngulf.left   = Math.min(contourEngulf.left  , p.x);
			contourEngulf.right  = Math.max(contourEngulf.right , p.x);
			contourEngulf.top    = Math.min(contourEngulf.top   , p.y);
			contourEngulf.bottom = Math.max(contourEngulf.bottom, p.y);		
		}

		if (contourMap[I]) 
		{
			backtrack.push(p);
			contourMap[I] = false;
			consumed++;
		}

		// termination test
		if (p != start && Math.abs(start.x-p.x) <= 2 && Math.abs(start.y-p.y) <= 2) {
			if (
				contourEngulf.left   <= engulfTest.left  &&
				contourEngulf.right  >= engulfTest.right &&
				contourEngulf.top    <= engulfTest.top   &&
				contourEngulf.bottom >= engulfTest.bottom
			) {
				break;
			}
		}

		var Xm = x > w_0 ?  x-1 		: null;
		var Xp = x < w_1 ?  x+1 		: null;
		var Ym = y > h_0 ? (y-1) << 16 	: null;
		var Yp = y < h_1 ? (y+1) << 16 	: null;
		
		// legal moves
		var v = [
			Yp !== null &&    true    ,
			Yp !== null && Xm !== null,
			    true    && Xm !== null,
			Ym !== null && Xm !== null,
			Ym !== null &&    true    ,
			Ym !== null && Xp !== null,
			    true    && Xp !== null,
			Yp !== null && Xp !== null
		];


		// make next move
		if      (v[0] && contourMap[Yp + X ]) p = { x: x  , y: y+1 };
		else if (v[1] && contourMap[Yp + Xm]) p = { x: x-1, y: y+1 };
		else if (v[2] && contourMap[Y  + Xm]) p = { x: x-1, y: y   };
		else if (v[3] && contourMap[Ym + Xm]) p = { x: x-1, y: y-1 };
		else if (v[4] && contourMap[Ym + X ]) p = { x: x  , y: y-1 };
		else if (v[5] && contourMap[Ym + Xp]) p = { x: x+1, y: y-1 };
		else if (v[6] && contourMap[Y  + Xp]) p = { x: x+1, y: y   };
		else if (v[7] && contourMap[Yp + Xp]) p = { x: x+1, y: y+1 };
		else {
			console.log("trace route p=null");
			p = null;
		}

	}
	console.log("consumed: " + consumed + " / " + contourVertices.length);
	console.log("backtracked: " + backtracked);

	return contour;
}

BubbleSets.prototype.visualizeEnergyField = function(canvas, scale, _colorScale)
{
	var ENERGY_COLOR_SCALE = _colorScale || ['#fef0d9','#fdd49e','#fdbb84','#fc8d59','#ef6548','#d7301f','#990000'];

	// determine min/max (only consider positive numbers)
	var w = this.w;
	var h = this.h;
	var minmax = [Number.MAX_VALUE, -Number.MAX_VALUE];
	var energy = this.energy;
	if (!scale) {
		scale = 1 / this.resolution;
	}

	for (var i=0, index=0; i < h; i++) {
		for (var j=0; j < w; j++, index++) {
			e = energy[index];
			if (e > 0) {
				minmax[0] = Math.min(e, minmax[0]);
				minmax[1] = Math.max(e, minmax[1]);
			}	
		}
	}

	var ctx = canvas.getContext("2d");
	var colorScale = d3.scale.quantize().domain([minmax[0],minmax[1]]).range(ENERGY_COLOR_SCALE);
	
	for (var i=0, index=0, y=0; i < h; i++, y += scale) 
	{
		for (var j=0, x=0; j < w; j++, index++, x += scale) 
		{
			e = energy[index];
			if (e > 0) {
				ctx.fillStyle = colorScale(e);
				ctx.fillRect(x, y, scale, scale);
			}	
		}
	}

	return minmax;
}

BubbleSets.prototype.visualizeContourEdge = function(canvas, contour, _scale)
{
	var scale = _scale || 1.0 / this.resolution;
	var ctx = canvas.getContext("2d");
	ctx.fillStyle = "#000000";

	for (var i=0, N=contour.length; i<N; i++) 
	{
		var p = contour[i];
		ctx.fillRect(p.x*scale, p.y*scale, scale, scale);
	}	
}

// Helper geometric functions
// ---------------------------
function pointInCircle(point, circle, radiusSq)
{
	var d = Math.pow(point.x-circle.x, 2) + Math.pow(point.y-circle.y, 2);
	return radiusSq !== undefined ? d < radiusSq : Math.sqrt(d) < circle.r;
}

function BoxBoxIntersect(box1, box2)
{
	return !(
		box1.left > box2.right ||
		box2.left > box1.right ||
		box1.top  > box2.bottom ||
		box2.top  > box1.bottom
	);
}

function BoxCircleIntersect(box, circle, radiusSq)
{
	// clamp(value, min, max) - limits value to the range min..max
	function clamp(x, a, b)
	{
		if (x < a) {
			return a;
		}
		else if (x > b) {
			return b;
		}
		else {
			return x;
		}
	}
	// Find the closest point to the circle within the rectangle
	var closestX = clamp(circle.x, box.left, box.right);
	var closestY = clamp(circle.y, box.top, box.bottom);

	// Calculate the distance between the circle's center and this closest point
	var distanceX = circle.x - closestX;
	var distanceY = circle.y - closestY;

	// If the distance is less than the circle's radius, an intersection occurs
	var distanceSquared = Math.pow(distanceX, 2) + Math.pow(distanceY, 2);
	return distanceSquared < (radiusSq || (circle.r * circle.r));	
}

function circleLineSegmentIntersect(a, b, circle, radius, radiusSq)
{
	var ret = findIntersections(a, b, circle, radius, radiusSq);

	if (ret.intersects == 0)
	{
		return ret;
	}
	else
	{
		// do further tests to determine if we're within
		// the bounds of the line segment
		var xExtent = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
		var yExtent = [Math.min(a.y, b.y), Math.max(a.y, b.y)];

		if (ret.intersects == 1) {
			if (
				inRange(xExtent[0], xExtent[1], ret.pointOnLine.x) &&
				inRange(yExtent[0], yExtent[1], ret.pointOnLine.y)
			)
			{
				// don't change
			}
			else
			{
				// no more intersections
				ret.intersects = 0;
			}
			return ret;

		}
		else // (ret.intersects == 2)
		{
			var p1 = ret.points[0];
			var p2 = ret.points[1];

			var p1In =
				inRange(xExtent[0], xExtent[1], p1.x) &&
				inRange(yExtent[0], yExtent[1], p1.y);
			var p2In =
				inRange(xExtent[0], xExtent[1], p2.x) &&
				inRange(yExtent[0], yExtent[1], p2.y);

			if (p1In&&p2In) 
			{
				// don't change
			}
			else if (p1In && !p2In) 
			{
				var eInRange = 	
					inRange(xExtent[0], xExtent[1], ret.pointOnLine.x) &&
					inRange(yExtent[0], yExtent[1], ret.pointOnLine.y)

				if (!eInRange) {
					ret.distanceToLine = correctDistanceToLine(a, b, circle);
				}
				ret.points.splice(1, 1);

			}
			else if (!p1In && p2In) {

				var eInRange = 	
					inRange(xExtent[0], xExtent[1], ret.pointOnLine.x) &&
					inRange(yExtent[0], yExtent[1], ret.pointOnLine.y)

				if (!eInRange) {
					ret.distanceToLine = correctDistanceToLine(a, b, circle);
				}
				ret.points.splice(0, 1);
			}
			else
			{
				var eInRange = 	
					inRange(xExtent[0], xExtent[1], ret.pointOnLine.x) &&
					inRange(yExtent[0], yExtent[1], ret.pointOnLine.y)
				if (eInRange) {
					ret.points = [];
				}
				else
				{
					ret.intersects = 0;
				}
			}
			return ret;
		}
	}

	function correctDistanceToLine(a, b, c)
	{
		var CA = Math.pow(c.x-a.x, 2) + Math.pow(c.y-a.y, 2);
		var CB = Math.pow(c.x-b.x, 2) + Math.pow(c.y-b.y, 2);
		return Math.sqrt(Math.min(CA, CB));
	}

	function inRange(a, b, x) {
		return x >= a && x <= b;
	}

	// circle-line segment intersection code from: http://bl.ocks.org/milkbread/11000965
	function findIntersections(a, b, c, _r, _rSq) 
	{
		// square of circle radius
		var r = _r || c.r;
		var rSq = _rSq || Math.pow(r, 2);

		// Calculate the euclidean distance between a & b
		var eDistAtoB = Math.sqrt( Math.pow(b.x-a.x, 2) + Math.pow(b.y-a.y, 2) );

		// compute the direction vector d from a to b
		var d = {
			x: (b.x-a.x) / eDistAtoB, 
			y: (b.y-a.y) / eDistAtoB 
		};

		// Now the line equation is x = dx*t + ax, y = dy*t + ay with 0 <= t <= 1.

		// compute the value t of the closest point to the circle center (cx, cy)
		var t = (d.x * (c.x-a.x)) + (d.y * (c.y-a.y));

		// compute the coordinates of the point e on line and closest to c
	    var e = {
			x: (t * d.x) + a.x,
			y: (t * d.y) + a.y
		};

		// Calculate the euclidean distance between c & e
		var eDistCtoESq = Math.pow(e.x-c.x, 2) + Math.pow(e.y-c.y, 2);
		var eDistCtoE = Math.sqrt( eDistCtoESq );

		// test if the line intersects the circle
		if( eDistCtoE < r )
		{
			// compute distance from t to circle intersection point
			var dt = Math.sqrt( rSq - eDistCtoESq );
			
			// compute first intersection point
			var f = {
				x: ((t-dt) * d.x) + a.x,
				y: ((t-dt) * d.y) + a.y
			};
			
			// compute second intersection point
			var g = {
				x: ((t+dt) * d.x) + a.x,
				y: ((t+dt) * d.y) + a.y
			};
			
			return {
				intersects: 2, 
				pointOnLine: e,
				distanceToLine: eDistCtoE,
				points: [f, g]
			};

		} 
		else if ( Math.floor(eDistCtoE) == Math.floor(r) ) 
		{
			// console.log("Only one intersection");
			return {
				intersects: 1,
				pointOnLine: e,
				distanceToLine: eDistCtoE,
				points: null
			};
		} else 
		{
			// console.log("No intersection");
			return {
				intersects: 0, 
				distanceToLine: eDistCtoE,
				pointOnLine: e,
				points: null
			};
		}
	}
}

// Union-Find data struct
// Minimum spanning tree
// -----------------------

function UnionFind()
{
	this.sets = {};
}

UnionFind.prototype.MakeSet = function(name)
{
	var s = {
		rank: 0,
		name: name
	};
	
	// in its own set now
	s.parent = s;
	this.sets[name] = s;
	return s;
}

UnionFind.prototype.lookup = function(name) {
	return this.sets[name];
}

UnionFind.prototype.Find = function(x)
{
	if (x.parent != x) {
		x.parent = this.Find(x.parent);
	}
	return x.parent;
}

UnionFind.prototype.Union = function(x, y)
{
	var xRoot = this.Find(x);
	var yRoot = this.Find(y);
	if (xRoot == yRoot) {
		return;
	}
	else
	{
		if (xRoot.rank < yRoot.rank) {
			xRoot.parent = yRoot;
		}
		else if (xRoot.rank > yRoot.rank) {
			yRoot.parent = xRoot;
		}
		else
		{
			yRoot.parent = xRoot;
			xRoot.rank++;
		}
	}
}

// Kruska's minimum spanning tree
// assumes a fully-connected graph
function KruskalMST(vertices, getWeight)
{
	var MST = [];
	var edges = [];
	var sets = new UnionFind();

	// initialize all sets
	for (var i=0, N=vertices.length; i<N; i++)
	{
		sets.MakeSet(vertices[i]);
	}

	// initialize all edges
	for (var i=1, N=vertices.length; i<N; i++) 
	{
		var u = vertices[i];
		for (var j=0; j<i; j++) 
		{
			var v = vertices[j];
			edges.push({
				u: u,
				v: v,
				w: getWeight(u, v)
			});
		}
	}

	// sort edges by weight
	edges.sort(function(a, b) { return a.w-b.w; });

	// loop through all edges
	for (var e=0, E=edges.length; e < E; e++)
	{
		var edge = edges[e];
		var sU = sets.lookup(edge.u);
		var sV = sets.lookup(edge.v);

		if (sets.Find(sU) != sets.Find(sV)) 
		{
			sets.Union(sU, sV)
			MST.push(edge)
		}
	}
	return MST;
}

function normalize2(v)
{
	var l = Math.pow(v.x, 2) + Math.pow(v.y, 2);
	if (l > 0) 
	{
		l = 1 / Math.sqrt(l);
		v.x *= l;
		v.y *= l;
	}
	return v;
}

// extend Array with an extent() function; essentially an in-place concat()
Array.prototype.extend = function(other_array) {
	/* you should include a test to check whether other_array really is an array */
	other_array.forEach(function(v) {this.push(v)}, this);    
}

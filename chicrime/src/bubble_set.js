/* ===================================
 * Bubble Sets
 * A crude implementation
 * ===================================
 */


var R0 = 10;
var R1 = 25;
var MAX_REROUTE_ITERATIONS = 15;
var MAX_REROUTES = 100;

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
		if (members.length == 0) {
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
	// it might have changed if new joint nodes were added
	this.calcBoundingBox( set );

	// calculate energy
	this.calcEnergy( set, vEdges );

	return vEdges;
}

BubbleSets.prototype.computeAll = function()
{
	for (var i=0, N=this.sets.length; i<N; i++) 
	{
		this.computeBubbleSet(this.sets[i]);
	}	
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
	var overlapThreshold = Math.pow(this.R0, 2);

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
							// make sure the proposed obstacle have no overlap with any
							// of out members, otherwise there wouldn't be a solution
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
							// safe to add
							set.obstacles.push({
								x: circle.x,
								y: circle.y,
								m: circle.m,
								overlapping: !safe	// mark obstacles overlapping with set members
													// so that we can ignore them in edge intersection
													// but still use them in energy field calculation
							});
						}
					}
				}
			}
		}
	}
}

BubbleSets.prototype.visualizeEnergyField = function(canvas, scale)
{
	var ENERGY_COLOR_SCALE = ['#fef0d9','#fdd49e','#fdbb84','#fc8d59','#ef6548','#d7301f','#990000'];

	// determine min/max (only consider positive numbers)
	var w = this.w;
	var h = this.h;
	var minmax = [Number.MAX_VALUE, -Number.MAX_VALUE];
	var energy = this.energy;
	if (!scale) {
		scale = 1;
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

BubbleSets.prototype.findConnectivityStep = function(set, lastStep)
{
	// get list of members and obstacles
	var R1 = this.R1;
	var R0 = this.R0;
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
			var collision = circleLineSegmentIntersect(u, v, obstacle, R0);
			if (collision.intersects == 2 && collision.points && collision.points.length == 2 && reRouteCount < MAX_REROUTES) 
			{
				var newEdges = this.reRoute(set, edge, obstacle, collision);
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


BubbleSets.prototype.findConnectivity = function(set)
{
	// get list of members and obstacles
	var R1 = this.R1;
	var R0 = this.R0;
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
			if (obstacle.overlapping) {
				// ignore this obstacle
				continue;
			}

			// test edge againt obstacle
			var intersection = circleLineSegmentIntersect(u, v, obstacle, R0);
			var collisionTest = 
				intersection.intersects == 2 &&
				intersection.points && 
				(intersection.points.length == 2 || intersection.points.length == 0);

			if (collisionTest) 
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
	var PUSH_OUT_0 = this.R0 * 1.6;
	var PUSH_OUT = PUSH_OUT_0;


	// start with a vector going from the center
	// of the obstacle to the point that's perpendicular to the edge
	var v = { 
		x: collision.pointOnLine.x - obstacle.x, 
		y: collision.pointOnLine.y - obstacle.y 
	};

	// if zero-vector, randomize
	if (v.x == 0 && v.y == 0) 
	{
		randomVector = true;
		v = {x: Math.random(), y: Math.random()};
	}
	normalize2(v);

	var iteration = 0;
	while (iteration++ < MAX_REROUTE_ITERATIONS)
	{
		var joint = {
			x: obstacle.x + PUSH_OUT * v.x,
			y: obstacle.y + PUSH_OUT * v.y
		};

		// test joint against all other obstacles
		var bad = false;
		for (var i=0, O=set.obstacles.length; i<O; i++) {
			if (pointInCircle(joint, set.obstacles[i], this.R0Sq)) 
			{
				bad = true;
				break;
			}
		}

		if (bad) 
		{
			if (iteration % 4 == 0) 
			{
				// flip vector and rotate by 30 degrres
				v.x *= -1;
				v.y *= -1;
			}
			else if (iteration % 4 == 1)
			{
				// increase pushout
				PUSH_OUT *= 1.4;
			}
			else if (iteration % 4 == 2)
			{
				// increase pushout
				v.x *= -1;
				v.y *= -1;
			}
			else if (iteration % 4 == 3)
			{
				var vRotated = {
					x: v.x * COS_THETA - v.y * SIN_THETA,
					y: v.x * SIN_THETA + v.y * COS_THETA
				};
				v = vRotated;
			}
		
		}
		else
		{
			// add two new edges
			joint.m = set.members.length;
			joint.joint = true;
			set.members.push(joint);

			// add two new edges
			return [
				{
					u: edge.u,
					v: joint.m
				},
				{
					u: joint.m,
					v: edge.v
				}
			];
		}
	}

	// faiure to re-route
	return null;
}

BubbleSets.prototype.calcEnergy = function(set, vEdges)
{
	// clear energy buffer
	this.clearEnergyBuffer();

	// calculate pixel-based active area
	var R1 = this.R1;
	var R1Sq = this.R1Sq;
	var R1R0Sq = this.R1R0Sq;

	var r = this.resolution;
	var iR = 1/r;

	var w = this.w;
	var h = this.h;
	var bb = set.boundingBox;
	var pBB = {
		left: Math.max(0, Math.floor(bb.left*r)),
		right: Math.min(w-1, Math.ceil(bb.right*r)),
		top: Math.max(0, Math.floor(bb.top*r)),
		bottom: Math.min(h-1, Math.floor(bb.bottom*r))
	};

	var setMembers = set.members;
	var setObstacles = set.obstacles;
	var M = setMembers.length;

	// loop through all pixels
	for (var row=pBB.top; row <= pBB.bottom; row++)
	{
		var pY = row * iR;
		var rowOffset = row * w;
		var hitMap = {};

		for (var col=pBB.left; col <= pBB.right; col++)
		{
			var pX = col * iR;
			var E = 0;

			// accumilate contribution from set members
			for (var i=0; i<M; i++) 
			{
				var member = setMembers[i];
				if (member.joint)
				{
					// this is just a joint, skip
					continue;
				}

				var d = Math.pow(pX-member.x, 2) + Math.pow(pY-member.y, 2);
				if (d < R1Sq) {

					// evaluate energy field
					d = Math.sqrt(d);
					E += Math.pow(R1-d, 2) / R1R0Sq;
					hitMap[ member ] = d;
				}
			}

			// accumilate contribution from the closest virtual edge to this pixel
			var minEdge = null, minD = null;
			for (var i=0, N=vEdges.length; i<N; i++) 
			{
				var edge = vEdges[i];

				// see how far this edge is from the pixel
				var collision = circleLineSegmentIntersect(edge.u, edge.v, {x: pX, y: pY}, R1);
				if (collision.intersects > 0 && (minD === null || (minD > collision.distanceToLine))) 
				{
					minD = collision.distanceToLine;
					minEdge = edge;
				}
				else if (collision.intersects == 0) {
					// test the nodes themselves as hiy for edges
					var uHit = hitMap[edge.u];
					var vHit = hitMap[edge.u];
					if (uHit && uHit < minD) {
						minD = uHit;
						minEdge = edge;
					}
					if (vHit && vHit < minD) {
						minD = vHit;
						minEdge = edge;
					}
				}

			}
			if (minEdge) 
			{
				E += Math.pow(R1 - minD, 2) / R1R0Sq;
			}

			if (E > 0) 
			{
				// accumilate negative contribution from obstacles
				for (var i=0, N=setObstacles.length; i<N; i++) {
					var obstacle = setObstacles[i];
					var d = Math.pow(pX-obstacle.x, 2) + Math.pow(pY-obstacle.y, 2);
					if (d < R1Sq) {
						E += -0.8 * Math.pow(R1-Math.sqrt(d), 2) / R1R0Sq;
					}
				}
			}

			if (E > 0) 
			{
				this.energy[rowOffset + col] = Math.floor(100 * E + .5);
			}
		}
	}
}

BubbleSets.prototype.clearEnergyBuffer = function()
{
	// clear the buffer
	for (var i=0, N=this.w * this.h; i < N; i++) {
		this.energy[i] = 0;
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
	/*
	var xIntersect = 
		(box1.left >= box2.left && box1.left <= box2.right) ||
		(box1.right >= box2.left && box1.right <= box2.right);
	
	var yIntersect = 
		(box1.top >= box2.top && box1.top <= box2.bottom) ||
		(box1.bottom >= box2.top && box1.bottom <= box2.bottom);

	return xIntersect && yIntersect;
	*/
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

function circleLineSegmentIntersect(a, b, circle, radius)
{
	var ret = findIntersections([a.x, a.y], [b.x, b.y], [circle.x, circle.y, radius || circle.r]);

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
	function findIntersections(a, b, c) 
	{
		// Calculate the euclidean distance between a & b
		eDistAtoB = Math.sqrt( Math.pow(b[0]-a[0], 2) + Math.pow(b[1]-a[1], 2) );

		// compute the direction vector d from a to b
		d = [ (b[0]-a[0])/eDistAtoB, (b[1]-a[1])/eDistAtoB ];

		// Now the line equation is x = dx*t + ax, y = dy*t + ay with 0 <= t <= 1.

		// compute the value t of the closest point to the circle center (cx, cy)
		t = (d[0] * (c[0]-a[0])) + (d[1] * (c[1]-a[1]));

		// compute the coordinates of the point e on line and closest to c
	    var e = {
			x: (t * d[0]) + a[0],
			y: (t * d[1]) + a[1]
		};

		// Calculate the euclidean distance between c & e
		eDistCtoE = Math.sqrt( Math.pow(e.x-c[0], 2) + Math.pow(e.y-c[1], 2) );

		// test if the line intersects the circle
		if( eDistCtoE < c[2] )
		{
			// compute distance from t to circle intersection point
			dt = Math.sqrt( Math.pow(c[2], 2) - Math.pow(eDistCtoE, 2));
			// compute first intersection point
			var f = {
				x: ((t-dt) * d[0]) + a[0],
				y: ((t-dt) * d[1]) + a[1]
			}
			
			// check if f lies on the line
			//f.onLine = is_on(a,b,f.coords);

			// compute second intersection point
			var g = {
				x: ((t+dt) * d[0]) + a[0],
				y: ((t+dt) * d[1]) + a[1]
			}
			
			// check if g lies on the line
			//g.onLine = is_on(a,b,g.coords);

			return {
				intersects: 2, 
				pointOnLine: e,
				distanceToLine: eDistCtoE,
				points: [f, g]
			};

		} else if (parseInt(eDistCtoE) === parseInt(c[2])) {
			// console.log("Only one intersection");
			return {
				intersects: 1, 
				distanceToLine: eDistCtoE,
				pointOnLine: e,
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

	// BASIC GEOMETRIC functions
	function distance(a,b) {
		return Math.sqrt( Math.pow(a[0]-b[0], 2) + Math.pow(a[1]-b[1], 2) )
	}
	function is_on(a, b, c) {
		return distance(a,c) + distance(c,b) == distance(a,b);
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
	if (x.parent == x) {
		return x;
	}
	else {
		return this.Find(x.parent);
	}
}

UnionFind.prototype.Union = function(x, y)
{
	var xRoot = this.Find(x);
	var yRoot = this.Find(y);
	xRoot.parent = yRoot;
}

/* optimized versions */
UnionFind.prototype.FindOptimized = function(x)
{
	if (x.parent != x) {
		x.parent = this.FindOptimized(x.parent);
	}
	return x.parent;
}

UnionFind.prototype.UnionOptimized = function(x, y)
{
	var xRoot = this.FindOptimized(x);
	var yRoot = this.FindOptimized(y);
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
// assumes a fully graph
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

		if (sets.FindOptimized(sU) != sets.FindOptimized(sV)) 
		{
			sets.UnionOptimized(sU, sV)
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

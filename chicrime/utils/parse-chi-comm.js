#!/usr/bin/env node
var fs = require('fs');

// determine which of the arguments is a file name
var communityFile = null;
var communityPath = null;
var parsedCommunities = [];

process.argv.forEach( function(val, index, array) {

	if (index > 1) {
		var filename = val;
		var stats = fs.statSync(filename);
		if (stats.isFile() && !communityFile) {
			communityFile = filename;
		}
	}
});

if (!communityFile) {
	console.error("Please pass in a community filename in the arguments.");
	process.exit(1)
}
else
{
	// figure out the path name component of the file
	var slashIndex = communityFile.lastIndexOf('/');
	if (slashIndex == -1) slashIndex = communityFile.lastIndexOf('\\');
	if (slashIndex == -1)
		communityPath = './';
	else
		communityPath = communityFile.substr(0, slashIndex) + '/';

	// we have our community filename, read it.
	var data = fs.readFileSync(communityFile, 'utf8');
	var communities = data.split("\n");

	// list of all parsed communities
	var communityCount = communities.length;
	var readCommunityCount = 0;

	for (var i = 0; i < communities.length; i++) 
	{

		var tokens = communities[i].trim().split(",");
		
		if (tokens.length != 2) {
			console.error("Ignoring: " + communities[i]);
			communityCount--;
		}
		else
		{
			var _communityNum  = tokens[0].trim();
			var _communityName = tokens[1].trim();
			var _filename = communityPath + _communityNum;

			(function(filename, communityNum, communityName) {
				// load the file for the community
				fs.readFile(filename, 'utf8', function(err, data) 
				{
					if (err) {
						console.error("Error openining: " + filename);
						console.error(err);
						process.exit(1);
					}
					else
					{			
						// store vectors in 'coordinates'
						var coordinates = [];

						// read all points
						var allPoints = data.split("\n");
						for (var j = 0, len = allPoints.length; j < len; j++) 
						{
							var str = allPoints[j].trim();
							if (str.length > 0) 
							{
								var vector = str.split(',');
								coordinates.push( [+vector[0].trim(), +vector[1].trim()] );
							}

						}

						// parsed all points
						parsedCommunities.push({
							id: communityNum,
							name: communityName,
							coordinates: coordinates
						});
						console.log("\tread complete: " + filename + ", file processed: " + readCommunityCount);
						readCommunityCount++;
						if (readCommunityCount == communityCount) {
							readFinished();
						}
					}
				});
			})(_filename, _communityNum, _communityName);
		}

	}
}

function readFinished()
{
	// write file to GeoJSON
	var outputFile = communityPath + 'chi-communities.json';
	var writer = fs.createWriteStream( outputFile, { flags: 'w', defaultEncoding: 'utf8' });

	// write GeoJSON header
	writer.write("{ \n\
\t\"type\": \"FeatureCollection\", \n\
\t\"features\": [\n");

	// print all communities
	for (var c = 0, len = parsedCommunities.length; c < len; c++) 
	{
		var comm = parsedCommunities[c];
		writer.write("\t\t{ \n\
\t\t\t\"type\": \"Feature\", \n\
\t\t\t\"properties\": { \"community\": \"" + comm.name + "\", \"number\": " + comm.id + " }, \n\
\t\t\t\"geometry\": { \"type\": \"Polygon\", \"coordinates\": [[");

		for (var i = 0, len2 = comm.coordinates.length; i < len2; i++) 
		{
			var p = comm.coordinates[i];
			writer.write('[' + p[0] + "," + p[1] + ']' + ((i < len2-1) ? ',' : ''));
		}
		writer.write(']] }\n\t\t}' + ((c < len-1) ? ',' : '') + '\n');
	}
	writer.write("\t]\n}");
		// close the stream
	writer.end();
}




						
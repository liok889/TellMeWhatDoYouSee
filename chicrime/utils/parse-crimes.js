var fs = require('fs');
var es = require('event-stream');
var JSONStream = require('JSONStream');
var assert = require('assert');
var MongoClient = require('mongodb').MongoClient;

// open json crimes.json
var readStream = fs.createReadStream('./crimes.json');

// create a buffer
var crimeBuffer = [];
var totalRead = 0;
var totalWritten = 0;
var noMoreData = false;
var inWrite = false;

readStream.on('open', function(err) {
	
	// open connection to mongoDB
	var url = 'mongodb://localhost/TellMeWhatDoYouSee';
	MongoClient.connect(url, function(err, db) 
	{
		// make sure there are no probelems connecting to database
		assert.equal(null, err);

		// get crime collections
		var crimeCollection = db.collection('crimes');

		//if (err) throw err;
		readStream.pipe(JSONStream.parse('data.*')).pipe( es.mapSync(function(data) 
		{ 

			var d = {
				serial: totalRead,
				timestamp: new Date(data[10]),
				block: data[11],
				crimeCode: data[12],
				crimeType: data[13],
				crimeDescription: data[14],
				crimeLocation: data[15],
				arrest: data[16],
				domestic: data[17],
				beat: +data[18],
				district: +data[19],
				ward: + data[20],
				community: +data[21],
				lat: +data[27],
				lon: +data[28]
			}

			// add record to buffer
			crimeBuffer.push( d );
			totalRead++;

			// see if it's time to flush the buffer and write to mongoDB
			if (crimeBuffer.length >= 5000 && !inWrite) 
			{				
				var crimesToInsert = crimeBuffer;
				crimeBuffer = [];
				inWrite = true;
					
				// insert into database
				var writeTime = Date.now();
				crimeCollection.insertMany( crimesToInsert, function (err, result) 
				{
					assert.equal(err, null);
					totalWritten += result.result.n;

					var timeInMS = Date.now();
					var diff = timeInMS - writeTime;
					if (diff >= 2) 
					{
						var writePerSecond = 1000 * result.result.n / diff;
						console.error("Written: " + totalWritten + " records -->\t\t" + writePerSecond.toFixed(1) + " write per sec.");
					}
					inWrite = false;

					// see if we're done
					if (noMoreData && totalWritten == totalRead) {
						db.close();
					}

				});					
			}
		}) );

	});
});

readStream.on('end', function() {
	noMoreData = true;
});


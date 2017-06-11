var MongoClient = require('mongodb').MongoClient
, assert = require('assert');

// Connection URL 
var url = 'mongodb://localhost:27017/bitflyer';

var insertExecutions = function(db, executions, callback) {
	var collection = db.collection('lightning_executions_FX_BTC_JPY');
	collection.insertMany(executions, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

var removeAllExecutions = function(db, callback) {
	db.collection('lightning_executions_FX_BTC_JPY').deleteMany( {}, function(err, results) {
		callback();
	});
}

var subscribePubNub = function() {

	var PubNub = require('pubnub');

	var pubnub = new PubNub({
		subscribeKey: "sub-c-52a9ab50-291b-11e5-baaa-0619f8945a4f",
		ssl: true
	});

	console.log("Subscribe PubNub channel 'lightning_executions_FX_BTC_JPY'");

	pubnub.addListener({
		message: function(m) {
			// handle message
			var channelName = m.channel; // The channel for which the message belongs
			var channelGroup = m.subscription; // The channel group or wildcard subscription match (if exists)
			var pubTT = m.timetoken; // Publish timetoken
			var msg = m.message; // The Payload

			// Use connect method to connect to the Server 
			MongoClient.connect(url, function(err, db) {
				assert.equal(null, err);
				insertExecutions(db, msg, function(result) {
					db.close();
				});
			});
		},
		presence: function(p) {
			// handle presence
			var action = p.action; // Can be join, leave, state-change or timeout
			var channelName = p.channel; // The channel for which the message belongs
			var occupancy = p.occupancy; // No. of users connected with the channel
			var state = p.state; // User State
			var channelGroup = p.subscription; //  The channel group or wildcard subscription match (if exists)
			var publishTime = p.timestamp; // Publish timetoken
			var timetoken = p.timetoken;  // Current timetoken
			var uuid = p.uuid; // UUIDs of users who are connected with the channel
		},
		status: function(s) {
			// handle status
		}
	})

	pubnub.subscribe({
		channels: ['lightning_executions_FX_BTC_JPY'],
		withPresence: true // also subscribe to presence instances.
	})
}

MongoClient.connect(url, function(err, db) {
	assert.equal(null, err);
	removeAllExecutions(db, function () {
		console.log("Remove all executions from db.");
		subscribePubNub();
	});
});

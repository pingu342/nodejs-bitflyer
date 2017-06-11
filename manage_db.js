// 
// DBの管理
//
var MongoClient = require('mongodb').MongoClient
, assert = require('assert');

if (process.argv[2] === 'FX_BTC_JPY') {
	; // valid
} else if (process.argv[2] === 'BTC_JPY') {
	; // valid
} else {
	console.log('product code error.');
	return; // invalid
}

if (process.argv[3] === 'dropAll') {
	; // valid
} else if (process.argv[3] === 'createIndex') {
	; // valid
} else {
	console.log('command error.');
	return; // invalid
}

var url = 'mongodb://localhost:27017/bitflyer';
var market = 'lightning_executions_' + process.argv[2];
var collections = [
	{'name' : market					, 'index' : {'id' : 1, 'exec_date' : 1}}, // 約定データ
	{'name' : (market + '_OHLC_300')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(5分足)
	{'name' : (market + '_OHLC_900')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(15分足)
	{'name' : (market + '_OHLC_1800')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(30分足)
	{'name' : (market + '_OHLC_3600')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(1時間足)
	{'name' : (market + '_OHLC_21600')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(6時間足)
	{'name' : (market + '_OHLC_43200')	, 'index' : {'id' : 1, 'open_date' : 1}}, // OHLCデータ(12時間足)
	{'name' : (market + '_OHLC_86400')	, 'index' : {'id' : 1, 'open_date' : 1}}  // OHLCデータ(24時間足)
];
var command = process.argv[3];

if (command === 'dropAll') {

	MongoClient.connect(url, function(err, db) {
		assert.equal(null, err);

		for (var i=0, n=0, len=collections.length; i<len; i++) {
			(function (name) {
				var collection = db.collection(name);
				collection.drop(function(err, result) {
					if (err) {
						console.log('db.' + name + '.drop()' + ' : ' + err.errmsg);
					} else {
						console.log('db.' + name + '.drop()' + ' : ' + result);
					}
					n++;
					if (n == collections.length) {
						db.close();
					}
				});
			})(collections[i].name);
		}

	});

} else if (command === 'createIndex') {

	MongoClient.connect(url, function(err, db) {
		assert.equal(null, err);

		for (var i=0, n=0, len=collections.length; i<len; i++) {
			(function (name, index) {
				var collection = db.collection(name);
				collection.createIndex(index, function(err, result) {
					if (err) {
						console.log('db.' + name + '.createIndex()' + ' : ' + err.errmsg);
					} else {
						console.log('db.' + name + '.createIndex()' + ' : ' + result);
					}
					n++;
					if (n == collections.length) {
						db.close();
					}
				});
			})(collections[i].name, collections[i].index);
		}

	});

}
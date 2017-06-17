//
// OHLCデータの配信サーバー
//
// JOINしたクライアントに対して、
//  - JOIN時点での最新データを配信
//  - 以降は定期的に、前回送信したデータからの更新データを配信
// 
// またクライアントからの要求に応じて過去データを配信
//
var Config = require('config');

var MongoClient = require('mongodb').MongoClient
, assert = require('assert');

var url;
if (Config.config.mongo_user && Config.config.mongo_pwd) {
	url = 'mongodb://' + Config.config.mongo_user + ':' + Config.config.mongo_pwd + '@' + Config.config.mongo_host + ':' + Config.config.mongo_port + '/' + Config.config.mongo_db;
} else {
	url = 'mongodb://' + Config.config.mongo_host + ':' + Config.config.mongo_port + '/' + Config.config.mongo_db;
}
var ohlcs = {	'300'   : null, //5分足
				'900'   : null, //15分足
				'1800'  : null, //30分足
				'3600'  : null, //1時間足
				'21600' : null, //6時間足
				'43200' : null, //12時間足
				'86400' : null  //24時間足
};

//
// コレクション名を返す
//
var getCollectionName = function(code) {
	return 'lightning_executions_' + code;
}

//
// コード名を返す
//
var getCodeName = function(market, span) {
	return market + '_OHLC_' + span;
}

//
// クライアントからの要求のパラメータが正しいかどうかチェック
//
var checkRequest = function(span) {
	
	for (var key in ohlcs) {
		if (key === String(span)) {
			return true;
		}
	}

	return false;
}

console.log('[LISTEN] port:' + Config.config.server_port);

var io = require('socket.io')(Config.config.server_port);

var Server = function (market) {

	var namespace = '/' + market + '_OHLC';

	var ns = io.of(namespace).on('connection', function (socket) {
		console.log('[CONN] ' + namespace);

		socket.on('req', function(obj){

			// クライアントから要求を受信
			console.log('[RECV REQ] ' + namespace + ' span:' + obj.span + ' before:' + obj.before);

			if (checkRequest(obj.span)) {
				sendOldOHLC(getCodeName(market, obj.span), obj.before, 100, socket);
			}
		});

		socket.on('join', function(obj) {

			// クライアントから要求を受信
			console.log('[RECV JOIN] ' + namespace + ' span:' + obj.span);

			if (checkRequest(obj.span)) {
				socket.join(getCodeName(market, obj.span));
			} else {
				console.log('[FAIL JOIN]');
			}
		});

		socket.on('disconnect', function (socket) {
			console.log('[DISCONN] ' + namespace);
		});

	});

	//
	// idより前(idは含まない)の古いOHLCデータをlimit件だけclientへ送信
	//
	var sendOldOHLC = function(code, before, limit, client) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(code));

			collection.find({'id':{'$lt':before}}).sort([['id',-1]]).limit(limit).forEach(function (doc) {

				// iteration callback

				client.emit(code, doc);

			}, function (err) {

				// end callback

				db.close();

			});

		});
	};

	//
	// lastより新しいOHLCデータすべてを全クライアントへ送信
	//
	var sendUpdatedOHLC = function(code, last) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(code));

			collection.find({'id':{'$gte':last.id}}).sort([['id',1]]).forEach(function (doc) {

				// iteration callback

				//if (last.id == doc.id && last.close_exec_id == doc.close_exec_id) {
				//	// 未更新なら送信不要
				//	return;
				//}

				ns.to(code).emit(code, doc);

				last = doc;

			}, function (err) {

				// end callback

				setTimeout(sendUpdatedOHLC, 1000, code, last);
				db.close();

			});

		});
	};

	//
	// 最新のOHLCデータを1つだけ全クライアントへ送信
	//
	var sendLatestOHLC = function(code) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(code));

			collection.find().sort([['id',-1]]).limit(1).forEach(function (doc) {

				ns.to(code).emit(code, doc);

				setTimeout(sendUpdatedOHLC, 1000, code, doc);
				db.close();

			});

		});
	};

	this.start = function () {
		for (var key in ohlcs) {
			var code = getCodeName(market, key);
			console.log('[START] ' + code);
			sendLatestOHLC(code);
		}
	}

	return this;
}

Server('BTC_JPY').start();
Server('FX_BTC_JPY').start();

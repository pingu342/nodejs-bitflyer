//
// OHLCデータの配信サーバー
//
// OHLCデータの足の長さ(span)ごとにroomを提供
// roomにJOINしたクライアントに対して、
//  - JOIN時点での最新のOHLCデータを配信
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
var getCollectionName = function(market, span) {
	return 'lightning_executions_' + market + '_OHLC_' + span;
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
			console.log('[RECV REQ] ' + market + '_OHLC_' + obj.span + ' before:' + obj.before);

			if (checkRequest(obj.span)) {
				sendOldOHLC(obj.span, obj.before, 100, socket);
			}
		});

		socket.on('join', function(obj) {

			// クライアントから要求を受信
			console.log('[RECV JOIN] ' + market + '_OHLC_' + obj.span);

			if (checkRequest(obj.span)) {
				socket.join(obj.span);
			} else {
				console.log('[FAIL JOIN]');
			}
		});

		socket.on('disconnect', function (socket) {
			console.log('[DISCONN] ' + namespace);
		});

	});

	//
	// idより前(idは含まない)の古い、span足のOHLCデータをlimit件だけ、clientへ送信
	//
	var sendOldOHLC = function(span, before, limit, client) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(market, span));
			var oldestId = Number.MAX_VALUE;

			collection.find({'id':{'$lt':before}}).sort([['id',-1]]).limit(limit).forEach(function (doc) {

				// iteration callback

				client.emit(span, doc);

				if (oldestId > doc.id) {
					oldestId = doc.id;
				}

			}, function (err) {

				// end callback

				client.emit('rsp', {'span':span, 'before':before, 'after':(oldestId-1), 'msg':'Requested data was sent.'});
				db.close();

			});

		});
	};

	//
	// lastより新しいspan足のOHLCデータすべてを、spanにJOINした全クライアントへ送信
	//
	var sendUpdatedOHLC = function(span, last) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(market, span));

			collection.find({'id':{'$gte':last.id}}).sort([['id',1]]).forEach(function (doc) {

				// iteration callback

				//if (last.id == doc.id && last.close_exec_id == doc.close_exec_id) {
				//	// 未更新なら送信不要
				//	return;
				//}

				ns.to(span).emit(span, doc);

				last = doc;

			}, function (err) {

				// end callback

				setTimeout(sendUpdatedOHLC, 1000, span, last);
				db.close();

			});

		});
	};

	//
	// 最新のspan足のOHLCデータを1つだけ、spanにJOINした全クライアントへ送信
	//
	var sendLatestOHLC = function(span) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var collection = db.collection(getCollectionName(market, span));

			collection.find().sort([['id',-1]]).limit(1).forEach(function (doc) {

				ns.to(span).emit(span, doc);

				setTimeout(sendUpdatedOHLC, 1000, span, doc);
				db.close();

			});

		});
	};

	//
	// 配信開始
	//
	this.start = function () {
		for (var span in ohlcs) {
			console.log('[START] ' + market + '_OHLC_' + span);
			sendLatestOHLC(span);
		}
	}

	return this;
}

Server('BTC_JPY').start();
Server('FX_BTC_JPY').start();
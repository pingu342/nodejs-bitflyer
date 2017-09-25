//
// OHLCデータの配信サーバー
//
// OHLCデータの足の長さ(span)ごとにroomを提供
// roomにJOINしたクライアントに対して、
//  - JOIN時点での最新のOHLCデータを配信
//  - 以降は定期的に、前回送信したデータからの更新データを配信
// 
// またクライアントからの要求に応じて過去のOHLCデータを配信
//
// また過去1分間の出来高を配信
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
var ohlcspan = {	'300'   : null, //5分足
					'900'   : null, //15分足
					'1800'  : null, //30分足
					'3600'  : null, //1時間足
					'21600' : null, //6時間足
					'43200' : null, //12時間足
					'86400' : null  //24時間足
};
var volumespan = {	'60' : null, //過去1分間の出来高
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
var checkRequest = function(req) {

	var span;
	if (req.type === 'OHLC') {
		span = ohlcspan;
	} else if (req.type == 'volume') {
		span = volumespan;
	} else {
		return false;
	}

	for (var key in span) {
		if (key === String(req.span)) {
			return true;
		}
	}

	return false;
}

//
// 出来高
//
var Volume = function(span) {

	var execList = []; //過去span秒の約定履歴

	this.sell = 0.0;
	this.buy = 0.0;

	//
	// 新しい約定を追加
	//
	this.pushExec = function(exec) {
		execList.push(exec);
		if (exec.side == 'SELL') {
			this.sell += exec.size;
		} else {
			this.buy += exec.size;
		}
	}

	//
	// 古い約定を履歴から削除
	//
	this.checkExec = function() {
		var changed = false;
		while (execList.length > 0) {
			var oldest = execList[0];
			var d = Date.now() - oldest.exec_date.getTime();
			if (d > 1000.0 * span) {
				//console.log('remove');
				if (oldest.side == 'SELL') {
					this.sell -= oldest.size;
				} else {
					this.buy -= oldest.size;
				}
				execList.splice(0, 1);
				changed = true;
			} else {
				break;
			}
		}
		return changed;
	}
}

console.log((new Date).toISOString() + ' [LISTEN] port:' + Config.config.server_port);

var io = require('socket.io')(Config.config.server_port);

var Server = function (market) {

	var namespace = '/' + market;
	var database = null;

	var ns = io.of(namespace).on('connection', function (socket) {
		console.log((new Date).toISOString() + '[CONN] ' + namespace);

		socket.on('req', function(obj){

			// クライアントから要求を受信
			console.log((new Date).toISOString() + '[RECV REQ] ' + market + '_' + obj.type + '_' + obj.span + ' before:' + obj.before + ' after:' + obj.after);

			if (checkRequest(obj)) {
				if (obj.type === 'OHLC') {
					var after = obj.after;
					if (typeof after === "undefined") {
						after = 0;
					}
					sendOldOHLC(obj.span, obj.before, after, 200, socket);
				}
			}
		});

		socket.on('join', function(obj) {

			// クライアントからJOINを受信
			console.log((new Date).toISOString() + '[RECV JOIN] ' + market + '_' + obj.type + '_' + obj.span);

			if (checkRequest(obj)) {
				socket.join(obj.type +'_' + obj.span);
			} else {
				console.log((new Date).toISOString() + '[FAIL JOIN]');
			}
		});

		socket.on('leave', function(obj) {

			// クライアントからLEAVEを受信
			console.log((new Date).toISOString() + '[RECV LEAVE] ' + market + '_' + obj.type + '_' + obj.span);

			if (checkRequest(obj)) {
				socket.leave(obj.type + '_' + obj.span);
			} else {
				console.log((new Date).toISOString() + '[FAIL LEAVE]');
			}
		});

		socket.on('disconnect', function (socket) {
			console.log((new Date).toISOString() + '[DISCONN] ' + namespace);
		});

	});

	//
	// idより前(idは含まない)の古い、span足のOHLCデータをlimit件だけ、clientへ送信
	//
	var sendOldOHLC = function(span, before, after, limit, client) {

		var collection = database.collection(getCollectionName(market, span));
		//var oldestId = Number.MAX_VALUE;

		//console.log((new Date).toISOString() + '[EMIT DAT] ' + market + '_' + span + ' before=' + before);
		collection.find({'id':{'$lt':before, '$gt':after}}).sort([['id',-1]]).limit(limit).forEach(function (doc) {

			// iteration callback

			client.emit('OHLC_' + span, doc);

			//if (oldestId > doc.id) {
			//	oldestId = doc.id;
			//}

		}, function (err) {

			// end callback

			console.log((new Date).toISOString() + '[SEND RSP] ' + market + '_' + span + ' before:' + before + ' after:' + after);
			client.emit('rsp', {'type':'OHLC', 'span':span, 'before':before, 'after':after, 'msg':'Requested data was sent.'});

		});
	};

	//
	// OHLCデータを、spanにJOINした全クライアントへ送信
	//
	var sendOHLC = function(span) {

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			// databaseのconnectionはなるべく使いまわす
			database = db;

			var collection = database.collection(getCollectionName(market, span));

			// lastより新しいspan足のOHLCデータすべてを送信
			var sendUpdatedOHLC = function(span, last) {

				var collection = database.collection(getCollectionName(market, span));

				//console.log((new Date).toISOString() + '[EMIT DAT] ' + market + '_' + span + ' after=' + last.id);
				collection.find({'id':{'$gte':last.id}}).sort([['id',1]]).forEach(function (doc) {

					// iteration callback

					//if (last.id == doc.id && last.close_exec_id == doc.close_exec_id) {
					//	// 未更新なら送信不要
					//	return;
					//}

					ns.to('OHLC_' + span).emit('OHLC_' + span, doc);

					last = doc;

				}, function (err) {

					// end callback

					setTimeout(sendUpdatedOHLC, 1000, span, last);

				});
			};

			collection.find().sort([['id',-1]]).limit(1).forEach(function (doc) {

				ns.to('OHLC_' + span).emit('OHLC_' + span, doc);

				setTimeout(sendUpdatedOHLC, 1000, span, doc);

			});

		});
	};

	//
	// 約定データから出来高を取得し、spanにJOINした全クライアントへ送信
	//
	var sendVolume = function(span) {

		var volume = new Volume(span);

		MongoClient.connect(url, function(err, db) {
			assert.equal(null, err);

			var lastExec = null;
			var database = db;
			var collection = database.collection('lightning_executions_' + market);

			var checkExec = function() {
				
				var execNum = 0;

				collection.find({'id':{'$gt':lastExec.id}}).sort([['id',1]]).forEach(function (exec) {
					
					execNum++;
					volume.pushExec(exec);
					lastExec = exec;

				}, function (err) {

					var result = volume.checkExec();
					if (/*execNum > 0 || result*/true) {
						ns.to('volume_' + span).emit('volume_' + span, {sell: volume.sell, buy: volume.buy});
					}

					// 新しい約定データを1秒後に確認
					setTimeout(checkExec, 1000);
				});
			};

			// 最新の約定データを1つだけ取得
			collection.find().sort([['id',-1]]).limit(1).forEach(function (exec) {

				volume.pushExec(exec);
				lastExec = exec;

				// 新しい約定データを1秒後に確認
				setTimeout(checkExec, 1000);
			});

		});
	}

	//
	// 配信開始
	//
	this.start = function () {
		for (var span in ohlcspan) {
			console.log((new Date).toISOString() + ' [START] ' + market + '_OHLC_' + span);
			sendOHLC(span);
		}
		for (var span in volumespan) {
			console.log((new Date).toISOString() + ' [START] ' + market + '_volume_' + span);
			sendVolume(span);
		}
	}
}

new Server('BTC_JPY').start();
new Server('FX_BTC_JPY').start();
new Server('ETH_BTC').start();
new Server('BCH_BTC').start();



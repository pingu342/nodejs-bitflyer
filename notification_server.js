// 
// iOSアプリに通知を送るサーバー
//
var Config = require('config');
var http = require('http');
var qs = require('qs');
var server = http.createServer();
var port = Config.config.notification.server_port;
var subscriptionList = [];

//
// サブスクリプションを追加
//
var addSubscription = function(json) {
	console.log('[*] new subscription:');
	console.log(json.deviceToken);
	subscriptionList.push(json);
	return true;
}

//
// 通知すべきサブスクリプションを取得
//
var getSubscription = function(oldPrice, newPrice) {
	for(let i = 0; i < subscriptionList.length; i++) {
		if (subscriptionList[i].direction === 'fall') {
			if (subscriptionList[i].price < oldPrice &&
				subscriptionList[i].price >= newPrice) {
				return i;
			}
		} else if (subscriptionList[i].direction === 'rise') {
			if (subscriptionList[i].price > oldPrice &&
				subscriptionList[i].price <= newPrice) {
				return i;
			}
		}
	}
	return -1;
}

//
// iOSアプリからサブスクリプションを受け付ける
//
server.on('request', function(req, res) {
	
	//console.log('Recieve request for ' + req.url);

	if (req.url === '/subscribe' && req.method === 'POST') {
		req.on('data', function(chunk) {
			var json = JSON.parse(chunk);
			addSubscription(json);
		});
		req.on('end', function() {
			res.writeHead(200);
			res.end();
		});
		return;
	}

	res.writeHead(404);
	res.end();
})

console.log('Listen %d port', port);
server.listen(port);

//
// APNsサーバー経由でiOSアプリへ通知を送信
//
var apn = require('apn');
var options = {
	pfx:		Config.config.notification.pfx_file,
	passphrase:	Config.config.notification.pfx_passphrase,
	production:	false
};
var apnProvider = new apn.Provider(options);

var pushNotification = function(sub) {
	var deviceToken = sub.deviceToken;
	var note = new apn.Notification();
	note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now. 
	note.badge = 1;
	note.sound = "ping.aiff";
	if (sub.direction === 'rise') {
		note.alert = "Price rose to " + sub.price + ".";
	} else {
		note.alert = "Price fell to " + sub.price + ".";
	}
	apnProvider.send(note, deviceToken).then( (result) => {
		// see documentation for an explanation of result 
		console.log(result);
	});
}

//
// MongoDBから約定データを取得することで価格変動を監視し、iOSアプリへ通知を送信
//
var MongoClient = require('mongodb').MongoClient
, assert = require('assert');

var url;
if (Config.config.mongo_user && Config.config.mongo_pwd) {
	url = 'mongodb://' + Config.config.mongo_user + ':' + Config.config.mongo_pwd + '@' + Config.config.mongo_host + ':' + Config.config.mongo_port + '/' + Config.config.mongo_db;
} else {
	url = 'mongodb://' + Config.config.mongo_host + ':' + Config.config.mongo_port + '/' + Config.config.mongo_db;
}
console.log(url);

MongoClient.connect(url, function(err, db) {
	assert.equal(null, err);

	var lastExec = null;
	var database = db;
	var collection = database.collection('lightning_executions_FX_BTC_JPY');

	var check = function() {

		collection.find({'id':{'$gte':lastExec.id}}).sort([['id',1]]).forEach(function (exec) {

			var i = getSubscription(lastExec.price, exec.price);
			if (i >= 0) {
				console.log('[*] fire subscription:');
				console.log(subscriptionList[i]);
				pushNotification(subscriptionList[i]);
				subscriptionList.splice(i, 1);
			}

			//console.log(lastExec.price + '->' + exec.price);
			lastExec = exec;

		}, function (err) {

			// 新しい約定データを1秒後に確認
			setTimeout(check, 1000);

		});
	};

	// 最新の約定データを1つだけ取得
	collection.find().sort([['id',-1]]).limit(1).forEach(function (exec) {

		lastExec = exec;

		// 新しい約定データを1秒後に確認
		setTimeout(check, 1000);

	});

});

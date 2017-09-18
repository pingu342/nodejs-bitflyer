// 
// iOSアプリに通知を送るサーバー
//
var Config = require('config');
var http = require('http');
var qs = require('qs');
var server = http.createServer();
var port = Config.config.notification.server_port;
var userList = [];
var subscriptionList = [];

//
// ユーザーを取得
//
var getUser = function(uid) {
	var length = userList.length;
	for (let i = 0; i < length; i++) {
		var user = userList[i];
		if (user.uid === uid) {
			return user;
		}
	}
	return null;
}

//
// ユーザーを追加
//
var addUser = function(json) {
	var user = getUser(json.uid);
	if (user) {
		var length = user.deviceToken.length;
		for (let i = 0; i < length; i++) {
			if (user.deviceToken[i] === json.deviceToken) {
				return false;
			}
		}
		user.deviceToken.push(json.deviceToken);
		console.log('[*] new device:');
		console.log(user);
		return true;
	}
	console.log('[*] new user:');
	var user = {
		uid: json.uid,
		deviceToken: [json.deviceToken]
	};
	console.log(user);
	userList.push(user);
	return true;
}

//
// サブスクリプションを追加
//
var addSub = function(json) {
	// 重複禁止
	var length = subscriptionList.length;
	for(let i = 0; i < length; i++) {
		var sub = subscriptionList[i];
		if (sub.uid === json.uid &&
			sub.price === json.price &&
			sub.market === json.market) {
			return false;
		}
	}
	console.log('[*] new subscription:');
	console.log(json);
	subscriptionList.push(json);
	return true;
}

//
// サブスクリプションを削除
//
var deleteSub = function(json) {
	var length = subscriptionList.length;
	for(let i = 0; i < length;) {
		var sub = subscriptionList[i];
		if (sub.uid === json.uid) {
			console.log('[*] delete subscription:');
			console.log(sub);
			subscriptionList.splice(i, 1);
			length--;
		} else {
			i++;
		}
	}
	return true;
}

//
// Pushすべき通知を取得
//
var getNotification = function(next, oldPrice, newPrice) {
	var notifi = null;
	for(let i = next; i < subscriptionList.length; i++) {
		var sub = subscriptionList[i];
		if (sub.price < oldPrice && sub.price >= newPrice) {
			// fall
			notifi = {sub: sub, dire: 'fall', next: i};
			subscriptionList.splice(i, 1);
			break;
		} else if (sub.price > oldPrice && sub.price <= newPrice) {
			// rise
			notifi = {sub: sub, dire: 'rise', next: i};
			subscriptionList.splice(i, 1);
			break;
		}
	}
	return notifi;
}

//
// iOSアプリからリクエストを受け付ける
//
server.on('request', function(req, res) {
	
	//console.log('Recieve request for ' + req.url);

	if (req.url === '/login' && req.method === 'POST') {
		req.on('data', function(chunk) {
			var json = JSON.parse(chunk);
			addUser(json);
		});
		req.on('end', function() {
			res.writeHead(200);
			res.end();
		});
		return;
	} else if (req.url === '/subscribe' && req.method === 'POST') {
		req.on('data', function(chunk) {
			var json = JSON.parse(chunk);
			addSub(json);
		});
		req.on('end', function() {
			res.writeHead(200);
			res.end();
		});
		return;
	} else if (req.url === '/unsubscribe' && req.method === 'POST') {
		req.on('data', function(chunk) {
			var json = JSON.parse(chunk);
			deleteSub(json);
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

var pushNotification = function(notifi) {
	var user = getUser(notifi.sub.uid);
	var sub = notifi.sub;
	var dire = notifi.dire;

	console.log('[*] push notification:');
	console.log(dire);
	console.log(user);
	console.log(sub);

	var length = user.deviceToken.length;
	for (let i = 0; i < length; i++) {
		var deviceToken = user.deviceToken[i];
		var note = new apn.Notification();
		note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now. 
		note.badge = 1;
		note.sound = "ping.aiff";
		if (dire === 'rise') {
			note.alert = sub.market + ": Price rose to " + sub.price + ".";
		} else {
			note.alert = sub.market + ": Price fell to " + sub.price + ".";
		}
		apnProvider.send(note, deviceToken).then( (result) => {
			// see documentation for an explanation of result 
			console.log(result);
		});
	}
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

			var next = 0;
			for (;;) {
				var notifi = getNotification(next, lastExec.price, exec.price);
				if (notifi == null) {
					break;
				}
				pushNotification(notifi);
				next = notifi.next;
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

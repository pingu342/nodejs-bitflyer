// 
// ローソク足チャートを描くためのOHLCデータを作成する。
// 約定データを事前にDBに取得しておかなければならない。
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

var url = 'mongodb://localhost:27017/bitflyer';
var market = 'lightning_executions_' + process.argv[2];
var ohlcs = {	'300'   : null, //5分足
				'900'   : null, //15分足
				'1800'  : null, //30分足
				'3600'  : null, //1時間足
				'21600' : null, //6時間足
				'43200' : null, //12時間足
				'86400' : null  //24時間足
};
var execId = 1;

var getCollectionName = function(span) {
	return market + '_OHLC_' + span;
}

var getOpenDate = function(exec, span) {
	var unixTime = Date.parse(exec.exec_date);
	unixTime -= (unixTime % (parseInt(span) * 1000));
	return new Date(unixTime);
}

var OHLCData = function (id, span, exec) {

	if (exec.hasOwnProperty('open_price')) {
		// DBから取得したOHLCデータを使ってインスタンスを初期化
		this.id = exec.id;
		this.open_price = exec.open_price;
		this.high_price = exec.high_price;
		this.low_price = exec.low_price;
		this.close_price = exec.close_price;
		this.exec_num = exec.exec_num;
		this.volume = exec.volume;
		this.open_date = exec.open_date;
		this.open_exec_id = exec.open_exec_id;
		this.close_exec_id = exec.close_exec_id;
	} else {
		// DBから取得した約定データを使ってインスタンスを初期化
		this.id = id;
		this.open_price = exec.price;
		this.high_price = exec.price;
		this.low_price = exec.price;
		this.close_price = exec.price;
		this.exec_num = 1;
		this.volume = exec.size;
		this.open_date = getOpenDate(exec, span);
		this.open_exec_id = exec.id;
		this.close_exec_id = exec.id;
	}

}

// id   : OHLCデータのid
// span : ローソク足のスパン(秒数)
// exec : 約定データまたはOHLCデータ
var OHLC = function (id, span, exec) {

	this.notyetInserted = true; //未だDBに挿入されてなければtrue
	this.inQueue = false; //DBへの書き込みキューの中に居ればtrue
	
	if (exec.hasOwnProperty('open_price')) {
		this.notyetInserted = false;
	}

	this.span = span;
	this.data = new OHLCData(id, span, exec);
	this.closeUnixTime = this.data.open_date.getTime() + (parseInt(span) * 1000);

	this.check = function (exec) {
		if (this.data.close_exec_id >= exec.id) {
			// 古い約定データなのでupdate()への入力禁止
			return false;
		}
		return true;
	}

	this.update = function (exec) {
		if (this.closeUnixTime <= Date.parse(exec.exec_date)) {
			// 次のローソク足に使うべき約定データ
			return false;
		}
		if (this.data.high_price < exec.price) {
			this.data.high_price = exec.price;
		}
		if (this.data.low_price > exec.price) {
			this.data.low_price = exec.price;
		}
		this.data.close_price = exec.price;
		this.data.exec_num++;
		this.data.volume += exec.size;
		this.data.close_exec_id = exec.id;
		return true;
	}
}

// 新しいOHLCデータをDBへ挿入
var insertToDB = function(db, ohlc) {
	console.log('-> INSERT: ' + ohlc.data.id + '@' + ohlc.span);
	var collection = db.collection(getCollectionName(ohlc.span));
	collection.insertOne(ohlc.data);
}

// 既存のOHLCデータを更新
var updateToDB = function(db, ohlc) {
	console.log('-> UPDATE: ' + ohlc.data.id + '@' + ohlc.span);
	var collection = db.collection(getCollectionName(ohlc.span));
	collection.findOneAndUpdate({'id' : ohlc.data.id}, {$set : ohlc.data});
}

// DBからOHLCデータを読み込み
var findFromDB = function(db, callback) {

	var keys = Object.keys(ohlcs);
	var n = 0;
	var smallExecId = Number.MAX_VALUE;

	for (var span in ohlcs) {
		(function (span) {
			// DB内のコレクションは各スパン毎に分けている
			var collection = db.collection(getCollectionName(span));

			// 各スパンの最新のOHLCデータを探す
			collection.findOne({}, {limit:1, sort:[['id',-1]]}, function (err, doc) {
				if (!doc) {
					// DB内に、このスパンのOHLCデータが1つも作られていないので、
					// 最も古い約定データまで遡る必要がある
					smallExecId = 0;
				} else {
					ohlcs[span] = new OHLC(0, 0, doc);
					if (smallExecId > doc.close_exec_id) {
						// DB内に、smallExecId以前の約定データに対応したOHLCデータが作られているので、
						// smallExecId+1 の約定データに遡ればよい
						smallExecId = doc.close_exec_id;
					}
				}
				n++;
				if (n == keys.length) {
					// すべのてスパンのコレクションを読み込み終えた
					execId = smallExecId + 1;
					callback();
				}
			});
		})(span);
	}
}

MongoClient.connect(url, function(err, db) {
	assert.equal(null, err);

	var collection = db.collection(market);

	// 作成済みのOHLCデータをDBから読み込み
	findFromDB(db, function() {

		// 約定データを古いほうから1つずつ読んで、各スパンのOHLCデータをDBに作成していく
		var next = function (after) {

			var count = 0;
			var queue = [];

			// 0.1秒毎に10件の約定データを処理
			console.log('FIND: {execution_id:{$gte:' + after + '}}');
			collection.find({'id' : {'$gte' : after}}).sort([['id',1]]).limit(10).forEach(function (doc) {
				console.log('[' + doc.id + '] ' + doc.exec_date);
				after = doc.id + 1;
				count++;
				for (var span in ohlcs) {
					var ohlc = ohlcs[span];
					if (ohlc && !ohlc.check(doc)) {
						continue;
					}
					if (!ohlc || !ohlc.update(doc)) {
						ohlcs[span] = new OHLC((!ohlc ? 1 : ohlc.data.id + 1), span, doc);
						queue.push(ohlcs[span]);
						ohlcs[span].inQueue = true;
					} else {
						if (!ohlc.inQueue) {
							queue.push(ohlc);
							ohlc.inQueue = true;
						}
					}
				}
			}, function (err) {
				if (count > 0) {
					// OHLCデータをDBへ書き込む
					for (var i=0, len=queue.length; i<len; i++) {
						var ohlc = queue[i];
						ohlc.inQueue = false;
						if (ohlc.notyetInserted) {
							insertToDB(db, ohlc);
							ohlc.notyetInserted = false;
						} else {
							updateToDB(db, ohlc);
						}
					}
					setTimeout(next, 100, after);
				} else {
					// 最新の約定データに追いついた
					console.log('no execution.');
					setTimeout(next, 1000, after);
				}
			});
		};

		next(execId);

	});
});


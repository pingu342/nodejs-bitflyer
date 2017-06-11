// 
// 約定データをダウンロードしてDBへ保存する。
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
var productCode = process.argv[2];

var insertExecutionsToDB = function(db, exec, callback) {
	
	var collection = db.collection(market);
	collection.insertMany(exec, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

//
// id >= after の約定データを最大count件だけ取得する
//
var getExecutions = function(count, after, callback) {

	var request = require('request');
	var path = '/v1/executions';
	var query = '?product_code=' + productCode;
	
	if (count > 0) {
		query += '&count=' + count;
	} else {
		count = 100;
	}
	
	if (after > 0) {
		query += '&after=' + (after-1) + '&before=' + (after + count);
	}
	
	console.log(query);
	
	request('https://api.bitflyer.jp' + path + query, function (err, response, payload) {
		try {
			var json = JSON.parse(payload);
			callback(json);
		} catch (e) {
			callback(null);
		}
	});
}

// 
// id >= after の約定データを取得してDBに書き込む
// このfunctionは、サーバは id <= upper の約定データを必ず持っている
// (リクエストしたら必ず返してくれる) ものとして動作する
//
var getExecutionsPeridic = function(after, upper) {

	// after <= id && id < after+100 の範囲の約定データ100件をサーバに要求する
	getExecutions(0, after, function (res) {

		if (res == null) {
			// 取得失敗なら1秒後にリトライ
			console.log('getExecutions error.');
			setTimeout(getExecutionsPeridic, 1000, after, upper);
			return;
		}

		// 取得した約定データには欠番がある(例えばafter=1で100件要求しても、結果は id=1,5,9,...,98 だったりする)ケースがほとんど
		// 欠番があると、取得件数は100件未満となる(先の例では、before=after+100=101なので、サーバは id >= 101 の約定データを返すことはない)
		// 取得結果の順番はidの降順になっている

		// 昇順ソート
		res.sort(function(a, b) {
			return b.id - a.id;
		});

		var execs = [];

		// after > id の約定データは無視
		// uppper < id の約定データを取得したらupperを更新
		// exec_dateをDate型に変換
		var maxId = 0;
		for (var i=res.length-1; i>=0; i--) {
			if (after > res[i].id) {
				continue;
			}
			console.log(' { id : ' + res[i].id + ', exec_date : ' + res[i].exec_date.toString() + ' }');
			if (maxId < res[i].id) {
				maxId = res[i].id;
			}
			res[i].exec_date = new Date(res[i].exec_date);
			execs.push(res[i]);
		}

		if (upper < maxId) {
			upper = maxId;
		}

		var next = function () {

			// after+100 <= upper なら、id < after+100 の約定データはすべてサーバから取得できたとみなし、次は id >= after+100 の約定データを取得する
			// after+100 > upper なら、id <= upper の約定データはすべてサーバから取得できたとみなし、次は id >= upper+1 の約定データを取得する

			after += 100;

			if (after <= maxId) {
				after = maxId + 1;
			}

			if (after > upper) {
				after = upper + 1;

				// サーバに問い合わせてupperを更新する
				// after <= upper になるまで (サーバにafter以上の約定データが貯まるまで)、
				// periodicの間隔を長く、ゆっくりにする

				var getLatestExec = function () {
					getExecutions(1, 0, function (res) {
						if (res == null) {
							// 取得失敗なら1秒後にリトライ
							console.log('getExecutions error.');
							setTimeout(getLatestExec, 1000);
							return;
						}
						console.log('after=' + after + ' upper=' + res[0].id);
						upper = res[0].id;
						if (after <= upper) {
							getExecutionsPeridic(after, upper);
						} else {
							setTimeout(getLatestExec, 1000);
						}
					});
				};

				getLatestExec();
				return;
			}

			setTimeout(getExecutionsPeridic, 10, after, upper);
		};

		if (execs.length > 0) {
			MongoClient.connect(url, function(err, db) {
				assert.equal(null, err);
				insertExecutionsToDB(db, execs, function(result) {
					db.close();
					next();
				});
			});
		} else {
			next();
		}
	});
}

MongoClient.connect(url, function(err, db) {
	assert.equal(null, err);

	var collection = db.collection(market);

	// コレクション内で最新の約定データを探す
	collection.findOne({}, {limit:1, sort:[['id',-1]]}, function (err, doc) {

		var after = 1; // 約定データが1つもないなら最初のデータから取得する

		if (doc != null) {
			// 続きのデータを取得する
			after = doc.id + 1;
		}

		console.log("after=" + after);

		db.close();

		// サーバ側で最新の約定データのidを取得する
		getExecutions(1, 0, function (res) {

			console.log('upper=' + res[0].id);

			// idがafter以上の約定データを取得する
			getExecutionsPeridic(after, res[0].id);
		});
	});
	
});
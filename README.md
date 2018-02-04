# nodejs-bitflyer
Download bitFlyer lightning bitcoin market executions data and create OHLC data.

Deliver OHLC data by SocketIO.

Push remote notification to iOS app.

## 概要

bitFlyer lightning APIを使用してBTC_JPY, FX_BTC_JPY, ETH_BTC, BCH_BTCの約定データを取得してmongodbに保存します。

ローソク足チャート用のOHLCデータを作成してmongodbに保存します。

OHLCデータをSocketIOで配信します。

iOSアプリへリモート通知をプッシュします。


## ハードウェア

動作確認をしたハードウェアを示します。

### Macbook Pro (2016), macOS Sierra

### Amazon Linux AMI

* instance : t2.small
* volume : 16 GiB

## ソフトウェア

動作確認をしたソフトウェアのバージョンを示します。

* node -v
	* v6.10.3

* npm -v
	 * 3.10.10

* npm list

		bitflyer@1.0.0
		├── apn@2.1.5
		├── config@1.26.1
		├── forever@0.15.3
		├── js-yaml@3.8.4
		├── mongodb@2.2.28
		├─― play-sound@1.1.2
		├── pubnub@4.10.0
		├── request@2.81.0
		├── require@2.4.20
		├── socketio@1.0.0
		└── sprintf-js@1.1.1

* mongod --version

		db version v3.4.4
		git version: 888390515874a9debd1b6c5d36559ca86b44babd
		OpenSSL version: OpenSSL 1.0.1t  3 May 2016
		allocator: tcmalloc
		modules: none
		build environment:
			distmod: debian81
			distarch: x86_64
			target_arch: x86_64

* mongo --version

		MongoDB shell version v3.4.4
		git version: 888390515874a9debd1b6c5d36559ca86b44babd
		OpenSSL version: OpenSSL 1.0.1t  3 May 2016
		allocator: tcmalloc
		modules: none
		build environment:
			distmod: debian81
			distarch: x86_64
			target_arch: x86_64

### 補足

* メモリは最低2GB必要
* ストレージは〜2017/7までのデータ保存に約3GBが必要。


## インストール

* node.js, mongodbをセットアップ


* このリポジトリをclone

		$ git clone <this_repository>


* node.jsのパッケージをインストール

		$ cd nodejs-bitflyer
		$ npm install
		$ npm install -g forever


* configファイルを修正

		$ vim config/default.yaml

	* mongo_host : mongodのホスト名
	* mongo_port : mongodのポート番号
	* mongo_db : 使用するDBの名前
	* mongo_user : 認証なしの場合は行ごと削除
	* mongo_pwd : 同上
	* server_host : OHLCデータ配信サーバーのホスト名
	* server_port : OHLCデータ配信サーバーのポート番号


* dbを初期化する

	dbからコレクションを削除します。

		$ node manage_db.js BTC_JPY ALL drop
		$ node manage_db.js FX_BTC_JPY ALL drop
		$ node manage_db.js ETH_BTC ALL drop
		$ node manage_db.js BCH_BTC ALL drop

	dbに空のコレクションを作成し、アクセスを高速化するためのインデックスを作成します。

		$ node manage_db.js BTC_JPY ALL createIndex
		$ node manage_db.js FX_BTC_JPY ALL createIndex
		$ node manage_db.js ETH_BTC ALL createIndex
		$ node manage_db.js BCH_BTC ALL createIndex


* 実行

	約定データをダウンロードします。
	
		$ forever start download_exec.js BTC_JPY
		$ forever start download_exec.js FX_BTC_JPY
		$ forever start download_exec.js ETH_BTC
		$ forever start download_exec.js BCH_BTC
	
	OHLCデータを生成します。

		$ forever start create_ohlc.js BTC_JPY
		$ forever start create_ohlc.js FX_BTC_JPY
		$ forever start create_ohlc.js ETH_BTC
		$ forever start create_ohlc.js BCH_BTC

	DBが空っぽの場合は、最初の約定データから順にダウンロードして、OHLCデータを作成します。

	約定データのダウンロードは`GET /v1/getexecutions`のAPIで行います。詳しくはbitFlyerの[リファレンス](https://lightning.bitflyer.jp/docs?lang=ja#%E7%B4%84%E5%AE%9A%E5%B1%A5%E6%AD%B4)を参照してください。pubnubによるRealtime APIも提供されていますが、不安定なので使ってません。

	DBが空っぽの場合、`download_exec.js`は`id=1`の約定データからダウンロードしようとします。  
	しかし、例えばFX_BTC_JPYの場合、最初の約定データは`id=119933`になっており、119932以下のidの約定データは存在しないようです。  
	`download_exec.js`は、まず`id=1~100`の約定データをダウンロードできるかな？ 次は`id=101~200`をダウンロードできるかな？ という具合に動きますので、最初のうちは空振りします。  
	現在に追いつくには4,5日かかります。辛抱してください。

	以前に実行されたことがありDBに途中までのデータが残っている場合、`download_exec.js`はそこからダウンロードを再開します。

	`create_ohlc.js`は、`download_exec.js`がダウンロードした約定データをDBから読み込んでOHLDデータを作成します。  
	DBが空っぽの場合、`create_ohlc.js`は最初の約定データからOHLCデータを作成します。

	以前に実行されたことがありDBに途中までのデータが残っている場合、`create_ohlc.js`はそこからOHLCデータの作成を再開します。

	最後に、OHLCデータを配信します。

		$ forever start server.js

	OHLCデータが正しく配信されているかを確認します。

		$ node client.js BTC_JPY <span>
		$ node client.js FX_BTC_JPY <span>
		$ node client.js ETH_BTC <span>
		$ node client.js BCH_BTC <span>

	`<span>`には、例えば5分足のOHLCデータを確認するなら`300`を入れます。
	他には`900`,`1800`,`3600`,`21600`,`43200`,`86400`を入れることができます。

	正しく動くと以下のような情報が表示されます。  

		[RECV] 166413 2018-02-04T06:57:29.160Z 991888
		[RECV] sell:2.8295130099998076 buy: 7.534459590000511

	値の意味は以下のとおりです。

		[RECV] 最新のOHLCデータの番号 最終取引時刻 最終取引価格  
		[RECV] 直近1分の売り出来高 直近1分の買い出来高

* 停止

		$ forever stopall

	停止しても再開できますのでご安心を。


# Push remote notification to iOS app.

価格が、ある閾値を超えて上昇または下落したことを、iOSアプリへ通知します。

その仕組みは以下の通りです。

* iOSアプリが、通知サーバー`notification_server.js`に、通知をリクエストします。(価格がこの閾値を超えたら通知をくれ。)
* 通知サーバーが価格を監視します。
* 価格が閾値を超えたらiOSアプリへ通知します。具体的には、通知サーバーが、appleのAPNsに通知を依頼することによって、APNsがiOSアプリに通知します。

現状、FX_BTC_JPYのみ対応です。

通知サーバーは、APNsと通信するために、専用のクライアント証明書と秘密鍵を必要とします。
その作成方法はappleのリファレンスをお読みください。

通知サーバーの設定をconfigファイルに追加します。

	$ vim config/default.yaml

* notification
	* server_port : 通知サーバーのポート番号
	* pfx_file : APNsと通信するためのクライアント証明書と秘密鍵の.p12ファイル
	* pfx_passphrase : 暗号化されているpfx_fileを復号するためのパスフレーズ

通知サーバーを起動します。

	$ forever start notification_server.js

iOSアプリの開発方法は説明を省きます。

はじめにiOSアプリは通知サーバーにログインします。ログインするには、`http://<server>:<port>/login`宛に、以下の書式のjsonデータを送信します。

	{
		deviceToken: '123456789ABCDEF...'
		uid: 'userid',
	}

`deviceToken`はappleから取得します。これについてはappleのリファレンスをお読みください。

`uid`にはユーザー名など、ユーザーを識別するための文字列を指定します。

続いて、通知をリクエストするには、`http://<server>:<port>/subscribe`宛に、以下の書式のjsonデータを送信します。

	{
		uid: 'userid'
		price: 100000,
		market: 'FX_BTC_JPY',
	}

`price`は閾値です。

`market`は`FX_BTC_JPY`のみ対応です。

価格が閾値を超えて上昇または下落したとき、`uid`に紐づく`deviceToken`すべてに通知します。


# MongoDB

## コレクション

	$ mongo

	> show dbs
	admin     0.000GB
	bitflyer  0.000GB
	local     0.000GB
	
	> use bitflyer
	
	> show collections
	lightning_executions_<product_code>
	lightning_executions_<product_code>_OHLC_300
	lightning_executions_<product_code>_OHLC_900
	lightning_executions_<product_code>_OHLC_1800
	lightning_executions_<product_code>_OHLC_3600
	lightning_executions_<product_code>_OHLC_21600
	lightning_executions_<product_code>_OHLC_43200
	lightning_executions_<product_code>_OHLC_86400

`<product_code>`には`BTC_JPY`,`FX_BTC_JPY`,`ETH_BTC`,`BCH_BTC`が入ります。

コレクションは上から順に、約定データ、OHLCデータ(5分足,15分足,...)です。

BTC_JPYの約定データを見てみます。

	> db.lightning_executions_BTC_JPY.find()
	{ "_id" : ObjectId("593cb89b7ecc67e89da86c41"), "id" : 1, "side" : "SELL", "price" : 30195, "size" : 0.01, "exec_date" : ISODate("2015-06-24T05:58:48.773Z"), "buy_child_order_acceptance_id" : "4b76790b", "sell_child_order_acceptance_id" : "3075b6ed" }

これはbitflyer lightning APIが返したデータそのものです。

次にBTC_JPYのOHLCデータ(1時間足)を見てみます。

	> db.lightning_executions_BTC_JPY_OHLC_3600.find()
	{ "_id" : ObjectId("59492cf9f9cb006dfe16636c"), "id" : 1, "op" : 70570, "hi" : 70570, "lo" : 70494, "cl" : 70494, "vol_sell" : 0.1, "vol_buy" : 4.924977859999999, "op_date" : ISODate("2016-07-01T17:58:01.373Z"), "cl_date" : ISODate("2016-07-01T17:59:48.003Z"), "op_exec_id" : 2902453, "cl_exec_id" : 2902463 }

* op : 始値
* hi : 上ヒゲ
* lo : 下ヒゲ
* cl : 終値
* vol_sell : 出来高(売り)
* vol_buy : 出来高(買い)
* op_date : 日時
* op_exec_id : 始値をつけた約定データのid
* cl_exec_id : 終値をつけた約定データのid


## コレクションの削除・初期化

削除は次のスクリプトで行います。

	$ node manage_db.js <product_code> <target> drop

初期化は次のスクリプトで行います。これは空のコレクション作成と、アクセスを高速化するためのインデックス作成を行います。

	$ node manage_db.js <product_code> <target> createIndex

`<product_code>`には`BTC_JPY`,`FX_BTC_JPY`,`ETH_BTC`,`BCH_BTC`を入れます。

`<target>`には`ALL`,`OHLC`を入れます。

e.g.

* `node manage_db.js BTC_JPY ALL drop`
	* BTC_JPYの約定データ用とOHLCデータ用のコレクションがdbからすべて消えます。要注意。
* `node manage_db.js BTC_JPY ALL createIndex`
	* BTC_JPYの約定データ用とOHLCデータ用のコレクションをdbに作成し、インデックスを作成します。
* `node manage_db.js BTC_JPY OHLC drop`
	* BTC_JPYのOHLCデータ用のコレクションのみがdbから消えます。約定データ用のコレクションは消えません。

# データのチェック

* `test/check_data.ipynb`
	
	pythonのサンプルです。
	
	ファイルはjupyter notebookの形式です。
	
	データの重複や欠落をチェックします。

	（bitflyer lightning APIで取ってきた約定データにもともと欠落があります）


# ローソク足チャートを描く

* `test/candle_chart.ipynb`
	
	pythonのサンプルです。
	
	ファイルはjupyter notebookの形式です。
	
	DBからOHLCデータを読み出し、matplotlibを利用してローソク足チャートを描きます。



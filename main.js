var https = require('https');
var http = require('http');
var fs = require('fs');
var ca = fs.readFileSync('./cert/srca.cer.pem');
var nodemailer = require('nodemailer');
var schedule = require('node-schedule');
var scanf = require('scanf');
var program = require('commander');
var UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36";

var config = {};
program
  .version('0.0.1')
  .option('-r, --rewrite', 'rewrite config')
  .parse(process.argv);

fs.readFile('config.json','utf-8',function(err,data){
	if(err||!data||program.rewrite){

		console.log('输入日期-time(如:2017-01-27)：');
		config.time = scanf('%s');

		var _stations = JSON.parse(fs.readFileSync('station.json','utf-8'));

		console.log('输入始发站拼音-from_station(如:shanghai)：');
		var _start = scanf("%s");
		while(!_stations.stationInfo[_start]){
			console.log('没有这个车站哦，请重新输入：');
			_start = scanf("%s");
		}
		config.from_station = _stations.stationInfo[_start];
		console.log('输入终点站拼音-end_station(如:hefei)：');
		var _end = scanf('%s');
		while(!_stations.stationInfo[_end]){
			console.log('没有这个车站哦，请重新输入：');
			_end = scanf("%s");
		}
		config.end_station =  _stations.stationInfo[_end];

		console.log('输入车次-train_num(如:K1209，多个车次用|分开)：');
		config.train_num = scanf('%s').split('|');

		console.log('输入邮箱-your_mail(如:123456789@163.com)：');
		config.your_mail = scanf('%s');

		console.log('输入密码或者邮箱授权码-mail_pass：');
		config.mail_pass = scanf('%s');

		console.log('是否购买学生票?(y/n)：');
		config.ticket_type = scanf('%s')=='y'?'0X00':'ADULT';

		console.log('输入收件人邮箱(如果与上面的邮箱一致请直接回车)：');
		config.receive_mail = scanf('%s');
		// console.log(config);
		fs.writeFile('config.json',JSON.stringify(config));
	}else{
		// console.log(data);
		config = JSON.parse(data);
	}
	var rule = new schedule.RecurrenceRule();
	rule.second = [0];
	queryTickets(config);
	schedule.scheduleJob(rule, function(){
		queryTickets(config);
	});
});


var yz_temp = [],yw_temp = [];//保存余票状态

/*
* 查询余票
*/
function queryTickets(config){
	/*设置请求头参数*/
	var options = {
	    hostname: 'kyfw.12306.cn',//12306
	    port:443,
	  	method:'GET',
	    path: '/otn/leftTicket/query?leftTicketDTO.train_date='+config.time+'&leftTicketDTO.from_station='+config.from_station.code+'&leftTicketDTO.to_station='+config.end_station.code+'&purpose_codes='+config.ticket_type,
	    ca:[ca],//证书
	    headers:{
	      'Connection':'keep-alive',
	      'Host':'kyfw.12306.cn',
	      'User-Agent': UA,
	      "Connection":"keep-alive",
	      "Referer":"https://kyfw.12306.cn/otn/leftTicket/init",
	      "Cookie":"__NRF=D2A7CA0EBB8DD82350AAB934FA35745B; JSESSIONID=0A02F03F9852081DDBFEA4AA03EF4252C569EB7AB1; _jc_save_detail=true; _jc_save_showIns=true; BIGipServerotn=1072693770.38945.0000; _jc_save_fromStation=%u77F3%u5BB6%u5E84%2CSJP; _jc_save_toStation=%u5408%u80A5%2CHFH; _jc_save_fromDate=2017-02-17; _jc_save_toDate=2017-01-19; _jc_save_wfdc_flag=dc",
    	}
	};
	/*请求开始*/
	var req = https.get(options, function(res){
	    var data = '';
	    /*设置邮箱信息*/
	    var transporter = nodemailer.createTransport({
		    host: "smtp.qq.com",//"smtp.163.com",//邮箱的服务器地址，如果你要换其他类型邮箱（如QQ）的话，你要去找他们对应的服务器，
		    secureConnection: true,
		    port:465,//端口，这些都是163给定的，自己到网上查163邮箱的服务器信息
		    auth: {
		        user: config.your_mail,//邮箱账号
		        pass: config.mail_pass,//邮箱密码
		    }
		});
		console.log('--------------------------------------------------------------------------');
	    res.on('data',function(buff){
	    	data += buff;//查询结果（JSON格式）
	    });
	    res.on('end',function(){
	    	var jsonData;//用来保存返回的json数据

	    	try{
	    	 	jsonData = JSON.parse(data).data;
	    	}catch(e){
	    		console.log('JSON数据出错',e);
	    		return;
	    	}
	    	if(!jsonData||jsonData.length == 0){
	    		console.log('没有查询到余票信息');
	    		return;
	    	}
	    	/*获取车次与车辆代码的映射表*/
	    	var jsonMap = {};
	    	for(var i=0;i<jsonData.length;i++){
	    		var cur = jsonData[i];
	    		jsonMap[cur.queryLeftNewDTO.station_train_code] = cur.queryLeftNewDTO;
	    	}
			/*过滤不需要的车次*/
	    	var train_arr = config.train_num;
			for(var i=0;i<jsonData.result.length;i++){
				var cur = jsonData.result[i];
				var _results = cur.split('|');
				for(var j = 0;j < train_arr.length;j++){
	    			if(_results[3] == config.train_num[j]) {
	    				jsonMap[_results[3]] = _results;
	    			}
				}
			}

	    	for(var j = 0;j < train_arr.length;j++){
				var cur_train = jsonMap[train_arr[j]];//当前车次

				var yz = cur_train[29];//硬座数目
				var yw = cur_train[28];//硬卧数目
				var trainNum = cur_train[3];//车次

				/*tickect.ruanzuo = temp[24]; // 软座
				tickect.wuzuo = temp[26];	// 无座
				tickect.yingwo = temp[28];  // 硬卧
				tickect.yingzuo = temp[29]; // 硬座

				tickect.scSeat = temp[30];	// 二等座
				tickect.fcSeat = temp[31];	// 一等座
				tickect.bcSeat = temp[32];	// 商务座 / 特等座

				tickect.dongwo = temp[33];	// 动卧
				tickect.train_no = temp[2];	// 火车编号
				tickect.tId = temp[3];	    // Train ID

				tickect.sTime = temp[8];	// Start Time
				tickect.eTime = temp[9];	// End Time
				tickect.tTime = temp[10];	// Total Time
				tickect.date = temp[13];    //乘车日期
				*/
				console.log(trainNum+' 车次的硬座余票数:',yz,', 硬卧余票数:',yw,'。当前时间：'+getTime());
				if(yz!='无'&&yz!='--'||yw!='无'&&yw!='--'){

					var interVal = setInterval(function(){
						process.stdout.write('\x07')
					},1000);

					if(yw_temp[j] == yw && yz_temp[j] == yz){//当余票状态发生改变的时候就不发送邮件
						console.log(' '+trainNum+'车次状态没改变，不重复发邮件');
						continue;
					}
					var mailOptions = {
					    from: config.your_mail, // 发件邮箱地址
					    to: config.receive_mail||config.your_mail, // 收件邮箱地址，可以和发件邮箱一样
					    subject: trainNum+'有票啦，硬座：'+yz+'，硬卧：'+yw, // 邮件标题
					    text: trainNum+'有票啦\n'+jsonData.map.LZJ+'=============>'+jsonData.map.CDW+'\n出发日期：'+config.time+',\n出发时间：'+cur_train[8]+',\n到达时间：'+cur_train[9]+',\n历时：'+cur_train[10], // 邮件内容
					};

					// 发邮件部分
					(function(j,yz,yw){
						transporter.sendMail(mailOptions, function(error, info){
						    if(error){
						        return console.log(error);
						    }
						    console.log(' 邮件已发送: ====================> ' + mailOptions.to);
						    yw_temp[j] = yw;//保存当前列车的余票数量
						    yz_temp[j] = yz;
						});
					})(j,yz,yw);
				}else{
					console.log(trainNum+'硬座/硬卧无票');

				}
	    	}
			console.log('-----------------------------------end------------------------------------');
	    	// fs.writeFile('./train.json',data);
	    });
	});

	req.on('error', function(err){
	    console.error(err.code);
	});
}


/*
* 爬取全国车站信息并生成JSON文件
*/
function stationJson(){
	var _opt = {
		hostname: 'kyfw.12306.cn',
		path: '/otn/resources/js/framework/station_name.js?station_version=1.8964',
		ca:[ca]
	};
	var _data = '';
	var _req = https.get(_opt, function(res){
		res.on('data',function(buff){
			_data += buff;
		});
		res.on('end', function(){
			// console.log(_data);
			try{
				var re = /\|[\u4e00-\u9fa5]+\|[A-Z]{3}\|\w+\|\w+\|\w+@\w+/g;
				// console.log('data',_data.match(re));
				var stationMap = {};
				var stationArray = [];
				var temp = _data.match(re);
				[].forEach.call(temp,function(item,i){
					// console.log(item,i);
					var t = item.split("|");
					stationArray.push(t[3]);
					stationMap[t[3]]={
						name:t[1],
						code:t[2],
						pinyin:t[3],
						suoxie:t[4],
						other:t[5]
					}
				});
				// console.log(stationMap["hefei"]);
				fs.writeFile('station.json',JSON.stringify({stationName:stationArray,stationInfo:stationMap}));
			}catch(e){
				console.log(e);
				return null;
			}
		});
	});
	_req.on('error', function(err){
    	console.error(err.code);
	});
}
function getTime(){
	var T = new Date();
	return T.getFullYear()+'-'+(parseInt(T.getMonth())+1)+'-'+T.getDate()+' '+T.getHours()+":"+T.getMinutes()+":"+T.getSeconds();
}


/*serial2.js Interface between RF Module serial interface and ThingsBoard
---------------------------------------------------------------------------------                                                                               
 J. Evans May 2018
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN 
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                                                       
                                                                                  
 Revision History                                                                  
 V1.00 - Release

 Instructions:
 Update the ThingsBoard ip address and the table below with your DeviceID's, 
 ThingsBoard AccessTokens, and message type. This version will send each wireless 
 device's telemetry to a specific ThingsBoard device (see accessTokenTable below)
 
 Message Types:
 TMP - Temperature
 HUM - Humidity
 BUTTON - Switch 
 BATT - Battery level
 SLEEPING - Sensor sleeping
 AWAKE - Sensor awake
 STARTED - Sensor started
 
 -----------------------------------------------------------------------------------
*/
//ThingsBoard IP address
const thingsboardHost = "127.0.0.1";
var accessTokenTable = [
//These are just examples. Delete these values and insert your own
//Device ID, Access Token, Message Type
["45", "PhrSAgljUiikoBlDL9v6", "TMP"],
["21", "Qr0d7JC4ZJFEOGkJd3I8", "TMP"],
["90", "TM6XvPlhpTzdW29liDWH", "TMP"],
["61", "uAk8xrkramrq8cBNl6Hl", "TMP"]
];

//Set Fahrenheit=0 display in centigrade
const Fahrenheit=1;

var mqtt = require('mqtt');
var accessToken = "";
var SerialPort = require('serialport');
var port = new SerialPort('/dev/ttyAMA0');
var inStr="";
var data = {
	deviceID: "",
    command: "",
    value: ""
};

var mqtt = require('mqtt');
var client;

//connectMQTT();

function lookupToken(deviceID, command){
	var arrayLength = accessTokenTable.length;
	for (var i = 0; i < arrayLength; i++) {
		if (accessTokenTable[i][0]==deviceID && accessTokenTable[i][2]==command){
			return accessTokenTable[i][1];
			}
		}
	return -1;
}

function connectMQTT(){
	client  = mqtt.connect('mqtt://'+ thingsboardHost, { username: accessToken });			
}

function onDisconnect(){
    console.log('MQTT disconnect!');            
 }

 function onConnect(){
    console.log('MQTT connected!'); 
	client.on('disconnect', connectMQTT);
	client.on('connect', onConnect);
	client.on('close', onClose);
	client.on('error', onError);		
 }

 function onDisconnect(){
    console.log('MQTT disconnect!');            
 }

function onClose(){
    console.log('MQTT close!'); 
 }

function onError(err){
    console.log('MQTT Error!'+err);        
 }

//Catches ctrl+c event
process.on('SIGINT', function () {
    console.log();
    console.log('Disconnecting...');
    client.end();
    console.log('Exited!');
    process.exit(2);
});

//Catches uncaught exceptions
process.on('uncaughtException', function(e) {
    console.log('Uncaught Exception...');
    console.log(e.stack);
    process.exit(99);
});


// Read data that is available but keep the stream from entering "flowing mode"
port.on('readable', function () {
  var n;
  var deviceID;
  var payload;
  inStr+=port.read().toString('utf8');
  n = inStr.search("a"); //start charachter for llap message
  if (n>0) inStr = inStr.substring(n, inStr.length); //chop off data preceding start charachter
  if (inStr.length>=12){ //we have an llap message!
    while (inStr!=""){
		data.command=""
		llapMsg=inStr.substring(1,12);
		console.log(llapMsg);
		data.deviceID=llapMsg.substring(0,2);
		if (llapMsg.substring(2,6)=="TMPA") {
			data.value=llapMsg.substring(6,13);
			data.command="TMP";
		}
		if (llapMsg.substring(2,6)=="TMPB") {
			data.value=llapMsg.substring(6,13);
			data.command="TMP";
		}
		if (llapMsg.substring(2,5)=="HUM") {
			data.value=llapMsg.substring(5,13);
			data.command="HUM";
		}
		if (llapMsg.substring(2,6)=="TMPC") {
			data.value=llapMsg.substring(6,13);
			data.command="TMP";
		}
		if (llapMsg.substring(2,8)=="BUTTON") {
			data.value=llapMsg.substring(8,13);
			data.command="BUTTON";
		}
		if (llapMsg.substring(2,10)=="SLEEPING") {
			data.value="";
			data.command="SLEEPING";
		}
	    if (llapMsg.substring(2,7)=="AWAKE") {
			data.value="";
			data.command="AWAKE";
		}
		if (llapMsg.substring(2,6)=="BATT") {
			data.value=llapMsg.substring(6,13);
			data.command="BATT";
		}
		if (llapMsg.substring(2,9)=="STARTED"){
			data.value="";
			data.command="STARTED";
		} 
		if (data.command!=""){
			data.value.replace('-',' ');
			data.value.trim();
			if (Fahrenheit){
				if (data.command=="TMP"){
					data.value=data.value*1.8+32;
					data.value=data.value.toFixed(2);
				}
			}
			accessToken=lookupToken(data.deviceID, data.command);
			if (accessToken!=-1){
				connectMQTT();
				client.publish('v1/devices/me/telemetry', JSON.stringify(data));
				console.log(JSON.stringify(data));
				console.log('Connecting to: %s using access token: %s', thingsboardHost, accessToken);
			}
			else {
				console.log("Message not sent because not in lookup table");
			}
		}
		if (inStr.length>12) 
			inStr=inStr.substring(12,inStr.length);
		else
			inStr="";
	  }  
  }
});


port.on('error', function(err) {
  console.log('Error: ', err.message);
});




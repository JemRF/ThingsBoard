 /*rf2gciot.js Interface between RF Module serial interface and Google Cloud IoT Core
---------------------------------------------------------------------------------                                                                               
 J. Evans May 2018
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN 
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.                                                       
 
 Adapted from the Google Cloud Quick Startup https://cloud.google.com/iot/docs/quickstart
 
 Revision History                                                                  
 V1.00 - Release
 
 -----------------------------------------------------------------------------------
*/
 
'use strict';

//Set Fahrenheit=0 display in centigrade
const Fahrenheit=0;

//Library used for serial port access
var SerialPort = require('serialport');
var port = new SerialPort('/dev/ttyAMA0');

var inStr="";

var data = {
	deviceID: "",
    command: "",
    value: ""
};
// [START iot_mqtt_include]
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mqtt = require('mqtt');
// [END iot_mqtt_include]

// The initial backoff time after a disconnection occurs, in seconds.
var MINIMUM_BACKOFF_TIME = 1;

// The maximum backoff time before giving up, in seconds.
var MAXIMUM_BACKOFF_TIME = 32;

// Whether to wait with exponential backoff before publishing.
var shouldBackoff = false;

// The current backoff time.
var backoffTime = 1;

// Whether an asynchronous publish chain is in progress.
var publishChainInProgress = false;

console.log('Google Cloud IoT Core MQTT example.');
var argv = require(`yargs`)
  .options({
    projectId: {
      default: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
      description: 'The Project ID to use. Defaults to the value of the GCLOUD_PROJECT or GOOGLE_CLOUD_PROJECT environment variables.',
      requiresArg: true,
      type: 'string'
    },
    cloudRegion: {
      default: 'us-central1',
      description: 'GCP cloud region.',
      requiresArg: true,
      type: 'string'
    },
    registryId: {
      description: 'Cloud IoT registry ID.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    deviceId: {
      description: 'Cloud IoT device ID.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    privateKeyFile: {
      description: 'Path to private key file.',
      requiresArg: true,
      demandOption: true,
      type: 'string'
    },
    algorithm: {
      description: 'Encryption algorithm to generate the JWT.',
      requiresArg: true,
      demandOption: true,
      choices: ['RS256', 'ES256'],
      type: 'string'
    },
    numMessages: {
      default: 100,
      description: 'Number of messages to publish.',
      requiresArg: true,
      type: 'number'
    },
    tokenExpMins: {
      default: 20,
      description: 'Minutes to JWT token expiration.',
      requiresArg: true,
      type: 'number'
    },
    mqttBridgeHostname: {
      default: 'mqtt.googleapis.com',
      description: 'MQTT bridge hostname.',
      requiresArg: true,
      type: 'string'
    },
    mqttBridgePort: {
      default: 8883,
      description: 'MQTT bridge port.',
      requiresArg: true,
      type: 'number'
    },
    messageType: {
      default: 'events',
      description: 'Message type to publish.',
      requiresArg: true,
      choices: ['events', 'state'],
      type: 'string'
    }
  })
  .example(`node $0 cloudiot_mqtt_example_nodejs.js --projectId=blue-jet-123 \\\n\t--registryId=my-registry --deviceId=my-node-device \\\n\t--privateKeyFile=../rsa_private.pem --algorithm=RS256 \\\n\t --cloudRegion=us-central1`)
  .wrap(120)
  .recommendCommands()
  .epilogue(`For more information, see https://cloud.google.com/iot-core/docs`)
  .help()
  .strict()
  .argv;

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
  
// Create a Cloud IoT Core JWT for the given project id, signed with the given
// private key.
// [START iot_mqtt_jwt]
function createJwt (projectId, privateKeyFile, algorithm) {
  // Create a JWT to authenticate this device. The device will be disconnected
  // after the token expires, and will have to reconnect with a new token. The
  // audience field should always be set to the GCP project id.
  const token = {
    'iat': parseInt(Date.now() / 1000),
    'exp': parseInt(Date.now() / 1000) + 20 * 60, // 20 minutes
    'aud': projectId
  };
  const privateKey = fs.readFileSync(privateKeyFile);
  return jwt.sign(token, privateKey, { algorithm: algorithm });
}
// [END iot_mqtt_jwt]

// [START iot_mqtt_run]
// The mqttClientId is a unique string that identifies this device. For Google
// Cloud IoT Core, it must be in the format below.
const mqttClientId = `projects/${argv.projectId}/locations/${argv.cloudRegion}/registries/${argv.registryId}/devices/${argv.deviceId}`;

// With Google Cloud IoT Core, the username field is ignored, however it must be
// non-empty. The password field is used to transmit a JWT to authorize the
// device. The "mqtts" protocol causes the library to connect using SSL, which
// is required for Cloud IoT Core.
let connectionArgs = {
  host: argv.mqttBridgeHostname,
  port: argv.mqttBridgePort,
  clientId: mqttClientId,
  username: 'unused',
  password: createJwt(argv.projectId, argv.privateKeyFile, argv.algorithm),
  protocol: 'mqtts',
  secureProtocol: 'TLSv1_2_method'
};

// The MQTT topic that this device will publish data to. The MQTT
// topic name is required to be in the format below. The topic name must end in
// 'state' to publish state and 'events' to publish telemetry. Note that this is
// not the same as the device registry's Cloud Pub/Sub topic.
const mqttTopic = `/devices/${argv.deviceId}/${argv.messageType}`;
const messagesSent=1
const payload = `${argv.registryId}/${argv.deviceId}-payload-${messagesSent}`;

let client = mqtt.connect(connectionArgs);

client.on('connect', (success) => {
  console.log('connect');
  if (!success) {
    console.log('Client not connected...');
  }
});

client.on('close', () => {
  console.log('close');
  shouldBackoff = true;
});

client.on('error', (err) => {
  console.log('error', err);
});

client.on('message', (topic, message, packet) => {
  console.log('message received: ', Buffer.from(message, 'base64').toString('ascii'));
});

client.on('packetsend', () => {
  // Note: logging packet send is very verbose
});

// Once all of the messages have been published, the connection to Google Cloud
// IoT will be closed and the process will exit.
// [END iot_mqtt_run]

// Read data that is available but keep the stream from entering "flowing mode"
port.on('readable', function () {
  var n;
  var deviceID;
  var payload;
  var jsonData;
  var llapMsg;
  
  inStr+=port.read().toString('utf8');
  n = inStr.search("a"); //start charachter for llap message
  if (n>0) inStr = inStr.substring(n, inStr.length); //chop off data preceding start charachter
  if (inStr.length>=12){ //we have an llap message!
    while (inStr!=""){
		data.command="";
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
			jsonData="{'"+data.deviceID+data.command+"':"+data.value+"}";
			console.log(jsonData);
			// Create a client, and connect to the Google MQTT bridge.
			let client = mqtt.connect(connectionArgs);

			client.publish(mqttTopic, jsonData, { qos: 1 }, function (err) {
			if (err) {
			  console.log('Error publishing message:', err);
			}
			client.end();
			}); 			
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


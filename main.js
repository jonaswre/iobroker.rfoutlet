/**
 *
 * rfoutlet adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "rfoutlet",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.0.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js rfoutlet Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "name <mail@rfoutlet.com>"
 *          ]
 *          "desc":         "rfoutlet adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *      }
 *  }
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

// imports
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils
var rpi433    = require('rpi-433');
var Queue = require('better-queue');
var async = require('async');
var sleep = require('sleep-async')();

//init
var rfSniffer = rpi433.sniffer({
    pin: 2,                     //Snif on GPIO 2 (or Physical PIN 13)
    debounceDelay: 500          //Wait 500ms before reading another code
});

var rfEmitter = rpi433.emitter({
    pin: 0,                     //Send through GPIO 0 (or Physical PIN 11)
    pulseLength: 350            //Send the code with a 350 pulse length
});

var q = new Queue(runTask, {id: 'id'});

var adapter = new utils.Adapter('rfoutlet');


//functions
function normSignal(input) {
    input = Number(input);
    return input|(1<<4)-1;
}

function sniff(data) {
    var count = 0;
    adapter.getForeignObjects('rfoutlet.*.*', 'state', function (err, objs) {
        var norm_code = normSignal(data.code);
        var count = 0;
        for (var id in objs) {
            count++;
            var common = objs[id]['common'];
            var norm_on_code = normSignal(common['on_code']);
            if(data.code == common['on_code'] || data.code == common['off_code']) {
                q.cancel(id);
                return;
            }
            if(norm_code ===  norm_on_code) {
                objs[id]['common']['off_code'] = data.code;
                adapter.setForeignObject(id, objs[id]);
                return;
            }
        }
        var nr = count+1;
        adapter.setObject("outlet"+ nr, {
            type: 'state',
            common: {
                name: "outlet"+ nr,
                type: 'boolean',
                role: 'outlet',
                on_code: data.code,
                off_code: '',
                pulseLength: data.pulseLength
            },
            native: {}
        });
    });
}

function runTask (task, cb) {
    var abort = false;
    var count = 0;
    adapter.log.warn("["+ task.id + "] [Code] --> "+ task.code + ' (' + task.pulseLength+ ') {'+count+'}');
    rfEmitter.sendCode(task.code, {pulseLength:task.pulseLength});
    async.forever(function (next) {
        sleep.sleep(2000, function () {
            count++;
            if(abort) {
                next(true);
            } else if (count > 10) {
                adapter.log.error(task.id + " not recieved!!")
                next(true);
            } else {
                adapter.log.warn("["+ task.id + "] [Code] --> "+ task.code + ' (' + task.pulseLength+ ') {'+count+'}');
                rfEmitter.sendCode(task.code, {pulseLength:task.pulseLength});
                next();
            }
        });
    }, function (err) {
        cb(null,true);
    });
    return {
        cancel: function () {
            adapter.log.warn("["+ task.id + "] [Code] <-- "+ task.code + ' (' + task.pulseLength+ ')');
            adapter.setState(task.id, {ack: true});
            abort = true;
            cb(null,true);
        }
    }
}

//event handler
// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
// gets object data, and then sends on or off code.
adapter.on('stateChange', function (id, state) {
    adapter.getForeignObject(id, function (err, obj) {
        var rfid = id;
        var common = obj['common'];
        var rfcode;
        var rfpulseLength = common['pulseLength'];
        if (state && !state.ack) {
            if(state.val) {
                rfcode = common['on_code'];
            } else {
                rfcode = common['off_code'];
            }
            if(String(rfcode) !== "") {
                q.push({'id': rfid, 'code': rfcode, 'pulseLength': rfpulseLength});
            } else {
                adapter.log.error("Code in ["+ rfid +"] is empty!");
            }
        }
    });
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function main() {
    rfSniffer.on('data', sniff);

    // in this rfoutlet all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });
}

//var rpi433    = require('rpi-433');
var Queue = require('better-queue');
var asyc = require('async');
var sleep = require('sleep-async')();

function send(code, pulse) {
    console.log("Started"+ code + ' ' + pulse);
}

var q = new Queue(function (task, cb) {
    var abort = false;
    asyc.forever(function (next) {
        sleep.sleep(1000, function () {
            if(abort) {
                next(true);
            } else {
                send(83029,360);
                next();
            }
        });
    });
    return {
        cancel: function () {
            abort = true;
        }
    }
},{id: 'id', cancelIfRunning: true});


/*var rfSniffer = rpi433.sniffer({
    pin: 2,                     //Snif on GPIO 2 (or Physical PIN 13)
    debounceDelay: 500          //Wait 500ms before reading another code
});

var rfEmitter = rpi433.emitter({
    pin: 0,                     //Send through GPIO 0 (or Physical PIN 11)
    pulseLength: 350            //Send the code with a 350 pulse length
});*/

q.push({'id': 'test', 'code': 83029, 'pulseLength': 360});
console.log(q.getStats().total);
sleep.sleep(10000,function () {
    console.log("Hallo");
    q.cancel('test');
    console.log(q.getStats().total);
});

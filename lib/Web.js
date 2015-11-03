var config = require('./Config');
var express = require('express');
var _ = require('lodash');
var pushAssociations = require('./PushAssociations');
var push = require('./PushController');
var mongodb = require('mongodb');

var app = express();
//mongodb module
var LoginDB;
mongodb.MongoClient.connect("mongodb://iseeking101:iseeking2015@ds027318.mongolab.com:27318/iseeking", function(err, db) {
    if (err) {
        console.log(err);
    } else {
        LoginDB = db;
        console.log('mongodbMe connection success');
    }
});
// Middleware
app.use(express.compress());
app.use(express.bodyParser());

app.use(express.static(__dirname + '/../public'));

app.use(function(err, req, res, next) {
    res.status(500);
    res.render('error', { error: err });
});

app.post('/*', function (req, res, next) {
    if (req.is('application/json')) {
        next();
    } else {
        res.status(406).send({'desc': 'wrong Content-Type in header'});
    }
});

// Main API
app.post('/subscribe', function (req, res) {
    var deviceInfo = req.body;
    push.subscribe(deviceInfo);

    res.status(200).send({'desc' : 'ok'});
});

app.post('/unsubscribe', function (req, res) {
    var data = req.body;

    if (data.user) {
        push.unsubscribeUser(data.user);
    } else if (data.token) {
        push.unsubscribeDevice(data.token);
    } else {
        return res.status(503).send({});
    }

    res.status(200).send({'desc' : 'ok'});
});

app.post('/send', function (req, res) {
    //req.body.longitude,req.body.latitude
    var nearbyUser =new Array();
    var longitude = parseFloat(req.body.longitude);
    var latitude = parseFloat(req.body.latitude);
    var collection = LoginDB.collection('login'); 
    var leftLongitude = longitude-0.2;
    var rightLongitude = longitude + 0.2;
    var leftLatitude = latitude - 0.2;
    var rightLatitude = latitude +0.2; 
    //console.log("leftLongitude = "+leftLongitude +" rightLongitude = "+ rightLongitude
    //    + " leftLatitude = "+leftLatitude +" rightLatitude = " + rightLatitude); 
    //查詢user位置是否在範圍內 將user 帳號擺入陣列
    var where = {"detail.longitude":{"$gt":leftLongitude,"$lt":rightLongitude},"detail.latitude":{"$gt":leftLatitude,"$lt":rightLatitude}};
    collection.find(where).toArray(function(err,docs){
        if(err){
            console.log(err);
            return err;
        }else{
            for(var i = 0 ; i< docs.length ; i++){
                console.log(docs[i].user);
                nearbyUser.push(docs[i].user); 
            }
            var notifsv = [{
            "users" : nearbyUser,
            "android" : {
                "collapseKey":"optional",
                "data" : {
                    "user" : "d",
                    "message" : "you message here"
                }
                
            },
            "ios" : {
                "badge": 0,
                "alert": "Your message here",
                "sound": "soundName"
            }
        }];
            var notificationsValid = sendNotifications(notifsv);
            res.status(notificationsValid ? 200 : 400).send({});
        }

    }); 
    
    //var notificationsValid = sendNotifications(notifsv);
    //res.status(notificationsValid ? 200 : 400).send({});
});

app.post('/sendBatch', function (req, res) {
    var notifs = req.body.notifications;

    var notificationsValid = sendNotifications(notifs);

    res.status(notificationsValid ? 200 : 400).send({});
});

// Utils API
app.get('/users/:user/associations', function (req, res) {
    pushAssociations.getForUser(req.params.user, function (err, items) {
        if (!err) {
            res.send({"associations": items});
        } else {
            res.status(503).send({});
        }
    });
});

app.get('/users', function (req, res) {
    pushAssociations.getAll(function (err, pushAss) {
        if (!err) {
            var users = _(pushAss).map('user').unique().value();
            res.send({
                "users": users
            });
        } else {
            res.status(503).send({})
        }
    });
});

app.delete('/users/:user', function (req, res) {
    pushController.unsubscribeUser(req.params.user);
    res.send({'desc': 'ok'});
});


// Helpers
function sendNotifications(notifs) {
    var areNotificationsValid = _(notifs).map(validateNotification).min().value();

    if (!areNotificationsValid) return false;

    notifs.forEach(function (notif) {
        var users = notif.users,
            androidPayload = notif.android,
            iosPayload = notif.ios,
            target;
        if (androidPayload && iosPayload) {
            target = 'all'
        } else if (iosPayload) {
            target = 'ios'
        } else if (androidPayload) {
            target = 'android';
        }

        var fetchUsers = users ? pushAssociations.getForUsers : pushAssociations.getAll,
            callback = function (err, pushAssociations) {
                if (err) return;

                if (target !== 'all') {
                    // TODO: do it in mongo instead of here ...
                    pushAssociations = _.where(pushAssociations, {'type': target});
                }

                push.send(pushAssociations, androidPayload, iosPayload);
            },
            args = users ? [users, callback] : [callback];

        // TODO: optim. -> mutualise user fetching ?
        fetchUsers.apply(null, args);
    });

    return true;
}
function getNearbyUser(longitude,laititude){
    //mongodb util
    var nearbyUser =new Array();
    var collection = LoginDB.collection('login'); 
    var leftLongitude = longitude -0.2;
    var rightLongitude = longitude + 0.2;
    var leftLatitude = laititude - 0.2;
    var rightLatitude = laititude +0.2; 
    //console.log("leftLongitude = "+leftLongitude +" rightLongitude = "+ rightLongitude
    //    + " leftLatitude = "+leftLatitude +" rightLatitude = " + rightLatitude); 
    var where = {"detail.longitude":{"$gt":leftLongitude,"$lt":rightLongitude},"detail.latitude":{"$gt":leftLatitude,"$lt":rightLatitude}};
    collection.find(where).toArray(function(err,docs){
        if(err){
            console.log(err);
            return err;
        }else{
            for(var i = 0 ; i< docs.length ; i++){
                nearbyUser.push(docs[i].user); 
            }
            console.log("push nearbyUser = "+ nearbyUser);
            return nearbyUser;
        }

    });  
    
};

function validateNotification(notif) {
    var valid = true;

    valid = valid && (!!notif.ios || !!notif.android);
    // TODO: validate content

    return valid;
}

exports.start = function () {
    //app.listen(config.get('webPort'));
	//process.env.PORT = 3000;
    app.listen(process.env.PORT);
    console.log('Listening on port ' + process.env.PORT + "...");
};

'use strict';

var Boom = require('boom');
var concat = require('concat-stream');
var OVouch = require('ovouch');
var crypto = require('crypto');

var conf = require('./conf');

var db = require('./db').register('contacts');
var auth = require('./auth');
var utils = require('./utils');

var ovouch = {};

exports.initialize = function() {
  var rs = db.createReadStream({
    gte: 'user!',
    lte: 'user!\xff'
  });

  rs.pipe(concat(function(users) {
    users.forEach(function(user) {
      ovouch[user.uid] = new OVouch();
      ovouch[user.uid].vouchMin = user.count || 1;
    });
  }));

  rs.on('error', function(err) {
    throw err;
  });
};

exports.setOwnVouch = function(count, uid, next) {
  count = parseInt(count, 10);

  ovouch[uid] = new OVouch();

  if (isNaN(count) || count < 1) {
    count = 1;
  }

  ovouch[uid].vouchMin = count;

  db.put('user!' + uid, {
    uid: uid,
    vouchPreference: count
  }, function(err) {
    if (err) {
      return next(err);
    }

    next(null, true);
  });
};

exports.add = function(request, reply) {
  var uid = request.payload.id; // your uid
  var number = utils.cleanNumber(request.payload.number);
  var cid = crypto.createHash('sha1')
                  .update(conf.get('phoneSalt') + number)
                  .digest('hex'); // contact's uid

  if (!ovouch[uid]) {
    ovouch[uid] = new OVouch();
  }

  ovouch[uid].addToTrustedNetwork(cid, {});

  db.put('trustednetwork!' + uid, ovouch[uid].trustedNetwork, function(err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    reply({
      message: 'added user to trusted network'
    });
  });
};

exports.addFromNetwork = function(request, reply) {
  var uid = request.payload.id; // your uid
  var cid = request.payload.cid; // contact's uid

  if (!ovouch[uid]) {
    ovouch[uid] = new OVouch();
  }

  ovouch[uid].addToTrustedNetwork(cid, {});

  db.put('trustednetwork!' + uid, ovouch[uid].trustedNetwork, function(err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    reply({
      message: 'added user to trusted network'
    });
  });
};

exports.getTrustedNetwork = function(request, reply) {
  var uid = request.payload.id;

  db.get('trustednetwork!' + uid, function(err, network) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var networkArr = [];
    var count = 0;
    console.log('getting trusted network ', network);
    for (var key in network) {
      count ++;
      auth.db().get('user!' + key, function(err, user) {
        if (!err && user) {
          networkArr.push({
            id: user.id,
            name: user.name,
            avatar: user.avatar
          });
        }

        if (count === Object.keys(network).length) {
          console.log(networkArr)
          reply({
            users: networkArr
          });
        }
      });
    }
  });
};

function updateNetwork(uid, ovouch) {
  for (var key in ovouch[uid].trustedNetwork) {
    console.log(key, ovouch[key].network);
    db.put('network!' + key, ovouch[key].network);
  }
}

exports.db = function() {
  return db;
};

exports.vouch = function(request, reply) {
  var uid = request.payload.uid; // your uid
  var cid = request.payload.cid; // contact's uid

  // first param is the person to vouch, second is who is vouching
  ovouch[uid].addVouch(cid, uid);
  updateNetwork(uid, ovouch);
};

exports.vouch = function(request, reply) {
  var uid = request.payload.uid; // your uid
  var cid = request.payload.cid; // contact's uid

  // first param is the person to unvouch, second is who is unvouching
  ovouch[uid].removeVouch(cid, uid);
  updateNetwork(uid, ovouch);
};

exports.recommended = function(request, reply) {
  var uid = request.params.uid;

  reply({
    users: ovouch[uid].network
  });
};
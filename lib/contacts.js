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
  console.log('adding contact', request.payload);
  var uid = request.payload.uid; // your uid
  var number = request.payload.number.trim();
  var cid = crypto.createHash('sha1')
                  .update(conf.get('phoneSalt') + number)
                  .digest('hex'); // contact's uid

  ovouch[uid].addToTrustedNetwork(cid, {});

  db.put('trustednetwork!' + uid, ovouch[uid].trustedNetwork, function(err) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }
    console.log('trusted network: ', ovouch[uid].trustedNetwork);
    reply({
      message: 'added user to trusted network'
    });
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
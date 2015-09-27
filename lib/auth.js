'use strict';

var TwilioParty = require('twilio-party');
var uuid = require('uuid');
var Boom = require('boom');
var conf = require('./conf');
var uuid = require('uuid');

var dbs = require('./db');
var db = dbs.register('users');
var utils = require('./utils');
var contacts = require('./contacts');

var tp = new TwilioParty(conf.get('twilioSID'), conf.get('twilioToken'),
                         conf.get('twilioNumber'), conf.get('phoneSalt'));

exports.db = function() {
  return db;
};

exports.verify = function(request, reply) {
  console.log('verifying... ', request.payload.pin, request.payload.phone)
  var phone = utils.cleanNumber(request.payload.phone);
  var validate = tp.validatePin(phone, request.payload.pin);

  if (!validate) {
    return reply(Boom.wrap(new Error('Invalid PIN', 400)));
  }

  var user = {
    id: validate,
    lastSignin: new Date().getTime(),
    apiKey: uuid.v4(),
    name: ''
  };

  var batch = [
    {
      type: 'put',
      key: 'user!' + validate,
      value: user
    },
    {
      type: 'put',
      key: 'api!' + user.id,
      value: user.apiKey
    }
  ];

  db.batch(batch, function(err) {
    if (err) {
      return reply(Boom.wrap(new Error('Could not save user data', 400)));
    }

    reply(user);
  });
};

exports.authenticate = function(request, reply) {
  var phone = utils.cleanNumber(request.payload.phone);

  tp.addNumber(phone, function(err) {
    if (err) {
      return reply(Boom.wrap(new Error('Could not authenticate', 400)));
    }

    phone = utils.cleanNumber(phone);

    db.put('user!' + tp.numberList[phone].hashed, {
      id: tp.numberList[phone].hashed,
      lastSignin: false,
      name: ''
    }, function(err) {
      if (err) {
        return reply(Boom.wrap(new Error('Could not save user data', 400)));
      }

      reply({
        phone: phone
      });
    });
  });
};

exports.profile = function(request, reply) {
  var apiKey = request.payload.apiKey;
  var name = request.payload.name.trim();
  var id = request.payload.id;

  var profileData = {
    id: id,
    name: name,
    avatar: request.payload.avatar || '',
    lastSignin: new Date().getTime(),
    apiKey: apiKey
  };

  db.put('user!' + id, profileData, function(err) {
    if (err) {
      console.log('!! ', err)
      return reply(Boom.wrap(new Error('Could not save user data', 400)));
    }

    contacts.setOwnVouch(count, id, function(err) {
      if (err) {
        return reply(Boom.wrap(new Error('Could not save vouch data', 400)));
      }
      console.log(profileData)
      reply(profileData);
    });
  });
};

exports.api = function(payload, next) {
  var apiKey = payload.apiKey;
  var id = payload.id;

  db.get('api!' + id, function(err, key) {
    if (key == apiKey) {
      return next(null, true);
    }

    next(new Error('Invalid key'));
  });
};

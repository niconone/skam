'use strict';

var conf = require('./conf');

var ctx = {
  analytics: conf.get('analytics')
};

exports.home = function(request, reply) {
  reply.view('index', ctx);
};

exports.privacy = function(request, reply) {
  reply.view('privacy', ctx);
};

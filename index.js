'use strict';

var Hapi = require('hapi');
var conf = require('./lib/conf');
var Joi = require('joi');
var Boom = require('boom');
var http = require('http');

var views = require('./lib/views');
var auth = require('./lib/auth');
var posts = require('./lib/posts');

var server = new Hapi.Server();

server.connection({
  host: conf.get('domain'),
  port: conf.get('port')
});

server.views({
  engines: {
    jade: require('jade')
  },
  isCached: process.env.node === 'production',
  path: __dirname + '/views',
  compileOptions: {
    pretty: true
  }
});

var routes = [
  {
    method: 'GET',
    path: '/',
    handler: views.home
  },
  {
    method: 'GET',
    path: '/privacy',
    handler: views.privacy
  },
  {
    method: 'POST',
    path: '/authenticate',
    handler: auth.authenticate
  },
  {
    method: 'POST',
    path: '/verify',
    handler: auth.verify
  },
  {
    method: 'POST',
    path: '/post/add',
    handler: posts.add
  },
  {
    method: 'GET',
    path: '/feed/{uid}',
    handler: posts.feedByNetwork
  },
  {
    method: 'POST',
    path: '/api',
    handler: auth.api
  }
];

server.route(routes);

server.route({
  path: '/{p*}',
  method: 'GET',
  handler: {
    directory: {
      path: './public',
      listing: false,
      index: false
    }
  }
});

server.ext('onPreResponse', function(request, reply) {
  var response = request.response;
  if (!response.isBoom) {
    if (['/post/add', '/feed'].indexOf(request.path) > -1) {
      auth.api(request.payload || request.params, function(err) {
        if (err) {
          return reply(Boom.wrap(err, 403));
        }
      });
    }

    return reply.continue();
  }

  var error = response;
  var ctx = {};

  var message = error.output.payload.message;
  var statusCode = error.output.statusCode || 500;
  ctx.code = statusCode;
  ctx.httpMessage = http.STATUS_CODES[statusCode].toLowerCase();

  switch (statusCode) {
    case 404:
      ctx.reason = 'page not found';
      break;
    case 403:
      ctx.reason = 'forbidden';
      break;
    case 500:
      ctx.reason = 'something went wrong';
      break;
    default:
      break;
  }

  if (process.env.npm_lifecycle_event === 'dev') {
    console.log(error.stack || error);
  }

  if (ctx.reason) {
    // Use actual message if supplied
    ctx.reason = message || ctx.reason;
    return reply.view('error', ctx).code(statusCode);
  } else {
    ctx.reason = message.replace(/\s/gi, '+');
    reply.redirect(request.path + '?err=' + ctx.reason);
  }
});

server.start(function (err) {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
});

exports.getServer = function () {
  return server;
};

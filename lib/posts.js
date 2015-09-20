'use strict';

var Boom = require('boom');
var concat = require('concat-stream');
var conf = require('./conf');

var crypto = require('crypto');

var MAX_LIMIT = 10;

var db = require('./db').register('posts');

exports.add = function(request, reply) {
  var time = new Date().getTime();
  var uid = request.payload.id;
  var link = request.payload.link;
  var comment = request.payload.comment;
  var backgroundSource = request.payload.backgroundSource;

  if (!link) {
    var err = new Error('Link cannot be empty');
    return reply(Boom.wrap(err, 400));
  }

  var postid = Math.floor(time / 1000) + '-' + crypto.randomBytes(1).toString('hex');

  var postItem = {
    pid: postid,
    uid: uid,
    link: link,
    created: time,
    comment: comment || '',
    backgroundSource: backgroundSource || ''
  };

  var batch = [
    {
      type: 'put',
      key: 'user!' + uid + '!' + postid,
      value: postItem
    },
    {
      type: 'put',
      key: 'post!' + postid,
      value: postItem
    }
  ];

  db.batch(batch, function (err) {
    if (err) {
      console.log('err ', err)
      return reply({
        error: 'Could not save post'
      }, 400);
    }
    console.log('saved')
    reply({
      message: 'Post saved'
    });
  });
};

exports.feedByNetwork = function (request, reply) {
  var rs = db.createValueStream({
    gte: 'post!',
    lte: 'post!\xff',
    limit: MAX_LIMIT,
    reverse: true
  });

  rs.pipe(concat(function (posts) {
    console.log(posts.length)
    return reply({
      posts: posts
    });
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.del = function (request, reply) {
  var uid = request.payload.id;
  var postid = request.payload.pid;

  var batch = [
    {
      type: 'del',
      key: 'user!' + uid + '!' + postid
    },
    {
      type: 'del',
      key: 'post!' + postid
    }
  ];

  db.batch(batch, function (err) {
    if (err) {
      return reply(Boom.wrap(new Error('Could not delete post', 400)));
    }
    console.log('deleted')
    reply({
      message: 'Post deleted'
    });
  });
};

'use strict';

var Boom = require('boom');
var concat = require('concat-stream');
var conf = require('./conf');

var ctx = {
  analytics: conf.get('analytics')
};

var crypto = require('crypto');

var MAX_LIMIT = 20;

var db = require('./db').register('posts');

exports.add = function(request, reply) {
  var time = new Date().getTime();
  var uid = request.payload.id;
  var link = request.payload.link;
  var comment = request.payload.comment;
  var backgroundSource = request.payload.backgroundSource;
  var avatar = request.payload.avatar;
  var name = request.payload.name;

  if (!link) {
    var err = new Error('Link cannot be empty');
    return reply(Boom.wrap(err, 400));
  }

  // youtube id
  link = 'http://www.youtube.com/embed/' + link.split('?v=')[1].split('&')[0];

  var postid = Math.floor(time / 1000) + '-' + crypto.randomBytes(1).toString('hex');

  var postItem = {
    pid: postid,
    uid: uid,
    link: link,
    created: time,
    comment: comment || '',
    backgroundSource: backgroundSource || '',
    avatar: avatar,
    name: name
  };

  var batch = [
    {
      type: 'put',
      key: 'user!' + uid + '!' + postid,
      value: postItem
    },
    {
      type: 'put',
      key: 'post!' + uid + '!' + postid,
      value: postItem
    }
  ];

  db.batch(batch, function(err) {
    if (err) {
      console.log('err ', err)
      return reply({
        error: 'Could not save post'
      }, 400);
    }

    reply({
      key: postid,
      value: postItem
    });
  });
};

exports.feedByNetwork = function(request, reply) {
  var rs = db.createReadStream({
    keys: true,
    gte: 'post!' + request.params.uid + '!',
    lte: 'post!' + request.params.uid + '!\xff',
    limit: MAX_LIMIT,
    reverse: true
  });

  rs.pipe(concat(function(posts) {
    var replyFormat;

    if (request.headers['content-type'] === 'application/json') {
      replyFormat = reply({
        posts: posts
      });
    } else {
      ctx.posts = posts;
      replyFormat = reply.view('feed', ctx);
    }

    return replyFormat;
  }));

  rs.on('error', function(err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.del = function(request, reply) {
  var uid = request.payload.id;
  var postid = request.payload.pid;

  var batch = [
    {
      type: 'del',
      key: 'user!' + uid + '!' + postid
    },
    {
      type: 'del',
      key: 'post!' + uid + '!' + postid
    }
  ];

  db.batch(batch, function(err) {
    if (err) {
      return reply(Boom.wrap(new Error('Could not delete post', 400)));
    }

    reply({
      message: 'Post deleted'
    });
  });
};

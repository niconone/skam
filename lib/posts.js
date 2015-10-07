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
var contacts = require('./contacts');

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
  if (link.indexOf('youtu.be') > -1) {
    link = 'http://www.youtube.com/embed/' + link.split('.be/')[1].split('&')[0];
  } else {
    link = 'http://www.youtube.com/embed/' + link.split('?v=')[1].split('&')[0];
  }

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

  function save() {
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
  }

  contacts.db().get('trustednetwork!' + uid, function(err, network) {
    if (err) {
      // no network created yet
      save();
    } else {
      console.log('trusted network listing ', network);
      for (var key in network) {
        batch.push({
          type: 'put',
          key: 'post!' + key + '!' + postid,
          value: postItem
        });
      }

      contacts.db().get('network!' + uid, function(err, network) {
        if (err) {
          save();
        } else {
          console.log('network listing ', network);
          for (var key in network) {
            batch.push({
              type: 'put',
              key: 'network!' + key + '!' + postid,
              value: postItem
            });
          }

          save();
        }
      });
    }
  });
};

exports.network = function(request, reply) {
  var uid = request.payload.id;

  var rs = db.createReadStream({
    keys: true,
    gte: 'network!' + request.params.uid + '!',
    lte: 'network!' + request.params.uid + '!\xff',
    limit: MAX_LIMIT,
    reverse: true
  });

  rs.pipe(concat(function(posts) {
    var replyFormat;

    return reply({
      posts: posts
    });
  }));

  rs.on('error', function(err) {
    return reply(Boom.wrap(err, 400));
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

exports.feedByUser = function(request, reply) {
  var rs = db.createReadStream({
    keys: true,
    gte: 'user!' + request.payload.cid + '!',
    lte: 'user!' + request.payload.cid + '!\xff',
    limit: MAX_LIMIT,
    reverse: true
  });

  rs.pipe(concat(function(posts) {
    var replyFormat;

    return reply({
      posts: posts
    });
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

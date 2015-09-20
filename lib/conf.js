// Put this in a module so that it's only ever done one time.
// Otherwise, settings get overwritten each time, making testing
// harder.
var nconf = require('nconf');
nconf.argv().env().file({ file: 'config.json' });

nconf.defaults({
  port: 3000,
  cookie: 'secret',
  ops: []
});

module.exports = nconf;

const tcp = require('./tcp.js');
const exception = require('./exception.js');

//export default tcp;
module.exports = {
  tcp,
  exception,
};

/*
export default {
  startServer: tcp.startServer,
  closeServer: tcp.closeServer,
  startClient: tcp.startClient,
  getRtu: tcp.getRtu,
};
*/

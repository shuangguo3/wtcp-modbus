

/*
socket标记为 client 或者server模式

client，必须提前先connect

并建立socket结构

默认为serner模式，如果没有socket结构，表示需要等待对方主动连接

如果socket关闭，设置socket结构 isclosed 为true

增加exception tcpnotinit

tcp主动listen或者connect
*/

// modbus rtu over tcp通信实现
// 既可作为tcp server，也可以作为tcp client，连接后的tcp socket通道作为modbus通信通道

const net = require('net');

class tcp {

  constructor() {

    // 初始化socket列表
    /**
     * 保存socket通道信息（用于modbus通信）
     * 通过ip和port，唯一标识一个socket通道，在server模式和client模式下有区分
     * 如果是server模式，使用client的ip和port标识
     * 如果是client模式，使用server的ip和port标识
     * 【重要】ip和port不区分是server或client，只是标识对端的唯一信息
     * server和client可以同时存在，即作为server的等待其他client连接的同时，可以连接其他server
     */
    this.socketList = {};

    this.rtuList = {};
  }

  // 设置关联的rtu
  setRtu(connectionId, rtu) {
    this.rtuList[connectionId] = rtu;
  }

  // 发送modbus请求
  sendRequest(connectionId, requestBuf) {

    const socketInfo = this.socketList[connectionId];

    // 通过tcp sock通道发送modbus数据
    socketInfo.sock.write(requestBuf);
  }

  // 作为tcp server 服务器listen
  listen(port) {
    console.log(port);

    this.server = net.createServer();
    this.server.on('connection', sock => {

      const connectionId = sock.remoteAddress + ':' + sock.remotePort;
      this.socketList[connectionId] = {
        sock,
      };

      /*
      const connectMsg = 'client connected, address - ' + sock.remoteAddress + ' port - ' + sock.remotePort;
      // global.windowList.mainWindow.webContents.send('modbus', 'connect', connectMsg);
      console.log(connectMsg);

      console.log('connectionId', connectionId);
      console.log('rtuList', this.rtuList);

      this.rtuList[connectionId].ReadHoldingRegisters({
        slaveAddr: 0x01,
        regAddr: 0x8008,
        regQuantity: 6,
        callback(slaveInfo) {
          console.log('callback', slaveInfo);
        },
        errorCallback(errorCode, slaveInfo) {
          console.log('errorCallback', errorCode, slaveInfo);
        },
      });
      */

      // sock.write(buf);

      // sock.setEncoding('utf8')
      sock.on('data', buf => {
        console.log('got data from client - ', buf);

        this.rtuList[connectionId].recvResponseData(buf);

        // sock.write('hello: ' + buf);
      });
      sock.on('end', () => {
        console.log('client disconnected');
        this.socketList[connectionId].isClosed = true;
      });
      sock.on('error', err => {
        console.log('socket error - ', err);
      });
    });
    this.server.maxConnections = 100;

    // 增加'0.0.0.0'，保证使用ipv4，否则返回的remoteAddress会带有::ffff前缀
    this.server.listen(port, '0.0.0.0', () => {
      console.log('echo server bound at port - 7');
    });

    // return this.server;

  }

  // 作为tcp client 连接远端服务器
  connect(ip, port) {
    console.log(ip, port);
  }

}

module.exports = tcp;

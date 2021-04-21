
// 网关多主机模式：https://blog.csdn.net/qq_35899914/article/details/100777921
// 存储型网关：上海卓岚 http://www.zlmcu.com/products_modbus.htm   zlan5143
// 山东有人物联网 https://www.usr.cn/

// 京东modbus网关：https://www.jd.com/pinpai/Search?keyword=modbus%E7%BD%91%E5%85%B3&enc=utf-8&spm=2.1.0
/**
 * 组网方案：
 * 使用modbus网关连接下位机串口通讯设备，通过网口联网控制
 * 使用专门的交换机组网
 * 当前诚讯使用了三旺的 ies3016，兼具了modbus网关和以太网交换机功能（但无法支持多主机模式）
 */

// modbus rtu over tcp通信实现
// 既可作为tcp server，也可以作为tcp client，连接后的tcp socket通道作为modbus通信通道

const net = require('net');

class tcp {

  constructor(callbackList) {

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

    // 保存connectionId的连接列表
    this.connectionList = {};

    // 回调函数列表
    this.callbackList = callbackList || {};
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

      // ip+port作为connectionId
      const connectionId = sock.remoteAddress + ':' + sock.remotePort;

      this.connectionList[connectionId] = connectionId;

      // 兼容只使用ip作为connectionId
      const ipConnectionId = sock.remoteAddress;
      this.socketList[connectionId] = {
        ip: sock.remoteAddress,
        port: sock.remotePort,
        sock,
      };
      // 如果创建modbusRtu时，只传入了ip，没有传入port，表示此rtu使用ip作为connectionId
      // 为了兼容ip作为connectionId的情况，需要复制一个socketInfo，作为ip connectionId的socketInfo
      if (!this.socketList[ipConnectionId] || this.socketList[ipConnectionId].isClosed) {
        this.socketList[ipConnectionId] = this.socketList[connectionId];
      }
      // 在创建rtu时，要么明确指定ip+port
      // 如果只指定了ip，如果对端有多个连接，那么就无法区分，默认只使用第一个

      // console.log('this.socketList', this.socketList);

      const connectMsg = 'client connected, address - ' + sock.remoteAddress + ' port - ' + sock.remotePort;
      console.log(connectMsg);

      // 如果有连接成功回调，就调用
      console.log('tcp onConnection');
      if (this.callbackList.onConnection) {
        this.callbackList.onConnection(sock.remoteAddress, sock.remotePort, this.connectionList);
      }

      /*
      // global.windowList.mainWindow.webContents.send('modbus', 'connect', connectMsg);


      console.log('connectionId', connectionId);
      console.log('rtuList', this.rtuList);

      this.rtuList[connectionId].ReadHoldingRegisters({
        slaveAddr: 0x01,
        regAddr: 0x8008,
        regQuantity: 6,
        callback(requestInfo) {
          console.log('callback', requestInfo);
        },
        errorCallback(errorCode, requestInfo) {
          console.log('errorCallback', errorCode, requestInfo);
        },
      });
      */

      // sock.write(buf);

      // sock.setEncoding('utf8')
      sock.on('data', buf => {
        console.log('got data from client - ', buf);

        let rtu;
        if (this.rtuList[connectionId]) {
          rtu = this.rtuList[connectionId];
        } else if (this.rtuList[ipConnectionId]) {
          rtu = this.rtuList[ipConnectionId];
        }
        if (!rtu) {
          throw new Error('connection id error');
        }
        console.log('on data', connectionId, this.rtuList[connectionId]);
        if (rtu) {
          rtu.recvResponseData(buf);
        }

        // sock.write('hello: ' + buf);
      });
      sock.on('end', () => {
        console.log('client disconnected');
        this.close(connectionId);

      });
      sock.on('error', err => {
        console.log('socket error - ', err);

        if (err.errno === 'ECONNRESET') {
          sock.destroy();
          this.close(connectionId);
        }

      });
    });
    this.server.maxConnections = 100;

    // 增加'0.0.0.0'，保证使用ipv4，否则返回的remoteAddress会带有::ffff前缀
    this.server.listen(port, '0.0.0.0', () => {
      console.log('echo server bound at port - 7');
    });

    // return this.server;

  }

  close(connectionId) {

    delete this.connectionList[connectionId];

    const socketInfo = this.socketList[connectionId];
    socketInfo.isClosed = true;
    if (this.socketList[socketInfo.ip]) {
      this.socketList[socketInfo.ip].isClosed = true;
    }

    // 如果close回调，就调用
    console.log('tcp onEnd');
    if (this.callbackList.onEnd) {
      this.callbackList.onEnd(socketInfo.ip, socketInfo.port, this.connectionList);
    }
  }

  // 作为tcp client 连接远端服务器
  connect(ip, port) {
    console.log(ip, port);
  }

}

module.exports = tcp;

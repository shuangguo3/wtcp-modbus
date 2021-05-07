
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

const ModbusRtu = require('./rtu.js');

// 心跳包发送间隔
const HEART_PACKAGE_INTERVAL = 20000;


class tcp {

  constructor(params) {

    // 初始化socket列表
    /**
     * 保存socket通道信息（用于modbus通信）
     * 通过ip和port，唯一标识一个socket通道，在server模式和client模式下有区分
     * 如果是server模式，使用client的ip和port标识
     * 如果是client模式，使用server的ip和port标识
     * 【重要】ip和port不区分是server或client，只是标识对端的唯一信息
     * server和client可以同时存在，即作为server的等待其他client连接的同时，可以连接其他server
     */


    this.rtuList = {};

    // 保存connectionId的连接列表
    this.connectionList = {};

    // 回调函数列表
    this.callbackList = params.callbackList || {};

    const heartPackageInterval = params.requestTimeout || HEART_PACKAGE_INTERVAL;

    // 心跳包定时器，默认20秒
    setInterval(() => {
      for (const i in this.rtuList) {
        const rtu = this.rtuList[i];
        if (rtu.isClosed) continue;
        // console.log('keepalive write');
        rtu.sock.write('keepalive');
      }

    }, heartPackageInterval);
  }

  // 发送modbus请求
  sendRequest(connectionId, requestBuf) {

    // const rtu = this.rtuList[host][port];
    const rtu = this.rtuList[connectionId];

    // 通过tcp sock通道发送modbus数据
    rtu.sock.write(requestBuf);
  }

  createRtu(host, port, sock) {
    // host+port作为connectionId
    const connectionId = host + ':' + port;

    this.connectionList[connectionId] = {
      host,
      port,
    };

    // 创建并保存rtu
    const modbusRtu = new ModbusRtu({
      tcp: this,
      // 通信对端的ip和端口，标识唯一的通信信道
      host,
      port,
      sock,
    });

    this.rtuList[connectionId] = modbusRtu;
    // 为了兼容只使用ip调用的情况，同时设置port为0的信息，只把第一个port信息作为port为0的信息
    if (!this.rtuList[host] || this.rtuList[host].isClosed) {
      this.rtuList[host] = modbusRtu;
    }

    return modbusRtu;
  }

  // 作为tcp server 服务器listen
  listen(port, callback) {
    console.log(port);

    this.server = net.createServer();
    this.server.on('connection', sock => {

      const host = sock.remoteAddress;
      const port = sock.remotePort;
      const modbusRtu = this.createRtu(host, port, sock);

      const connectMsg = 'client connected, address - ' + host + ' port - ' + port;
      console.log(connectMsg);

      // 如果有连接成功回调，就调用
      console.log('tcp onConnection');
      this.callbackList.onConnection && this.callbackList.onConnection(host, port, this.connectionList);

      sock.on('data', buf => {

        console.log('got data from client - ', buf);
        modbusRtu.recvResponseData(buf);

        // sock.write('hello: ' + buf);
      });
      /*
      当 socket 的另一端发送一个 FIN 包的时候触发，从而结束 socket 的可读端。（对端半关闭连接）
      默认情况下（allowHalfOpen 为 false），socket 将发送一个 FIN 数据包，并且一旦写出它的等待写入队列就销毁它的文件描述符。 当然，如果 allowHalfOpen 为 true，socket 就不会自动结束 end() 它的写入端，允许用户写入任意数量的数据。 用户必须调用 end() 显式地结束这个连接（例如发送一个 FIN 数据包）。
      */
      sock.on('end', () => {
        console.log('client end');

        // 只要对方关闭，就关闭socket连接
        sock.destroy();
        // 关闭rtu信道
        this.closeRtu(host, port);
        // this.close(host, port);
      });
      // 一旦 socket 完全关闭就发出该事件。参数 had_error 是 boolean 类型，表明 socket 被关闭是否取决于传输错误。
      sock.on('close', () => {
        console.log('client close');
        // 关闭rtu信道
        this.closeRtu(host, port);
      });
      sock.on('error', err => {
        console.log('socket error - ', err);

        if (err.errno === 'ECONNRESET') {
          // 关闭socket连接
          sock.destroy();
          // 关闭rtu信道
          this.closeRtu(host, port);
        }

      });
    });
    this.server.maxConnections = 100;

    // 增加'0.0.0.0'，保证使用ipv4，否则返回的remoteAddress会带有::ffff前缀
    this.server.listen(port, '0.0.0.0', () => {
      console.log(`echo server bound at port - ${port}`);
      this.serverPort = port;

      callback && callback();
    });

    // return this.server;

  }

  // 关闭server
  closeServer(callback) {
    console.log('closeServer', this.serverPort);
    if (!this.serverPort) {
      callback && callback();
    } else {

      console.log('server.close');

      // 阻止 server 接受新的连接并保持现有的连接
      this.server.close(() => {

        console.log('server.close callback');
        this.serverPort = null;
        callback && callback();
      });

      // 关闭所有已建立的连接
      // 只有在所有已建立连接都关闭的时候，this.server.close的回调才会返回
      for (const i in this.rtuList) {
        const rtu = this.rtuList[i];
        if (rtu.isClosed) continue;

        rtu.sock.destroy();
      }

    }

  }

  closeRtu(host, port) {

    const connectionId = host + ':' + port;
    delete this.connectionList[connectionId];

    // const rtu = this.rtuList[host][port];
    const rtu = this.rtuList[connectionId];
    if (!rtu) {
      throw new Error('rtu not exist:', connectionId);
    }
    rtu.isClosed = true;

    if (this.rtuList[host]) {
      this.rtuList[host].isClosed = true;
    }

    // 如果close回调，就调用
    this.callbackList.onClose && this.callbackList.onClose(host, port, this.connectionList);

  }

  // 作为tcp client 连接远端服务器
  connect(params) {

    const { host, port, callback } = params;
    console.log(host, port);

    let modbusRtu;
    const sock = net.connect({ host, port }, () => {
      console.log('连接到服务器！');
      modbusRtu = this.createRtu(host, port, sock);

      this.callbackList.onConnection && this.callbackList.onConnection(host, port, this.connectionList);
      callback && callback();
    });
    sock.on('data', buf => {

      console.log('got data from client - ', buf);
      modbusRtu.recvResponseData(buf);

      // sock.write('hello: ' + buf);
    });
    sock.on('end', () => {
      console.log('server end');

      // 只要对方关闭，就关闭socket连接
      sock.destroy();
      // 关闭rtu信道
      this.closeRtu(host, port);
    });
    sock.on('close', () => {
      console.log('server close');

      // 关闭rtu信道
      this.closeRtu(host, port);
    });
    sock.on('error', err => {
      console.log('socket error - ', err);

      if (err.errno === 'ECONNRESET') {
        // 关闭socket连接
        sock.destroy();
        // 关闭rtu信道
        this.closeRtu(host, port);
      }

    });


  }

}

module.exports = tcp;

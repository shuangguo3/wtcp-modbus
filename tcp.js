
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


    this.rtuList = {};

    // 保存connectionId的连接列表
    this.connectionList = {};

    // 回调函数列表
    this.callbackList = callbackList || {};
  }

  // 发送modbus请求
  sendRequest(connectionId, requestBuf) {

    // const rtu = this.rtuList[ip][port];
    const rtu = this.rtuList[connectionId];

    // 通过tcp sock通道发送modbus数据
    rtu.sock.write(requestBuf);
  }

  // 作为tcp server 服务器listen
  listen(port) {
    console.log(port);

    this.server = net.createServer();
    this.server.on('connection', sock => {

      // ip+port作为connectionId
      const ip = sock.remoteAddress;
      const port = sock.remotePort;
      const connectionId = ip + ':' + port;

      this.connectionList[connectionId] = {
        ip,
        port,
      };

      // 创建并保存rtu
      const modbusRtu = new ModbusRtu({
        tcp: this,
        // 通信对端的ip和端口，标识唯一的通信信道
        ip: sock.remoteAddress,
        port: sock.remotePort,
        sock,
      });

      /*
      if (!this.rtuList[ip]) {
        this.rtuList[ip] = {};
      }
      this.rtuList[ip][port] = modbusRtu;
      // 为了兼容只使用ip调用的情况，同时设置port为0的信息，只把第一个port信息作为port为0的信息
      if (!this.rtuList[ip][0] || this.rtuList[ip][0].isClosed) {
        this.rtuList[ip][0] = modbusRtu;
      }
      */

      this.rtuList[connectionId] = modbusRtu;
      // 为了兼容只使用ip调用的情况，同时设置port为0的信息，只把第一个port信息作为port为0的信息
      if (!this.rtuList[ip] || this.rtuList[ip].isClosed) {
        this.rtuList[ip] = modbusRtu;
      }

      const connectMsg = 'client connected, address - ' + ip + ' port - ' + port;
      console.log(connectMsg);

      // 如果有连接成功回调，就调用
      console.log('tcp onConnection');
      if (this.callbackList.onConnection) {
        this.callbackList.onConnection(ip, port, this.connectionList);
      }


      sock.on('data', buf => {
        console.log('got data from client - ', buf);

        // const rtu = this.rtuList[ip][port];
        const rtu = this.rtuList[connectionId];
        if (!rtu) {
          throw new Error('rtu not exist:', connectionId);
        }
        console.log('on data', connectionId);
        if (rtu) {
          rtu.recvResponseData(buf);
        }

        // sock.write('hello: ' + buf);
      });
      sock.on('end', () => {
        console.log('client disconnected');
        this.close(ip, port);
      });
      sock.on('error', err => {
        console.log('socket error - ', err);

        if (err.errno === 'ECONNRESET') {
          sock.destroy();
          this.close(ip, port);
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

  close(ip, port) {

    const connectionId = ip + ':' + port;
    delete this.connectionList[connectionId];

    // const rtu = this.rtuList[ip][port];
    const rtu = this.rtuList[connectionId];
    if (!rtu) {
      throw new Error('rtu not exist:', connectionId);
    }
    rtu.isClosed = true;

    if (this.rtuList[ip]) {
      this.rtuList[ip].isClosed = true;
    }

    // 如果close回调，就调用
    console.log('tcp onEnd');
    if (this.callbackList.onEnd) {
      this.callbackList.onEnd(ip, port, this.connectionList);
    }
  }

  // 作为tcp client 连接远端服务器，以后再实现此函数
  connect(ip, port) {
    console.log(ip, port);
  }

}

module.exports = tcp;

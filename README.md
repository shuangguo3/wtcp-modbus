# wtcp-modbus
- 基于node，用web的方式，开发modbus应用的基础库。
- 只支持最主流的RTU Over Tcp modebus协议。
- 可同时以tcp server和tcp client的方式建立连接，提供modbus信道。
- wtcp 即 web tcp的缩写。

# 安装
npm i wtcp-modbus

# 使用
# tcp server模式
`const WtcpModbus = require('wtcp-modbus');

// server
const wtcpModbus = new WtcpModbus.tcp({
    // 回调函数列表
    callbackList: {
        // 新增tcp连接事件，参数为对端连接的地址和端口号，以及当前全部的连接列表
        onConnection(host, port, connectionList) {
        },

        // 连接关闭事件，参数为对端连接的地址和端口号，以及当前全部的连接列表
        onClose(host, port, connectionList) {
        },

        // server模式下，关闭server完成事件
        onServerClose() {
        },
    },
});

// 启动server模式，等待client连接
wtcpModbus.startServer({
    // server 端口
    port: 7777, 
    // 启动成功回调
    callback: () => {        
    },
});

// client模式，连接server
wtcpModbus.startClient({
    // tcp server 的主机地址
    host: '192.168.1.111',
    // tcp server 的主机端口
    port: 1234,
    // 连接server成功回调
    callback: () => {
    },
});

// 在tcp连接建立后，就可以通过对端连接id，获取rtu，进行rtu读写操作
// 可以是对端地址和端口对，也可以只提供对端地址（这种情况只获取此地址下建立的第一个连接，一个地址下支持建立多个连接）
const connectionId = '192.168.1.111:1234'; // 或者const connectionId = '192.168.1.111'
const rtu = wtcpModbus.getRtu(connectionId);`



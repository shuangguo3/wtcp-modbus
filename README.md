# wtcp-modbus
- 基于node，用web的方式，开发modbus应用的基础库。
- 只支持最主流的RTU Over Tcp modebus协议。
- 可同时以tcp server和tcp client的方式建立连接，提供modbus信道。
- wtcp 即 web tcp的缩写。

## 安装
npm i wtcp-modbus

## 使用
```
// 引入WtcpModbus
const WtcpModbus = require('wtcp-modbus');

// 创建wtcpModbus实例
const wtcpModbus = new WtcpModbus.tcp({
    // modbus请求超时，默认3秒
    requestTimeout: 3000,
    // tcp连接心跳包，默认20秒，如果设置为0，表示不需要发送心跳包
    heartPackageInterval: 20000,
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
const rtu = wtcpModbus.getRtu(connectionId);

// 调用rtu的读保存寄存器方法（0x03命令）
rtu.readHoldingRegisters({
    slaveAddr: 1, // 从机地址
    regAddr: 0x1000, // 寄存器起始地址
    regQuantity: 10, // 读取寄存器数量
    // 读取成功回调函数，requestInfo：本次modbus请求的数据
    callback: (requestInfo) => {
        console.log('callback', requestInfo);
        
        // 读保存寄存器成功后，调用rtu的获取寄存器值方法（把本次获取的寄存器值放入列表）
        rtu.getHoldingRegistersValue((regInfos) => {
            // regInfos为json对象，保存 寄存器地址:值 对，regAddr: regValue
            console.log('regInfos', regInfos);    
        });

    },
    // 读取错误回调，errorCode：错误码，requestInfo：本次modbus请求的数据
    errorCallback(errorCode, requestInfo) {
        console.log('errorCallback', requestInfo);
    },

});

// 调用rtu的写保存寄存器方法（0x10命令）
modbusRtu.writeHoldingRegisters({
    slaveAddr: 1,
    regAddr: 0x1000,
    regQuantity: 1,
    regValueBuf: Buffer.from('12'), // 写入寄存器值的缓冲区
    options: {},
    // 写入成功回调函数，requestInfo：本次modbus请求的数据
    callback: (requestInfo) => {
        console.log('callback', requestInfo);
    },
    // 写入错误回调，errorCode：错误码，requestInfo：本次modbus请求的数据
    errorCallback(errorCode, requestInfo) {
        console.log('errorCallback', errorCode, requestInfo);
    },

});

// 其它命令当前版本未开发

```

## 完整示例
参考作者开发的示例项目：
[web-modbus](https://github.com/shuangguo3/web-modbus.git)

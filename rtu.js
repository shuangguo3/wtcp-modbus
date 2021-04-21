

/*
Function Codes
01 ReadCoils(address, quantity)
02 ReadDiscreteInputs(address, quantity)
03 ReadHoldingRegisters(address, quantity)
04 ReadInputRegisters(address, quantity)
05 WriteSingleCoil(address, value)
06 WriteSingleRegister(address, value)
07 ReadExceptionStatus()
0B GetCommEventCounter()
0C GetCommEventLog()
0F WriteMultipleCoils(address, values) // values should be Array of 1/0
10 WriteMultipleRegisters(address, values) // values should be Array of 2-size Buffers
14 ReadFileRecord(requests) // requests should be Array of objects with keys file, address and length
15 WriteFileRecord(requests) // requests should be Array of objects with keys file, address and values (Array of 2-size Buffers)
16 MaskWriteRegister(address, andmask, ormask)
17 ReadWriteMultipleRegisters(read_address, read_quantity, write_address, values) // values should be Array of 2-size Buffers
18 ReadFIFOQueue(address)
2B/0E ReadDeviceIdentification(code, id)
Exceptions
01 IllegalFunction
02 IllegalDataAddress
03 IllegalDataValue
04 ServerDeviceFailure
05 Aknowledge
06 ServerDeviceBusy
08 MemoryParityError
0A GatewayPathUnavailable
0B GatewayTargetDeviceFailedToRespond
*/

/*

tcp同时支持 client 或者server模式

server模式，必须主动调用接口listen

client模式，必须主动调用接口connect

如果socket关闭，设置socket结构 isclosed 为true

connectionId默认使用ip+port

当tcp的socket连接建立时，使用ip+port作为connectionId在socketList里保存socketInfo，
同时为了兼容ip作为connectionId的情况，此ip的第一个socket连接，需要复制一份socketInfo，保存在socketList里
【重要】如果同一个ip对端有多个程序建立了socket连接，rtu又没有明确指定port，rtu默认使用的是第一个建立的连接，可能发生异常

【使用规则】
应该是tcp先listen或者connect（对端应该先绑定好约定的port），等待连接建立后，从socketList读取已有的连接信息（或者程序约定好固定的ip+port），再传入ip+port创建rtu

modbus 业务层 应该维护一张寄存器地址对应 传感器id的表，在获取到寄存器地址对应的传感器值，就可以把传感器id和值对应

*/

// 缓冲区文档 https://www.runoob.com/nodejs/nodejs-buffer.html

// rtu协议实现

const crc16 = require('./crc16.js');
const exception = require('./exception.js');

class rtu {

  constructor(params) {

    if (!params) {
      throw new Error('connection param lost');
    }

    if (!params.tcp && !params.serial) {
      throw new Error('connection param error');
    }

    // 初始化tcp通信
    if (params.tcp) {

      if (!params.ip) {
        throw new Error('tcp param error');
      }

      this.mode = 'tcp';

      // 保存tcp通信连接
      this.tcp = params.tcp;


      // 保存和当前modbus信道关联的socket通道
      this.ip = params.ip;
      this.port = params.port;

      if (params.port) {
        this.connectionId = params.ip + ':' + params.port;
      } else {
        this.connectionId = params.ip;
      }

      // 在tcp对象里保存rtu信息，使得tcp对象内也可以主动调用rtu方法
      params.tcp.setRtu(this.connectionId, this);


    } else {

      // 初始化串口通信

      this.mode = 'serial';

      // 后续实现串口通信

    }

    /**
     * 每次通信只能和一个从机slave进行通信，通信完成后才能进行下一次通信
     * 一次通信中可能有多次收数据包操作，都归属于一次modbus通信的数据
     */
    // 初始化请求信息
    this.requestInfo = {};

  }

  // ------------------接口层-------------------------
  // modbus 03命令，读取保存寄存器
  ReadHoldingRegisters(params) {
    if (!params.slaveAddr || !params.regAddr || !params.regQuantity || !params.callback) {
      throw new Error('read param error');
    }
    return this.read(params.slaveAddr, 0x03, params.regAddr, params.regQuantity, params.callback, params.errorCallback);
  }

  // 读取保存寄存器成功后，获取寄存器值，number从0开始，返回寄存器地址和对应的值
  getHoldingRegistersValue(callback, number) {

    console.log('getHoldingRegistersValue requestInfo', this.requestInfo);

    // 没有传入number参数，表示返回所有寄存器值
    if (typeof (number) === 'undefined') {

      console.log('this.requestInfo.regQuantity', this.requestInfo.regQuantity);

      const regInfos = {};
      for (let index = 0; index < this.requestInfo.regQuantity; index++) {
        const regAddr = this.requestInfo.regAddr + index;
        const regValue = this.requestInfo.responseBuf.readUIntBE(3 + index * 2, 2);

        // console.log('regAddr 111', regAddr, typeof regAddr);
        // console.log('regValue', regValue);

        regInfos[regAddr] = regValue;
      }
      console.log('getHoldingRegistersValue regInfos', regInfos);
      callback(regInfos);

    } else {

      // 返回指定寄存器值
      const result = {};
      const regAddr = this.requestInfo.regAddr + number;
      const regValue = this.requestInfo.responseBuf.readUIntBE(3 + number * 2, 2);
      result[regAddr] = regValue;
      callback(result);

    }
  }

  // -------------------实现层-------------------------
  // 收到响应数据处理，提供给tcp进行调用
  recvResponseData(buf) {

    console.log('recvResponseData', buf);

    if (!this.requestInfo.FC) {
      // 还没有发送数据，就收到响应
      this.errorHandle('no request');
      return;
      // throw new Error('not send request');
    }
    // 收到第一个数据包
    if (this.requestInfo.recvDataLength === 0) {

      // 从机地址异常
      if (this.requestInfo.slaveAddr !== this.getSlaveAddr(buf)) {

        // 进行异常回调（接收数据异常）
        this.requestInfo.errorCallback(exception.RecvDataError, this.requestInfo);
        this.errorHandle('slaveAddr');

        // 重新初始化从机数据信息
        this.requestInfo = {};
        return;
      }

      const responseFC = this.getFC(buf);
      // 收到异常响应
      if (responseFC === this.requestInfo.FC + 0x80) {

        // 进行异常回调
        const errorCode = this.getErrorCode(buf);
        this.requestInfo.errorCallback(errorCode, this.requestInfo);
        this.errorHandle('modbus error', errorCode);

        // 重新初始化从机数据信息
        this.requestInfo = {};

        return;
      }

      // 功能码异常
      if (responseFC !== this.requestInfo.FC) {

        // 进行异常回调（接收数据异常）
        this.requestInfo.errorCallback(exception.RecvDataError, this.requestInfo);
        this.errorHandle('FC');

        // 重新初始化从机数据信息
        this.requestInfo = {};

        return;
      }
    }

    // 响应数据长度异常
    if (buf.length + this.requestInfo.recvDataLength > this.requestInfo.responseDataLength) {

      // 进行异常回调（接收数据异常）
      this.requestInfo.errorCallback(exception.RecvDataError, this.requestInfo);
      this.errorHandle('response data length');

      // 重新初始化从机数据信息
      this.requestInfo = {};

      return;

    }

    console.log(111);

    buf.copy(this.requestInfo.responseBuf, this.requestInfo.recvDataLength);
    this.requestInfo.recvDataLength += buf.length;

    console.log(222);

    // 已经获取到完整的响应数据
    if (this.requestInfo.recvDataLength === this.requestInfo.responseDataLength) {

      console.log(333);

      // 检查crc
      if (this.calCrc(this.requestInfo.responseBuf, this.requestInfo.responseDataLength - 2) !== this.getCrc(this.requestInfo.responseBuf, this.requestInfo.responseDataLength - 2)) {

        // 进行异常回调（crc异常）
        this.requestInfo.errorCallback(exception.CrcError, this.requestInfo);
        this.errorHandle('crc error');

        // 重新初始化从机数据信息
        this.requestInfo = {};

        return;


      }

      // 成功收取modbus数据

      // 设置通信信道空闲
      this.requestInfo.isBusy = false;

      // 成功回调
      this.requestInfo.callback(this.requestInfo);

      console.log(444);

      return;
    }

  }

  // 进行异常处理，记录日志等
  errorHandle(err) {
    console.log('errorHandle', err);
  }

  // 读寄存器
  /**
   *
   * @param {int} slaveAddr 从机地址
   * @param {*} FC 功能码
   * @param {int} regAddr 寄存器地址
   * @param {int} regQuantity 寄存器数量
   * @param {func} callback 回调函数
   * @param {*} errorCallback 异常回调函数
   * @return {boolean} 出错返回异常代码，否则返回false
   */
  read(slaveAddr, FC, regAddr, regQuantity, callback, errorCallback) {


    if (!errorCallback) {
      errorCallback = function(errorCode, requestInfo) {
        console.log(`errorCallback: read ${FC} error ${errorCode}`, requestInfo);
      };
    }

    // 检查连接异常
    const connectionException = this.checkConnection(slaveAddr);
    if (connectionException) {
      // 进行异常回调（crc异常）
      errorCallback(connectionException, null);
      this.errorHandle('checkConnection error:', connectionException);
      return;

    }

    const timestamp = new Date().getTime();

    // 分配请求缓冲区
    const requestBuf = Buffer.allocUnsafe(8);

    // 从机slave地址
    this.setSlaveAddr(requestBuf, slaveAddr);
    // buf.writeUIntBE(slaveAddr, 0, 1);

    // FC功能码
    this.setFC(requestBuf, FC);

    // 寄存器地址
    this.setRegAddr(requestBuf, regAddr);

    // 寄存器数量
    this.setRegQuantity(requestBuf, regQuantity);

    // crc校验
    this.setCrc(requestBuf, 6);

    // 计算响应数据有多少个字节
    let responseDataLength = 0;
    switch (FC) {
      case 0x03:
        // 寄存器数量 * 2 + 1字节slaveAddr + 1字节FC + 1字节响应长度 + 2字节crc
        responseDataLength = regQuantity * 2 + 5;
        break;

      default:
        break;
    }

    // 分配响应缓冲区
    const responseBuf = Buffer.allocUnsafe(responseDataLength);


    this.requestInfo = {

      // 保存请求数据
      slaveAddr,
      FC,
      regAddr,
      regQuantity,

      // 请求缓冲区
      requestBuf,
      // 响应缓冲区
      responseBuf,

      // 是否信道忙
      isBusy: true,
      // 当前时间戳
      timestamp,

      // 应该收到的响应数据长度
      responseDataLength,
      // 已收到的响应数据（在sock层，可能多次接收，才是一个完整的modbus响应数据）
      recvDataLength: 0,

      callback,
      errorCallback,
    };

    console.log('this.tcp', this.tcp, this.tcp.sendRequest);
    // rtu和tcp通过唯一标识的connectionId进行调用
    // 调用tcp发送modbus数据
    this.tcp.sendRequest(this.connectionId, requestBuf);

    // 设置3秒超时（超过3秒没有收到数据，即认为通信失败）
    setTimeout(() => {

      if (timestamp === this.requestInfo.timestamp && this.requestInfo.recvDataLength === 0) {
        errorCallback(exception.RequestTimeout, this.requestInfo);
        // 重新初始化从机数据信息
        this.requestInfo = {};
      }

    }, 3000);


    return false;
  }


  checkConnection(slaveAddr) {

    console.log('slaveAddr', slaveAddr);
    // console.log(exception);

    if (this.mode === 'tcp') {

      if (!this.tcp) {
        return exception.ConnectionNotInit;
      }

      const socketInfo = this.tcp.socketList[this.connectionId];
      if (!socketInfo) {
        return exception.NotConnection;
      }

      if (socketInfo.isclosed) {
        return exception.ConnectionClosed;
      }

      // 只有完成一次完整的modbus通信，或者通信超时，才能再次主动发送modbus数据
      if (this.requestInfo.isBusy) {
        return exception.ConnectionBusy;
      }

    }

    return false;

  }

  getSlaveAddr(buf) {
    return buf.readUIntBE(0, 1);
  }
  setSlaveAddr(buf, slaveAddr) {
    buf.writeUIntBE(slaveAddr, 0, 1);
  }

  getFC(buf) {
    return buf.readUIntBE(1, 1);
  }
  setFC(buf, FC) {
    buf.writeUIntBE(FC, 1, 1);
  }

  // 获取异常响应代码
  getErrorCode(buf) {
    return buf.readUIntBE(2, 1);
  }

  setRegAddr(buf, regAddr) {
    buf.writeUIntBE(regAddr, 2, 2);
  }

  setRegQuantity(buf, regQuantity) {
    buf.writeUIntBE(regQuantity, 4, 2);
  }

  // crc校验时，需要输入buf长度（读命令和写命令长度不同）
  // 计算crc
  calCrc(buf, length) {
    return crc16(buf, length);
  }
  // 从buf获取crc值
  getCrc(buf, startPos) {
    return buf.readUIntBE(startPos, 2);
  }
  // 在buf内设置crc值
  setCrc(buf, length) {
    const crcValue = this.calCrc(buf, length);
    buf.writeUIntBE(crcValue, length, 2);
  }

}

module.exports = rtu;

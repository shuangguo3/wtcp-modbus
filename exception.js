

// 异常代码
const exception = {
  // modbus 异常
  IllegalFunction: 0x01,
  IllegalDataAddress: 0x02,
  IllegalDataValue: 0x03,
  ServerDeviceFailure: 0x04, // server（server client模式） 即 slave（master slave模式）
  Aknowledge: 0x05,
  ServerDeviceBusy: 0x06,
  MemoryParityError: 0x08,
  GatewayPathUnavailable: 0x0A,
  GatewayTargetDeviceFailedToRespond: 0x0B,


  // 自定义异常
  // 没有modbus连接
  ConnectionNotInit: 0x101, // 257

  // 没有modbus连接
  NotConnection: 0x102, // 258

  // 连接已关闭
  ConnectionClosed: 0x103, // 259

  // 通信层连接忙（上一个请求未返回，区别于设备忙ServerDeviceFailure）
  ConnectionBusy: 0x104, // 260

  // 请求超时（超时时间内没有收到响应数据，认为超时）
  RequestTimeout: 0x105, // 261

  // 接收数据异常（包括多种情况）
  RecvDataError: 0x106, // 262

  // modbus crc 异常
  CrcError: 0x107, // 263
};

Object.freeze(exception);

module.exports = exception;


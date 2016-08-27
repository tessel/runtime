// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Portions Copyright Joyent, Inc. and other Node contributors.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.


var tm = process.binding('tm');

var util = require('util');
var dns = require('dns');
var Stream = require('stream');
var tls = require('tls');

/**
 * ip/helpers
 */
function isIPv4 (host) {
  // via http://stackoverflow.com/a/5284410/179583 + modified to disallow leading 0s
  return /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])(\.|$)){4}/.test(host);
}

function isIP (host) {
  if (isIPv4(host)) return 4;
  else return 0;
}

function isPipeName(s) {
  return util.isString(s) && toNumber(s) === false;
}

function toNumber(x) { return (x = Number(x)) >= 0 ? x : false; }

/**
 * TCPSocket
 */

function TCPSocket (socket, _secure) {
  Stream.Duplex.call(this);
  
  if (typeof socket === 'object') {
    this.socket = socket.fd;
    // TODO: respect readable/writable flags
    if (socket.allowHalfOpen) console.warn("Ignoring allowHalfOpen option.");
  } 

  this._secure = _secure;
  this._outgoing = [];
  this._sending = false;
  this._queueEnd = false;
  this.socket = (socket === undefined) ? null : socket;

  var self = this;

  self.on('finish', function () {
    // this is called when writing is ended
    // TODO: support allowHalfOpen (if firmware can?)
    self.close();
  })
  self._closehandler = function (buf) {
    var socket = buf.readUInt32LE(0);
    if (socket == self.socket) {
      setImmediate(function () {
        self.__readSocket(true);
        self.close();
      });
    }
  }
  process.on('tcp-close', this._closehandler)
}

util.inherits(TCPSocket, Stream.Duplex);

TCPSocket._portsUsed = Object.create(null);

TCPSocket._requestPort = function (port) {
  // NOTE: only supports _automatic_ port assignment; we track (but not *check*) manually requested ports
  if (port === 0) {
    port = 1024;    // NOTE: could optimize, e.g. by starting from last-granted or assuming only 7 sockets…
    while (port in TCPSocket._portsUsed) ++port;
  }
  TCPSocket._portsUsed[port] = true;
  return port;
};

function normalizeConnectArgs(args) {
  var options = {};

  if (util.isObject(args[0])) {
    // connect(options, [cb])
    options = args[0];
  } else if (isPipeName(args[0])) {
    // connect(path, [cb]);
    options.path = args[0];
  } else {
    // connect(port, [host], [cb])
    options.port = args[0];
    if (util.isString(args[1])) {
      options.host = args[1];
    }
  }

  var cb = args[args.length - 1];
  return util.isFunction(cb) ? [options, cb] : [options];
}

TCPSocket.prototype.connect = function (/*options | [port], [host], [cb]*/) {
  var self = this;

  var args = normalizeConnectArgs(arguments);
  var opts = args[0];
  if (opts.allowHalfOpen) console.warn("Ignoring allowHalfOpen option.");
  var port = +opts.port;
  var host = opts.host || "127.0.0.1";
  var cb = args[1];
  self.remotePort = port;
  self.remoteAddress = host;
  // TODO: proper value for these?
  self.localPort = 0;
  self.localAddress = "0.0.0.0";

  if (cb) {
    if (self._secure) {
      self.once('secureConnect', cb);
    }
    else {
      self.once('connect', cb);
    }
    
  }

  if (isIP(host)) {
    setUpConnection(host);
  } else {
    dns.resolve(host, function onResolve(err, ips) {
      if (err) {
        return self.emit('error', err);
      }
      setUpConnection(ips[0]);
    })
  }

  function setUpConnection(ip) {
    if (self.socket == null) {
      if (self._secure) {
        var custom_certs = null;
        self._ssl_checkCerts = (opts.rejectUnauthorized !== false);
        if (opts.ca) custom_certs = opts.ca.map(function (pem_data) {
            // TODO: review PEM specs and axTLS needs; make more thorough if needed
            return Buffer(pem_data.toString().split('\n').filter(function (line) {
                return line && line.indexOf('-----') !== 0;
            }).join(''), 'base64');
        });
        self._ssl_ctx = tm.ssl_context_create(self._ssl_checkCerts, custom_certs);
      }
      self.socket = tm.tcp_open();
    }

    if (self.socket < 0) {
      setImmediate(function () {
        var err = "ENOENT: Cannot open another socket.";
        if (self.socket == -tm.ENETUNREACH) {
          // wifi is not connected
          err = "ENETUNREACH: Wifi is not connected.";
        }
        self.emit('error', new Error(err));

        // cleanup
        self.removeAllListeners();
      });

      return;
    }

    var retries = 0;
    setImmediate(function doConnect() {
      var addr = ip.split('.').map(Number);
      addr = ((addr[0] << 24) | (addr[1] << 16) | (addr[2] << 8) | addr[3]) >>> 0;

      var ret = tm.tcp_connect(self.socket, addr, port);
      if (ret == -tm.ENETUNREACH) {
        // we're not connected to the internet
        self.emit('error', new Error("ENETUNREACH: Wifi is not connected"));
        // force the cleanup
        self.destroy();
        return self.__close(true); // need to call close otherwise we keep listening for the tcp-close event
      }

      if (ret < 0) {
        var closeRet = tm.tcp_close(self.socket); // returns -57 if socket is already closed
        if (closeRet < 0 && closeRet != -tm.ENOTCONN){ 
          // couldn't close socket, throw an error
          // failed to connect, stay silent
          self.emit('error', new Error('ENOENT Cannot close socket ' + self.socket + ' Got: err'+closeRet));
          self.destroy();
          return self.__close(true);
        }

        if (retries > 3) {
          self.emit('error', new Error('ENOENT Cannot connect to ' + ip + ' Got: err'+ret));
          // force the cleanup
          self.destroy();
          return self.__close(true);
        } else {
          retries++;
          setTimeout(function(){
            // wait for tcp socket to actually close
            self.socket = tm.tcp_open();

            if (self.socket < 0) {
              var err = "ENOENT: Cannot open another socket.";
              if (self.socket == -tm.ENETUNREACH) {
                // wifi is not connected
                err = "ENETUNREACH: Wifi is not connected.";
              }
              self.emit('error', new Error(err));

              // force the close
              self.destroy();
              return self.__close(true);
            } else {
              doConnect();
            }
          }, 100);
          return;
        }
      }

      if (!self._secure) {
        connectionStable();
      } else {

        setTimeout(function() {
          createSession(); 
        }, 100);

        function createSession() {
          var _ = tm.ssl_session_create(self._ssl_ctx, self.socket, hostname)
            , ssl = _[0]
            , ret = _[1]
            ;

          if (ret != 0) {
            if (ret == -517) {
              return self.emit('error', new Error('CERT_HAS_EXPIRED'));
            } else if (ret == -516) {
              return self.emit('error', new Error('CERT_NOT_YET_VALID'));
            } else if (ret == -2) {
              self.emit('error', new Error('Socket out of mem'));

              tm.tcp_readable(self.socket);
              self.destroy();
              self.__close(true);
              return;
            } else {
              // close socket
              self.emit('error', new Error('Could not validate SSL request (error ' + ret + ')'));
              self.destroy();
              self.__close(true);
              return;
            }
          }

          self._ssl_cert = {
            subjectaltname: (function () {
              var altnames = [];
              for (var i = 0; ; i++) {
                var _ = tm.ssl_session_altname(ssl, i)
                  , altname = _[0]
                  , ret = _[1]
                if (ret != 0) {
                  break;
                }
                altnames.push(altname);
              }
              return altnames.map(function (n) { return 'DNS:' + n; }).join(', ');
            })(),
            subject: {
              CN: tm.ssl_session_cn(ssl)[0]
            }
          };

          if (self._ssl_checkCerts && !tls.checkServerIdentity(host, self._ssl_cert)) {
            return self.emit('error', new Error('Hostname/IP doesn\'t match certificate\'s altnames'));
          }

          self._ssl = ssl;
          connectionStable();
        }
        
      }

      function connectionStable(){
        self._restartTimeout();
        self.__listen();
        self.connected = true;
        if(!self._secure) {
          self.emit('connect');
        } else {
          self.emit('secureConnect');
        }
        
        self.__send();
      }
      
    });
  }
};

TCPSocket.prototype._read = function (size) {
  // TODO: start polling it again
}

TCPSocket.prototype.__listen = function () {
  var self = this;
  this.__listenid = setTimeout(function loop () {
    self.__listenid = null;
    // ~HACK: set a watchdog to fire end event if not re-polled
    var failsafeEnd = setImmediate(function () {
      self.emit('end');
    });

    var flag = self.__readSocket(true);

    // Check error condition.
    if (flag < 0) {
      self.emit('error', new Error('Socket closed.'));
      self.destroy();
      return;
    }

    self.__listenid = setTimeout(loop, 10);
    clearImmediate(failsafeEnd);
  }, 10);
};

TCPSocket.prototype.localFamily = 'IPv4';
TCPSocket.prototype.remoteFamily = 'IPv4';

// Maximum packet size CC can handle.
var WRITE_PACKET_SIZE = 1024;

TCPSocket.prototype._write = function (buf, encoding, cb) {
  var self = this;
  if (!Buffer.isBuffer(buf)) {
    buf = new Buffer(buf);
  }
  if (buf.length > WRITE_PACKET_SIZE) {
    for (var i = 0; i < buf.length; i += WRITE_PACKET_SIZE) {
      var s = buf.slice(i, i + WRITE_PACKET_SIZE);
      this._outgoing.push(s);
    }
  } else {
    this._outgoing.push(buf);
  }

  this.__send(cb);
};

TCPSocket.prototype.__send = function (cb) {
  if (this._sending || !this._outgoing.length || !this.connected) {
    if (this._queueEnd) {
      // close actual socket
      this._queueEnd = false;
      this.__close(true);
    }
    return cb ? cb() : false;
  }
  this._sending = true;

  var self = this;
  var buf = this._outgoing.shift();

  (function send () {
    if (self.socket == null) {
      // most likely we ran out of memory or needed to send an EWOULDBLOCK / EAGAIN
      // however res.end got called before we successfully recovered
      // so now the socket is closed, gg
      return cb();
    }

    var ret = null;
    if (self._ssl) {
      // HACK: if socket isn't writable due to in-progress incoming data, feign EAGAIN
      //       (axTLS's ssl_write clobbers state that ssl_read may store between calls)
      ret = (tm.ssl_writeable(self._ssl)) ? tm.ssl_write(self._ssl, buf, buf.length) : -11;
    } else {
      // HACK/TODO: invert return value to match logic below (but AFAICT it used to always get -1 from this TCP path anyway??!)
      ret = -tm.tcp_write(self.socket, buf, buf.length);
    }

    if (ret == null) {
      return self.emit('error', new Error('Never sent data over socket'));
    } else if (ret == -2 || self._ssl && ret == -256) {
      // cc3000 ran out of buffers. wait until a buffer clears up to send this packet.
      setTimeout(function() {
        // call select to listen for CC3k clearing mem
        tm.tcp_readable(self.socket);
        send();
      }, 100);
    } else if (ret == -11) {
      // EWOULDBLOCK / EAGAIN
      setTimeout(send, 100);
    } else if (ret < 0) {
      return self.emit('error', new Error("Socket write failed unexpectedly! ("+ret+")"));
    } else {
      self._restartTimeout();
      // Next buffer.
      self._sending = false;
      self.__send(cb);
    }
  })();
}

TCPSocket.prototype.__readSocket = function(restartTimeout) {
  var self = this;
  var arr = [], flag = 0;
  while (self.socket != null && (flag = tm.tcp_readable(self.socket)) > 0) {
    if (self._ssl) {
      try {
        var data = tm.ssl_read(self._ssl);
      } catch(e){
        self.emit("error", typeof e == 'string' ? new Error(e) : e);
      }
    } else {
      try {
        var data = tm.tcp_read(self.socket);
      } catch(e){
        self.emit("error", typeof e == 'string' ? new Error(e) : e);
      }
    }
    if (!data || data.length == 0) {
      break;
    }
    arr.push(data);
  }


  if (arr.length) {

    if (restartTimeout) {
      self._restartTimeout();
    }

    var buf = Buffer.concat(arr);
    // TODO: stop polling if this returns false
    self.push(buf);
  }

  return flag;
}


TCPSocket.prototype.__close = function (tryToClose) {
  if (this.socket == null) {
    return;
  }

  var self = this;
  process.removeListener('tcp-close', this._closehandler);

  var retries = 0;
  function closeSocket(){
    if (self.socket === null) return;
    var ret = tm.tcp_close(self.socket);
    if (ret < 0 && ret != -tm.ENOTCONN) { // -57 is inactive, socket has already been closed
      if (retries > 3) {
        // tried 3 times and couldn't close
        // nothing for the user to do if this occurs, close the socket and user should re-request connection
        self.emit('close');
      } else {
        retries++;
        // try again
        setTimeout(closeSocket, 100);
      }
     
    } else {
      self.socket = null;
      self.emit('close');
    }
  }

  if (tryToClose !== false) {
    closeSocket();
  }
}

TCPSocket.prototype.destroy = TCPSocket.prototype.close = function () {
  if (this._destroy) return;

  this._destroy = true;
  if (this._secure) {
    // free ssl context
    tm.ssl_context_free(this._ssl_ctx);
  }
  
  var self = this;
  setImmediate(function () {
    if (self.__listenid != null) {
      clearInterval(self.__listenid);
      self.__listenid = null;
    }
    self.emit('end')
    if (self.socket != null) {
      // if there is still data left, wait until its sent before we end
      if (self._outgoing.length || self._sending) {
        self._queueEnd = true;
      } else {
        self.__close(true);
      } 
    }
    self.removeAllListeners();
  });
};

TCPSocket.prototype.setTimeout = function (msecs, cb) {
  this._timeout = msecs;
  this._restartTimeout();
  if (cb) {
    if (msecs) this.once('timeout', cb);
    else this.removeListener('timeout', cb);   // not documented, but node.js does this
  }
};
TCPSocket.prototype._restartTimeout = function () {
  var self = this;
  clearTimeout(self._timeoutWatchdog);
  this._timeoutWatchdog = (self._timeout) ? setTimeout(function () {
    self.emit('timeout');
  }, self._timeout) : null;
};

TCPSocket.prototype.getPeerCertificate = function () {
  return this._ssl_cert || null;
};


// NOTE: CC3K may not support? http://e2e.ti.com/support/wireless_connectivity/f/851/p/349461/1223801.aspx#1223801
TCPSocket.prototype.setNoDelay = function (val) {
  if (val) console.warn("Ignoring call to setNoDelay. TCP_NODELAY socket option not supported.");
};

function connect (port, host, callback) {
  var client = new TCPSocket(null);
  TCPSocket.prototype.connect.apply(client, arguments);
  return client;
};

// HACK: this is a quick solution to the regressions introduced by 5fb859605b183b70b246328bff24f4e4f8b50dab
//       a more complete solution is implemented in a different PR: c015017492980271fa583fce57d798de26a12dab
function _secureConnect (options, callback) {
  var client = new TCPSocket(null, true);
  TCPSocket.prototype.connect.apply(client, arguments);
  return client;
};


/**
 * Server
 */

function TCPServer (socket) {
  if (socket === undefined || socket === null) {
    // create a new socket
    socket = tm.tcp_open();
  }
  TCPSocket.call(this, socket);
}

util.inherits(TCPServer, TCPSocket);

TCPServer.prototype.listen = function (port, host, backlog, cb) {
  if (typeof port === 'string') {
    throw Error("UNIX sockets not supported");
  }
  
  if (typeof host === 'function') {
    cb = host;
    host = null;    // NOTE: would be INADDR_ANY, but we ignore…
    backlog = 511;  // NOTE: also ignored
  } else if (typeof host === 'number') {
    backlog = host;
    host = null;
  }
  
  if (typeof backlog === 'function') {
    cb = backlog;
    backlog = 511;
  }
  
  this.localPort = TCPSocket._requestPort(port);
  this.localAddress = host || "0.0.0.0";
  if (cb) this.once('listening', cb);
  
  var self = this,
      res = tm.tcp_listen(this.socket, this.localPort);
  if (res < 0) setImmediate(function () {
    self.emit('error', new Error("Listen on TCP socket failed ("+res+")"));
  }); else setImmediate(function () {
    self.emit('listening');
    poll();
  });
  
  function poll(){
    // stop polling if we get closed
    if (self.socket === null) return;
    
    var _ = tm.tcp_accept(self.socket)
      , client = _[0]
      , addr = _[1]
      , port = _[2];

    if (client >= 0) {
      var clientsocket = new TCPSocket(client);
      clientsocket.connected = true;
      clientsocket.localAddress = self.localAddress;    // TODO: https://forums.tessel.io/t/get-ip-address-of-tessel-in-code/203
      clientsocket.localPort = self.localPort;
      clientsocket.remoteAddress = [addr >>> 24, (addr >>> 16) & 0xFF, (addr >>> 8) & 0xFF, addr & 0xFF].join('.');
      clientsocket.remotePort = port;
      clientsocket.__listen();
      self.emit('connection', clientsocket);

      // do not poll if we're not connected
      // this also gives time for the 'disconnect' event to fire from the wifi-cc3000 lib 
      // user should listen for require('wifi-cc3000').on('disconnect') event and
      // reissue the request
      setTimeout(poll, 10);
    } else {
      self.emit('error', new Error("Cannot listen on a bad socket %d", client));
    }
  }
  return this;
};

TCPServer.prototype.address = function () {
  return {
    port: this.localPort,
    family: this.localFamily,
    address: this.localAddress
  };
};

function createServer (opts, onsocket) {
  if (typeof opts === 'function') {
    onsocket = opts;
    opts = null;
  }
  if (opts && opts.allowHalfOpen) console.warn("Ignoring allowHalfOpen option.");
  var socket = tm.tcp_open();
  if (socket < 0) {
    var err = "ENOENT: Cannot open another socket. Got code:"+socket;
    if (socket == -tm.ENETUNREACH) {
      // wifi is not connected
      err = "ENETUNREACH: Wifi is not connected.";
    }
    throw new Error(err);
  }

  var server = new TCPServer(socket);
  onsocket && server.on('connection', onsocket);
  return server;
};


/**
 * Public API
 */

exports.isIP = isIP;
exports.isIPv4 = isIPv4;
exports.connect = exports.createConnection = connect;
exports._secureConnect = _secureConnect;
exports.createServer = createServer;
exports.Socket = TCPSocket;
exports.Server = TCPServer;
exports._normalizeConnectArgs = normalizeConnectArgs;

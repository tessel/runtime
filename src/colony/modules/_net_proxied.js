var util = require('util'),
    events = require('events'),
    net = require('net'),
    tls = require('tls'),
    streamplex = require('_streamplex');

// NOTE: this list may not be exhaustive, see also https://tools.ietf.org/html/rfc5735#section-4
var _PROXY_LOCAL = "10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 127.0.0.0/8 localhost";

var _PROXY_DBG = ('_PROXY_DBG' in process.env) || false,
    PROXY_HOST = process.env.PROXY_HOST || "proxy.tessel.io",
    PROXY_PORT = +process.env.PROXY_PORT || 443,
    PROXY_TRUSTED = +process.env.PROXY_TRUSTED || 0,
    PROXY_TOKEN = process.env.PROXY_TOKEN || process.env.TM_API_KEY,
    PROXY_LOCAL = process.env.PROXY_LOCAL || _PROXY_LOCAL,
    PROXY_IDLE = +process.env.PROXY_IDLE || 90e3,
    PROXY_CERT = process.env.PROXY_CERT || null;

/**
 * Tunnel helpers
 */

function createTunnel(cb) {
  if (_PROXY_DBG) console.log("TUNNEL -> START", new Date());
  tls.connect({host:PROXY_HOST, port:PROXY_PORT, proxy:false, ca:(PROXY_CERT && [PROXY_CERT])}, function () {
    var proxySocket = this,
        tunnel = streamplex(streamplex.B_SIDE);
    tunnel.pipe(proxySocket).pipe(tunnel);
    proxySocket.on('error', shutdownTunnel);
    proxySocket.on('close', shutdownTunnel);
    proxySocket.on('error', cb);
    
    var idleTimeout;
    tunnel.on('inactive', function () {
      if (_PROXY_DBG) console.log("TUNNEL -> inactive", new Date());
      idleTimeout = setTimeout(shutdownTunnel, PROXY_IDLE);
    });
    tunnel.on('active', function () {
      if (_PROXY_DBG) console.log("TUNNEL -> active", new Date());
      clearTimeout(idleTimeout);
    });
    
    tunnel.sendMessage({token:PROXY_TOKEN});
    tunnel.once('message', function (d) {
      if (_PROXY_DBG) console.log("TUNNEL: auth response?", d);
      proxySocket.removeListener('error', cb);
      if (!d.authed) cb(new Error("Authorization failed."));
      else cb(null, tunnel);
    });
    function shutdownTunnel(e) {
      if (_PROXY_DBG) console.log("TUNNEL -> STOP", new Date());
      tunnel.destroy(e);
      if (this !== proxySocket) proxySocket.end();
      proxySocket.removeListener('close', shutdownTunnel);
    }
  }).on('error', cb);
}

var tunnelKeeper = new events.EventEmitter();

tunnelKeeper.getTunnel = function (cb) {    // CAUTION: syncronous callback!
    if (this._tunnel) return cb(null, this._tunnel);
    
    var self = this;
    if (!this._pending) createTunnel(function (e, tunnel) {
      delete self._pending;
      if (e) return self.emit('tunnel', e);
      
      self._tunnel = tunnel;
      tunnel.on('close', function () {
        self._tunnel = null;
      });
      var streamProto = Object.create(ProxiedSocket.prototype);
      streamProto._tunnel = tunnel;
      tunnel._streamProto = streamProto;
      self.emit('tunnel', null, tunnel);
    });
    this._pending = true;
    this.once('tunnel', cb);
};

var local_matchers = PROXY_LOCAL.split(' ').map(function (str) {
  var parts = str.split('/');
  if (parts.length > 1) {
    // IPv4 + mask
    var bits = +parts[1],
        mask = 0xFFFFFFFF << (32-bits) >>> 0,
        base = net._ipStrToInt(parts[0]) & mask;      // NOTE: left signed to match test below
    return function (addr, host) {
      return ((addr & mask) === base);
    };
  } else if (str[0] === '.') {
    // base including subdomains
    str = str.slice(1);
    return function (addr, host) {
      var idx = host.lastIndexOf(str);
      return (~idx && idx + str.length === host.length);
    };
  } else return function (addr, host) {
    // exact domain/address 
    return (host === str);
  }
});

function protoForConnection(host, port, opts, cb) {   // CAUTION: syncronous callback!
  var addr = (net.isIPv4(host)) ? net._ipStrToInt(host) : null,
      force_local = !PROXY_TOKEN || (opts._secure && !PROXY_TRUSTED) || (opts.proxy === false),
      local = force_local || local_matchers.some(function (matcher) { return matcher(addr, host); });
  if (_PROXY_DBG) {
      if (force_local) console.log(
        "Forced to use local socket to \"%s\". [token: %s, secure/trusted: %s/%s, opts override: %s]",
        host, Boolean(PROXY_TOKEN), Boolean(opts._secure), Boolean(PROXY_TRUSTED), (opts.proxy === false)
      );
      else console.log("Proxied socket to \"%s\"? %s", host, !local);
  }
  if (local) cb(null, net._CC3KSocket.prototype);
  else tunnelKeeper.getTunnel(function (e, tunnel) {
    if (e) return cb(e);
    cb(null, tunnel._streamProto);
  });
}

/**
 * ProxiedSocket
 */

function ProxiedSocket(opts) {
  if (!(this instanceof ProxiedSocket)) return new ProxiedSocket(opts);
  net.Socket.call(this, opts);
  this._tunnel = this._opts.tunnel;
  this._setup(this._opts);
}
util.inherits(ProxiedSocket, net.Socket);

ProxiedSocket.prototype._setup = function () {
  var type = (this._secure) ? 'tls' : 'net';
  this._transport = this._tunnel.createStream(type);
  
  var self = this;
  // TODO: it'd be great if we is-a substream instead of has-a…
  this._transport.on('data', function (d) {
    var more = self.push(d);
    if (!more) self._transport.pause();
  });
  this._transport.on('end', function () {
    self.push(null);
  });
  
  function reEmit(evt) {
    self._transport.on(evt, function test() {
      var args = Array.prototype.concat.apply([evt], arguments);
      self.emit.apply(self, args);
    });
  }
  ['connect', 'secureConnect', 'error', 'timeout', 'close'].forEach(reEmit);
};

ProxiedSocket.prototype._read = function () {
  this._transport.resume();
};
ProxiedSocket.prototype._write = function (buf, enc, cb) {
  this._transport.write(buf, enc, cb);
};

ProxiedSocket.prototype._connect = function (port, host) {
  this.remotePort = port;
  this.remoteAddress = host;
  this._transport.remoteEmit('_pls_connect', port, host);
};

ProxiedSocket.prototype.setTimeout = function (msecs, cb) {
  this._transport.remoteEmit('_pls_timeout', msecs);
  if (cb) {
    if (msecs) this.once('timeout', cb);
    else this.removeListener('timeout', cb);
  }
};

ProxiedSocket.prototype.destroy = function () {
  this._transport.destroy();
  this.end();
};

exports._protoForConnection = protoForConnection;

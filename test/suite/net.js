// NOTE: see https://github.com/tcr/tinytap/issues/4 — not all tests get applied?!
var test = require('tinytap'),
    net = require('net');

test.count(74);

test('addresses', function (t) {
  // API checks
  t.ok(net.isIP);
  t.ok(net.isIPv4);
  // t.ok(net.isIPv6);
  
  // some samples from http://publib.boulder.ibm.com/infocenter/ts3500tl/v1r0/index.jsp?topic=%2Fcom.ibm.storage.ts3500.doc%2Fopg_3584_IPv4_IPv6_addresses.html
  // c.f. http://tools.ietf.org/id/draft-main-ipaddr-text-rep-02.txt for some grammar discussion
  
  var validIPv4 = ["0.0.0.0", "127.0.0.1", "255.255.255.255", "1.2.3.4", "101.203.111.200"/*, "01.102.103.104"*/],
      validIPv6 = [
        "2001:db8:3333:4444:5555:6666:7777:8888", "2001:db8:3333:4444:CCCC:DDDD:EEEE:FFFF",
        "::", "2001:db8::", "::1234:5678", "2001:db8::1234:5678",
        "2001:0db8:0001:0000:0000:0ab9:C0A8:0102", "2001:db8:1::ab9:C0A8:102",
        "2001:db8:3333:4444:5555:6666:1.2.3.4",
        "::11.22.33.44", "2001:db8::123.123.123.123", "::1234:5678:91.123.4.56", "::1234:5678:1.2.3.4", "2001:db8::1234:5678:5.6.7.8",
      ],
      totalBunk = [
        "255.255.255.256", "0xFF.0xFF.0xFF.0xFF", "0.0.A.0", "-1.0.0.0", "123.45.67.89zzz", "01.102.103.104",
        "::11.22.33.044", "::255.255.255.256", "::FG", "hello world", void 0, 42, ""
      ];
  
  // isIP
  validIPv4.forEach(function (v) {
    t.equal(net.isIP(v), 4, v);
  });
  // isIP only for ipv4 right now
  // validIPv6.forEach(function (v) {
  //   t.equal(net.isIP(v), 6, v);
  // });
  totalBunk.forEach(function (v) {
    t.equal(net.isIP(v), 0, v);
  });
  
  // isIPv4
  validIPv4.forEach(function (v) {
    t.equal(net.isIPv4(v), true, v);
  });
  validIPv6.forEach(function (v) {
    t.equal(net.isIPv4(v), false, v);
  });
  totalBunk.forEach(function (v) {
    t.equal(net.isIPv4(v), false, v);
  });
  
  // // isIPv6
  // validIPv4.forEach(function (v) {
  //   t.equal(net.isIPv6(v), false, v);
  // });
  // validIPv6.forEach(function (v) {
  //   t.equal(net.isIPv6(v), true, v);
  // });
  // totalBunk.forEach(function (v) {
  //   t.equal(net.isIPv6(v), false, v);
  // });
  
  t.end();
});

test('client-basic', function (t) {
  // API checks
  t.ok(net.createConnection, "method available");
  t.ok(net.connect, "method available");
  
  // see http://nodejs.org/api/net.html#net_net_connect_options_connectionlistener
  
  // connects
  var client = net.connect(80, "tessel-httpbin.herokuapp.com", function () {
    t.pass("callback called");
  });
  t.ok(client instanceof net.Socket, "returned socket");
  client.on('connect', function () {
    t.pass("socket connected");
    client.write("GET /ip HTTP/1.1\nHost: tessel-httpbin.herokuapp.com\nConnection: close\nAccept: text/plain\n\n");
  });
  client.on('error', function () {
    t.fail("socket error");
  });
  
  // lives/dies
  client.on('data', function (d) {
    t.equal(d.slice(0,8).toString(), "HTTP/1.1", "got response");
    client.end();
  });
  client.on('end', function () {
    t.pass("socket closed");
    t.end();
  });
});

test('server-basic', function (t) {
  // API checks
  t.ok(net.createServer, "method available");
  
  // see http://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener
  
  // listening
  var server = net.createServer(function (c) {
    t.pass("connection callback called");
  });
  server.listen(0, function () {
     t.pass("listening callback called");
  });
  server.on('listening', function () {
    t.pass("got listening event");
    t.ok(server.address().port, "port assigned");
    testConnection(server.address().port);
  });
  
  // connecting
  server.on('connection', function (c) {
    t.ok(c instanceof net.Socket, "got connection");
    c.on('end', function () {
      t.pass("disconnected");
    });
    c.end("«§»");
  });
  function testConnection(port) {
    net.connect(port).on('data', function (d) {
      t.equal(d.toString(), "«§»");
      t.end();
    });
  }
});

test('server-binding', function (t) {
  var firstServer = net.createServer(),
      otherServer = net.createServer(),
      conflicting = net.createServer();
  firstServer.listen(0, function () {
    var firstPort = firstServer.address().port;
    t.ok(firstPort, "assigned a port");
    otherServer.listen(0, function () {
      t.notEqual(otherServer.address().port, firstPort, "assigned a different port");
    });
    conflicting.listen(firstPort, function () {
      t.fail("this should not be called!");
    });
    conflicting.on('error', function (e) {
      t.ok(e, "got error as expected");
      t.end();
    });
  });
});

test('client-errors', function (t) {
  net.connect(1, "0.0.0.0").on('error', function (e) {
    t.ok(e, "got expected error");
    t.end();
  });
});

test('client-timeout', function (t) {
  var client = net.connect(80, "tessel-httpbin.herokuapp.com", function () {
    client.setTimeout(100, function () {
      t.pass("timeout callback called");
    });
    client.on('timeout', function () {
      t.pass("timeout event fired");
      client.destroy();
      t.end();
    });
  });
});

test('client-connect-args', function (t) {
  var client = net.connect({port:80, host:"tessel-httpbin.herokuapp.com"}, function () {
    t.pass("callback called");
    t.end();
  });
});

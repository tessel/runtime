// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#include "tm.h"

#include <sys/socket.h>
#include <arpa/inet.h> //inet_addr
#include <netdb.h>
#include <sys/types.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/time.h>
#include <assert.h>

/**
 * Net
 */

uint32_t tm_hostname_lookup (const uint8_t *hostname)
{
  struct hostent *h;

  /* get the host info */
  if ((h = gethostbyname((const char *) hostname)) == NULL) {
    herror("gethostbyname(): ");
    return 0;
  }
  return ((struct in_addr *)h->h_addr)->s_addr;
}

/**
 * UDP
 */

tm_socket_t tm_udp_open ()
{
    return socket(AF_INET, SOCK_DGRAM, 0);
}

int tm_udp_close (tm_socket_t sock)
{
  return shutdown(sock, SHUT_WR) == 0 ? 0 : -errno;
}

int tm_udp_listen (tm_socket_t sock, int port)
{
  struct sockaddr_in localSocketAddr;
  localSocketAddr.sin_family = AF_INET;
  localSocketAddr.sin_addr.s_addr = htonl(INADDR_ANY);
  localSocketAddr.sin_port = htons(port);

  // Bind socket
  // TM_COMMAND('w', "Binding local socket...");
  int sockStatus;
  if ((sockStatus = bind(sock, (struct sockaddr *) &localSocketAddr, sizeof(localSocketAddr))) != 0) {
    // TM_DEBUG("binding failed: %d on port %d", sockStatus, port);
    // CC3000_END;
    return -1;
  }

  if (fcntl(sock, F_SETFL, O_NDELAY) < 0) {
    perror("Can't set socket to non-blocking");
    return -1;
  }
  
  return 0;
}

int tm_udp_receive (tm_socket_t sock, uint8_t *buf, size_t *buf_len, uint32_t *addr, uint16_t *port)
{
  struct sockaddr_storage remoteAddr;
  socklen_t remoteLen = sizeof(remoteAddr);
  ssize_t res = recvfrom(sock, buf, *buf_len, 0, (struct sockaddr *) &remoteAddr, &remoteLen);
  if (res < 0) {
    *buf_len = 0;
    return errno;
  } else {
    assert(remoteAddr.ss_family == AF_INET);
    struct sockaddr_in* remoteAddr4 = (void *) &remoteAddr;
    *addr = ntohl(remoteAddr4->sin_addr.s_addr);
    *port = ntohs(remoteAddr4->sin_port);
    *buf_len = res;
    return 0;
  }
}

int tm_udp_readable (tm_socket_t sock)
{
    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 0;

    fd_set readset;
    FD_ZERO(&readset);
    FD_SET(sock, &readset);
    if (select(sock+1, &readset, NULL, NULL, &tv) <= 0) {
        return 0;
    }
    return FD_ISSET(sock, &readset);
}

int tm_udp_send (tm_socket_t sock, uint32_t addr, uint16_t port, const uint8_t *buf, size_t *buf_len)
{
  struct sockaddr_in tSocketAddr;
  tSocketAddr.sin_family = AF_INET;
  tSocketAddr.sin_addr.s_addr = htonl(addr);
  tSocketAddr.sin_port = htons(port);

  ssize_t res = sendto(sock, buf, *buf_len, 0, (struct sockaddr *) &tSocketAddr, sizeof(tSocketAddr));
  if (res < 0) {
    *buf_len = 0;
    return errno;
  } else {
    *buf_len = res;
    return 0;
  }
}

/**
 * TCP
 */

tm_socket_t tm_tcp_open ()
{
    return socket(AF_INET, SOCK_STREAM, 0);
}

int tm_tcp_close (tm_socket_t sock)
{
    return shutdown(sock, SHUT_WR) == 0 ? 0 : -errno;
    // return close(sock);
}

int tm_tcp_connect (tm_socket_t sock, uint32_t addr, uint16_t port)
{
    struct sockaddr_in server;
    server.sin_family = AF_INET;
    server.sin_addr.s_addr = htonl(addr);
    server.sin_port = htons(port);
    // printf("server: %p, %d, %d\n", server.sin_addr.s_addr, server.sin_family, server.sin_port);
    return connect(sock, (struct sockaddr *) &server, sizeof(server));
}

uint32_t tm_net_dnsserver () {
  // for now just do 8.8.8.8 on the PC
  return 0x08080808;
}

// http://publib.boulder.ibm.com/infocenter/iseries/v5r3/index.jsp?topic=%2Frzab6%2Frzab6xnonblock.htm

int tm_tcp_write (tm_socket_t sock, const uint8_t *buf, size_t *buf_len)
{
    ssize_t res = send(sock, buf, *buf_len, 0);
    if (res < 0) {
      *buf_len = 0;
      return errno;
    } else {
      *buf_len = res;
      return 0;
    }
}

int tm_tcp_read (tm_socket_t sock, uint8_t *buf, size_t *buf_len)
{
    ssize_t res = recv(sock, buf, *buf_len, 0);
    if (res < 0) {
      *buf_len = 0;
      return errno;
    } else {
      *buf_len = res;
      return 0;
    }
}

int tm_tcp_readable (tm_socket_t sock)
{
    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 0;

    fd_set readset;
    FD_ZERO(&readset);
    FD_SET(sock, &readset);
    if (select(sock+1, &readset, NULL, NULL, &tv) <= 0) {
        return 0;
    }

    return FD_ISSET(sock, &readset) != 0 ? 1 : 0;
}

int tm_tcp_listen (tm_socket_t sock, uint16_t port)
{
  // CC3000_START;

  struct sockaddr_in localSocketAddr;
  localSocketAddr.sin_family = AF_INET;
  localSocketAddr.sin_port = htons(port);
  localSocketAddr.sin_addr.s_addr = 0;

  // Allow port to be re-bound even in TIME_WAIT state.
  // http://stackoverflow.com/questions/3229860/what-is-the-meaning-of-so-reuseaddr-setsockopt-option-linux
  int optval = 1;
  setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &optval, sizeof optval);

  // Bind socket
  // TM_COMMAND('w', "Binding local socket...");
  int sockStatus;
  if ((sockStatus = bind(sock, (struct sockaddr *) &localSocketAddr, sizeof(localSocketAddr))) != 0) {
    // TM_COMMAND('w', "binding failed: %d", sockStatus);
    // CC3000_END;
    return -1;
  }

  // TM_DEBUG("Listening on local socket...");
  int listenStatus = listen(sock, 5);
  if (listenStatus != 0) {
    // TM_COMMAND('w', "cannot listen to socket: %d", listenStatus);
    // CC3000_END;
    return -1;
  }

  if (fcntl(sock, F_SETFL, O_NDELAY) < 0) {
    perror("Can't set socket to non-blocking");
    return -1;
  }

  // CC3000_END;
  return 0;
}

// Returns -1 on error or no socket.
// Returns -2 on pending connection.
// Returns >= 0 for socket descriptor.
tm_socket_t tm_tcp_accept (tm_socket_t sock, uint32_t *addr, uint16_t *port)
{
  struct sockaddr_in addrClient;
  socklen_t addrlen = sizeof(addrClient);
  int res = accept(sock, (struct sockaddr *) &addrClient, &addrlen);
  *addr = ntohl(addrClient.sin_addr.s_addr);
  *port = ntohs(addrClient.sin_port);
  return res;
}

// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#ifndef ORDER32_H
#define ORDER32_H

#include <limits.h>
#include <stdint.h>

#if CHAR_BIT != 8
#error "unsupported char size"
#endif

enum
{
    O32_LITTLE_ENDIAN = 0x03020100ul,
    O32_BIG_ENDIAN = 0x00010203ul,
    O32_PDP_ENDIAN = 0x01000302ul
};

static const union { unsigned char bytes[4]; uint32_t value; } o32_host_order =
    { { 0, 1, 2, 3 } };

#define O32_HOST_ORDER  (o32_host_order.value)
#define O32_SWAP(x)      __builtin_bswap32(x)

#define O32_HOST_TO_BE(x)    ((O32_HOST_ORDER == O32_LITTLE_ENDIAN) ? (O32_SWAP(x)) : (x))
#define O32_HOST_TO_LE(x)    ((O32_HOST_ORDER == O32_BIG_ENDIAN)    ? (O32_SWAP(x)) : (x))

#define O32_BE_TO_HOST(x)    O32_HOST_TO_BE(x)
#define O32_LE_TO_HOST(x)    O32_HOST_TO_LE(x)

        
#endif
// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#include <stdint.h>

void dlmallocfork_restore (void* _source, int source_max, void* _target, int target_max);
void dlmallocfork_save (void* _source, int source_max, void* _target, int target_max);
size_t dlmallocfork_save_size (void* _ptr, int max);
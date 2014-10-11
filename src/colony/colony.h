// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>

#include <stddef.h>
#include <stdint.h>

extern lua_State* tm_lua_state;

int colony_runtime_open();
int colony_runtime_run(const char *path, const char **argv, int argc);
int colony_runtime_close();

void colony_init (lua_State* L);

int tm_eval_lua(lua_State *L, const char* script);
int tm_checked_call(lua_State *L, int nargs);

int colony_runtime_arena_open (lua_State** stateptr, void* arena, size_t arena_size, int preload_on_init);
int colony_runtime_arena_save_size (void* _ptr, int max);
void colony_runtime_arena_save (void* _source, int source_max, void* _target, int target_max);
void colony_runtime_arena_restore (void* _source, int source_max, void* _target, int target_max);

// JavaScript primitives

void colony_createarray (lua_State* L, int size);
void colony_createobj (lua_State* L, int size, int proto);
uint8_t* colony_createbuffer (lua_State* L, int size);
const uint8_t* colony_toconstdata (lua_State* L, int index, size_t* buf_len);
uint8_t* colony_tobuffer (lua_State* L, int index, size_t* buf_len);
void colony_ipc_emit (lua_State* L, char *type, void* data, size_t size);
int colony_isbuffer (lua_State *L, int index);
int colony_isarray (lua_State* L, int index);

uint8_t* colony_string_flags (lua_State* L, int index);

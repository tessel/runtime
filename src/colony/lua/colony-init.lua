-- Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
-- file at the top-level directory of this distribution.
--
-- Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
-- http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
-- <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
-- option. This file may not be copied, modified, or distributed
-- except according to those terms.

--
-- colony-init.lua
-- Initialize metatables, operators, and prototypes.
--

local tm = require('tm')

-- local logger = assert(io.open('colony.log', 'w+'))
-- debug.sethook(function ()
--   logger:write(debug.traceback())
--   logger:write('\n\n')
-- end, 'c', 1000)

local function js_toprimitive (val)
  if type(val) == 'table' then
    val = val:valueOf()
    if type(val) == 'table' then
      val = tostring(val)
    end
  end
  return val
end

-- tonumber that returns NaN instead of nil
_G.tonumbervalue = function (val)
  val = tonumber(js_toprimitive(val))
  if val == nil then
    return 0/0
  else
    return val
  end
end

_G.tointegervalue = function (val)
  val = tonumber(js_toprimitive(val))
  if val == nil then
    return 0/0
  else
    return math.floor(val)
  end
end

-- built-in prototypes

local obj_proto, func_proto, bool_proto, num_proto, str_proto, arr_proto, regex_proto, date_proto = {}, {}, {}, {}, {}, {}, {}, {}

local function is_builtin_proto (proto)
  return proto == obj_proto or proto == func_proto or proto == bool_proto or proto == num_proto or proto == str_proto or proto == arr_proto or proto == regex_proto or proto == date_proto
end

-- NOTE: js_proto_get defined in colony_init.c
-- NOTE: js_getter_index defined in colony_init.c

local function js_setter_index (proto)
  return function (self, key, value)
    local mt = type(self) == 'function' and rawget(self, '__mt') or getmetatable(self)
    local setter = mt.setters[key]
    if setter then
      return setter(self, value)
    end
    rawset(self, key, value)
  end
end

function js_define_setter (self, key, fn)
  if type(self) == 'function' then
    mt = self.__mt
    if not mt then
      self.__mt = { proto = func_proto }
      mt = self.__mt
    end
  else
    mt = get_unique_metatable(self)
  end

  rawset(self, key, nil)
  if not mt.getters then
    mt.getters = {}
    mt.__index = js_getter_index
  end
  if not mt.setters then
    mt.setters = {}
    mt.__newindex = js_setter_index(mt.proto)
  end

  mt.setters[key] = fn
end

function js_define_getter (self, key, fn)
  local mt
  if type(self) == 'function' then
    mt = self.__mt
    if not mt then
      self.__mt = { proto = func_proto }
      mt = self.__mt
    end
  else
    mt = get_unique_metatable(self)
  end
  
  rawset(self, key, nil)
  if not mt.getters then
    mt.getters = {}
    mt.__index = js_getter_index
  end
  if not mt.setters then
    mt.setters = {}
    mt.__newindex = js_setter_index(mt.proto)
  end

  mt.getters[key] = fn
end

local function js_tostring (this)
  return this:toString()
end

local function js_valueof (this)
  return this:valueOf()
end

-- introduce metatables to built-in types using debug library:
-- this can cause conflicts with other modules if they utilize the string prototype
-- (or expect number/booleans to have metatables)

local func_mt, str_mt, nil_mt, num_mt = {}, {}, {}, {}

debug.setmetatable((function () end), func_mt)
debug.setmetatable(true, {
  __index=function (self, key)
    return js_proto_get(self, bool_proto, key)
  end
})
debug.setmetatable(0, num_mt)
debug.setmetatable("", str_mt)
debug.setmetatable(nil, nil_mt)

--[[
--  number
--]]

num_mt.__index=function (self, key)
  return js_proto_get(self, num_proto, key)
end

num_mt.__lt = function (op1, op2)
  if op2 == nil then return op1 < 0 end
  return tonumber(op1) < tonumber(op1)
end

num_mt.__le = function (op1, op2)
  if op2 == nil then return op1 <= 0 end
  return tonumber(op1) <= tonumber(op1)
end


--[[
--  undefined (nil)
--]]

nil_mt.__tostring = function (arg)
  return 'undefined'
end

nil_mt.__add = function (op1, op2)
  if op1 == nil then
    op1 = 'null'
  end
  if op2 == nil and type(op1) == 'string' then
    op2 = 'null'
  elseif op2 == nil then
    op2 = 0
  end
  return op1 + op2
end

nil_mt.__sub = function (op1, op2)
  return (tonumber(op1) or 0) - (tonumber(op2) or 0)
end

nil_mt.__mul = function (op1, op2)
  return (tonumber(op1) or 0) * (tonumber(op2) or 0)
end

nil_mt.__div = function (op1, op2)
  return (tonumber(op1) or 0) / (tonumber(op2) or 0)
end

nil_mt.__mod = function (op1, op2)
  return (tonumber(op1) or 0) % (tonumber(op2) or 0)
end

nil_mt.__pow = function (op1, op2)
  return (tonumber(op1) or 0) ^ (tonumber(op2) or 0)
end

nil_mt.__lt = function (op1, op2)
  if type(op2) == 'table' then return false end
  return op2 > 0
end

nil_mt.__le = function (op1, op2)
  return type(op2) == 'table' or op2 >= 0
end

--[[
--  Object
--]]

function get_unique_metatable (this)
  local mt = getmetatable(this)
  if mt and mt.shared then
    setmetatable(this, {
      __index = mt.__index,
      __newindex = mt.__newindex,
      __tostring = mt.__tostring,
      __tovalue = mt.__tovalue,
      proto = mt.proto,
      shared = false
    });
    return getmetatable(this)
  end
  return mt
end

function js_obj_index (self, key)
  return js_proto_get(self, obj_proto, key)
end

function js_obj_newindex (this, key, value)
  if key == '__proto__' then
    local mt = get_unique_metatable(this)
    mt.proto = value
    mt.__index = function (self, key)
      return js_proto_get(self, value, key)
    end
  else
    rawset(this, key, value)
  end
end

local js_obj_mt = {
  __index = js_obj_index,
  __newindex = js_obj_newindex,
  __tostring = js_tostring,
  __tovalue = js_valueof,
  __lt = function (a, b)
    return js_toprimitive(a) < js_toprimitive(b)
  end,
  __sub = function (a, b)
    return js_toprimitive(a) + js_toprimitive(b)
  end,
  proto = obj_proto,
  shared = true
};

function js_obj (o)
  if rawget(o, '__proto__') then
    local proto = o.__proto__
    rawset(o, '__proto__', nil)
    setmetatable(o, js_obj_mt)
    o.__proto__ = proto
  else
    setmetatable(o, js_obj_mt)
  end
  return o
end

-- all prototypes inherit from object

js_obj(func_proto)
js_obj(num_proto)
js_obj(bool_proto)
js_obj(str_proto)
js_obj(arr_proto)
js_obj(regex_proto)
js_obj(date_proto)


--[[
--  Function
--]]

-- Functions don't have objects on them by default
-- so when we access an __index or __newindex, we
-- set up an intermediary object to handle it

func_mt.__index = function (self, key)
  if key == 'prototype' then
    self.prototype = js_obj({constructor = self})
    return self.prototype
  end
  if rawget(self, '__mt') and rawget(self, '__mt').__index then
    return rawget(self, '__mt').__index(self, key)
  end
  return js_proto_get(self, func_proto, key)
end
func_mt.__tostring = js_tostring
func_mt.__tovalue = js_valueof
func_mt.__newindex = function (self, key, value)
  if rawget(self, '__mt') and rawget(self, '__mt').__newindex then
    return rawget(self, '__mt').__newindex(self, key, value)
  end
  rawset(self, key, value)
end
-- func_mt.__tostring = function ()
--   return "[Function]"
-- end
func_mt.proto = func_proto


--[[
--  String
--]]

str_mt.getters = {
  length = function (this)
    return tm.str_lookup_LuaToJs(this, #this+1)
  end
}
str_mt.__index = function (self, key)
  -- custom js_getter_index for strings
  -- allows numerical indices
  local mt = getmetatable(self)
  local getter = mt.getters[key]
  if getter then
    return getter(self, key)
  end
  if (tonumber(key) == key) then
    local off, len = tm.str_lookup_JsToLua(self, key)
    if len > 0 then
      return string.sub(self, off, off+len-1)
    else
      return null
    end
  end
  return js_proto_get(self, str_proto, key)
end
str_mt.__add = function (op1, op2)
  return tostring(op1) .. tostring(op2)
end
str_mt.proto = str_proto


--[[
--  Array
--]]

function array_setter (this, key, val)
  if type(key) == 'number' then
    rawset(this, 'length', math.max(rawget(this, 'length'), (tonumber(key) or 0) + 1))
  end
  if key ~= 'length' then
    rawset(this, key, val)
  end
end

function js_arr_index (self, key)
  return js_proto_get(self, arr_proto, key)
end

local arr_mt_cached = {
  __index = js_arr_index,
  __newindex = array_setter,
  __tostring = js_tostring,
  __valueof = js_valueof,
  proto = arr_proto,
  shared = true
}

function js_arr (arr, len)
  if len == nil then
    error('js_arr invoked without length')
  end

  rawset(arr, 'length', len)
  setmetatable(arr, arr_mt_cached)
  return arr
end

--[[
--  "null" object (nil == undefined)
--]]

local js_null = {
  __tostring = function ()
    return 'null'
  end
}


--[[
--  void
--]]

local function js_void () end

-- a = object, b = last value
local function js_next (a, b, c)
  local arg = a.arg
  local len = rawget(arg, 'length')
  local mt = getmetatable(arg)

  -- first value in arrays should be 0
  if b == nil and type(len) == 'number' and len > 0 then
    return 0
  end

  -- next value after 0 should be 1
  if type(b) == 'number' and len then
    if b < len - 1 then
      return b + 1
    end
    b = nil
  end
  local k = b
  repeat
    k = next(arg, k)
  until (len == nil or type(k) ~= 'number') and not (k == 'length' and mt.proto == arr_proto) and not (type(arg) == 'function' and k == '__mt') and (k ~= 'constructor')
  if k == nil then
    if mt and mt.proto and not is_builtin_proto(mt.proto) then
      a.arg = mt.proto
      return next(mt.proto, k)
    end
  end
  return k
end

-- pairs

function js_pairs (arg)
  if type(arg) == 'string' then
    -- todo what
    return js_next, {arg = {}}
  else
    return js_next, {arg = (arg or {})}
  end
end

-- typeof operator

function js_typeof (arg)
  if arg == nil then
    return 'undefined'
  elseif type(arg) == 'table' then
    return 'object'
  end
  return type(arg)
end

-- instanceof

function js_instanceof (self, arg)
  local mt = getmetatable(self)
  if mt and arg then
    local proto = getmetatable(self).proto
    if proto then
      return proto == arg.prototype or js_instanceof(proto, arg)
    end
  end
  return false
end

-- "new" invocation

function js_new (f, ...)
  if type(f) ~= 'function' then
    error(js_new(global.TypeError, 'object is not a function'))
  end
  local o = {}
  local mt = {
    __index = function (self, key)
      return js_proto_get(self, f.prototype, key)
    end,
    __newindex = function (this, key, value)
      if key == '__proto__' then
        local mt = get_unique_metatable(this)
        mt.proto = value
        mt.__index = function (self, key)
          return js_proto_get(self, value, key)
        end
      else
        rawset(this, key, value)
      end
    end,
    __tostring = js_tostring,
    __tovalue = js_valueof,
    __sub = function (a, b)
      return js_toprimitive(a) - js_toprimitive(b)
    end,
    -- TODO more primitive methods!
    proto = f.prototype
  }
  setmetatable(o, mt)
  return f(o, ...) or o
end

-- arguments objects

function js_arguments (strict, callee, ...)
  local a, len = {}, select('#', ...)
  for i=1,len do
    local val, _ = select(i, ...)
    table.insert(a, i-1, val)
  end

  local obj = global._obj(a);
  obj.length = len
  if strict then
    js_define_getter(obj, 'callee', function (this)
      error(js_new(global.TypeError, '\'caller\', \'callee\', and \'arguments\' properties may not be accessed on strict mode functions or the arguments objects for calls to them'))
    end)
  else
    obj.callee = callee
  end
  get_unique_metatable(obj).arguments = true
  return obj
end


-- break/cont flags

local js_break = {}
local js_cont = {}

-- sequence

function js_seq (list)
  return table.remove(list)
end

-- in

function js_in (key, obj)
  return obj[key] ~= nil
end

-- with

function js_with (env, fn)
  local genv = getfenv(2)

  local locals = {}
  local idx = 1
  while true do
    local ln, lv = debug.getlocal(2, idx)
    if ln ~= nil then
      locals[ln] = idx
    else
      break
    end
    idx = 1 + idx
  end

  local mt = get_unique_metatable(env) or {};

  mt.__index = function (this, key)
    if locals[key] ~= nil then
      local ln, lv = debug.getlocal(4, locals[key])
      return lv
    else
      return genv[key]
    end
  end

  mt.__newindex = function (this, key, value)
    if locals[key] ~= nil then
      debug.setlocal(4, locals[key], value)
    else
      genv[key] = value
    end
  end

  setmetatable(env, mt);

  setfenv(fn, env)

  return fn(js_with)
end


--[[
--  Public API
--]]

colony.js_arr = js_arr
colony.js_obj = js_obj
colony.js_new = js_new
colony.js_tostring = js_tostring
colony.js_valueof = js_valueof
colony.js_instanceof = js_instanceof
colony.js_void = js_void
colony.js_pairs = js_pairs
colony.js_typeof = js_typeof
colony.js_arguments = js_arguments
colony.js_break = js_break
colony.js_cont = js_cont
colony.js_seq = js_seq
colony.js_in = js_in
colony.js_setter_index = js_setter_index
colony.js_getter_index = js_getter_index
colony.js_define_getter = js_define_getter
colony.js_define_setter = js_define_setter
colony.js_proto_get = js_proto_get
colony.js_with = js_with

colony.obj_proto = obj_proto
colony.bool_proto = bool_proto
colony.num_proto = num_proto
colony.func_proto = func_proto
colony.str_proto = str_proto
colony.arr_proto = arr_proto
colony.regex_proto = regex_proto
colony.date_proto = date_proto

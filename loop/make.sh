gcc-4.9 -fdiagnostics-color=auto -o runtime ../LuaJIT-2.0.2/src/libluajit.a -I../LuaJIT-2.0.2/src/ -std=c99 -g -pagezero_size 10000 -image_base 100000000 *.c
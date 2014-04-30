# Let's shortcut all the things

arm : TARGET ?= libtm
pc-test : TARGET ?= test-tm

CONFIG ?= Release

.PHONY: all

all:

arm:
	AR=arm-none-eabi-ar AR_host=arm-none-eabi-ar AR_target=arm-none-eabi-ar CC=arm-none-eabi-gcc gyp runtime.gyp --depth=. -f ninja-arm -R $(TARGET) -D builtin_section=.rodata
	ninja -C out/$(CONFIG)

pc-test:
	gyp runtime.gyp --depth=. -f ninja -R $(TARGET)
	ninja -C out/$(CONFIG)
	./out/Release/test-tm

clean:
	ninja -v -C out/Debug -t clean
	ninja -v -C out/Release -t clean

nuke: 
	rm -rf out
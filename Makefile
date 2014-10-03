ENABLE_TLS ?= 1
ENABLE_NET ?= 1

CONFIG ?= Release

ifeq ($(ARM),1)
	compile = \
		AR=arm-none-eabi-ar AR_host=arm-none-eabi-ar AR_target=arm-none-eabi-ar CC=arm-none-eabi-gcc CXX=arm-none-eabi-g++ gyp $(1) --depth=. -f ninja-arm -D builtin_section=.rodata -D enable_ssl=$(ENABLE_TLS) -D enable_net=$(ENABLE_NET) &&\
		ninja -C out/$(CONFIG)
else
    compile = \
        gyp $(1) --depth=. -f ninja -D enable_ssl=$(ENABLE_TLS) -D enable_net=$(ENABLE_NET) &&\
		ninja -C out/$(CONFIG)
endif

.PHONY: all test

all: colony

clean:
	ninja -v -C out/Debug -t clean
	ninja -v -C out/Release -t clean

nuke:
	rm -rf out build

update:
	git submodule update --init --recursive
	npm install

test:
	@./node_modules/.bin/tap -e './out/Release/colony' test/suite/*.js test/issues/*.js test/net/*.js


# Targets

libcolony:
	$(call compile, libcolony.gyp)

colony:
	$(call compile, colony.gyp)

libtm-test:
	$(call compile, libtm-test.gyp)
	./out/Release/libtm-test

libtm:
	$(call compile, libtm.gyp)


# Compiler Targets

compile-axtls:
	gyp libtm.gyp --depth=. -f ninja -D enable_ssl=1 -R tm-ssl
	ninja -C out/$(CONFIG)

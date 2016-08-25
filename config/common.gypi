{
  "variables": {
    "runtime_path": "../src",
    "http_parser_path": "../deps/http-parser",
    "hsregex_path": "../deps/hsregex",
    "rapidjson_path": "../deps/rapidjson",
    "axtls_path": "../deps/axtls",
    "axtls_inc_path": "../deps/axtls-inc",
    "c_ares_path": "../deps/c-ares",
    "colony_lua_path": "../deps/colony-lua",
    "colony_luajit_path": "../deps/colony-luajit",
    "lua_bitop_path": "../deps/luabitop-1.0",
    "fortuna_path": "../deps/fortuna",
    "fortuna_inc_path": "../deps/fortuna-inc",
    "dlmalloc_path": "../deps/dlmalloc",
    "utf8proc_path": "../deps/utf8proc",
    "miniz_path": "../deps/miniz",
    "miniz_inc_path": "../deps/miniz-inc",
    "node_libs_path": "../deps/node-libs",
    "npm_bin_path": "../node_modules/.bin",
    "approxidate_path": "../deps/approxidate",
    "tools_path": "../tools",
    'enable_ssl%': 0,
    'enable_luajit%': 0,
    'node_version%': "0.10.0",
    "compiler_path%": "",
  },

  'target_defaults': {
    'conditions': [
      [ 'OS=="arm"', {
        'defines': [
          'COLONY_EMBED',
          'CONFIG_PLATFORM_EMBED',
          'TM_FS_vfs',
          'HAVE_CLOSESOCKET',
        ],
        'include_dirs': [
          '<(axtls_path)/config/'
        ],
        'cflags': [
          '-mcpu=cortex-m3',
          '-mthumb',
          '-mtune=cortex-m3',
          '-march=armv7-m',
          '-mlong-calls',
          '-mfix-cortex-m3-ldrd',
          '-mapcs-frame',
          '-msoft-float',
          '-mno-sched-prolog',
          # '-fno-hosted',
          '-ffunction-sections',
          '-fdata-sections',
          # '-fpermissive',
          '-std=c99',

          '-Wall',
          #'-Wextra',
          '-Werror',
          '-Wno-error=unused-parameter',
          '-ggdb',
        ]
      }],
      [ 'OS!="arm"', {
        'defines': [
          'COLONY_PC',
          '_GNU_SOURCE',
          'LUA_USE_POSIX',
        ],
        'cflags': [
          '-std=c99',
          '-ggdb',

          '-Wall',
          #'-Wextra',
          '-Werror',
          '-Wno-unused-parameter'
        ]
      }],
      ['enable_ssl==1', {
        'defines': [
          "ENABLE_TLS",
        ],
      }],
      ['enable_net==1', {
        'defines': [
          "ENABLE_NET",
        ],
      }],
      ['enable_luajit==1', {
        'defines': [
          "COLONY_JIT",
        ],
      }],
    ],

    'default_configuration': 'Release',
    'configurations': {
      'Debug': {
        'conditions': [
          [ 'OS=="arm"', {
            'cflags': [
              '-gdwarf-2',
              '-Ofast',
            ]
          }],
          [ 'OS!="arm"', {
            'cflags': [
              '-O0',
              '-g',
              '-ftrapv'
            ],
            'xcode_settings': {
              'OTHER_CFLAGS': [
                '-O0',
                '-g',
                '-ftrapv'
              ]
            },
            'msvs_settings': {
              'VCCLCompilerTool': {
                'RuntimeLibrary': 1, # static debug
              },
            }
          }]
        ],
      },
      'Release': {
        'conditions': [
          [ 'OS=="arm"', {
            'cflags': [
              '-O3',
            ],
          }],
          [ 'OS!="arm"', {
            'cflags': [
              '-O3'
            ],
            'xcode_settings': {
              'OTHER_CFLAGS': [
                '-O3'
              ]
            },
            'msvs_settings': {
              'VCCLCompilerTool': {
                'RuntimeLibrary': 0, # static release
              },
            },
          }]
        ]
      }
    },

    'msvs_settings': {
      'VCCLCompilerTool': {
      },
      'VCLibrarianTool': {
      },
      'VCLinkerTool': {
        'GenerateDebugInformation': 'true',
      },
    },
  }
}

(function(){
var Module = {
  TOTAL_MEMORY: 8*1024*1024,
  TOTAL_STACK: 2*1024*1024 ,
  preRun: [],
  postRun: [],
  print: function( text ) {
    console.log(text);
  },
  printErr: function(text) {
    text = Array.prototype.slice.call(arguments).join(' ');
    if ( text.indexOf( 'pre-main prep time' ) >= 0 ) {
      return;
    }
    console.error(text);
  }
};
var Module = typeof Module !== 'undefined' ? Module : {};
var moduleOverrides = {};
var key;
for (key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key];
    }
}
Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function (status, toThrow) {
    throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
if (Module['ENVIRONMENT']) {
    if (Module['ENVIRONMENT'] === 'WEB') {
        ENVIRONMENT_IS_WEB = true;
    } else if (Module['ENVIRONMENT'] === 'WORKER') {
        ENVIRONMENT_IS_WORKER = true;
    } else if (Module['ENVIRONMENT'] === 'NODE') {
        ENVIRONMENT_IS_NODE = true;
    } else if (Module['ENVIRONMENT'] === 'SHELL') {
        ENVIRONMENT_IS_SHELL = true;
    } else {
        throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
    }
} else {
    ENVIRONMENT_IS_WEB = typeof window === 'object';
    ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
    ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
    ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}
if (ENVIRONMENT_IS_NODE) {
    var nodeFS;
    var nodePath;
    Module['read'] = function shell_read(filename, binary) {
        var ret;
        ret = tryParseAsDataURI(filename);
        if (!ret) {
            if (!nodeFS)
                nodeFS = require('fs');
            if (!nodePath)
                nodePath = require('path');
            filename = nodePath['normalize'](filename);
            ret = nodeFS['readFileSync'](filename);
        }
        return binary ? ret : ret.toString();
    };
    Module['readBinary'] = function readBinary(filename) {
        var ret = Module['read'](filename, true);
        if (!ret.buffer) {
            ret = new Uint8Array(ret);
        }
        return ret;
    };
    if (process['argv'].length > 1) {
        Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    }
    Module['arguments'] = process['argv'].slice(2);
    if (typeof module !== 'undefined') {
        module['exports'] = Module;
    }
    process['on']('uncaughtException', function (ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex;
        }
    });
    process['on']('unhandledRejection', function (reason, p) {
        process['exit'](1);
    });
    Module['inspect'] = function () {
        return '[Emscripten Module object]';
    };
} else if (ENVIRONMENT_IS_SHELL) {
    if (typeof read != 'undefined') {
        Module['read'] = function shell_read(f) {
            var data = tryParseAsDataURI(f);
            if (data) {
                return intArrayToString(data);
            }
            return read(f);
        };
    }
    Module['readBinary'] = function readBinary(f) {
        var data;
        data = tryParseAsDataURI(f);
        if (data) {
            return data;
        }
        if (typeof readbuffer === 'function') {
            return new Uint8Array(readbuffer(f));
        }
        data = read(f, 'binary');
        return data;
    };
    if (typeof scriptArgs != 'undefined') {
        Module['arguments'] = scriptArgs;
    } else if (typeof arguments != 'undefined') {
        Module['arguments'] = arguments;
    }
    if (typeof quit === 'function') {
        Module['quit'] = function (status, toThrow) {
            quit(status);
        };
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module['read'] = function shell_read(url) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send(null);
            return xhr.responseText;
        } catch (err) {
            var data = tryParseAsDataURI(url);
            if (data) {
                return intArrayToString(data);
            }
            throw err;
        }
    };
    if (ENVIRONMENT_IS_WORKER) {
        Module['readBinary'] = function readBinary(url) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, false);
                xhr.responseType = 'arraybuffer';
                xhr.send(null);
                return new Uint8Array(xhr.response);
            } catch (err) {
                var data = tryParseAsDataURI(url);
                if (data) {
                    return data;
                }
                throw err;
            }
        };
    }
    Module['readAsync'] = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                onload(xhr.response);
                return;
            }
            var data = tryParseAsDataURI(url);
            if (data) {
                onload(data.buffer);
                return;
            }
            onerror();
        };
        xhr.onerror = onerror;
        xhr.send(null);
    };
    if (typeof arguments != 'undefined') {
        Module['arguments'] = arguments;
    }
    Module['setWindowTitle'] = function (title) {
        document.title = title;
    };
}
Module['print'] = typeof console !== 'undefined' ? console.log : typeof print !== 'undefined' ? print : null;
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : typeof console !== 'undefined' && console.warn || Module['print'];
Module.print = Module['print'];
Module.printErr = Module['printErr'];
for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key];
    }
}
moduleOverrides = undefined;
var STACK_ALIGN = 16;
function staticAlloc(size) {
    var ret = STATICTOP;
    STATICTOP = STATICTOP + size + 15 & -16;
    return ret;
}
function dynamicAlloc(size) {
    var ret = HEAP32[DYNAMICTOP_PTR >> 2];
    var end = ret + size + 15 & -16;
    HEAP32[DYNAMICTOP_PTR >> 2] = end;
    if (end >= TOTAL_MEMORY) {
        var success = enlargeMemory();
        if (!success) {
            HEAP32[DYNAMICTOP_PTR >> 2] = ret;
            return 0;
        }
    }
    return ret;
}
function alignMemory(size, factor) {
    if (!factor)
        factor = STACK_ALIGN;
    var ret = size = Math.ceil(size / factor) * factor;
    return ret;
}
function getNativeTypeSize(type) {
    switch (type) {
    case 'i1':
    case 'i8':
        return 1;
    case 'i16':
        return 2;
    case 'i32':
        return 4;
    case 'i64':
        return 8;
    case 'float':
        return 4;
    case 'double':
        return 8;
    default: {
            if (type[type.length - 1] === '*') {
                return 4;
            } else if (type[0] === 'i') {
                var bits = parseInt(type.substr(1));
                return bits / 8;
            } else {
                return 0;
            }
        }
    }
}
function warnOnce(text) {
    if (!warnOnce.shown)
        warnOnce.shown = {};
    if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        Module.printErr(text);
    }
}
var functionPointers = new Array(0);
var funcWrappers = {};
function dynCall(sig, ptr, args) {
    if (args && args.length) {
        return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
        return Module['dynCall_' + sig].call(null, ptr);
    }
}
var GLOBAL_BASE = 8;
var ABORT = 0;
var EXITSTATUS = 0;
function assert_em(condition, text) {
    if (!condition) {
        abort('Assertion failed: ' + text);
    }
}
function getCFunc(ident) {
    var func = Module['_' + ident];
    return func;
}
var JSfuncs = {
    'stackSave': function () {
        stackSave();
    },
    'stackRestore': function () {
        stackRestore();
    },
    'arrayToC': function (arr) {
        var ret = stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return ret;
    },
    'stringToC': function (str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
            var len = (str.length << 2) + 1;
            ret = stackAlloc(len);
            stringToUTF8(str, ret, len);
        }
        return ret;
    }
};
var toC = {
    'string': JSfuncs['stringToC'],
    'array': JSfuncs['arrayToC']
};
function ccall(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
        for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
                if (stack === 0)
                    stack = stackSave();
                cArgs[i] = converter(args[i]);
            } else {
                cArgs[i] = args[i];
            }
        }
    }
    var ret = func.apply(null, cArgs);
    if (returnType === 'string')
        ret = Pointer_stringify(ret);
    if (stack !== 0) {
        stackRestore(stack);
    }
    return ret;
}
function setValue(ptr, value, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*')
        type = 'i32';
    switch (type) {
    case 'i1':
        HEAP8[ptr >> 0] = value;
        break;
    case 'i8':
        HEAP8[ptr >> 0] = value;
        break;
    case 'i16':
        HEAP16[ptr >> 1] = value;
        break;
    case 'i32':
        HEAP32[ptr >> 2] = value;
        break;
    case 'i64':
        tempI64 = [
            value >>> 0,
            (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)
        ], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
        break;
    case 'float':
        HEAPF32[ptr >> 2] = value;
        break;
    case 'double':
        HEAPF64[ptr >> 3] = value;
        break;
    default:
        abort('invalid type for setValue: ' + type);
    }
}
var ALLOC_STATIC = 2;
var ALLOC_NONE = 4;
function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr)
        return '';
    var hasUtf = 0;
    var t;
    var i = 0;
    while (1) {
        t = HEAPU8[ptr + i >> 0];
        hasUtf |= t;
        if (t == 0 && !length)
            break;
        i++;
        if (length && i == length)
            break;
    }
    if (!length)
        length = i;
    var ret = '';
    if (hasUtf < 128) {
        var MAX_CHUNK = 1024;
        var curr;
        while (length > 0) {
            curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
            ret = ret ? ret + curr : curr;
            ptr += MAX_CHUNK;
            length -= MAX_CHUNK;
        }
        return ret;
    }
    return UTF8ToString(ptr);
}
var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
    var endPtr = idx;
    while (u8Array[endPtr])
        ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
    } else {
        var u0, u1, u2, u3, u4, u5;
        var str = '';
        while (1) {
            u0 = u8Array[idx++];
            if (!u0)
                return str;
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue;
            }
            u1 = u8Array[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode((u0 & 31) << 6 | u1);
                continue;
            }
            u2 = u8Array[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = (u0 & 15) << 12 | u1 << 6 | u2;
            } else {
                u3 = u8Array[idx++] & 63;
                if ((u0 & 248) == 240) {
                    u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u3;
                } else {
                    u4 = u8Array[idx++] & 63;
                    if ((u0 & 252) == 248) {
                        u0 = (u0 & 3) << 24 | u1 << 18 | u2 << 12 | u3 << 6 | u4;
                    } else {
                        u5 = u8Array[idx++] & 63;
                        u0 = (u0 & 1) << 30 | u1 << 24 | u2 << 18 | u3 << 12 | u4 << 6 | u5;
                    }
                }
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0);
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
            }
        }
    }
}
function UTF8ToString(ptr) {
    return UTF8ArrayToString(HEAPU8, ptr);
}
function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0))
        return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            if (outIdx >= endIdx)
                break;
            outU8Array[outIdx++] = u;
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx)
                break;
            outU8Array[outIdx++] = 192 | u >> 6;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx)
                break;
            outU8Array[outIdx++] = 224 | u >> 12;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 2097151) {
            if (outIdx + 3 >= endIdx)
                break;
            outU8Array[outIdx++] = 240 | u >> 18;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 67108863) {
            if (outIdx + 4 >= endIdx)
                break;
            outU8Array[outIdx++] = 248 | u >> 24;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else {
            if (outIdx + 5 >= endIdx)
                break;
            outU8Array[outIdx++] = 252 | u >> 30;
            outU8Array[outIdx++] = 128 | u >> 24 & 63;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx;
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}
function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            ++len;
        } else if (u <= 2047) {
            len += 2;
        } else if (u <= 65535) {
            len += 3;
        } else if (u <= 2097151) {
            len += 4;
        } else if (u <= 67108863) {
            len += 5;
        } else {
            len += 6;
        }
    }
    return len;
}
var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
    var endPtr = ptr;
    var idx = endPtr >> 1;
    while (HEAP16[idx])
        ++idx;
    endPtr = idx << 1;
    if (endPtr - ptr > 32 && UTF16Decoder) {
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
    } else {
        var i = 0;
        var str = '';
        while (1) {
            var codeUnit = HEAP16[ptr + i * 2 >> 1];
            if (codeUnit == 0)
                return str;
            ++i;
            str += String.fromCharCode(codeUnit);
        }
    }
}
function stringToUTF16(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 2)
        return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr;
}
function demangle(func) {
    return func;
}
function demangleAll(text) {
    var regex = /__Z[\w\d_]+/g;
    return text.replace(regex, function (x) {
        var y = demangle(x);
        return x === y ? x : x + ' [' + y + ']';
    });
}
function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
        try {
            throw new Error(0);
        } catch (e) {
            err = e;
        }
        if (!err.stack) {
            return '(no stack trace available)';
        }
    }
    return err.stack.toString();
}
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;
function alignUp(x, multiple) {
    if (x % multiple > 0) {
        x += multiple - x % multiple;
    }
    return x;
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateGlobalBuffer(buf) {
    Module['buffer'] = buffer = buf;
}
function updateGlobalBufferViews() {
    Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
    Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
    Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
    Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
    Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
    Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
    Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
    Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}
var STATIC_BASE, STATICTOP, staticSealed;
var STACK_BASE, STACKTOP, STACK_MAX;
var DYNAMIC_BASE, DYNAMICTOP_PTR;
STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
staticSealed = false;
function abortOnCannotGrowMemory() {
    abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}
if (!Module['reallocBuffer'])
    Module['reallocBuffer'] = function (size) {
        var ret;
        try {
            if (ArrayBuffer.transfer) {
                ret = ArrayBuffer.transfer(buffer, size);
            } else {
                var oldHEAP8 = HEAP8;
                ret = new ArrayBuffer(size);
                var temp = new Int8Array(ret);
                temp.set(oldHEAP8);
            }
        } catch (e) {
            return false;
        }
        var success = _emscripten_replace_memory(ret);
        if (!success)
            return false;
        return ret;
    };
function enlargeMemory() {
    var PAGE_MULTIPLE = Module['usingWasm'] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
    var LIMIT = 2147483648 - PAGE_MULTIPLE;
    if (HEAP32[DYNAMICTOP_PTR >> 2] > LIMIT) {
        return false;
    }
    var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
    TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY);
    while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR >> 2]) {
        if (TOTAL_MEMORY <= 536870912) {
            TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE);
        } else {
            TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
        }
    }
    var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
    if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
        TOTAL_MEMORY = OLD_TOTAL_MEMORY;
        return false;
    }
    updateGlobalBuffer(replacement);
    updateGlobalBufferViews();
    return true;
}
var byteLength;
try {
    byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
    byteLength(new ArrayBuffer(4));
} catch (e) {
    byteLength = function (buffer) {
        return buffer.byteLength;
    };
}
var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK)
    Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');
if (Module['buffer']) {
    buffer = Module['buffer'];
} else {
    {
        buffer = new ArrayBuffer(TOTAL_MEMORY);
    }
    Module['buffer'] = buffer;
}
updateGlobalBufferViews();
function getTotalMemory() {
    return TOTAL_MEMORY;
}
HEAP32[0] = 1668509029;
HEAP16[1] = 25459;
if (HEAPU8[2] !== 115 || HEAPU8[3] !== 99)
    throw 'Runtime error: expected the system to be little-endian!';
function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == 'function') {
            callback();
            continue;
        }
        var func = callback.func;
        if (typeof func === 'number') {
            if (callback.arg === undefined) {
                Module['dynCall_v'](func);
            } else {
                Module['dynCall_vi'](func, callback.arg);
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg);
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
function preRun() {
    if (Module['preRun']) {
        if (typeof Module['preRun'] == 'function')
            Module['preRun'] = [Module['preRun']];
        while (Module['preRun'].length) {
            addOnPreRun(Module['preRun'].shift());
        }
    }
    callRuntimeCallbacks(__ATPRERUN__);
}
function ensureInitRuntime() {
    if (runtimeInitialized)
        return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true;
}
function postRun() {
    if (Module['postRun']) {
        if (typeof Module['postRun'] == 'function')
            Module['postRun'] = [Module['postRun']];
        while (Module['postRun'].length) {
            addOnPostRun(Module['postRun'].shift());
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
}
function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
}
function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer);
}
function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull)
        HEAP8[buffer >> 0] = 0;
}
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function addRunDependency(id) {
    runDependencies++;
    if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
    }
}
function removeRunDependency(id) {
    runDependencies--;
    if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback();
        }
    }
}
Module['preloadedImages'] = {};
Module['preloadedAudios'] = {};
var memoryInitializer = null;
var dataURIPrefix = 'data:application/octet-stream;base64,';
function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0;
}
STATIC_BASE = GLOBAL_BASE;
STATICTOP = STATIC_BASE + 69168;
__ATINIT__.push();
memoryInitializer = 'data:application/octet-stream;base64,IAIAAKsLAQAYAAAAAAAAACACAABYCwEAKAAAAAAAAAD4AQAAeQsBACACAACGCwEACAAAAAAAAAAgAgAA8QsBABgAAAAAAAAAIAIAAM0LAQBAAAAAAAAAAAEAAAACAAAATQUBAG0GAQDXBAEA1wQBAHcEAQBtBgEA1wQBANcEAQAVBgEARQYBANcEAQDXBAEAtQUBAOUFAQDXBAEA1wQBAH0FAQAIBQEAQAUBAEcFAQBNBQEAnwQBANcEAQDcBAEA4AQBAAgFAQBABQEARwUBAHcEAQCfBAEA1wQBANwEAQAAEAAAAIAAAAAIAAAAQAAAAAAAAEgBAACIAQAAiAgBACgLAQB2qAAAxsMAAAAAAACoDQAAjB8AAKABKA4AAAAAAAAAAAAAEQAwLQAAAAAAAAAAAAAAAAAAAAAAAAICAAAQAAAA8F0AAHhaAAAaAAAAIAYAAMAIAADACgEA8AoBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC2AlgAqwAgALsAAAAVIqACQyIgAZgigAKmIsACqCIAA6ki4AKrIiADzSJgAPIi4AHzIgAC9CIgAvYiQAL3ImAC+iJAAfsiYAH8IoAB/SKgAf4iwAG4KYAA9SlAAN4qoADjKuAA5CrAAOUqAAEAAAAACAAAAAEAAAACAAAAAwAAAAQAAAABAAAAAQAAAAEAAAABAAAAAAAAADAAAAABAAAABQAAAAMAAAAEAAAAAQAAAAIAAAACAAAAAgAAAHEGcQZ7BnsGewZ7Bn4GfgZ+Bn4GAAAAAAAAAAB6BnoGegZ6BgAAAAAAAAAAeQZ5BnkGeQYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIYGhgaGBoYGAAAAAAAAAACNBo0GjAaMBo4GjgaIBogGmAaYBpEGkQapBqkGqQapBq8GrwavBq8GAAAAAAAAAAAAAAAAAAAAALoGuga7BrsGuwa7BsAGwAbBBsEGwQbBBr4Gvga+Br4G0gbSBtMG0wYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMcGxwbGBsYGyAbIBgAAywbLBsUGxQbJBskG0AbQBtAG0AYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAzAbMBswGzAZLBksGTAZMBk0GTQZOBk4GTwZPBlAGUAZRBlEGUgZSBiEGIgYiBiMGIwYkBiQGJQYlBiYGJgYmBiYGJwYnBigGKAYoBigGKQYpBioGKgYqBioGKwYrBisGKwYsBiwGLAYsBi0GLQYtBi0GLgYuBi4GLgYvBi8GMAYwBjEGMQYyBjIGMwYzBjMGMwY0BjQGNAY0BjUGNQY1BjUGNgY2BjYGNgY3BjcGNwY3BjgGOAY4BjgGOQY5BjkGOQY6BjoGOgY6BkEGQQZBBkEGQgZCBkIGQgZDBkMGQwZDBkQGRAZEBkQGRQZFBkUGRQZGBkYGRgZGBkcGRwZHBkcGSAZIBkkGSQZKBkoGSgZKBlwGXAZdBl0GXgZeBl8GXwYhESETARUhFwMZIR0DHwEjAyUDKQMtAzEDNQE5ATsBPQE/A0EDRQNJA00DUQNVA1kDXQAAAAAAAAAAAAADAANhA2UDaRNtA3EDdQN5AX0BfwOBBAGEAYQBhAGEAYQBRAMEAQQHBAgECAQBAAAAAAAAAAAAAAGFAYcBiQGLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBgkAIQAhAAAAIQABAAEAAwALFgsOCwIDAAMACwYDAAMAAwADAAMAAwADAAsqAwAJOAEAAQABAAk0CTIJNgEAAQAJPAEAAQABAAEAAQABAAk6AQADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwALPgMAAwADAAMAAwALQgMAAwADAAMAAwADAAMAAwADAAMACU4LUAMAAwALWgMACVQLVgEAAQABAAmQCYkJhwmLCZIBAAmOC6wBAAMAAwALlAMACV4JYE4EVgReBGYEfgSGBI4ElgSeBKYErAS0BLwExATMBNQE2gTiBOoE8gT1BP0EBQUNBRUFHQUZBSEFKQUxBTYFPgVGBU4FUgVaBWIFagVyBXoFdgV+BYMFiwWRBZkFoQWpBbEFuQXBBckFzgXWBdkF4QXpBfEF9wX/Bf4FBgYOBhYGJgYeBi4GbgRuBD4GRgY2BlYGWAZgBk4GcAZ2Bn4GaAaOBpQGnAaGBqwGsga6BqQGygbQBtgGwgboBvAG+AbgBggHDgcWBwAHJgcsBzQHHgdEB0kHUQc8B2EHaAdwB1kH+gV4B4AHbgSIB5AHmAduBKAHqAewB7UHvQfEB8wHbgS5BdQH3AfkB+wHRgX8B/QHuQW5BbkFuQW5BbkFuQW5BbkFuQUCCLkFCggACBIIuQUOCLkFGAggCCgIRgVGBTAIOAi5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQU9CEUIuQW5BU0IVQhdCGUIbQi5BXUIfQiFCJUIuQWdCJ8IpwiNCLkFqgi+CLIIugjGCLkFzgjUCNwI5Ai5BfQI/AgECewIbgRuBBQJFwkfCQwJLwknCbkFNgm5BUUJPglNCVUJbgRdCWUJ7gRtCXAJdgl9CXAJFQWFCZ4EngSeBJ4EjQmeBJ4EngSdCaUJrQm1Cb0JwQnJCZUJ4QnpCdEJ2QnxCfkJAQoJCiEKEQoZCikKMQpACkUKOApNCk0KTQpNCk0KTQpNCk0KVQpdCtwIYApoCm8KdAp8CtwIggqBCpIKlQrcCNwIigrcCNwI3AjcCNwIpAqsCpwK3AjcCNwIsQrcCNwI3AjcCNwI3AjcCLcKvwrcCMcKzgrcCNwI3AjcCNwI3AjcCNwITQpNCk0KTQrWCk0K3QrkCk0KTQpNCk0KTQpNCk0KTQrcCOwK8wr3Cv0KAwsLCxALRgUgCxgLKAueBJ4EngQwC+4EOAu5BT4LTgtGC0YLFQVWC14LZgtuBG4L3AjcCHUL3AjcCNwI3AjcCNwIfQuDC5MLiwv6BbkFmws4CLkFowurC7ALuQW5BbULpQXcCLwLxAvMC9IL3AjMC9oL3AjEC9wI3AjcCNwI3AjcCNwI3AjiC7kFuQW5BeoLuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQXwC7kFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BfULuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BaoI3AjcCP0LuQUADLkFCAwODBYMHgwjDLkFuQUnDLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BS4MuQU1DDsMuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BUMMuQW5BbkFSwy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFTQy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BVQMuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQVbDLkFuQW5BWIMagy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQVvDLkFuQV3DLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQV7DLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BX4MuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BYEMuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQWHDLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQWPDLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFlAy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BZkMuQW5BbkFngy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFpgytDLEMuQW5BbkFuAy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BaoIbgTGDLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW+DNwIzgxNCbkFuQW5BbkFuQW5BbkFuQXTDNsMngTrDOMMuQW5BfMM+wwLDZ4EEA0YDR4NbgQDDSYNLg25BTYNRg1JDT4NUQ0OBlkNYA1oDVYGeA1wDYANuQWIDZANmA25BaANqA2wDbgNwA3EDcwN7gTuBLkF1A25BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BdwN4w2eCG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgTrDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDbkFuQW5BfsNuQW5DAIOBw65BbkFuQUPDrkFuQWpCG4EJQ4VDh0OuQW5BS0ONQ65BbkFuQW5BbkFuQW5BbkFuQW5BToOQg65BUYOuQVMDlAOWA5gDmcObw65BbkFuQV1Do0OXgSVDp0Oog6+CH0OhQ7rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesN6w3rDesNuBG4EfgROBJ4ErAS8BIwE2gTqBPUExQUVBRkFKQU2BQYFUgViBXIFdgVDBZEFoQWxBYEFzgXZBekF9wX+Bc4GIAKwAoACzsLewtACrsLQArdC0AKQApACkAKHQzbAdsBXQydDEAKQApACkAK3Qz9DEAKQAo9DX0NvQ39DT0OfQ69DvQO2wHbARgPTA/bAXQP2wHbAdsB2wGhD9sB2wHbAdsB2wHbAdsBtQ/bAe0PLRDbATgQQApACkAKQApACngQQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQAq4EEAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAf4EAAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAH+BBuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBKoOsQ65Dm4EuQW5BbkFpQXJDsEO4A7RDtgO6A5qC/AObgRuBG4EbgRoDbkF+A4AD7kFCA8QDxQPHA+5BSQPbgRGBVAFLA+5BTAPOA9ID0APuQVQD7kFVw9uBG4EbgRuBLkFuQW5BbkFuQW5BbkFuQW5BU4LqghMDm4EbgRuBG4EZw9fD2oPcg++CHoPbgSCD4oPkg9uBG4EuQWiD6oPmg+6D8EPsg/JD9EPbgThD9kPuQXkD+wP9A/8DwQQbgRuBLkFuQUMEG4ERgUUEO4EHBBuBG4EbgRuBG4EbgRuBG4EbgRuBG4EJBBuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgQ0EO8FPBAsEC8JRBBMEFIQahBaEGIQbhAvCX4QdhCGEJYQjhBuBG4EnRClEBEGrRC9ELIGxRC1EG4EbgRuBG4EuQXNENUQbgS5Bd0Q5RBuBG4EbgRuBG4EuQXtEPUQbgS5Bf0QBRENEbkFHREVEW4ELRElEW4EbgRuBG4EbgRuBEYF7gQ1EW4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgS5BT0RbgRuBG4EbgRuBG4EbgRuBFMRWBFFEU0RaBFgEW4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgS5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BakIbgRuBG4EeBGAEYgRcBG5BbkFuQW5BbkFuQWQEW4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BZgRbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BZoRbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgS5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFPRG+CKIRbgRuBEIOqhG5BboRwhHKEbIRbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EuQW5BdIR1xHfEW4EbgTnEbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5Be8RuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BfcRbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgT/EW4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBLkFuQW5BQcSDBIUEm4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgTcCNwI3AjcCNwI3AjcCH0L3AgcEtwIIxIrEjES3Ag3EtwI3Ag/Em4EbgRuBG4EbgTcCNwIfgpHEm4EbgRuBG4EVxJeEmMSaRJxEnkSgRJbEokSkRKZEp4ScBJXEl4SWhJpEqYSWBKpElsSsRK5EsESyBK0ErwSxBLLErcS0xJPEtwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCNwIFQXjEhUF6hLxEtsSbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4E+BIAE24EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgS5BbkFuQW5BbkFuQUIE24ERgUYExATbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgQoEzATOBNAE0gTUBNuBCATbgRuBG4EbgRuBG4EbgRuBNwIWBPcCNwIdQtdE2ETfQtpE24T3AhYE9wINhJuBHYTfhOCE4oTbgRuBG4EbgRuBNwI3AjcCNwI3AjcCNwIkhPcCNwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCNwI3AjcCH8KmhPcCNwI3Ah1C9wI3AiiE24EWBPcCKoT3AiyE38LbgRuBLoTwhPKE24EfgtuBOgObgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgTSE7kFuQXZE7kFuQW5BeETuQXpE7kFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BV8MuQW5BfETuQW5BbkFuQW5BbkFuQW5BbkFuQX5EwEUuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFngy5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFCBS5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQUPFLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BRYUuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFTgtuBLkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BRoUuQW5BbkFuQW5BbkFMA+5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQW5BbkFuQX/EW4EbgRuBG4EbgRuBG4EbgRuBG4EuQW5BbkFuQUiFLkFuQW5BbkFuQW5BbkFuQW5BbkFuQUwD24EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgQyFCoUKhQqFG4EbgRuBG4EFQUVBRUFFQUVBRUFFQU6FG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBG4EbgRuBPMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDfMN8w3zDUIUDwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAwAFwAXABcAGQAXABcAFwAUABUAFwAYABcAEwAXABcASQCJAMkACQFJAYkByQEJAkkCiQIXABcAGAAYABgAFwAXAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAUABcAFQAaABYAGgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFAAYABUAGAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAwAFwAZABkAGQAZABsAFwAaABsABQAcABgAEAAbABoAGwAYAEsDiwMaAAIAFwAXABoACwMFAB0AyzRLNMs8FwABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAGAABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABgAAgACAAIAAgACAAIAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAEAAgABAAIAAQACAAEAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQABAAIAAQACAAEAAgACAAIAAQABAAIAAQACAAEAAQACAAEAAQABAAIAAgABAAEAAQABAAIAAQABAAIAAQABAAEAAgACAAIAAQABAAIAAQABAAIAAQACAAEAAgABAAEAAgABAAIAAgABAAIAAQABAAIAAQABAAEAAgABAAIAAQABAAIAAgAFAAEAAgACAAIABQAFAAUABQABAAMAAgABAAMAAgABAAMAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgABAAMAAgABAAIAAQABAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgACAAIAAgACAAIAAQABAAIAAQABAAIAAgABAAIAAQABAAEAAQACAAEAAgABAAIAAQACAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAFAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEABoAGgAaABoABAAEAAQABAAEAAQABAAEAAQABAAEAAQAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaAAQABAAEAAQABAAaABoAGgAaABoAGgAaAAQAGgAEABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAEAAgABAAIABAAaAAEAAgAAAAAABAACAAIAAgAXAAEAAAAAAAAAAAAaABoAAQAXAAEAAQABAAAAAQAAAAEAAQACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAIAAgABAAEAAQACAAIAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAIAAgACAAEAAgAYAAEAAgABAAEAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACABsABgAGAAYABgAGAAcABwABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAAAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAEABcAFwAXABcAFwAXAAAAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAABcAEwAAAAAAGwAbABkAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgATAAYAFwAGAAYAFwAGAAYAFwAGAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAABQAFAAUAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQABAAEAAYABgAGAAXABcAGQAXABcAGwAbAAYABgAGAAYABgAGAAYABgAGAAYABgAXABAAAAAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAQABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgBJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcABQAFAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAXAAUABgAGAAYABgAGAAYABgAQABsABgAGAAYABgAGAAYABAAEAAYABgAbAAYABgAGAAYABQAFAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAUAGwAbAAUAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAAAAEAAFAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAGAAQABAAbABcAFwAXAAQAAAAAAAAAAAAAAAYABgAGAAYABAAGAAYABgAEAAYABgAGAAYABgAAAAAAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABAAGAAYABgAGAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAAAAAAFwAAAAYABgAQAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABQAGAAYAFwAXAEkAiQDJAAkBSQGJAckBCQJJAokCFwAEAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAIAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAGAAUACAAIAAgABgAGAAYABgAGAAYABgAGAAgACAAIAAgABgAIAAgABQAGAAYABgAGAAYABgAGAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAZABkAyzfLNcs/yzTLPEsJGwAZAAAAAAAAAAAABQAGAAgACAAAAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAAAAAAAAAFAAUABQAFAAAAAAAGAAUACAAIAAgABgAGAAYABgAAAAAACAAIAAAAAAAIAAgABgAFAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAABQAFAAAABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgYABgAFAAUABQAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYACAAAAAUABQAFAAUABQAFAAAAAAAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAAABQAFAAAAAAAGAAAACAAIAAgABgAGAAAAAAAAAAAABgAGAAAAAAAGAAYABgAAAAAAAAAGAAAAAAAAAAAAAAAAAAAABQAFAAUABQAAAAUAAAAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhcAGQAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAAAAAAAAAAAGAAYACAAAAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAUABQAFAAAAAAAGAAUACAAIAAgABgAGAAYABgAGAAAABgAGAAgAAAAIAAgABgAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhsABQDLNEs0yzzLN8s1yz8AAAAAAAAAAAAAAAAAAAAAAAAGAAgACAAAAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAUABQAFAAAAAAAGAAUACAAGAAgABgAGAAYABgAAAAAACAAIAAAAAAAIAAgABgAAAAAAAAAAAAAAAAAAAAAABgAIAAAAAAAAAAAABQAFAAAABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAssHSx5LeBsAGwAbABsAGwAbABkAGwAAAAAAAAAAAAAAAAAAAAYABQAAAAUABQAFAAUABQAFAAAAAAAAAAUABQAFAAAABQAFAAUABQAAAAAAAAAFAAUAAAAFAAAABQAFAAAAAAAAAAUABQAAAAAAAAAFAAUABQAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAgACAAGAAgACAAAAAAAAAAIAAgACAAAAAgACAAIAAYAAAAAAAUAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAAAAAASwWLBcsFCwaLBcsFCwYbAAYACAAIAAgAAAAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAFAAYABgAGAAgACAAIAAgAAAAGAAYABgAAAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAGAAYAAAAFAAUABQAAAAAAAAAAAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABgAIAAgAAAAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAAAAAABgAFAAgABgAIAAgACAAIAAgAAAAGAAgACAAAAAgACAAGAAYAAAAAAAAAAAAAAAAAAAAIAAgAAAAAAAAAAAAAAAAAAAAFAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQLLB0seS3jLNEs0yzzLN8s1yz8bAAUABQAFAAUABQAFAAAABgAIAAgAAAAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABQAIAAgACAAGAAYABgAGAAAACAAIAAgAAAAIAAgACAAGAAUAGwAAAAAAAAAAAAUABQAFAAgAC8wLykvLC8lLNkvJCzUFAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAgACAAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUAAAAFAAAAAAAFAAUABQAFAAUABQAFAAAAAAAAAAYAAAAAAAAAAAAIAAgACAAGAAYABgAAAAYAAAAIAAgACAAIAAgACAAIAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABQAFAAYABgAGAAYABgAGAAYAAAAAAAAAAAAZAAUABQAFAAUABQAFAAQABgAGAAYABgAGAAYABgAGABcASQCJAMkACQFJAYkByQEJAkkCiQIXABcAAAAAAAAAAAAAAAUABQAAAAUAAAAAAAUABQAAAAUAAAAAAAUAAAAAAAAAAAAAAAAABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUAAAAFAAAAAAAFAAUAAAAFAAUABQAFAAYABQAFAAYABgAGAAYABgAGAAAABgAGAAUAAAAAAAUABQAFAAUABQAAAAQAAAAGAAYABgAGAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAABQAFAAUABQAFABsAGwAbABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABsAFwAbABsAGwAGAAYAGwAbABsAGwAbABsASQCJAMkACQFJAYkByQEJAkkCiQJLNEs8S0RLTEtUS1xLZEtsS3RLLBsABgAbAAYAGwAGABQAFQAUABUACAAIAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAgABgAGAAYABgAGABcABgAGAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAbABsAGwAbABsAGwAbABsABgAbABsAGwAbABsAGwAAABsAGwAXABcAFwAXABcAGwAbABsAGwAXABcAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgABgAGAAYABgAIAAYABgAGAAYABgAGAAgABgAGAAgACAAGAAYABQBJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcAFwAXAAUABQAFAAUABQAFAAgACAAGAAYABQAFAAUABQAGAAYABgAFAAgACAAIAAUABQAIAAgACAAIAAgACAAIAAUABQAFAAYABgAGAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAgACAAGAAYACAAIAAgACAAIAAgABgAFAAgASQCJAMkACQFJAYkByQEJAkkCiQIIAAgACAAGABsAGwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAXAAQABQAFAAUAAQABAAEAAQABAAEAAAABAAAAAAAAAAAAAAABAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAAABQAAAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABgAGAAYAFwAXABcAFwAXABcAFwAXABcACwNLA4sDywMLBEsEiwTLBAsFywdLCssMSw/LEUsUyxZLGcsbSx6LeAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAACAAIAAgACAAIAAgAAAAAAEwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAMAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAUABUAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFABcAFwAXAIoJygkKCgUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAXABcAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAYABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAgABgAGAAYABgAGAAYABgAIAAgACAAIAAgACAAIAAgABgAIAAgABgAGAAYABgAGAAYABgAGAAYABgAGABcAFwAXAAQAFwAXABcAGQAFAAYAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAASwWLBcsFCwZLBosGywYLB0sHiwcAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAGAAUAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAXABcAFwAXABcAEwAXABcAFwAXAAYABgAGABAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAUABQAFAAQABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAgACAAIAAgABgAGAAgACAAIAAAAAAAAAAAACAAIAAYACAAIAAgACAAIAAgABgAGAAYAAAAAAAAAAAAbAAAAAAAAABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgsDAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAgACAAGAAAAAAAXABcAFwAXABcAFwAXABcAFwAEABcAFwAXABcAFwAXAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABwAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgABgAIAAYABgAGAAYABgAGAAYAAAAGAAgABgAIAAgABgAGAAYABgAGAAYABgAGAAgACAAIAAgACAAIAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAYASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAABcAGwAbABsAGwAbABsAGwAbABsAGwAGAAYABgAGAAYABgAGAAYABgAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAGAAYABgAGAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAIAAYABgAGAAYABgAIAAYACAAIAAgACAAIAAYACAAIAAUABQAFAAUABQAFAAUAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcAFwAXAAUACAAGAAYABgAGAAgACAAGAAYACAAGAAYABgAFAAUASQCJAMkACQFJAYkByQEJAkkCiQIFAAUABQAFAAUABQAGAAYACAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAGAAYACAAIAAgABgAIAAYABgAGAAgACAAAAAAAAAAAAAAAAAAAAAAAFwAXABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAUABQAFAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAUABQAFAAUACAAIAAgACAAIAAgACAAIAAYABgAGAAYABgAGAAYABgAIAAgABgAGAAAAAAAAABcAFwAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEAAQABAAEAAQABAAXABcAAgACAAIAAgACAAIAAgACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABcAFwAXABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAABgAGAAYAFwAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAgABgAGAAYABgAGAAYABgAFAAUABQAFAAYABQAFAAUABQAIAAgABgAFAAUAAAAGAAYAAAAAAAAAAAAAAAAAAgACAAIAAgACAAIAAgACAAIAAgACAAIABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAEAAQABAAEAAQABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAAAAAAAAAAAAAABgAGAAYABgAGAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgACAAIAAgACAAIAAgACAAEAAgACAAIAAgACAAIAAgACAAIAAQABAAEAAQABABoAGgAaAAAAAAACAAIAAgAAAAIAAgABAAEAAQABAAMAGgAaAAAAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgAAAAAAAQABAAEAAQABAAEAAAAAAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgAAAAAAAQABAAEAAQABAAEAAAAAAAIAAgACAAIAAgACAAIAAgAAAAEAAAABAAAAAQAAAAEAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAAAAAAIAAgACAAIAAgACAAIAAgADAAMAAwADAAMAAwADAAMAAgACAAIAAgACAAIAAgACAAMAAwADAAMAAwADAAMAAwACAAIAAgACAAIAAAACAAIAAQABAAEAAQADABoAAgAaABoAGgACAAIAAgAAAAIAAgABAAEAAQABAAMAGgAaABoAAgACAAIAAgAAAAAAAgACAAEAAQABAAEAAAAaABoAGgAWABcAFwAXABgAFAAVABcAFwAXABcAFwAXABcAFwAXABcAFwAYABcAFgAXABcAFwAXABcAFwAXABcAFwAXAAwAEAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAQABAAEADLAgQAAAAAAMsDCwRLBIsEywQLBRgAGAAYABQAFQAEAAwADAAMAAwADAAMAAwADAAMAAwADAAQABAAEAAQABAAEwATABMAEwATABMAFwAXABwAHQAUABwAHAAdABQAHAAXABcAFwAXABcAFwAXABcADQAOABAAEAAQABAAEAAMABcAFwAXABcAFwAXABcAFwAXABwAHQAXABcAFwAXABYAywILA0sDiwPLAwsESwSLBMsECwUYABgAGAAUABUAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAAABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABwAHAAcABwAGAAcABwAHAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAAQAbAAEAGwABABsAAQABAAEAAQAbAAIAAQABAAEAAQACAAUABQAFAAUAAgAbABsAAgACAAEAAQAYABgAGAAYABgAAQACAAIAAgACABsAGAAbABsAAgAbAIs1CzZLNos0izgLNQs5Cz0LQUs1S0XLNcs9y0XLTYsFGwAbAAEAGwAbABsAGwABABsAGwACAAEAAQABAAIAAgABAAEAAQACABsAAQAbABsAGAABAAEAAQABAAEAGwAbAIoFygUKBkoGigbKBgoHSgeKB8oHCghKCMoRSh4KmEp4igXKBQoGSgaKBsoGCgdKB4oHygcKCEoIyhFKHgqYSnhKeEqYingBAAIAygbKEYqYynhLBRsAGwAAAAAAAAAAABgAGAAYABgAGAAbABsAGwAbABsAGAAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABsAGwAYABsAGwAYABsAGwAbABsAGwAbABsAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAbABsAGAAbABgAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAbABsAGwAbABsAGwAbABsAFAAVABQAFQAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABsAGwAbABsAGwAbABsAFAAVABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwDLAgsISwiLCMsICwlLCYsJywkLCksKCwNLA4sDywMLBEsEiwTLBAsFywfLAgsDSwOLA8sDCwRLBIsEywQLBcsHCwhLCIsIywgLCUsJiwnLCQsKSwoLA0sDiwPLAwsESwSLBMsECwXLBwsISwiLCMsICwlLCYsJywkLCksKGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABgAGAAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABsAGwAbABsAGwAbABsAGwAbABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABQAFQAUABUAFAAVABQAFQAUABUAFAAVABQAFQALA0sDiwPLAwsESwSLBMsECwXLBwsDSwOLA8sDCwRLBIsEywQLBcsHCwNLA4sDywMLBEsEiwTLBAsFywcbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABgAGAAYABgAFAAVABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABQAFQAUABUAFAAVABQAFQAUABUAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABUAFAAVABQAFQAUABUAFAAVABQAFQAUABUAFAAVABQAFQAUABUAFAAVABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABQAFQAUABUAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABUAGAAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABsAGwAYABgAGAAYABgAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAgABAAEAAQACAAIAAQACAAEAAgABAAIAAQABAAEAAQACAAEAAgACAAEAAgACAAIAAgACAAIABAAEAAEAAQABAAIAAQACAAIAGwAbABsAGwAbABsAAQACAAEAAgAGAAYABgABAAIAAAAAAAAAAAAAABcAFwAXABcASzQXABcAAgACAAIAAgACAAIAAAACAAAAAAAAAAAAAAACAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAABAAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAFwAXABwAHQAcAB0AFwAXABcAHAAdABcAHAAdABcAFwAXABcAFwAXABcAFwAXABMAFwAXABMAFwAcAB0AFwAXABwAHQAUABUAFAAVABQAFQAUABUAFwAXABcAFwAXAAQAFwAXABcAFwAXABcAFwAXABcAFwATABMAFwAXABcAFwATABcAFAAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAABsAigXKBQoGSgaKBsoGCgdKB4oHBgAGAAYABgAIAAgAEwAEAAQABAAEAAQAGwAbAMoHSgrKDAQABQAXABsAGwAMABcAFwAXABsABAAFAEoFFAAVABQAFQAUABUAFAAVABQAFQAbABsAFAAVABQAFQAUABUAFAAVABMAFAAVABUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAGAAYAGgAaAAQABAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABcABAAEAAQABQAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAGwAbAIsFywULBksGGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAACLBcsFCwZLBosGywYLB0sHiwfLBxsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAywdLCssMSw/LEUsUyxZLGRsAiwrLCgsLSwuLC8sLCwxLDIsMywwLDUsNiw3LDQsOGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAEsOiw7LDgsPSw+LD8sPCxBLEIsQyxALEUsRixHLEQUABQAFAAUABQCFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUFBQAFAAUHBQAFAAUAhXgFAAUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBQUABQAFAAUABQAFAAUAhQYFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIV5xQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFeAUABQAFAAUABQAFAAUABQAFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUARR4FAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFeQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFegUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBQUARQcFAMUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBwUARXhFCsUMBQAFAAUABQAFAAUARQ8FAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQYFBgUGBQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFBQUABQAFAAUABQAFAAUAhQUFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFB0UKBQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQXFBQUGBQDFBQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUHBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUHBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUeBQAFAAUABQAFAAUABQBFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhXgFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBQUABQAFAAUAxQUFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBgUABQAFAAUABQBFHgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFBQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAQABQAFAAUABQAFAAUABQAFAAUABQAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABAAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAQABAAGAAYAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAUABgAHAAcABwAXAAYABgAGAAYABgAGAAYABgAGAAYAFwAEAAUABQAFAAUABQAFAIoFygUKBkoGigbKBgoHSgeKB0oFBgAGABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABAAEAAIABQAFAAUABQAFABoAGgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAQAAgACAAIAAgACAAIAAgACAAEAAgABAAIAAQABAAIAAQACAAEAAgABAAIAAQACAAQAGgAaAAEAAgABAAIABQABAAIAAQACAAIAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAEAAQABAAEAAAABAAEAAQABAAEAAgABAAIAAAAAAAAAAAAAAAAAAAAAAAUABQAGAAUABQAFAAYABQAFAAUABQAGAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgABgAGAAgAGwAbABsAGwAAAAAAAAAAAMs0SzTLPMs3yzXLPxsAGwAZABsAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAgACAAIAAgABgAGAAAAAAAAAAAAAAAAAAAAAAAXABcASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAIAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgACAAIAAgACAAIAAgACAAIAAgABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABQAFAAUABQAFAAUAFwAXABcABQAXAAUAAAAAAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAIABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAAAAEAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAgACAAGAAYABgAGAAgACAAGAAgACAAIAAUABQAFAAUABQAGAAQABQAFAAUABQAFAAUABQAFAAUASQCJAMkACQFJAYkByQEJAkkCiQIFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAIAAgABgAGAAgACAAGAAYAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABgAFAAUABQAFAAUABQAFAAUABgAIAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAXABcAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUABQAFAAUABQAbABsAGwAFAAgABgAIAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABQAGAAYABgAFAAUABgAGAAUABQAFAAUABQAGAAYABQAGAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAQAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAYABgAIAAgAFwAXAAUABAAEAAgABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAAAAAABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAaAAQABAAEAAQAAgACAAIAAgACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAUABQAFAAgACAAGAAgACAAGAAgACAAXAAgABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARAAUABQAFAAUABQAFAAUABQAFAAUABQAFBgUABQAFAAUABQAFAAUAxQcFAAUABQAFAMUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUGBQDFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAYAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUAAAAFAAAABQAFAAAABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAIAAgACAAIAAgACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgACAAIAAgACAAAAAAAAAAAAAAAFAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABUAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAZABsAAAAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAFwAXABcAFwAXABcAFwAUABUAFwAAAAAAAAAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGABcAEwATABYAFgAUABUAFAAVABQAFQAUABUAFAAVABQAFQAXABcAFAAVABcAFwAXABcAFgAWABYAFwAXABcAAAAXABcAFwAXABMAFAAVABQAFQAUABUAFwAXABcAGAATABgAGAAYAAAAFwAZABcAFwAAAAAAAAAAAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAABAAAAAAAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAAAAAABQAFAAUABQAFAAUAAAAAAAUABQAFAAAAAAAAABkAGQAYABoAGwAZABkAAAAbABgAGAAYABgAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAGwAbAAAAAAAAABcAFwAXABkAFwAXABcAFAAVABcAGAAXABMAFwAXAEkAiQDJAAkBSQGJAckBCQJJAokCFwAXABgAGAAYABcAGgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFAAYABUAGAAUABUAFwAUABUAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEAAQABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAuwC7hLeEuAS4hLkEuYS6BLqEuwS7iLeIuAi4iLkIuYi6CLqIuwi7gAAAAAAAAbABsAGwAbABsAGwAbABsAGwAXABcAFwAAAAAAAAAAAIsFywULBksGiwbLBgsHSweLB8sHSwrLDEsPyxFLFMsWSxnLG0seC4ALiAuQC5gLoAuoygfKB8oHygfKB8oMyhHKEcoRyhFKHgqICpgKmAqYCpgKmEp4SpiKBsoRSzRLNIs4yzwbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAEsFyzQbABsAGwAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAyjRKNIoFigbKEQqYSpiKmIoGygfKEUoeCphKeEqYigbKB8oRSh4KmEp4iniKmMoHigWKBYoFygXKBcoFygWKBhsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsABgAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAiwXLBQsGSwaLBssGCwdLB4sHywdLCssMSw/LEUsUyxZLGcsbSx4LgAuIC5ALmAugC6gLsAu4AAAAAAAAAACLBYsGywfLEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDKGwUABQAFAAUABQAFAAUABQAKuAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAXAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUAFwCKBcoFygdKCkoeAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAIAAgACAAIAAgACAAIAAgAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAAAAAAAAAUAAAAAAAUABQAFAAUABQAFAAUAAAAAAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAABcAiwXLBQsGywdLCkseS3iLeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAbABsAiwXLBQsGSwaLBssHSwoAAAAAAAAAAAAAAAAAAIsFywULBksGSwaLBssHSwpLHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAAAAAAAAAAAAAAiwWLBssHSwpLHgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAiwXLB0sKSx7LBQsGAAAAAAAAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAABcAS6BLqEuwS7iLeIuAi4iLkIuYi6CLqIuwi7jLeMuAy4jLkMuYy6DLqMuwy7jLNks1yzSLNMtGSzTLTos4yzxLRQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAy15LNAUABQCLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLFgAAAABLHguAC4gLkAuYC6ALqAuwC7hLeEuAS4hLkEuYCwNLA4sDywPLB0sKSx5LeAAAAAAAAAAAAAAAAAAAAAAXABcAFwAXABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAUABgAGAAYAAAAGAAYAAAAAAAAAAAAAAAYABgAGAAYABQAFAAUABQAAAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABgAGAAYAAAAAAAAAAAAGAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCLBcsRFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAiwXLB0sKBQAFAAUABQAFAAYABgAAAAAAAAAAAIsFiwbLB0sKSx4XABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAbAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAFwAXABcAFwAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAACLBcsFCwZLBssHSwpLHkt4BQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAiwXLBQsGSwbLB0sKSx5LeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACLBcsFCwZLBssHSwpLHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAiwWLBssHyxFLHkt4CwNLA4sDywMLBEsEiwTLBAsFywdLCssMSw/LEUsUyxZLGcsbSx4LgAuIC5ALmAugC6gLsAu4SzTLNIs0izgAAEsUyxZLGcsbSx5LeEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAIAAYACAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYABgAXABcAFwAXABcAFwAXAAAAAAAAAAAACwNLA4sDywMLBEsEiwTLBAsFywdLCssMSw/LEQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgABgAGAAYABgAIAAgABgAGABcAFwAQABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAGAAYABgAGAAYACAAGAAYABgAGAAYABgAGAAYAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAXABcABQAAAAAAAAAAAAAAAAAAAAAAAAAIAAUABQAFAAUAFwAXABcAFwAXAAYABgAGABcAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCBQAXAAUAFwAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAGAAYABgAGAAYABgAIAAAAiwXLBQsGSwaLBssGCwdLB4sHywdLCssMSw/LEUsUyxZLGcsbSx5LeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAIAAgABgAIAAYABgAXABcAFwAXABcAFwAGAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAAAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUAFwAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAYABgAGAAYABgAAAAAAAAAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAFAAUACAAIAAAAAAAGAAYABgAGAAYABgAGAAAAAAAAAAYABgAGAAYABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAGAAgACAAAAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAIAAgACAAAAAAACAAIAAAAAAAIAAgACAAAAAAABQAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAGAAYABgAGAAYACAAIAAYABgAGAAgABgAFAAUABQAFABcAFwAXABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAgAAFwAAABcAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgABgAGAAYABgAGAAYACAAGAAgACAAIAAgABgAGAAgABgAGAAUABQAXAAUAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgABgAGAAYABgAAAAAACAAIAAgACAAGAAYACAAGAAYAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXAAUABQAFAAUABgAGAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAYABgAGAAYABgAIAAgABgAIAAYABgAXABcAFwAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAGAAgACAAGAAYABgAGAAYABgAIAAYAAAAAAAAAAAAAAAAAAAAAAAgACAAGAAYABgAGAAgABgAGAAYABgAGAAAAAAAAAAAASQCJAMkACQFJAYkByQEJAkkCiQLLB0sKFwAXABcAGwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAABgAGAAYASQCJAMkACQFJAYkByQEJAkkCiQLLB0sKywxLD8sRSxTLFksZyxsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAFABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCiwXLBQsGSwaLBssGCwdLB4sHywdLCssMSw/LEUsUyxZLGcsbSx4AAAAAAAAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgABgAGAAYABgAGAAYABgAAAAYABgAGAAYABgAGAAgABgAGAAYABgAGAAYABgAGAAYAAAAIAAYABgAGAAYABgAGAAYACAAGAAYACAAGAAYAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAMo0SjXKNMo0SjSKNIo4Sg/KEUoGigbKBgoHSgeKBwAAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADKBQoGSgaKBsoGCgdKB4oHCgZKBooGygYKB0oHigdKBooGygYKB0oHigeKBcoFCgZKBooGygYKB0oHigeKBcoFCgZKBooGygUKBgoGSgaKBsoGCgdKB4oHigXKBQoGCgZKBooGisCKwYoFygUKBgoGSgaKBgoGCgZKBkoGSgZKBsoGCgcKBwoHSgdKB4oHigeKB4oHygUKBkoGigbKBooFygUKBkoGSgaKBooGygUKBooFygWKNIo4SkWKNIo4yjUFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAGAAYABgAGAAYAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYAFwAXABcAFwAXABsAGwAbABsABAAEAAQABAAXABsAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAywdLHot4C3mLeQt6i3oAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAYABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAAAGwAGAAYAFwAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsACAAIAAYABgAGABsAGwAbAAgACAAIAAgACAAIABAAEAAQABAAEAAQABAAEAAGAAYABgAGAAYABgAGAAYAGwAbAAYABgAGAAYABgAGAAYAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAGAAYABgAGABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAGAAYABgAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLFksZyxsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASQKJAkkAiQDJAAkBSQGJAckBCQJJAokCSQCJAMkACQFJAYkByQEJAkkCiQJJAIkAyQAJAUkBiQHJAQkCSQKJAgEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAAAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAAABAAEAAAAAAAEAAAAAAAEAAQAAAAAAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAAAAgAAAAIAAgACAAIAAgACAAIAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAEAAQAAAAEAAQABAAEAAAAAAAEAAQABAAEAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAQABAAAAAQABAAEAAQAAAAEAAQABAAEAAQAAAAEAAAAAAAAAAQABAAEAAQABAAEAAQAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABgAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAYAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAGAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAYAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAGAACAAIAAgACAAIAAgABAAIAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCSQCJAMkACQFJAYkByQEJAgAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAGwAbABsAGwAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAGwAbABsAGwAbABsAGwAbAAYAGwAbABsAGwAbABsAGwAbABsAGwAGABsAGwAXABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAAAAAAGAAYABgAGAAYABgAGAAAABgAGAAAABgAGAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAAAAAAiwXLBQsGSwaLBssGCwdLB4sHBgAGAAYABgAGAAYABgAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAXABcAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUAAAAFAAAAAAAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUAAAAFAAAABQAAAAAAAAAAAAAAAAAFAAAAAAAAAAAABQAAAAUAAAAFAAAABQAFAAUAAAAFAAUAAAAFAAAAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUABQAAAAUAAAAAAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAUABQAAAAUABQAFAAUAAAAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAABQAFAAUAAAAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAywLLAgsDSwOLA8sDCwRLBIsEywQLBUsFSwUAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABoAGgAaABoAGgAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAGwAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAABQAFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFDAUABQAFAAUABQAFAAUABQBFDwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUPBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUARQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQAAAAAAAAAAAAAAAABqA3IDegOCA5oDogOqA7IDigOSA4oDkgOKA5IDigOSA4oDkgOKA5IDuAPAA8gD0APYA+AD3APkA+wD9APvA/cDigOSA4oDkgP/AwcEigOSA4oDkgOKA5IDDQQVBB0EJQQtBDUEPQRFBEsEUwRbBGMEawRzBHkEgQSJBJEEmQShBK0EqQS1BB8EHwTFBM0EvQTVBNcE3wTnBO8E8AT4BAAFCAXwBBAFFQUIBfAEHQUlBe8EKgUyBecENwWKAz8FQwVLBUwFVAVcBe8EZAVsBecE7wSKA/gE5wSKA4oDcgWKA4oDeAWABYoDigOEBYwFigOQBZcFigOfBacFrgU2BYoDigO2Bb4FxgXOBYoDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA9YFigPeBYoDigOKA+YFigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigPuBYoDigOKA/YF9gX8BPwEigP8BQQG3gUaBgwGDAYiBikGEgaKA4oDigMxBjkGigOKA4oDOwZDBksGigNSBloGigNiBooDigNqBm0GNwV1BgEEfQaKA4QGigOJBooDigOKA4oDjwaXBooDigOKA4oDigOKA9gDnwaKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA6cGrwazBssG0Qa7BsMG2QbhBuUGsQXtBvUG/QaKAwUHQwZDBkMGFQcdByUHLQcyBzoHQgcNB0oHUgeKA1gHXwdDBkMGZQdDBmIFagdDBnIHigOKA0AGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZ6B0MGQwZDBkMGQwaAB0MGQwaIB5AHigOKA4oDigOKA4oDigOKA0MGQwZDBkMGoAenB68HmAe/B8cHzwfWB94H5gftB7cHQwZDBkMG9Qf7BwEICQgOCIoDigOKA4oDigOKA4oDFQiKA4oDigMdCIoDigOKA9gDJQgtCDQIigM8CEMGQwZGBkMGQwZDBkMGQwZDBkMISQhZCFEIigOKA2EI5gWKA7EDigOKA4oDigOKA4oDQwYcCL8DigM4CGkIigNxCA4IigOKA4oDigN5CIoDigM7BrADigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA0MGQwaKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDOAhDBmIFigOKA4oDigOKA4oDigOKA4oDgAiKA4oDhQhMBYoDigOSBUMGOgaKA4oDjQiKA4oDigOVCJwIDAakCIoDigOrCLMIigO6CMEIigPVBMYIigPuBIoDzgjWCPAEigPaCO8E4giKA4oDigOKA4oDigOKA+kIigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA/0I8Qj1CIkEiQSJBIkEiQSJBIkEiQSJBIkEiQSJBIkEiQQFCYkEiQSJBIkEDQkRCRkJIQklCS0JiQSJBIkEMQk5CXoDQQlJCYoDigOKA1EJigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKAygOKA5oDqgOKA4oDigOKA4oDigO4A4gD2APcA+wD7wPKA4oDvwPKA4oDigONBB0ELQQ9BAsEWwRrBHkESQSZBJACoAKwAr6CqABoAGgAaABoAGgAaABoAGgASMLoAGgAaABoAGgAaABoAGgAaABYAugAaABlQvVCxUMVQyVDNUMoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEVDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABFQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgARUNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEVDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABFQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgARUNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEVDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABFQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgARUNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEVDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABFQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgARUNVQ1lDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEVDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABFQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgARUNigOKA4oDigOKA4oDigOKA1kJigNDBkMGYQnmBYoD6ASKA4oDigOKA4oDigOKA2kJigOKA4oDcAmKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigMfBB8EHwQfBB8EHwQfBB8EeAkfBB8EHwQfBB8EHwQfBIAJhAkfBB8EHwQfBJQJjAkfBJwJHwQfBKQJqgkfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwSyCR8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBO8ErQi6CcEJAQTECYoDigPVBMwJigPSCQEE1wn4BYoDigPfCYoDigOKA4oDHQjnCQEE8ARLBe4JigOKA4oDigOKA60I9gmKA4oD+gkCCooDigOKA4oDigOKAwYKDgqKA4oDFgpLBTIIigMeCooDigPWBSYKigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDKgqKA4oDMgo4CooDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigM+CooDRAqKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA0oKigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDCQVSCooDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigNZCmEKZwqKA4oDQwZDBm8KigOKA4oDigOKA0MGQwZnB4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA3EKigN4CooDdAqKA3sKigODCocKigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigPYA48K2AOWCp0KpQqKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOtCrUKigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKAx8EHwQfBB8EHwQfBL0KHwTFCsUKzAofBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBB8EHwQfBIkEiQSJBIkEiQSJBIkE1AofBB8EHwQfBB8EHwQfBB8EQwbcCkMGQwZGBuEK5QpDCO0KigOKA/MKigOKA4oDigOKA4oDigOKA4oDigOKA4oDQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGQwZDBkMGaAf7CkMGQwZDBkYGQwZDBjAIigPcCkMGAwtDBgsLRQiKA4oDGwsjCysLigNECIoD5gWKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigMTC4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKA4oDigOKAxMLOwszCzMLMws8CzwLPAs8C9gD2APYA9gD2APYA9gDRAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8CzwLPAs8C2kDaQNpAxIAEgASABIAEgASABIAEgASAAgABwAIAAkABwASABIAEgASABIAEgASABIAEgASABIAEgASABIABwAHAAcACAAJAAoACgAEAAQABAAKAAoACjEK8goAAwAGAAMABgAGAAIAAgACAAIAAgACAAIAAgACAAIABgAKAApQCgAK0AoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClEKAArSCgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApRCgAK0goAEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIAEgASABIAEgAHABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgAGAAoABAAEAAQABAAKAAoACgAKAAAACpAKALIACgAKAAQABAACAAIACgAAAAoACgAKAAIAAAAKkAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAACgAKAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAKAAoAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAKAAoABAABALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAEAsQABALEAsQABALEAsQABALEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAUABQAFAAUABQAFAAoACgANAAQABAANAAYADQAKAAoAsQCxALEAsQCxALEAsQCxALEAsQCxAA0ArQgNAA0ADQBNAA0AjQCNAI0AjQBNAI0ATQCNAE0ATQBNAE0ATQCNAI0AjQCNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ALQBNAE0ATQBNAE0ATQBNAI0ATQBNALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUADQBNAE0AsQCNAI0AjQANAI0AjQCNAE0ATQBNAE0ATQBNAE0ATQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0AjQBNAE0AjQCNAI0AjQCNAI0AjQCNAI0ATQCNAE0AjQBNAE0AjQCNAA0AjQCxALEAsQCxALEAsQCxAAUACgCxALEAsQCxALEAsQANAA0AsQCxAAoAsQCxALEAsQCNAI0AAgACAAIAAgACAAIAAgACAAIAAgBNAE0ATQANAA0ATQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQCtAI0AsQBNAE0ATQCNAI0AjQCNAI0ATQBNAE0ATQCNAE0ATQBNAE0ATQBNAE0ATQBNAI0ATQCNAE0AjQBNAE0AjQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAA0ADQCNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQCNAI0AjQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQCNAI0ATQBNAE0ATQCNAE0AjQCNAE0ATQBNAI0AjQBNAE0ATQBNAE0ATQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AsQCxALEAsQCxALEAsQCxALEAsQCxAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAEAAQABAAEAAQABAAEAAQABAAEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAsQCxALEAsQCxALEAsQCxALEAAQABAAoACgAKAAoAIQABAAEAAQABAAEAsQCxALEAsQABALEAsQCxAAEAsQCxALEAsQCxAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABALEAsQCxALEAAQCxALEAsQCxALEAgQBBAEEAQQBBAEEAgQCBAEEAgQBBAEEAQQBBAEEAQQBBAEEAQQBBAIEAQQABAAEAAQCxALEAsQABAAEAAQABALEAsQAFALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQBNAE0ATQBNAE0ATQBNAE0ATQBNAI0AjQCNAA0AjQBNAE0AjQCNAE0ATQANAE0ATQBNAI0ATQBNAE0ATQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAALEAAAAAAAAAAACxALEAsQCxALEAsQCxALEAAAAAAAAAAACxAAAAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAAAAAAAALEAsQAAAAAAsQCxALEAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxAAAAsQCxAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxAAAAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAQACgAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAsQCxALEAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAKAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAsQCxALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQAAALEACjEK8goxCvIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAALEAsQCxALEAsQAAALEAsQAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAALEAsQCxALEAsQCxAAAAsQCxAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxALEAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKMQryAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAQAAACxAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACxAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgBKAAoACgAqALEAsQCxABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQBAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAALEAsQCxAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAKAAAAAAAAAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAALEAsQCxALEAsQCxALEAAACxAAAAsQAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQCxALEAsQCxAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAALEAsQAAALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQCxAAAAAAAAALEAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAsQAAAAAAAAAAAAAAAACxAAAAAAAAALEAsQAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAACxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAoACgAKAAoABgAKMQryCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACQCyALIAsgCyALIAEgAUCBUIEwgWCLIAsgCyALIAsgCyAAIAAAAAAAAAAgACAAIAAgACAAIAAwADAAoACjEK8gAACQAJAAkACQAJAAkACQAJAAkACQAJALIAEgQyBKAIoQgKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAkABwCrCK4IsAisCK8IBgAEAAQABAAEAAQACgAKAAoACgAKMArwCgAKAAoACgAKAAIAAgACAAIAAgACAAIAAgACAAIAAwADAAoACjEK8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAKAAoAAAAKAAoACgAKAAAACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAoACgAKAAAAAAAAAAAAAAAKAAoACgAKAAoACgAAAAoAAAAKAAAACgAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAAAAAAAAAoQCgAKAAoACgAAAAAAAAAAAAAACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AoACgAKMArwCpAKkAqQChAKkAqQChAKEAqQCpAKkAqQCpAKEAoAChAKEAoQChAKAAoACgAKcApwCnAKsAqwCrAKAAoACgAKEAMABAAKAAqQChAKAAoACgAKEAoQChAKEAoAChAKEAoQChAKAAoQCgAKEAoACgAKAAoAChAKEAoQChAKEAoQChAKEAoQCgAKAAoACgAKAAoQCgAKEAowCvAKEAoQChAKEAoQCpAKEAoQChAKEAoQChAKEAoQChAKAAoACgAKAAoACjAK8AowCvAKAAoACgAKAAoACgAKAAoACgAKEAoQCgAKEAoACjAK8AowCvAKMArwCjAK8AoACgAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKEAoACgAKMArwCjAK8AoACgAKAAoACgAKkAoACgAKAAoACgAKAAoACgAKAAowCvAKAAoACpAKEAqQCpAKEAqQChAKEAoQChAKMArwCjAK8AowCvAKMArwChAKAAoACgAKAAoAChAKEAoACgAKAAoACgAKAAoACgAKAAowCvAKMArwCpAKAAoACjAK8AoACgAKAAoACjAK8AowCvAKMArwCjAK8AowCvAKAAoACgAKAAoACgAKAAoACjEK8goxCvIKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAChAKEAoACgAKAAoACgAKAAoACjEK8goACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACjEK8goxCvIKMQryCjEK8goxCvIKMQryCjEK8goACgAKAAoACgAKAAoACgAKAAoAChAKAAoACjAK8AoxCvIKAAowCvAKAApQChAK0AoACgAKAAoACgAKEAoQCjAK8AoACgAKAAoACgAKEAowCvAKAAoACgAKMArwCjAK8AoxCvIKMQryCjEK8goxCvIKMQryCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoQCgAKEAoQChAKAAoAChAKEAoACgAKAAoACgAKAAoACgAKAAoAChAKkAoQChAKMArwCgAKAAoxCvIKAAoACgAKAAoACjEK8goxCvIKMQryCjEK8goxCvIKcQoyCvEKsgoxCvIKMQryCjEK8goxCvIKAAoAChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoACgAKAAoACgAKAAoACgAKkAoACgAKAAoACgAKAAoACjAK8AoQChAKMArwCgAKAAoAChAKAAoACgAKAAoQCjAK8AowCvAKAAowCvAKAAoACjEK8goxCvIKEAoACgAKAAoACgAKEAqQCpAKkAoQCgAKAAoACgAKAAowCvAKEAoACgAKAAoAChAKAAoACgAKMArwCjAK8AoQCgAKEAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQCgAKEAoQChAKEAoACgAKEAoAChAKAAoAChAKAAowCvAKMArwCgAKAAoACgAKAAowCvAKAAoACgAKAAoACgAKMArwChAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKEAoQCgAKAAoACgAKAAoACgAKMArwCgAKAAoACgAKEAoQChAKEAoAChAKEAoACgAKEAoQCgAKAAoACgAKMArwChAKEAowCvAKMArwCjAK8AowCvAKEAoQChAKEAoQChAKMArwChAKEAoQChAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKEAoQChAKEAowCvAKEAoACgAKMArwCjAK8AowCvAKMArwCgAKMArwChAKEAowCvAKEAoQChAKEAoQChAKMArwCjAK8AowCvAKMArwChAKEAoQChAKEAoQCjAK8AowCvAKMArwCjAK8AowCvAKAAoACgAKAAoAChAKAAqQCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAKAAoACjAK8AowCvAKAAoACgAKMArwCgAKMArwCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAowCvAKAAoACjAK8AoxCvIKMQryCjEK8goxCvIKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAAAAAAKAAAAAAAAAAAAAAAKAAoAAAAAAAAAAAAAAAoACgAKAAkACgAKAAoACgAAAAAAAAAKMQryCjEK8goxCvIKMQryCjEK8goACgAKMQryCjEK8goxCvIKMQryCgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAoAsQCxALEAsQCxALEAsQCxALEAsQAKAAoAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAALEAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAGAAAAAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxALEAsQCxAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAACxALEAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAALEAsQCxAAAAAACxALEAAAAAAAAAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQADAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQCxAAEADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ACgAKAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAoADQANALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoABgAKAAYAAAAKAAYACgAKAAoACjEK8goxCvIKMQryBAAKAAoAAwADAAowCvAKAAAACgAEAAQACgAAAAAAAAAAAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AsgAAAAoACgAEAAQABAAKAAoACjEK8goAAwAGAAMABgAGAAIAAgACAAIAAgACAAIAAgACAAIABgAKAApQCgAK0AoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClEKAArSCgAKMQryCgAKMQryCgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQACgAKAAoABAAEAAAACgAKAAoACgAKAAoACgAAABIAEgASABIAEgASABIAEgASAKoAqgCqAAoACgASABIAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAACxAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAoAAQCxALEAsQABALEAsQABAAEAAQABAAEAsQCxALEAsQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQCxALEAsQABAAEAAQABALEAQQCBAAEAAQCBALEAsQABAAEAAQABAEEAQQBBAEEAgQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAEEAQQBBAEEAQQCBAAEAgQABAIEAgQABAAEAYQCBAIEAgQCBAIEAQQBBAEEAQQBhAEEAQQBBAEEAQQCBAEEAQQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAoACgAKAAoACgAKAAoAQQCBAEEAgQCBAIEAQQBBAEEAgQBBAEEAgQBBAIEAgQBBAIEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAgQCBAIEAgQBBAEEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAAsQCxAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQAAALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxAAAAAACxAAAAsQCxAAAAAAAAAAAAAAAAALEAAAAAAAAAAACxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAAACxAAAAAAAAAAAAsQCxAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAAAAAAAAAAAAAsQCxAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAAAAAALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQAAAAAAsQCxALEAsQCxALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQAAALEAsQCxALEAsQCxAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAAAAALEAsQCxALEAsQCxALEAAACxALEAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsgCyALIAsgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAALIAsgCyALIAsgCyALIAsgCxALEAsQCxALEAsQCxALEAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgCxALEAsQAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKEAAAAAAAAAAAAAAAAAAAAAAAAAAAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxAAAAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxAAAAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAACxALEAsQCxALEAsQCxAAAAsQCxAAAAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAsQCxALEAsQCxALEAsQABAAEAAQABAAEAAQABAAEAAQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAsQCxALEAsQCxALEAsQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAoACgANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAIAAgACAAIAAgACAAIAAgACAAIAAgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyABIAsgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgAAAAAAAAAAAAABAgcIAwkGBQQECgoMCgoKCwoEBAQEDQ4BAgQFBw8RBwkHAAcDEhUEASIkJScvMScpJwEBIzI1ACECJCUnLzEnKScCAiMyNQEhIiYmKDAxKCgoAwMDMjUBISIEJScvMUoLSgQEIxIVAiEiJAUnLzEnKUwFBSMyNQMhIgYGKDAxKChNBgYjEhUDISIkJQcvMQdOBwcHIzI1BCEiJiYIMDEICAgICCMyNQQhIgQlBy8xBwkHCQkjEhUEYWIEZYdvcYeOhwqHYxIVAiEiBCUnLzEnCycLCyMSFQJhYmQFh29xh46HDIdjcnUDYWIGBohwcYiIiA2IYxIVAyEihCUHLzEHDgcODiOSlQQhIiQlJw8xJyknDycjMjUFISImJigQMSgoKBAoIzI1BSEiJCUnLxEnKScRJyMyNQYhIhIlJy8xUxRTEhIjEhUAYWISZYdvcYeOhxOHYxIVACEiEiUnLzEnFCcUFCMSFQAhIhUlJy8xVhdWFRUjEhUDYWIVZYdvcYeOhxaHYxIVAyEiFSUnLzEnFycXFyMSFQMAAhERAAAAAABCAQEAAAAAAAIEBBMTAAEAIjQ0AwMAAAACBAQTEwACAQACAgAAAAABAAECExMAAQEAAgIAAAABITAGBAMDMAAhMAYEBQUwAyEwBgQFBTACITAGBAMDMAEAAQIDBAABDQ4AYgEBAAAAAABiAQEAMAAEAGJUVBMwAAMwQlRUAzAwAzBCBAQTMDAEEwABAQAAAAAjAAEBAkAAASMAAQECQAAAAwADNhRAAAFTQAU2BEBAAFNABTYEQEABU0AGBgRAQAMAAQIFBgcIAAEJCgsMAAEAAgAAAAAAAQMDFBQAAQABAAIVFQACAAEDAxQUAAIAITMzBAQAAAAhADIFBQAAAGMAAQAAAAAAYwABEjAABCBjIAECMCADAGNVVhQwAAMwQ1VWBDAwAzBDBVYUMDAEMENVBhQwMAQAAQAAAAAAAAABAAAUFAABAAEAABUVAAIAAQAAFBQAAiABICAEBCABIAEgIAUFIAEBAAEBAAAAAAEAAQEUFAABAQABAQAAAAEBAAEBBQUAASEAISEEBAAAAQABAQUFAAAAAxERAAAAACADAQECICACIAMBAQIgIAEAAwUFFAAAASADBQUEICABAAMFBRQAAAICAAEBAAAAAAIAAQEAAAABAgAUFBMAAAEiAAQEAwAAACIABAQDAAABAQACAgAAAAABAAEDFBQAAQEAAgIAAAABAQABAwUFAAEhACEDBAQAAAEAAQMFBQAAAAAAAAAAAAAAAQADAAEAAQAAAgIAAAECAAEBAgABAQMAAAAAAAAAAAABAAMAAQADAAABAgAAAQIAAQECAAEBAwACBAYICgwOAAEAAAAAAAECAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECAwAAAAAAAAAAAAAAAAABAAAAAQIDAAECAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAgMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQEBAQDAwMAAwADAwMDAwMDAwMDAAABAAEAAQABAAECAwABAAECAwABAAECAwABAgMAAQIDAAECAwABAgMAAQABAAEAAQABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAAEAAQIDAAEAAQABAAEAAAAtAAMDLAMtAwQqBAQNDQ0GBh8fIyMhISgoAQELCzc3NwAJHRMWGBoQLC0tAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEHQADAwMAAywsLQQEBAQEBAQEDQ0NDQ0NDQYGBgYGBgYGBh8fHx8fHx8fHyMjIyEhKAEJCQkJCQkdHQsmCxMTEwsLCwsLCxYWFhYaGhoaOBUNKhERDiwsLCwsLCwsNy83LC0tLi4AKgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYfAAAAAAAAAAAAACMhAQAAFQAAAAAAAAAAAAAAAAAAAAACAAUMDAcHDycyEisrMDEUFxkbJAoIHCAiHgclKQUMBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANTQzBAQEBAQEBA0NBgYfIwEBAQkJCwsLGBgaGhoWHx8jDQ0jHw0DAzc3LSwsNjYNIyMTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQNKAkdFhgtLR8sOQAGIQtVHwETAAQEBB8tVlhXAAA6PDxAQD0AUgBUVAAAQU9TQ0NDRD5QRUZMOztISEtJSUlKAABNAAAAAAAARz9OUUJOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQBTdDl0eXBlX2luZm8ATjEwX19jeHhhYml2MTIwX19zaV9jbGFzc190eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fY2xhc3NfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTlfX3BvaW50ZXJfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMTdfX3BiYXNlX3R5cGVfaW5mb0U=';
var tempDoublePtr = STATICTOP;
STATICTOP += 16;
function __ZSt18uncaught_exceptionv() {
    return !!__ZSt18uncaught_exceptionv.uncaught_exception;
}
var EXCEPTIONS = {
    last: 0,
    caught: [],
    infos: {},
    deAdjust: function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted])
            return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
            var info = EXCEPTIONS.infos[ptr];
            if (info.adjusted === adjusted) {
                return ptr;
            }
        }
        return adjusted;
    },
    addRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
    },
    decRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount--;
        if (info.refcount === 0 && !info.rethrown) {
            if (info.destructor) {
                Module['dynCall_vi'](info.destructor, ptr);
            }
            delete EXCEPTIONS.infos[ptr];
            ___cxa_free_exception(ptr);
        }
    },
    clearRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
    }
};
function ___resumeException(ptr) {
    if (!EXCEPTIONS.last) {
        EXCEPTIONS.last = ptr;
    }
    throw ptr + ' - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.';
}
function ___cxa_find_matching_catch() {
    var thrown = EXCEPTIONS.last;
    if (!thrown) {
        return (setTempRet0(0), 0) | 0;
    }
    var info = EXCEPTIONS.infos[thrown];
    var throwntype = info.type;
    if (!throwntype) {
        return (setTempRet0(0), thrown) | 0;
    }
    var typeArray = Array.prototype.slice.call(arguments);
    var pointer = Module['___cxa_is_pointer_type'](throwntype);
    if (!___cxa_find_matching_catch.buffer)
        ___cxa_find_matching_catch.buffer = _malloc(4);
    HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
    thrown = ___cxa_find_matching_catch.buffer;
    for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
            thrown = HEAP32[thrown >> 2];
            info.adjusted = thrown;
            return (setTempRet0(typeArray[i]), thrown) | 0;
        }
    }
    thrown = HEAP32[thrown >> 2];
    return (setTempRet0(throwntype), thrown) | 0;
}
function ___gxx_personality_v0() {
}
function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest;
}
function ___setErrNo(value) {
    if (Module['___errno_location'])
        HEAP32[Module['___errno_location']() >> 2] = value;
    return value;
}
DYNAMICTOP_PTR = staticAlloc(4);
STACK_BASE = STACKTOP = alignMemory(STATICTOP);
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = alignMemory(STACK_MAX);
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
staticSealed = true;
var ASSERTIONS = false;
function intArrayToString(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
        var chr = array[i];
        if (chr > 255) {
            if (ASSERTIONS) {
            }
            chr &= 255;
        }
        ret.push(String.fromCharCode(chr));
    }
    return ret.join('');
}
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
    var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    do {
        enc1 = keyStr.indexOf(input.charAt(i++));
        enc2 = keyStr.indexOf(input.charAt(i++));
        enc3 = keyStr.indexOf(input.charAt(i++));
        enc4 = keyStr.indexOf(input.charAt(i++));
        chr1 = enc1 << 2 | enc2 >> 4;
        chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        chr3 = (enc3 & 3) << 6 | enc4;
        output = output + String.fromCharCode(chr1);
        if (enc3 !== 64) {
            output = output + String.fromCharCode(chr2);
        }
        if (enc4 !== 64) {
            output = output + String.fromCharCode(chr3);
        }
    } while (i < input.length);
    return output;
};
function intArrayFromBase64(s) {
    if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
        var buf;
        try {
            buf = Buffer.from(s, 'base64');
        } catch (_) {
            buf = new Buffer(s, 'base64');
        }
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    try {
        var decoded = decodeBase64(s);
        var bytes = new Uint8Array(decoded.length);
        for (var i = 0; i < decoded.length; ++i) {
            bytes[i] = decoded.charCodeAt(i);
        }
        return bytes;
    } catch (_) {
        throw new Error('Converting base64 string to bytes failed.');
    }
}
function tryParseAsDataURI(filename) {
    if (!isDataURI(filename)) {
        return;
    }
    return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}
function invoke_iii(index, a1, a2) {
    try {
        return Module['dynCall_iii'](index, a1, a2);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_iiii(index, a1, a2, a3) {
    try {
        return Module['dynCall_iiii'](index, a1, a2, a3);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_vi(index, a1) {
    try {
        Module['dynCall_vi'](index, a1);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiii(index, a1, a2, a3, a4) {
    try {
        Module['dynCall_viiii'](index, a1, a2, a3, a4);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    try {
        Module['dynCall_viiiii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module['dynCall_viiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
Module.asmGlobalArg = {
    'Math': Math,
    'Int8Array': Int8Array,
    'Int16Array': Int16Array,
    'Int32Array': Int32Array,
    'Uint8Array': Uint8Array,
    'Uint16Array': Uint16Array,
    'Uint32Array': Uint32Array,
    'Float32Array': Float32Array,
    'Float64Array': Float64Array,
    'NaN': NaN,
    'Infinity': Infinity,
    'byteLength': byteLength
};
Module.asmLibraryArg = {
    'abort': abort,
    'assert_em': assert_em,
    'enlargeMemory': enlargeMemory,
    'getTotalMemory': getTotalMemory,
    'abortOnCannotGrowMemory': abortOnCannotGrowMemory,
    'invoke_iii': invoke_iii,
    'invoke_iiii': invoke_iiii,
    'invoke_vi': invoke_vi,
    'invoke_viiii': invoke_viiii,
    'invoke_viiiii': invoke_viiiii,
    'invoke_viiiiii': invoke_viiiiii,
    '__ZSt18uncaught_exceptionv': __ZSt18uncaught_exceptionv,
    '___cxa_find_matching_catch': ___cxa_find_matching_catch,
    '___gxx_personality_v0': ___gxx_personality_v0,
    '___resumeException': ___resumeException,
    '___setErrNo': ___setErrNo,
    '_emscripten_memcpy_big': _emscripten_memcpy_big,
    'DYNAMICTOP_PTR': DYNAMICTOP_PTR,
    'tempDoublePtr': tempDoublePtr,
    'ABORT': ABORT,
    'STACKTOP': STACKTOP,
    'STACK_MAX': STACK_MAX
};
var asm = function (global, env, buffer) {
    'almost asm';
    var a = global.Int8Array;
    var b = new a(buffer);
    var c = global.Int16Array;
    var d = new c(buffer);
    var e = global.Int32Array;
    var f = new e(buffer);
    var g = global.Uint8Array;
    var h = new g(buffer);
    var i = global.Uint16Array;
    var j = new i(buffer);
    var k = global.Uint32Array;
    var l = new k(buffer);
    var m = global.Float32Array;
    var n = new m(buffer);
    var o = global.Float64Array;
    var p = new o(buffer);
    var q = global.byteLength;
    var r = env.DYNAMICTOP_PTR | 0;
    var s = env.tempDoublePtr | 0;
    var t = env.ABORT | 0;
    var u = env.STACKTOP | 0;
    var v = env.STACK_MAX | 0;
    var w = 0;
    var x = 0;
    var y = 0;
    var z = 0;
    var A = global.NaN, B = global.Infinity;
    var C = 0, D = 0, E = 0, F = 0, G = 0;
    var H = 0;
    var I = global.Math.floor;
    var J = global.Math.abs;
    var K = global.Math.sqrt;
    var L = global.Math.pow;
    var M = global.Math.cos;
    var N = global.Math.sin;
    var O = global.Math.tan;
    var P = global.Math.acos;
    var Q = global.Math.asin;
    var R = global.Math.atan;
    var S = global.Math.atan2;
    var T = global.Math.exp;
    var U = global.Math.log;
    var V = global.Math.ceil;
    var W = global.Math.imul;
    var X = global.Math.min;
    var Y = global.Math.max;
    var Z = global.Math.clz32;
    var _ = env.abort;
    var $ = env.assert_em;
    var aa = env.enlargeMemory;
    var ba = env.getTotalMemory;
    var ca = env.abortOnCannotGrowMemory;
    var da = env.invoke_iii;
    var ea = env.invoke_iiii;
    var fa = env.invoke_vi;
    var ga = env.invoke_viiii;
    var ha = env.invoke_viiiii;
    var ia = env.invoke_viiiiii;
    var ja = env.__ZSt18uncaught_exceptionv;
    var ka = env.___cxa_find_matching_catch;
    var la = env.___gxx_personality_v0;
    var ma = env.___resumeException;
    var na = env.___setErrNo;
    var oa = env._emscripten_memcpy_big;
    var pa = 0;
    function qa(newBuffer) {
        if (q(newBuffer) & 16777215 || q(newBuffer) <= 16777215 || q(newBuffer) > 2147483648)
            return false;
        b = new a(newBuffer);
        d = new c(newBuffer);
        f = new e(newBuffer);
        h = new g(newBuffer);
        j = new i(newBuffer);
        l = new k(newBuffer);
        n = new m(newBuffer);
        p = new o(newBuffer);
        buffer = newBuffer;
        return true;
    }
    function xa(a) {
        a = a | 0;
        var b = 0;
        b = u;
        u = u + a | 0;
        u = u + 15 & -16;
        return b | 0;
    }
    function ya() {
        return u | 0;
    }
    function za(a) {
        a = a | 0;
        u = a;
    }
    function Aa(a, b) {
        a = a | 0;
        b = b | 0;
        u = a;
        v = b;
    }
    function Ba(a, b) {
        a = a | 0;
        b = b | 0;
        if (!w) {
            w = a;
            x = b;
        }
    }
    function Ca(a) {
        a = a | 0;
        H = a;
    }
    function Da() {
        return H | 0;
    }
    function Ea(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, g = 0, h = 0, i = 0;
        g = u;
        u = u + 16 | 0;
        h = g;
        f[h >> 2] = 0;
        e = Bb(a, b, 0, 0, h) | 0;
        i = e + 1 | 0;
        f[h >> 2] = 0;
        c = dc(i << 1) | 0;
        Bb(a, b, c, i, h) | 0;
        if ((f[h >> 2] | 0) > 0) {
            ec(c);
            c = 0;
        } else
            d[c + (e << 1) >> 1] = 0;
        u = g;
        return c | 0;
    }
    function Fa(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0;
        e = u;
        u = u + 16 | 0;
        d = e;
        c = f[17158] | 0;
        if (!c) {
            c = Ia() | 0;
            f[17158] = c;
        }
        f[d >> 2] = 0;
        Na(c, a, b, -2, d);
        if ((f[d >> 2] | 0) > 0)
            c = 0;
        else
            c = lb(f[17158] | 0) | 0;
        u = e;
        return c | 0;
    }
    function Ga(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0;
        d = u;
        u = u + 16 | 0;
        c = d + 4 | 0;
        b = d;
        f[c >> 2] = 0;
        f[b >> 2] = 0;
        mb(f[17158] | 0, a, b, c);
        u = d;
        return ((f[c >> 2] | 0) > 0 ? 0 : f[b >> 2] | 0) | 0;
    }
    function Ha(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, g = 0, h = 0, i = 0;
        i = u;
        u = u + 16 | 0;
        h = i;
        f[h >> 2] = 0;
        e = f[17159] | 0;
        if (!e) {
            e = Ia() | 0;
            f[17159] = e;
        }
        rb(f[17158] | 0, a, b, e, h);
        if ((f[h >> 2] | 0) <= 0 ? (g = kb(e) | 0, b = g + 1 | 0, c = dc(b << 1) | 0, pb(f[17159] | 0, c, b, 10, h) | 0, (f[h >> 2] | 0) <= 0) : 0)
            d[c + (g << 1) >> 1] = 0;
        else
            c = 0;
        u = i;
        return c | 0;
    }
    function Ia() {
        var a = 0, b = 0;
        b = u;
        u = u + 16 | 0;
        a = b;
        f[a >> 2] = 0;
        a = Ja(a) | 0;
        u = b;
        return a | 0;
    }
    function Ja(a) {
        a = a | 0;
        var c = 0;
        do
            if ((a | 0) != 0 ? (f[a >> 2] | 0) <= 0 : 0) {
                c = Qb(364) | 0;
                if (!c) {
                    f[a >> 2] = 7;
                    c = 0;
                    break;
                }
                Gc(c | 0, 0, 364) | 0;
                f[c + 4 >> 2] = 248;
                b[c + 72 >> 0] = 1;
                b[c + 73 >> 0] = 1;
                if ((f[a >> 2] | 0) >= 1) {
                    La(c);
                    c = 0;
                }
            } else
                c = 0;
        while (0);
        return c | 0;
    }
    function Ka(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0;
        g = f[a >> 2] | 0;
        if (!g)
            if (c << 24 >> 24 != 0 ? (g = Qb(d) | 0, f[a >> 2] = g, (g | 0) != 0) : 0) {
                f[b >> 2] = d;
                a = 1;
            } else
                a = 0;
        else if ((f[b >> 2] | 0) < (d | 0))
            if (c << 24 >> 24 != 0 ? (e = Rb(g, d) | 0, (e | 0) != 0) : 0) {
                f[a >> 2] = e;
                f[b >> 2] = d;
                a = 1;
            } else
                a = 0;
        else
            a = 1;
        return a | 0;
    }
    function La(a) {
        a = a | 0;
        var b = 0;
        if (a | 0) {
            f[a >> 2] = 0;
            b = f[a + 48 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 52 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 56 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 60 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 64 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 68 >> 2] | 0;
            if (b | 0)
                Sb(b);
            b = f[a + 348 >> 2] | 0;
            if (b | 0)
                Sb(b);
            Sb(a);
        }
        return;
    }
    function Ma(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        d = 0;
        while (1) {
            if ((d | 0) >= (a | 0)) {
                e = 5;
                break;
            }
            if ((f[b + (d << 3) >> 2] | 0) > (c | 0))
                break;
            d = d + 1 | 0;
        }
        if ((e | 0) == 5)
            d = a + -1 | 0;
        return f[b + (d << 3) + 4 >> 2] & 255 | 0;
    }
    function Na(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, u = 0, v = 0, w = 0, x = 0, y = 0;
        a:
            do
                if (g | 0 ? (f[g >> 2] | 0) <= 0 : 0) {
                    if ((a | 0) == 0 | (c | 0) == 0 | (d | 0) < -1 | e + -126 << 24 >> 24 << 24 >> 24 > -1) {
                        f[g >> 2] = 1;
                        break;
                    }
                    if ((d | 0) == -1)
                        d = Tb(c) | 0;
                    t = a + 88 | 0;
                    if ((f[t >> 2] | 0) == 3) {
                        Oa(a, c, d, e, g);
                        break;
                    }
                    f[a >> 2] = 0;
                    f[a + 8 >> 2] = c;
                    y = a + 20 | 0;
                    f[y >> 2] = d;
                    f[a + 12 >> 2] = d;
                    l = a + 16 | 0;
                    f[l >> 2] = d;
                    r = a + 97 | 0;
                    b[r >> 0] = e;
                    i = e & 1;
                    j = i & 255;
                    m = a + 120 | 0;
                    f[m >> 2] = j;
                    w = a + 136 | 0;
                    f[w >> 2] = 1;
                    k = a + 76 | 0;
                    f[k >> 2] = 0;
                    n = a + 80 | 0;
                    f[n >> 2] = 0;
                    f[a + 228 >> 2] = 0;
                    x = a + 336 | 0;
                    f[x >> 2] = 0;
                    f[a + 340 >> 2] = 0;
                    c = (e & 255) > 253;
                    s = a + 98 | 0;
                    b[s >> 0] = c & 1;
                    if (!d) {
                        if (c) {
                            b[r >> 0] = i;
                            b[s >> 0] = 0;
                        }
                        f[a + 124 >> 2] = f[96 + (j << 2) >> 2];
                        f[a + 224 >> 2] = 0;
                        f[w >> 2] = 0;
                        Pa(a);
                        break;
                    }
                    f[a + 224 >> 2] = -1;
                    c = f[a + 60 >> 2] | 0;
                    v = a + 140 | 0;
                    f[v >> 2] = (c | 0) == 0 ? a + 144 | 0 : c;
                    c = a + 48 | 0;
                    i = a + 72 | 0;
                    if (!((Ka(c, a + 24 | 0, b[i >> 0] | 0, d) | 0) << 24 >> 24)) {
                        f[g >> 2] = 7;
                        break;
                    }
                    f[k >> 2] = f[c >> 2];
                    if (!((Qa(a) | 0) << 24 >> 24)) {
                        f[g >> 2] = 7;
                        break;
                    }
                    u = f[k >> 2] | 0;
                    p = f[l >> 2] | 0;
                    k = a + 132 | 0;
                    f[k >> 2] = p;
                    d = a + 52 | 0;
                    if (!((Ka(d, a + 28 | 0, b[i >> 0] | 0, p) | 0) << 24 >> 24)) {
                        f[g >> 2] = 7;
                        break;
                    }
                    f[n >> 2] = f[d >> 2];
                    j = Ra(a, g) | 0;
                    if ((f[g >> 2] | 0) <= 0) {
                        e = a + 244 | 0;
                        d = f[e >> 2] | 0;
                        do
                            if ((d | 0) >= 6) {
                                d = d << 4;
                                c = a + 44 | 0;
                                i = a + 68 | 0;
                                if ((d | 0) <= (f[c >> 2] | 0)) {
                                    d = f[i >> 2] | 0;
                                    break;
                                }
                                if (!((Ka(i, c, 1, d) | 0) << 24 >> 24)) {
                                    f[g >> 2] = 7;
                                    break a;
                                } else {
                                    d = f[i >> 2] | 0;
                                    break;
                                }
                            } else
                                d = a + 252 | 0;
                        while (0);
                        f[a + 248 >> 2] = d;
                        f[e >> 2] = -1;
                        f[m >> 2] = j;
                        b:
                            do
                                switch (j | 0) {
                                case 0: {
                                        f[k >> 2] = 0;
                                        break;
                                    }
                                case 1: {
                                        f[k >> 2] = 0;
                                        break;
                                    }
                                default: {
                                        switch (f[t >> 2] | 0) {
                                        case 0: {
                                                f[a + 116 >> 2] = 104;
                                                break;
                                            }
                                        case 1: {
                                                f[a + 116 >> 2] = 120;
                                                break;
                                            }
                                        case 2: {
                                                f[a + 116 >> 2] = 136;
                                                break;
                                            }
                                        case 4: {
                                                f[a + 116 >> 2] = 152;
                                                break;
                                            }
                                        case 5: {
                                                f[a + 116 >> 2] = f[a + 92 >> 2] & 1 | 0 ? 168 : 184;
                                                break;
                                            }
                                        case 6: {
                                                f[a + 116 >> 2] = f[a + 92 >> 2] & 1 | 0 ? 200 : 216;
                                                break;
                                            }
                                        default: {
                                            }
                                        }
                                        j = f[w >> 2] | 0;
                                        if ((j | 0) < 2 ? (f[a + 124 >> 2] | 0) >= 0 : 0) {
                                            do
                                                if (b[s >> 0] | 0) {
                                                    c = f[v >> 2] | 0;
                                                    i = f[c >> 2] | 0;
                                                    if ((i | 0) > 0)
                                                        d = b[r >> 0] | 0;
                                                    else
                                                        d = Ma(j, c, 0) | 0;
                                                    d = d & 1;
                                                    if ((p | 0) > (i | 0)) {
                                                        c = Ma(j, c, p + -1 | 0) | 0;
                                                        break;
                                                    } else {
                                                        c = b[r >> 0] | 0;
                                                        break;
                                                    }
                                                } else {
                                                    d = b[r >> 0] | 0;
                                                    c = d;
                                                    d = d & 1;
                                                }
                                            while (0);
                                            Sa(a, 0, p, d, c & 1);
                                        } else {
                                            n = f[n >> 2] | 0;
                                            if ((b[s >> 0] | 0) != 0 ? (o = f[v >> 2] | 0, (f[o >> 2] | 0) <= 0) : 0)
                                                d = Ma(j, o, 0) | 0;
                                            else
                                                d = b[r >> 0] | 0;
                                            i = b[n >> 0] | 0;
                                            m = p + -1 | 0;
                                            d = ((d & 255) < (i & 255) ? i : d) & 1;
                                            l = 0;
                                            while (1) {
                                                if ((l | 0) > 0 ? (b[u + (l + -1) >> 0] | 0) == 7 : 0) {
                                                    do
                                                        if (!(b[s >> 0] | 0))
                                                            q = 57;
                                                        else {
                                                            d = f[v >> 2] | 0;
                                                            if ((l | 0) < (f[d >> 2] | 0)) {
                                                                q = 57;
                                                                break;
                                                            }
                                                            d = Ma(f[w >> 2] | 0, d, l) | 0;
                                                        }
                                                    while (0);
                                                    if ((q | 0) == 57) {
                                                        q = 0;
                                                        d = b[r >> 0] | 0;
                                                    }
                                                    d = d & 1;
                                                }
                                                e = l;
                                                while (1) {
                                                    k = e + 1 | 0;
                                                    if ((k | 0) >= (p | 0)) {
                                                        q = 64;
                                                        break;
                                                    }
                                                    c = b[n + k >> 0] | 0;
                                                    if (c << 24 >> 24 == i << 24 >> 24) {
                                                        e = k;
                                                        continue;
                                                    }
                                                    if (!(1 << h[u + k >> 0] & 382976)) {
                                                        j = 1;
                                                        break;
                                                    } else
                                                        e = k;
                                                }
                                                c:
                                                    do
                                                        if ((q | 0) == 64) {
                                                            q = 0;
                                                            do
                                                                if (b[s >> 0] | 0) {
                                                                    c = f[v >> 2] | 0;
                                                                    if ((p | 0) <= (f[c >> 2] | 0))
                                                                        break;
                                                                    c = Ma(f[w >> 2] | 0, c, m) | 0;
                                                                    j = 0;
                                                                    break c;
                                                                }
                                                            while (0);
                                                            c = b[r >> 0] | 0;
                                                            j = 0;
                                                        }
                                                    while (0);
                                                o = i & 255;
                                                i = c & 255;
                                                i = ((o & 127) >>> 0 < (i & 127) >>> 0 ? i : o) & 1;
                                                if (!(o & 128))
                                                    Sa(a, l, k, d, i);
                                                else {
                                                    d = l;
                                                    while (1) {
                                                        o = n + d | 0;
                                                        b[o >> 0] = b[o >> 0] & 127;
                                                        if ((d | 0) < (e | 0))
                                                            d = d + 1 | 0;
                                                        else
                                                            break;
                                                    }
                                                }
                                                if (j) {
                                                    d = i;
                                                    i = c;
                                                    l = k;
                                                } else
                                                    break;
                                            }
                                        }
                                        d = f[a + 344 >> 2] | 0;
                                        if ((d | 0) > 0) {
                                            f[g >> 2] = d;
                                            break a;
                                        } else {
                                            Ta(a);
                                            break b;
                                        }
                                    }
                                }
                            while (0);
                        k = a + 92 | 0;
                        d:
                            do
                                if ((b[s >> 0] | 0 ? f[k >> 2] & 1 | 0 : 0) ? ((f[t >> 2] | 0) + -5 | 0) >>> 0 < 2 : 0) {
                                    e = 0;
                                    while (1) {
                                        if ((e | 0) >= (f[w >> 2] | 0))
                                            break d;
                                        c = f[v >> 2] | 0;
                                        d = (f[c + (e << 3) >> 2] | 0) + -1 | 0;
                                        e:
                                            do
                                                if (f[c + (e << 3) + 4 >> 2] & 255 | 0) {
                                                    if (!e)
                                                        i = 0;
                                                    else
                                                        i = f[c + (e + -1 << 3) >> 2] | 0;
                                                    c = d;
                                                    while (1) {
                                                        if ((c | 0) < (i | 0))
                                                            break e;
                                                        j = b[u + c >> 0] | 0;
                                                        if (!(j << 24 >> 24))
                                                            break;
                                                        if (1 << (j & 255) & 8194 | 0)
                                                            break e;
                                                        c = c + -1 | 0;
                                                    }
                                                    if ((c | 0) < (d | 0))
                                                        while (1)
                                                            if ((b[u + d >> 0] | 0) == 7)
                                                                d = d + -1 | 0;
                                                            else
                                                                break;
                                                    Ua(a, d, 4);
                                                }
                                            while (0);
                                        e = e + 1 | 0;
                                    }
                                }
                            while (0);
                        if (!(f[k >> 2] & 2))
                            d = (f[y >> 2] | 0) + (f[x >> 2] | 0) | 0;
                        else
                            d = (f[y >> 2] | 0) - (f[a + 352 >> 2] | 0) | 0;
                        f[y >> 2] = d;
                        Pa(a);
                    }
                }
            while (0);
        return;
    }
    function Oa(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, u = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0;
        D = a + 88 | 0;
        f[D >> 2] = 0;
        do
            if (d) {
                i = Qb(d * 7 | 0) | 0;
                if (!i) {
                    f[g >> 2] = 7;
                    i = 0;
                    break;
                }
                k = i + (d << 2) | 0;
                C = k + (d << 1) | 0;
                l = a + 92 | 0;
                m = f[l >> 2] | 0;
                if (m & 1 | 0)
                    f[l >> 2] = m & -4 | 2;
                e = e & 1;
                Na(a, c, d, e, g);
                if ((f[g >> 2] | 0) <= 0) {
                    y = tb(a, g) | 0;
                    w = a + 16 | 0;
                    x = f[w >> 2] | 0;
                    Fc(C | 0, y | 0, x | 0) | 0;
                    y = a + 132 | 0;
                    z = f[y >> 2] | 0;
                    A = a + 120 | 0;
                    B = f[A >> 2] | 0;
                    j = pb(a, k, d, 2, g) | 0;
                    Ab(a, i, g);
                    if ((f[g >> 2] | 0) <= 0) {
                        f[l >> 2] = m;
                        f[D >> 2] = 5;
                        v = a + 72 | 0;
                        u = b[v >> 0] | 0;
                        b[v >> 0] = 0;
                        Na(a, k, j, e ^ 1, g);
                        b[v >> 0] = u;
                        vb(a, g);
                        a:
                            do
                                if ((f[g >> 2] | 0) <= 0) {
                                    o = a + 224 | 0;
                                    r = f[o >> 2] | 0;
                                    p = a + 228 | 0;
                                    q = f[p >> 2] | 0;
                                    k = 0;
                                    e = 0;
                                    g = 0;
                                    while (1) {
                                        if ((g | 0) >= (r | 0))
                                            break;
                                        n = f[q + (g * 12 | 0) + 4 >> 2] | 0;
                                        e = n - e | 0;
                                        b:
                                            do
                                                if ((e | 0) < 2)
                                                    e = k;
                                                else {
                                                    j = f[q + (g * 12 | 0) >> 2] & 2147483647;
                                                    m = j + e | 0;
                                                    e = k;
                                                    while (1) {
                                                        do {
                                                            k = j;
                                                            j = j + 1 | 0;
                                                            if ((j | 0) >= (m | 0))
                                                                break b;
                                                            l = f[i + (j << 2) >> 2] | 0;
                                                            k = f[i + (k << 2) >> 2] | 0;
                                                            v = l - k | 0;
                                                            if ((((v | 0) > -1 ? v : 0 - v | 0) | 0) != 1)
                                                                break;
                                                        } while ((b[C + l >> 0] | 0) == (b[C + k >> 0] | 0));
                                                        e = e + 1 | 0;
                                                    }
                                                }
                                            while (0);
                                        k = e;
                                        e = n;
                                        g = g + 1 | 0;
                                    }
                                    if (!k)
                                        u = q;
                                    else {
                                        e = a + 64 | 0;
                                        if (!((Ka(e, a + 40 | 0, b[a + 73 >> 0] | 0, (k + r | 0) * 12 | 0) | 0) << 24 >> 24))
                                            break;
                                        if ((r | 0) == 1) {
                                            v = f[e >> 2] | 0;
                                            f[v >> 2] = f[q >> 2];
                                            f[v + 4 >> 2] = f[q + 4 >> 2];
                                            f[v + 8 >> 2] = f[q + 8 >> 2];
                                        }
                                        u = f[e >> 2] | 0;
                                        f[p >> 2] = u;
                                        f[o >> 2] = (f[o >> 2] | 0) + k;
                                    }
                                    v = u + 4 | 0;
                                    e = r;
                                    while (1) {
                                        t = e + -1 | 0;
                                        if ((e | 0) <= 0)
                                            break a;
                                        if (!t)
                                            j = f[v >> 2] | 0;
                                        else
                                            j = (f[u + (t * 12 | 0) + 4 >> 2] | 0) - (f[u + ((e + -2 | 0) * 12 | 0) + 4 >> 2] | 0) | 0;
                                        r = u + (t * 12 | 0) | 0;
                                        e = f[r >> 2] | 0;
                                        s = e >>> 31;
                                        e = e & 2147483647;
                                        if ((j | 0) < 2)
                                            if (!k)
                                                j = 0;
                                            else {
                                                j = u + ((t + k | 0) * 12 | 0) | 0;
                                                f[j >> 2] = f[r >> 2];
                                                f[j + 4 >> 2] = f[r + 4 >> 2];
                                                f[j + 8 >> 2] = f[r + 8 >> 2];
                                                j = k;
                                            }
                                        else {
                                            m = (s | 0) == 0;
                                            g = j + -1 + e | 0;
                                            q = m ? e : g;
                                            n = m ? -1 : 1;
                                            o = u + (t * 12 | 0) + 4 | 0;
                                            p = u + (t * 12 | 0) + 8 | 0;
                                            g = m ? g : e;
                                            j = k;
                                            c:
                                                while (1) {
                                                    e = g;
                                                    while (1) {
                                                        if ((e | 0) == (q | 0))
                                                            break c;
                                                        k = f[i + (e << 2) >> 2] | 0;
                                                        l = e + n | 0;
                                                        m = f[i + (l << 2) >> 2] | 0;
                                                        E = k - m | 0;
                                                        if ((((E | 0) > -1 ? E : 0 - E | 0) | 0) != 1)
                                                            break;
                                                        if ((b[C + k >> 0] | 0) == (b[C + m >> 0] | 0))
                                                            e = l;
                                                        else
                                                            break;
                                                    }
                                                    E = f[i + (g << 2) >> 2] | 0;
                                                    E = (E | 0) < (k | 0) ? E : k;
                                                    m = j + t | 0;
                                                    f[u + (m * 12 | 0) >> 2] = (s ^ h[C + E >> 0]) << 31 | E;
                                                    f[u + (m * 12 | 0) + 4 >> 2] = f[o >> 2];
                                                    E = e - g | 0;
                                                    f[o >> 2] = (f[o >> 2] | 0) + ~((E | 0) > -1 ? E : 0 - E | 0);
                                                    E = f[p >> 2] & 10;
                                                    f[u + (m * 12 | 0) + 8 >> 2] = E;
                                                    f[p >> 2] = f[p >> 2] & ~E;
                                                    g = l;
                                                    j = j + -1 | 0;
                                                }
                                            if (j | 0) {
                                                E = u + ((j + t | 0) * 12 | 0) | 0;
                                                f[E >> 2] = f[r >> 2];
                                                f[E + 4 >> 2] = f[r + 4 >> 2];
                                                f[E + 8 >> 2] = f[r + 8 >> 2];
                                            }
                                            e = (f[i + (g << 2) >> 2] | 0) < (f[i + (q << 2) >> 2] | 0) ? g : q;
                                        }
                                        e = f[i + (e << 2) >> 2] | 0;
                                        f[u + ((j + t | 0) * 12 | 0) >> 2] = (s ^ h[C + e >> 0]) << 31 | e;
                                        e = t;
                                        k = j;
                                    }
                                }
                            while (0);
                        E = a + 97 | 0;
                        b[E >> 0] = b[E >> 0] ^ 1;
                    }
                    f[a + 8 >> 2] = c;
                    f[w >> 2] = x;
                    f[a + 12 >> 2] = d;
                    f[A >> 2] = B;
                    E = f[a + 28 >> 2] | 0;
                    Fc(f[a + 80 >> 2] | 0, C | 0, ((x | 0) > (E | 0) ? E : x) | 0) | 0;
                    f[y >> 2] = z;
                    if ((f[a + 224 >> 2] | 0) > 1)
                        f[A >> 2] = 2;
                }
            } else {
                Na(a, c, 0, e, g);
                i = 0;
            }
        while (0);
        Sb(i);
        f[D >> 2] = 3;
        return;
    }
    function Pa(a) {
        a = a | 0;
        f[a + 104 >> 2] = 0;
        f[a + 112 >> 2] = 0;
        f[a >> 2] = a;
        return;
    }
    function Qa(a) {
        a = a | 0;
        var c = 0, e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0, F = 0, G = 0, H = 0, I = 0, J = 0, K = 0, L = 0;
        L = u;
        u = u + 640 | 0;
        A = L;
        D = L + 504 | 0;
        B = f[a + 8 >> 2] | 0;
        C = f[a + 48 >> 2] | 0;
        H = f[a + 12 >> 2] | 0;
        I = a + 97 | 0;
        c = b[I >> 0] | 0;
        E = (c & 255) > 253;
        if (E)
            F = ((f[a + 88 >> 2] | 0) + -5 | 0) >>> 0 < 2;
        else
            F = 0;
        G = a + 92 | 0;
        K = f[G >> 2] | 0;
        i = K & 2;
        if (K & 4 | 0)
            f[a + 16 >> 2] = 0;
        c = c & 255;
        y = c & 1;
        z = y & 255;
        K = a + 140 | 0;
        e = (f[K >> 2] | 0) + 4 | 0;
        if (E) {
            f[e >> 2] = y;
            if ((f[a + 104 >> 2] | 0) > 0 ? (g = ib(a) | 0, g << 24 >> 24 != 10) : 0) {
                f[(f[K >> 2] | 0) + 4 >> 2] = g << 24 >> 24 != 0 & 1;
                c = z;
                e = 0;
            } else {
                c = z;
                e = 1;
            }
        } else {
            f[e >> 2] = c;
            c = 10;
            e = 0;
        }
        s = (i | 0) == 0;
        t = a + 136 | 0;
        v = a + 16 | 0;
        w = a + 352 | 0;
        r = -1;
        i = c;
        m = 0;
        p = 0;
        x = -1;
        c = 0;
        a:
            while (1) {
                if ((m | 0) >= (H | 0)) {
                    J = 49;
                    break;
                }
                g = m + 1 | 0;
                k = j[B + (m << 1) >> 1] | 0;
                if (!((g | 0) == (H | 0) | (k & 64512 | 0) != 55296)) {
                    l = j[B + (g << 1) >> 1] | 0;
                    q = (l & 64512 | 0) == 56320;
                    g = q ? m + 2 | 0 : g;
                    if (q) {
                        k = (k << 10) + -56613888 + l | 0;
                        q = g;
                    } else
                        q = g;
                } else
                    q = g;
                o = Ya(a, k) | 0;
                g = o & 255;
                o = o & 255;
                c = 1 << o | c;
                n = q + -1 | 0;
                l = C + n | 0;
                b[l >> 0] = g;
                if ((k | 0) > 65535) {
                    b[C + (q + -2) >> 0] = 18;
                    c = c | 262144;
                }
                if (!s)
                    p = p + (((k + -8294 | 0) >>> 0 < 4 | ((k & -4 | 0) == 8204 | (k + -8234 | 0) >>> 0 < 5)) & 1) | 0;
                switch (g << 24 >> 24) {
                case 0:
                    switch (e | 0) {
                    case 1: {
                            f[(f[K >> 2] | 0) + ((f[t >> 2] | 0) + -1 << 3) + 4 >> 2] = 0;
                            n = x;
                            o = r;
                            i = 0;
                            e = 0;
                            m = q;
                            x = n;
                            r = o;
                            continue a;
                        }
                    case 2: {
                            n = x;
                            o = r;
                            i = 0;
                            e = 3;
                            m = q;
                            c = (r | 0) < 126 ? c | 1048576 : c;
                            x = n;
                            r = o;
                            continue a;
                        }
                    default: {
                            l = x;
                            n = e;
                            o = r;
                            i = 0;
                            m = q;
                            x = l;
                            e = n;
                            r = o;
                            continue a;
                        }
                    }
                case 13:
                case 1: {
                        switch (e | 0) {
                        case 1: {
                                f[(f[K >> 2] | 0) + ((f[t >> 2] | 0) + -1 << 3) + 4 >> 2] = 1;
                                e = 0;
                                break;
                            }
                        case 2: {
                                if ((r | 0) < 126) {
                                    b[C + (f[A + (r << 2) >> 2] | 0) >> 0] = 21;
                                    e = 3;
                                    c = c | 2097152;
                                } else
                                    e = 3;
                                break;
                            }
                        default: {
                            }
                        }
                        l = r;
                        i = 1;
                        m = q;
                        x = (o | 0) == 13 ? n : x;
                        r = l;
                        continue a;
                    }
                default: {
                        if ((o + -19 | 0) >>> 0 < 3) {
                            g = r + 1 | 0;
                            if ((r | 0) < 125) {
                                f[A + (g << 2) >> 2] = n;
                                b[D + g >> 0] = e;
                            }
                            if ((o | 0) != 19) {
                                n = x;
                                o = i;
                                r = g;
                                e = 3;
                                m = q;
                                x = n;
                                i = o;
                                continue a;
                            }
                            b[l >> 0] = 20;
                            n = x;
                            o = i;
                            r = g;
                            e = 2;
                            m = q;
                            x = n;
                            i = o;
                            continue a;
                        }
                        switch (g << 24 >> 24) {
                        case 22: {
                                g = (r | 0) < 126;
                                c = (e | 0) == 2 & g ? c | 1048576 : c;
                                if ((r | 0) <= -1) {
                                    k = x;
                                    l = e;
                                    n = i;
                                    o = r;
                                    m = q;
                                    x = k;
                                    e = l;
                                    i = n;
                                    r = o;
                                    continue a;
                                }
                                if (g)
                                    e = b[D + r >> 0] | 0;
                                n = x;
                                o = i;
                                r = r + -1 | 0;
                                m = q;
                                x = n;
                                i = o;
                                continue a;
                            }
                        case 7:
                            break;
                        default: {
                                k = x;
                                l = e;
                                n = i;
                                o = r;
                                m = q;
                                x = k;
                                e = l;
                                i = n;
                                r = o;
                                continue a;
                            }
                        }
                        m = (q | 0) < (H | 0);
                        if ((k | 0) == 13 & m ? (d[B + (q << 1) >> 1] | 0) == 10 : 0) {
                            k = x;
                            l = e;
                            n = i;
                            o = r;
                            m = q;
                            x = k;
                            e = l;
                            i = n;
                            r = o;
                            continue a;
                        }
                        g = f[K >> 2] | 0;
                        k = f[t >> 2] | 0;
                        l = k + -1 | 0;
                        f[g + (l << 3) >> 2] = q;
                        if (F & i << 24 >> 24 == 1)
                            f[g + (l << 3) + 4 >> 2] = 1;
                        if (f[G >> 2] & 4 | 0) {
                            f[v >> 2] = q;
                            f[w >> 2] = p;
                        }
                        if (!m) {
                            k = x;
                            l = e;
                            n = i;
                            o = r;
                            m = q;
                            x = k;
                            e = l;
                            i = n;
                            r = o;
                            continue a;
                        }
                        f[t >> 2] = k + 1;
                        if (!((jb(a) | 0) << 24 >> 24)) {
                            c = 0;
                            break a;
                        }
                        if (E) {
                            i = z;
                            e = 1;
                            g = y;
                        } else {
                            e = 0;
                            g = h[I >> 0] | 0;
                        }
                        f[(f[K >> 2] | 0) + ((f[t >> 2] | 0) + -1 << 3) + 4 >> 2] = g;
                        o = x;
                        r = -1;
                        m = q;
                        x = o;
                        continue a;
                    }
                }
            }
        if ((J | 0) == 49) {
            C = (r | 0) > 125;
            g = C ? 125 : r;
            e = C ? 2 : e;
            while (1) {
                if ((g | 0) <= -1)
                    break;
                if ((e | 0) == 2) {
                    J = 52;
                    break;
                }
                e = b[D + g >> 0] | 0;
                g = g + -1 | 0;
            }
            if ((J | 0) == 52)
                c = c | 1048576;
            if (f[G >> 2] & 4) {
                if ((f[v >> 2] | 0) < (H | 0))
                    f[t >> 2] = (f[t >> 2] | 0) + -1;
            } else {
                f[(f[K >> 2] | 0) + ((f[t >> 2] | 0) + -1 << 3) >> 2] = H;
                f[w >> 2] = p;
            }
            if (F & i << 24 >> 24 == 1)
                f[(f[K >> 2] | 0) + ((f[t >> 2] | 0) + -1 << 3) + 4 >> 2] = 1;
            if (E)
                b[I >> 0] = f[(f[K >> 2] | 0) + 4 >> 2];
            g = f[t >> 2] | 0;
            e = 0;
            while (1) {
                if ((e | 0) >= (g | 0))
                    break;
                J = f[96 + ((f[(f[K >> 2] | 0) + (e << 3) + 4 >> 2] & 1) << 2) >> 2] | c;
                e = e + 1 | 0;
                c = J;
            }
            f[a + 124 >> 2] = c | (c & 128 | 0) != 0 & (b[a + 96 >> 0] | 0) != 0 & 1;
            f[a + 128 >> 2] = x;
            c = 1;
        }
        u = L;
        return c | 0;
    }
    function Ra(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0, F = 0, G = 0, H = 0, I = 0, J = 0, K = 0;
        K = u;
        u = u + 5072 | 0;
        F = K + 2532 | 0;
        C = K;
        G = f[a + 76 >> 2] | 0;
        J = f[a + 80 >> 2] | 0;
        H = f[a + 8 >> 2] | 0;
        E = f[a + 16 >> 2] | 0;
        D = a + 124 | 0;
        g = f[D >> 2] | 0;
        z = a + 98 | 0;
        if ((b[z >> 0] | 0) != 0 ? (e = f[a + 140 >> 2] | 0, (f[e >> 2] | 0) <= 0) : 0)
            i = Ma(f[a + 136 >> 2] | 0, e, 0) | 0;
        else
            i = b[a + 97 >> 0] | 0;
        y = a + 244 | 0;
        f[y >> 2] = 0;
        a:
            do
                if ((f[c >> 2] | 0) <= 0) {
                    e = _a(g) | 0;
                    if ((e | 0) == 2) {
                        if ((f[a + 88 >> 2] | 0) >>> 0 > 1) {
                            m = a + 136 | 0;
                            k = a + 140 | 0;
                            i = 0;
                            while (1) {
                                if ((i | 0) >= (f[m >> 2] | 0)) {
                                    e = 2;
                                    break a;
                                }
                                if (!i) {
                                    e = 0;
                                    g = f[k >> 2] | 0;
                                } else {
                                    g = f[k >> 2] | 0;
                                    e = f[g + (i + -1 << 3) >> 2] | 0;
                                }
                                l = f[g + (i << 3) >> 2] | 0;
                                g = f[g + (i << 3) + 4 >> 2] & 255;
                                while (1) {
                                    if ((e | 0) >= (l | 0))
                                        break;
                                    b[J + e >> 0] = g;
                                    e = e + 1 | 0;
                                }
                                i = i + 1 | 0;
                            }
                        }
                        if (!(g & 7985152)) {
                            $a(a, F);
                            n = a + 136 | 0;
                            l = a + 140 | 0;
                            k = 0;
                            b:
                                while (1) {
                                    if ((k | 0) >= (f[n >> 2] | 0)) {
                                        e = 2;
                                        break;
                                    }
                                    if (!k) {
                                        g = 0;
                                        e = f[l >> 2] | 0;
                                    } else {
                                        e = f[l >> 2] | 0;
                                        g = f[e + (k + -1 << 3) >> 2] | 0;
                                    }
                                    m = f[e + (k << 3) >> 2] | 0;
                                    i = f[e + (k << 3) + 4 >> 2] & 255;
                                    while (1) {
                                        if ((g | 0) >= (m | 0))
                                            break;
                                        b[J + g >> 0] = i;
                                        c:
                                            do
                                                switch (b[G + g >> 0] | 0) {
                                                case 18:
                                                    break;
                                                case 7: {
                                                        e = g + 1 | 0;
                                                        if ((e | 0) < (E | 0)) {
                                                            if ((d[H + (g << 1) >> 1] | 0) == 13 ? (d[H + (e << 1) >> 1] | 0) == 10 : 0)
                                                                break c;
                                                            ab(F, i);
                                                        }
                                                        break;
                                                    }
                                                default:
                                                    if (!((bb(F, g) | 0) << 24 >> 24)) {
                                                        I = 31;
                                                        break b;
                                                    }
                                                }
                                            while (0);
                                        g = g + 1 | 0;
                                    }
                                    k = k + 1 | 0;
                                }
                            if ((I | 0) == 31) {
                                f[c >> 2] = 7;
                                e = 0;
                            }
                            break;
                        }
                        $a(a, C);
                        d[F >> 1] = i & 255;
                        w = a + 97 | 0;
                        x = a + 140 | 0;
                        v = a + 136 | 0;
                        r = 0;
                        p = 0;
                        s = 0;
                        g = 0;
                        m = 0;
                        c = i;
                        q = i;
                        e = 0;
                        t = 0;
                        d:
                            while (1) {
                                if ((t | 0) >= (E | 0))
                                    break;
                                o = G + t | 0;
                                l = b[o >> 0] | 0;
                                n = l & 255;
                                e:
                                    do
                                        switch (l << 24 >> 24) {
                                        case 15:
                                        case 12:
                                        case 14:
                                        case 11: {
                                                e = e | 262144;
                                                b[J + t >> 0] = c;
                                                if ((l + -11 & 255) < 2)
                                                    i = q + 2 & 126;
                                                else
                                                    i = (q & 127) + 1 << 24 >> 24 | 1;
                                                if (!((p | s | 0) == 0 & (i & 255) < 126)) {
                                                    k = r;
                                                    p = p + ((s | 0) == 0 & 1) | 0;
                                                    l = s;
                                                    i = q;
                                                    break e;
                                                }
                                                switch (l << 24 >> 24) {
                                                case 15:
                                                case 12: {
                                                        i = i | -128;
                                                        break;
                                                    }
                                                default: {
                                                    }
                                                }
                                                g = g + 1 | 0;
                                                d[F + (g << 1) >> 1] = i & 255;
                                                k = r;
                                                l = s;
                                                m = t;
                                                break;
                                            }
                                        case 16: {
                                                e = e | 262144;
                                                b[J + t >> 0] = c;
                                                if (!s) {
                                                    if (p | 0) {
                                                        k = r;
                                                        p = p + -1 | 0;
                                                        l = 0;
                                                        i = q;
                                                        break e;
                                                    }
                                                    if (g) {
                                                        n = g + -1 | 0;
                                                        if ((j[F + (g << 1) >> 1] | 0) < 256) {
                                                            k = r;
                                                            p = 0;
                                                            l = 0;
                                                            m = t;
                                                            i = d[F + (n << 1) >> 1] & 255;
                                                            g = n;
                                                        } else {
                                                            k = r;
                                                            p = 0;
                                                            l = 0;
                                                            i = q;
                                                        }
                                                    } else {
                                                        k = r;
                                                        p = 0;
                                                        l = 0;
                                                        i = q;
                                                        g = 0;
                                                    }
                                                } else {
                                                    k = r;
                                                    l = s;
                                                    i = q;
                                                }
                                                break;
                                            }
                                        case 21:
                                        case 20: {
                                                k = q & 255;
                                                e = f[96 + ((k & 1) << 2) >> 2] | e;
                                                i = k & 127;
                                                b[J + t >> 0] = i;
                                                if ((i | 0) == (c & 127 | 0))
                                                    e = e | 1024;
                                                else {
                                                    cb(C, m, c, q);
                                                    e = e | -2147482624;
                                                }
                                                l = l << 24 >> 24 == 20 ? k + 2 & 382 : i + 1 | 1;
                                                i = l & 255;
                                                if (!((p | s | 0) == 0 & (l & 254) >>> 0 < 126)) {
                                                    b[o >> 0] = 9;
                                                    c = q;
                                                    k = r;
                                                    l = s + 1 | 0;
                                                    i = q;
                                                    break e;
                                                }
                                                k = r + 1 | 0;
                                                if ((r | 0) >= (f[y >> 2] | 0))
                                                    f[y >> 2] = k;
                                                g = g + 1 | 0;
                                                d[F + (g << 1) >> 1] = l | 256;
                                                db(C, i);
                                                c = q;
                                                l = s;
                                                m = t;
                                                e = e | 1 << n;
                                                break;
                                            }
                                        case 22: {
                                                if ((c ^ q) & 127) {
                                                    cb(C, m, c, q);
                                                    e = e | -2147483648;
                                                }
                                                do
                                                    if (!s) {
                                                        if (!r) {
                                                            b[o >> 0] = 9;
                                                            k = 0;
                                                            i = p;
                                                            l = 0;
                                                            break;
                                                        }
                                                        do {
                                                            s = g;
                                                            g = g + -1 | 0;
                                                        } while ((j[F + (s << 1) >> 1] | 0) < 256);
                                                        eb(C);
                                                        k = r + -1 | 0;
                                                        i = 0;
                                                        l = 0;
                                                        m = t;
                                                        e = e | 4194304;
                                                    } else {
                                                        b[o >> 0] = 9;
                                                        k = r;
                                                        i = p;
                                                        l = s + -1 | 0;
                                                    }
                                                while (0);
                                                c = d[F + (g << 1) >> 1] | 0;
                                                s = c & 255;
                                                c = c & 255;
                                                e = e | f[96 + ((c & 1) << 2) >> 2] | 1024;
                                                b[J + t >> 0] = c & 127;
                                                c = s;
                                                p = i;
                                                i = s;
                                                break;
                                            }
                                        case 7: {
                                                e = e | 128;
                                                if ((b[z >> 0] | 0) != 0 ? (A = f[x >> 2] | 0, (t | 0) >= (f[A >> 2] | 0)) : 0)
                                                    i = Ma(f[v >> 2] | 0, A, t) | 0;
                                                else
                                                    i = b[w >> 0] | 0;
                                                b[J + t >> 0] = i;
                                                i = t + 1 | 0;
                                                if ((i | 0) < (E | 0)) {
                                                    if ((d[H + (t << 1) >> 1] | 0) == 13 ? (d[H + (i << 1) >> 1] | 0) == 10 : 0) {
                                                        k = r;
                                                        l = s;
                                                        i = q;
                                                        break e;
                                                    }
                                                    if ((b[z >> 0] | 0) != 0 ? (B = f[x >> 2] | 0, (i | 0) >= (f[B >> 2] | 0)) : 0)
                                                        g = Ma(f[v >> 2] | 0, B, i) | 0;
                                                    else
                                                        g = b[w >> 0] | 0;
                                                    d[F >> 1] = g & 255;
                                                    ab(C, g);
                                                    c = g;
                                                    k = 0;
                                                    p = 0;
                                                    l = 0;
                                                    i = g;
                                                    g = 0;
                                                } else {
                                                    k = r;
                                                    l = s;
                                                    i = q;
                                                }
                                                break;
                                            }
                                        case 18: {
                                                b[J + t >> 0] = c;
                                                k = r;
                                                l = s;
                                                i = q;
                                                e = e | 262144;
                                                break;
                                            }
                                        default: {
                                                i = q & 255;
                                                if ((i & 127 | 0) != (c & 127 | 0)) {
                                                    cb(C, m, c, q);
                                                    e = e | f[((i & 128 | 0) == 0 ? 240 : 232) + ((i & 1) << 2) >> 2] | -2147483648;
                                                }
                                                b[J + t >> 0] = q;
                                                if (!((bb(C, t) | 0) << 24 >> 24)) {
                                                    I = 88;
                                                    break d;
                                                }
                                                c = q;
                                                k = r;
                                                l = s;
                                                i = q;
                                                e = 1 << h[o >> 0] | e;
                                            }
                                        }
                                    while (0);
                                r = k;
                                s = l;
                                q = i;
                                t = t + 1 | 0;
                            }
                        if ((I | 0) == 88) {
                            e = -1;
                            break;
                        }
                        if (e & 8380376)
                            e = f[96 + ((b[w >> 0] & 1) << 2) >> 2] | e;
                        e = e | (e & 128 | 0) != 0 & (b[a + 96 >> 0] | 0) != 0 & 1;
                        f[D >> 2] = e;
                        e = _a(e) | 0;
                    }
                } else
                    e = 0;
            while (0);
        u = K;
        return e | 0;
    }
    function Sa(a, c, e, g, h) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        t = u;
        u = u + 32 | 0;
        r = t;
        s = f[a + 76 >> 2] | 0;
        if ((f[a + 128 >> 2] | 0) > (c | 0)) {
            if ((b[a + 98 >> 0] | 0) != 0 ? (i = f[a + 140 >> 2] | 0, (f[i >> 2] | 0) <= (c | 0)) : 0)
                i = Ma(f[a + 136 >> 2] | 0, i, c) | 0;
            else
                i = b[a + 97 >> 0] | 0;
            if (i & 1)
                p = ((f[a + 88 >> 2] | 0) + -5 | 0) >>> 0 < 2;
            else
                p = 0;
        } else
            p = 0;
        f[r + 12 >> 2] = -1;
        f[r + 16 >> 2] = -1;
        f[r + 24 >> 2] = c;
        q = b[(f[a + 80 >> 2] | 0) + c >> 0] | 0;
        b[r + 28 >> 0] = q;
        o = f[a + 116 >> 2] | 0;
        q = q & 1;
        f[r >> 2] = f[o + (q << 2) >> 2];
        f[r + 4 >> 2] = f[o + 8 + (q << 2) >> 2];
        if ((c | 0) == 0 ? (f[a + 104 >> 2] | 0) > 0 : 0) {
            i = Va(a) | 0;
            i = i << 24 >> 24 == 4 ? g : i;
        } else
            i = g;
        g = s + c | 0;
        q = a + 244 | 0;
        if ((b[g >> 0] | 0) == 22 ? (j = f[q >> 2] | 0, (j | 0) > -1) : 0) {
            i = f[a + 248 >> 2] | 0;
            f[r + 8 >> 2] = f[i + (j << 4) >> 2];
            o = f[i + (j << 4) + 4 >> 2] | 0;
            l = d[i + (j << 4) + 12 >> 1] | 0;
            f[r + 20 >> 2] = f[i + (j << 4) + 8 >> 2];
            f[q >> 2] = j + -1;
            i = -1;
            j = 1;
            m = c;
            n = c;
        } else {
            f[r + 8 >> 2] = -1;
            l = (b[g >> 0] | 0) == 17 ? (i & 255) + 1 & 65535 : 0;
            f[r + 20 >> 2] = 0;
            Wa(a, r, i, c, c);
            i = -1;
            j = 1;
            m = c;
            n = c;
            o = c;
        }
        while (1) {
            if ((m | 0) > (e | 0))
                break;
            if ((m | 0) >= (e | 0)) {
                g = e;
                do {
                    g = g + -1 | 0;
                    k = b[s + g >> 0] | 0;
                    if ((g | 0) <= (c | 0))
                        break;
                } while ((1 << (k & 255) & 382976 | 0) != 0);
                if ((k & -2) << 24 >> 24 == 20)
                    break;
                else
                    k = h;
            } else {
                g = b[s + m >> 0] | 0;
                if (g << 24 >> 24 == 7)
                    f[q >> 2] = -1;
                a:
                    do
                        if (p) {
                            switch (g << 24 >> 24) {
                            case 13: {
                                    g = 1;
                                    break a;
                                }
                            case 2:
                                break;
                            default:
                                break a;
                            }
                            b:
                                do
                                    if ((i | 0) <= (m | 0)) {
                                        i = m;
                                        while (1) {
                                            i = i + 1 | 0;
                                            if ((i | 0) >= (e | 0)) {
                                                i = e;
                                                j = 1;
                                                break b;
                                            }
                                            g = b[s + i >> 0] | 0;
                                            switch (g << 24 >> 24) {
                                            case 13:
                                            case 1:
                                            case 0: {
                                                    j = g;
                                                    break b;
                                                }
                                            default: {
                                                }
                                            }
                                        }
                                    }
                                while (0);
                            g = j << 24 >> 24 == 13 ? 5 : 2;
                        }
                    while (0);
                k = b[66270 + (g & 255) >> 0] | 0;
            }
            g = l & 65535;
            k = b[(k & 255) + (66295 + (g << 4)) >> 0] | 0;
            l = k & 31;
            k = (k & 255) >>> 5;
            k = (m | 0) == (e | 0) & k << 24 >> 24 == 0 ? 1 : k & 255;
            c:
                do
                    if (!(k << 16 >> 16)) {
                        k = n;
                        g = o;
                    } else {
                        g = b[66295 + (g << 4) + 15 >> 0] | 0;
                        switch (k & 7) {
                        case 1: {
                                Wa(a, r, g, o, m);
                                k = n;
                                g = m;
                                break c;
                            }
                        case 2: {
                                k = m;
                                g = o;
                                break c;
                            }
                        case 3: {
                                Wa(a, r, g, o, n);
                                Wa(a, r, 4, n, m);
                                k = n;
                                g = m;
                                break c;
                            }
                        case 4: {
                                Wa(a, r, g, o, n);
                                k = m;
                                g = n;
                                break c;
                            }
                        default: {
                                k = n;
                                g = o;
                                break c;
                            }
                        }
                    }
                while (0);
            m = m + 1 | 0;
            n = k;
            o = g;
        }
        k = a + 16 | 0;
        if ((f[k >> 2] | 0) == (e | 0) ? (f[a + 112 >> 2] | 0) > 0 : 0) {
            i = Xa(a) | 0;
            i = i << 24 >> 24 == 4 ? h : i;
        } else
            i = h;
        g = e;
        do {
            g = g + -1 | 0;
            j = b[s + g >> 0] | 0;
            if ((g | 0) <= (c | 0))
                break;
        } while ((1 << (j & 255) & 382976 | 0) != 0);
        if ((j & -2) << 24 >> 24 == 20 ? (f[k >> 2] | 0) > (e | 0) : 0) {
            s = (f[q >> 2] | 0) + 1 | 0;
            f[q >> 2] = s;
            e = f[a + 248 >> 2] | 0;
            d[e + (s << 4) + 12 >> 1] = l;
            f[e + (s << 4) + 8 >> 2] = f[r + 20 >> 2];
            f[e + (s << 4) + 4 >> 2] = o;
            f[e + (s << 4) >> 2] = f[r + 8 >> 2];
        } else
            Wa(a, r, i, e, e);
        u = t;
        return;
    }
    function Ta(a) {
        a = a | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        l = f[a + 76 >> 2] | 0;
        n = f[a + 80 >> 2] | 0;
        a:
            do
                if (f[a + 124 >> 2] & 8248192 | 0) {
                    h = (b[a + 96 >> 0] | 0) != 0;
                    i = a + 98 | 0;
                    j = a + 97 | 0;
                    k = a + 140 | 0;
                    g = a + 136 | 0;
                    a = f[a + 132 >> 2] | 0;
                    b:
                        while (1) {
                            if ((a | 0) <= 0)
                                break a;
                            while (1) {
                                if ((a | 0) <= 0)
                                    break;
                                d = a + -1 | 0;
                                c = b[l + d >> 0] | 0;
                                if (!(1 << (c & 255) & 8248192)) {
                                    a = d;
                                    break;
                                }
                                do
                                    if (h & c << 24 >> 24 == 7)
                                        a = 0;
                                    else {
                                        if (b[i >> 0] | 0 ? (m = f[k >> 2] | 0, (a | 0) > (f[m >> 2] | 0)) : 0) {
                                            a = Ma(f[g >> 2] | 0, m, d) | 0;
                                            break;
                                        }
                                        a = b[j >> 0] | 0;
                                    }
                                while (0);
                                b[n + d >> 0] = a;
                                a = d;
                            }
                            while (1) {
                                if ((a | 0) <= 0)
                                    continue b;
                                e = a + -1 | 0;
                                c = b[l + e >> 0] | 0;
                                d = 1 << (c & 255);
                                if (d & 382976 | 0) {
                                    b[n + e >> 0] = b[n + a >> 0] | 0;
                                    a = e;
                                    continue;
                                }
                                if (h & c << 24 >> 24 == 7) {
                                    a = 0;
                                    break;
                                }
                                if (!(d & 384))
                                    a = e;
                                else {
                                    p = 17;
                                    break;
                                }
                            }
                            do
                                if ((p | 0) == 17) {
                                    p = 0;
                                    if (b[i >> 0] | 0 ? (o = f[k >> 2] | 0, (a | 0) > (f[o >> 2] | 0)) : 0) {
                                        a = Ma(f[g >> 2] | 0, o, e) | 0;
                                        break;
                                    }
                                    a = b[j >> 0] | 0;
                                }
                            while (0);
                            b[n + e >> 0] = a;
                            a = e;
                        }
                }
            while (0);
        return;
    }
    function Ua(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0;
        k = a + 332 | 0;
        d = f[k >> 2] | 0;
        do
            if (!d) {
                g = Qb(80) | 0;
                d = a + 348 | 0;
                f[d >> 2] = g;
                if (!g) {
                    f[a + 344 >> 2] = 7;
                    break;
                } else {
                    f[k >> 2] = 10;
                    j = d;
                    e = g;
                    h = 10;
                    i = 6;
                    break;
                }
            } else {
                j = a + 348 | 0;
                g = f[j >> 2] | 0;
                e = g;
                h = d;
                i = 6;
            }
        while (0);
        a:
            do
                if ((i | 0) == 6) {
                    i = a + 336 | 0;
                    d = f[i >> 2] | 0;
                    do
                        if ((d | 0) >= (h | 0)) {
                            e = Rb(g, h << 4) | 0;
                            f[j >> 2] = e;
                            if (!e) {
                                f[j >> 2] = g;
                                f[a + 344 >> 2] = 7;
                                break a;
                            } else {
                                f[k >> 2] = f[k >> 2] << 1;
                                d = f[i >> 2] | 0;
                                break;
                            }
                        }
                    while (0);
                    f[e + (d << 3) >> 2] = b;
                    f[e + (d << 3) + 4 >> 2] = c;
                    f[i >> 2] = (f[i >> 2] | 0) + 1;
                }
            while (0);
        return;
    }
    function Va(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        e = f[a + 100 >> 2] | 0;
        b = f[a + 104 >> 2] | 0;
        a:
            while (1) {
                if ((b | 0) <= 0) {
                    b = 4;
                    g = 6;
                    break;
                }
                d = b + -1 | 0;
                c = j[e + (d << 1) >> 1] | 0;
                if ((b | 0) != 1 & (c & 64512 | 0) == 56320) {
                    b = b + -2 | 0;
                    i = j[e + (b << 1) >> 1] | 0;
                    h = (i & 64512 | 0) == 55296;
                    c = h ? c + -56613888 + (i << 10) | 0 : c;
                    b = h ? b : d;
                } else
                    b = d;
                switch (((Ya(a, c) | 0) & 255) << 24 >> 24) {
                case 0: {
                        b = 0;
                        g = 6;
                        break a;
                    }
                case 13:
                case 1: {
                        g = 7;
                        break a;
                    }
                case 7: {
                        b = 4;
                        break a;
                    }
                default: {
                    }
                }
            }
        if ((g | 0) != 6)
            if ((g | 0) == 7)
                b = 1;
        return b | 0;
    }
    function Wa(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0;
        l = f[c >> 2] | 0;
        i = f[c + 4 >> 2] | 0;
        q = a + 80 | 0;
        r = f[q >> 2] | 0;
        s = c + 20 | 0;
        k = f[s >> 2] & 255;
        o = h[(d & 255) + (l + (k << 3)) >> 0] | 0;
        p = o & 15;
        f[s >> 2] = p;
        p = b[l + (p << 3) + 7 >> 0] | 0;
        a:
            do
                switch (b[i + (o >>> 4) >> 0] | 0) {
                case 14: {
                        l = c + 8 | 0;
                        m = (b[c + 28 >> 0] | 0) + 1 << 24 >> 24;
                        i = e;
                        while (1) {
                            k = i + -1 | 0;
                            if ((i | 0) <= (f[l >> 2] | 0)) {
                                i = e;
                                break a;
                            }
                            i = r + k | 0;
                            j = b[i >> 0] | 0;
                            if ((j & 255) <= (m & 255)) {
                                i = k;
                                continue;
                            }
                            b[i >> 0] = (j & 255) + 254;
                            i = k;
                        }
                    }
                case 1: {
                        f[c + 8 >> 2] = e;
                        i = e;
                        break;
                    }
                case 2: {
                        i = f[c + 8 >> 2] | 0;
                        break;
                    }
                case 3: {
                        Za(f[a + 76 >> 2] | 0, r, f[c + 8 >> 2] | 0, e, (h[c + 28 >> 0] | 0) + 1 & 255);
                        i = e;
                        break;
                    }
                case 4: {
                        Za(f[a + 76 >> 2] | 0, r, f[c + 8 >> 2] | 0, e, (h[c + 28 >> 0] | 0) + 2 & 255);
                        i = e;
                        break;
                    }
                case 5: {
                        i = c + 12 | 0;
                        j = f[i >> 2] | 0;
                        if ((j | 0) > -1)
                            Ua(a, j, 1);
                        f[i >> 2] = -1;
                        if (f[a + 332 >> 2] | 0 ? (m = a + 336 | 0, n = a + 340 | 0, (f[m >> 2] | 0) > (f[n >> 2] | 0)) : 0) {
                            j = c + 16 | 0;
                            i = f[j >> 2] | 0;
                            while (1) {
                                i = i + 1 | 0;
                                if ((i | 0) >= (e | 0))
                                    break;
                                s = r + i | 0;
                                b[s >> 0] = (b[s >> 0] | 0) + -2 << 24 >> 24 & -2;
                            }
                            f[n >> 2] = f[m >> 2];
                            f[j >> 2] = -1;
                            if (d << 24 >> 24 != 5) {
                                i = e;
                                break a;
                            }
                            Ua(a, e, 1);
                            f[n >> 2] = f[m >> 2];
                            i = e;
                            break a;
                        }
                        f[c + 16 >> 2] = -1;
                        if (!(b[l + (k << 3) + 7 >> 0] & 1))
                            i = e;
                        else {
                            i = f[c + 8 >> 2] | 0;
                            i = (i | 0) > 0 ? i : e;
                        }
                        if (d << 24 >> 24 == 5) {
                            Ua(a, e, 1);
                            f[a + 340 >> 2] = f[a + 336 >> 2];
                        }
                        break;
                    }
                case 6: {
                        if ((f[a + 332 >> 2] | 0) > 0)
                            f[a + 336 >> 2] = f[a + 340 >> 2];
                        f[c + 8 >> 2] = -1;
                        f[c + 12 >> 2] = -1;
                        f[c + 16 >> 2] = g + -1;
                        i = e;
                        break;
                    }
                case 7: {
                        if ((d << 24 >> 24 == 3 ? (b[(f[a + 76 >> 2] | 0) + e >> 0] | 0) == 5 : 0) ? (f[a + 88 >> 2] | 0) != 6 : 0) {
                            i = c + 12 | 0;
                            j = f[i >> 2] | 0;
                            if ((j | 0) == -1) {
                                f[c + 16 >> 2] = g + -1;
                                i = e;
                                break a;
                            }
                            if ((j | 0) > -1) {
                                Ua(a, j, 1);
                                f[i >> 2] = -2;
                            }
                            Ua(a, e, 1);
                            i = e;
                            break a;
                        }
                        i = c + 12 | 0;
                        if ((f[i >> 2] | 0) == -1) {
                            f[i >> 2] = e;
                            i = e;
                        } else
                            i = e;
                        break;
                    }
                case 8: {
                        f[c + 16 >> 2] = g + -1;
                        f[c + 8 >> 2] = -1;
                        i = e;
                        break;
                    }
                case 9: {
                        i = e;
                        while (1) {
                            s = i;
                            i = i + -1 | 0;
                            if ((s | 0) <= 0)
                                break;
                            if (b[r + i >> 0] & 1) {
                                j = 35;
                                break;
                            }
                        }
                        if ((j | 0) == 35) {
                            Ua(a, i, 4);
                            f[a + 340 >> 2] = f[a + 336 >> 2];
                        }
                        f[c + 8 >> 2] = e;
                        i = e;
                        break;
                    }
                case 10: {
                        Ua(a, e, 1);
                        Ua(a, e, 2);
                        i = e;
                        break;
                    }
                case 11: {
                        i = a + 340 | 0;
                        j = a + 336 | 0;
                        f[j >> 2] = f[i >> 2];
                        if (d << 24 >> 24 == 5) {
                            Ua(a, e, 4);
                            f[i >> 2] = f[j >> 2];
                            i = e;
                        } else
                            i = e;
                        break;
                    }
                case 12: {
                        l = (h[c + 28 >> 0] | 0) + (p & 255) | 0;
                        j = l & 255;
                        k = c + 8 | 0;
                        l = l & 255;
                        i = f[k >> 2] | 0;
                        while (1) {
                            if ((i | 0) >= (e | 0))
                                break;
                            m = r + i | 0;
                            if (l >>> 0 > (h[m >> 0] | 0) >>> 0)
                                b[m >> 0] = j;
                            i = i + 1 | 0;
                        }
                        f[a + 340 >> 2] = f[a + 336 >> 2];
                        f[k >> 2] = e;
                        i = e;
                        break;
                    }
                case 13: {
                        l = b[c + 28 >> 0] | 0;
                        m = c + 8 | 0;
                        o = l & 255;
                        n = o + 3 | 0;
                        d = o + 2 | 0;
                        o = o + 1 & 255;
                        i = e;
                        while (1) {
                            k = i + -1 | 0;
                            if ((i | 0) <= (f[m >> 2] | 0)) {
                                i = e;
                                break a;
                            }
                            j = b[r + k >> 0] | 0;
                            b:
                                do
                                    if ((n | 0) == (j & 255 | 0)) {
                                        i = k;
                                        while (1) {
                                            if ((n | 0) != (j & 255 | 0))
                                                break;
                                            j = i + -1 | 0;
                                            b[r + i >> 0] = o;
                                            i = j;
                                            j = b[r + j >> 0] | 0;
                                        }
                                        while (1) {
                                            k = i + -1 | 0;
                                            if (j << 24 >> 24 != l << 24 >> 24)
                                                break b;
                                            i = k;
                                            j = b[r + k >> 0] | 0;
                                        }
                                    } else
                                        i = k;
                                while (0);
                            b[r + i >> 0] = (d | 0) == (j & 255 | 0) ? l : o;
                        }
                    }
                default:
                    i = e;
                }
            while (0);
        c:
            do
                if (p << 24 >> 24 != 0 | (i | 0) < (e | 0)) {
                    j = (h[c + 28 >> 0] | 0) + (p & 255) & 255;
                    if ((i | 0) < (f[c + 24 >> 2] | 0)) {
                        Za(f[a + 76 >> 2] | 0, f[q >> 2] | 0, i, g, j);
                        break;
                    }
                    while (1) {
                        if ((i | 0) >= (g | 0))
                            break c;
                        b[r + i >> 0] = j;
                        i = i + 1 | 0;
                    }
                }
            while (0);
        return;
    }
    function Xa(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, k = 0;
        e = f[a + 108 >> 2] | 0;
        g = f[a + 112 >> 2] | 0;
        b = 0;
        a:
            while (1) {
                if ((b | 0) >= (g | 0)) {
                    b = 4;
                    h = 6;
                    break;
                }
                d = b + 1 | 0;
                c = j[e + (b << 1) >> 1] | 0;
                if ((d | 0) == (g | 0) | (c & 64512 | 0) != 55296)
                    b = d;
                else {
                    k = j[e + (d << 1) >> 1] | 0;
                    i = (k & 64512 | 0) == 56320;
                    c = i ? (c << 10) + -56613888 + k | 0 : c;
                    b = i ? b + 2 | 0 : d;
                }
                switch (((Ya(a, c) | 0) & 255) << 24 >> 24) {
                case 0: {
                        b = 0;
                        h = 6;
                        break a;
                    }
                case 13:
                case 1: {
                        h = 7;
                        break a;
                    }
                case 2: {
                        h = 8;
                        break a;
                    }
                case 5: {
                        b = 3;
                        break a;
                    }
                default: {
                    }
                }
            }
        if ((h | 0) != 6)
            if ((h | 0) == 7)
                b = 1;
            else if ((h | 0) == 8)
                b = 2;
        return b | 0;
    }
    function Ya(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        d = f[a + 356 >> 2] | 0;
        if (!((d | 0) != 0 ? (c = ra[d & 0](f[a + 360 >> 2] | 0, b) | 0, (c | 0) != 23) : 0))
            c = Yb(f[a + 4 >> 2] | 0, b) | 0;
        return (c >>> 0 > 22 ? 10 : c) | 0;
    }
    function Za(a, c, d, e, f) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0, h = 0;
        g = 0;
        while (1) {
            if ((d | 0) >= (e | 0))
                break;
            h = b[a + d >> 0] | 0;
            g = g + ((h << 24 >> 24 == 22) << 31 >> 31) | 0;
            if (!g)
                b[c + d >> 0] = f;
            d = d + 1 | 0;
            g = g + ((h & -2) << 24 >> 24 == 20 & 1) | 0;
        }
        return;
    }
    function _a(a) {
        a = a | 0;
        if ((a & 2154498 | 0) == 0 ? (a & 32 | 0) == 0 | (a & 8249304 | 0) == 0 : 0)
            a = 0;
        else
            a = (a & 26220581 | 0) == 0 ? 1 : 2;
        return a | 0;
    }
    function $a(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0;
        f[c >> 2] = a;
        f[c + 492 >> 2] = 0;
        d[c + 500 >> 1] = 0;
        d[c + 502 >> 1] = 0;
        do
            if (b[a + 98 >> 0] | 0) {
                e = f[a + 140 >> 2] | 0;
                if ((f[e >> 2] | 0) > 0) {
                    e = b[a + 97 >> 0] | 0;
                    b[c + 504 >> 0] = e;
                    break;
                } else {
                    g = f[a + 136 >> 2] | 0;
                    h = Ma(g, e, 0) | 0;
                    b[c + 504 >> 0] = h;
                    e = Ma(g, e, 0) | 0;
                    break;
                }
            } else {
                e = b[a + 97 >> 0] | 0;
                b[c + 504 >> 0] = e;
            }
        while (0);
        e = e & 1;
        f[c + 508 >> 2] = e & 255;
        b[c + 506 >> 0] = e;
        b[c + 505 >> 0] = e;
        f[c + 496 >> 2] = 0;
        e = f[a + 56 >> 2] | 0;
        if (!e) {
            g = 20;
            e = c + 4 | 0;
        } else
            g = ((f[a + 32 >> 2] | 0) >>> 0) / 24 | 0;
        f[c + 484 >> 2] = e;
        f[c + 488 >> 2] = g;
        h = f[a + 88 >> 2] | 0;
        b[c + 2528 >> 0] = ((h | 0) == 1 | (h | 0) == 6) & 1;
        return;
    }
    function ab(a, c) {
        a = a | 0;
        c = c | 0;
        f[a + 492 >> 2] = 0;
        d[a + 502 >> 1] = 0;
        b[a + 504 >> 0] = c;
        c = c & 1;
        f[a + 508 >> 2] = c & 255;
        b[a + 506 >> 0] = c;
        b[a + 505 >> 0] = c;
        f[a + 496 >> 2] = 0;
        return;
    }
    function bb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, u = 0;
        t = f[a + 492 >> 2] | 0;
        r = a + 496 + (t << 4) | 0;
        k = f[a >> 2] | 0;
        q = (f[k + 76 >> 2] | 0) + c | 0;
        m = b[q >> 0] | 0;
        a:
            do
                if (m << 24 >> 24 == 10) {
                    e = d[(f[k + 8 >> 2] | 0) + (c << 1) >> 1] | 0;
                    n = a + 496 + (t << 4) + 4 | 0;
                    g = j[n >> 1] | 0;
                    p = a + 484 | 0;
                    i = e & 65535;
                    o = j[a + 496 + (t << 4) + 6 >> 1] | 0;
                    while (1) {
                        u = o;
                        o = o + -1 | 0;
                        if ((u | 0) <= (g | 0))
                            break;
                        if ((f[(f[p >> 2] | 0) + (o * 24 | 0) + 4 >> 2] | 0) == (i | 0)) {
                            s = 5;
                            break;
                        }
                    }
                    if ((s | 0) == 5) {
                        e = fb(a, o, c) | 0;
                        if (e << 24 >> 24 == 10) {
                            s = 19;
                            break;
                        }
                        b[a + 496 + (t << 4) + 10 >> 0] = 10;
                        f[a + 496 + (t << 4) + 12 >> 2] = e & 255;
                        f[r >> 2] = c;
                        e = f[(f[a >> 2] | 0) + 80 >> 2] | 0;
                        i = e + c | 0;
                        g = h[i >> 0] | 0;
                        if (g & 128) {
                            g = g & 1;
                            b[a + 496 + (t << 4) + 9 >> 0] = g;
                            g = 1 << g;
                            e = j[n >> 1] | 0;
                            while (1) {
                                if ((e | 0) >= (o | 0))
                                    break;
                                u = (f[p >> 2] | 0) + (e * 24 | 0) + 12 | 0;
                                d[u >> 1] = g | j[u >> 1];
                                e = e + 1 | 0;
                            }
                            b[i >> 0] = b[i >> 0] & 127;
                            e = f[(f[a >> 2] | 0) + 80 >> 2] | 0;
                        }
                        e = e + (f[(f[p >> 2] | 0) + (o * 24 | 0) >> 2] | 0) | 0;
                        b[e >> 0] = b[e >> 0] & 127;
                        e = 1;
                        break;
                    }
                    if ((e << 16 >> 16 != 0 ? (l = (cc(i) | 0) & 65535, e << 16 >> 16 != l << 16 >> 16) : 0) ? ($b(f[k + 4 >> 2] | 0, i) | 0) == 1 : 0) {
                        b:
                            do
                                if (l << 16 >> 16 < 12297) {
                                    switch (l << 16 >> 16) {
                                    case 9002:
                                        break;
                                    default:
                                        break b;
                                    }
                                    if (!((gb(a, 12297, c) | 0) << 24 >> 24)) {
                                        e = 0;
                                        break a;
                                    }
                                } else {
                                    switch (l << 16 >> 16) {
                                    case 12297:
                                        break;
                                    default:
                                        break b;
                                    }
                                    if (!((gb(a, 9002, c) | 0) << 24 >> 24)) {
                                        e = 0;
                                        break a;
                                    }
                                }
                            while (0);
                        if (!((gb(a, l, c) | 0) << 24 >> 24))
                            e = 0;
                        else
                            s = 19;
                    } else
                        s = 19;
                } else
                    s = 19;
            while (0);
        c:
            do
                if ((s | 0) == 19) {
                    e = h[(f[(f[a >> 2] | 0) + 80 >> 2] | 0) + c >> 0] | 0;
                    d:
                        do
                            if (!(e & 128))
                                switch (m << 24 >> 24) {
                                case 0:
                                case 1:
                                case 13: {
                                        e = m << 24 >> 24 != 0;
                                        b[a + 496 + (t << 4) + 10 >> 0] = m;
                                        b[a + 496 + (t << 4) + 9 >> 0] = m;
                                        f[a + 496 + (t << 4) + 12 >> 2] = e & 1;
                                        f[r >> 2] = c;
                                        e = e & 1;
                                        s = 34;
                                        break d;
                                    }
                                case 2: {
                                        b[a + 496 + (t << 4) + 10 >> 0] = 2;
                                        i = b[a + 496 + (t << 4) + 9 >> 0] | 0;
                                        if (!(i << 24 >> 24))
                                            if (!(b[a + 2528 >> 0] | 0)) {
                                                e = 0;
                                                g = 0;
                                                i = 23;
                                                s = 28;
                                            } else {
                                                e = 0;
                                                g = 0;
                                            }
                                        else {
                                            e = 1;
                                            g = 1;
                                            i = i << 24 >> 24 == 13 ? 5 : 24;
                                            s = 28;
                                        }
                                        if ((s | 0) == 28)
                                            b[q >> 0] = i;
                                        f[a + 496 + (t << 4) + 12 >> 2] = g;
                                        f[r >> 2] = c;
                                        s = 34;
                                        break d;
                                    }
                                case 5: {
                                        b[a + 496 + (t << 4) + 10 >> 0] = 5;
                                        f[a + 496 + (t << 4) + 12 >> 2] = 1;
                                        f[r >> 2] = c;
                                        e = 1;
                                        break d;
                                    }
                                case 17: {
                                        e = b[a + 496 + (t << 4) + 10 >> 0] | 0;
                                        if (e << 24 >> 24 != 10) {
                                            s = 34;
                                            break d;
                                        }
                                        b[q >> 0] = 10;
                                        e = 1;
                                        break c;
                                    }
                                default: {
                                        b[a + 496 + (t << 4) + 10 >> 0] = m;
                                        e = m;
                                        s = 34;
                                        break d;
                                    }
                                }
                            else {
                                g = e & 1;
                                e = g & 255;
                                if ((m + -8 & 255) >= 3)
                                    b[q >> 0] = e;
                                b[a + 496 + (t << 4) + 10 >> 0] = e;
                                b[a + 496 + (t << 4) + 9 >> 0] = e;
                                f[a + 496 + (t << 4) + 12 >> 2] = g;
                                f[r >> 2] = c;
                                s = 34;
                            }
                        while (0);
                    if ((s | 0) == 34)
                        switch (e << 24 >> 24) {
                        case 0:
                        case 1:
                        case 13:
                            break;
                        default: {
                                e = 1;
                                break c;
                            }
                        }
                    i = 1 << (e << 24 >> 24 != 0 & 1);
                    k = j[a + 496 + (t << 4) + 6 >> 1] | 0;
                    l = a + 484 | 0;
                    e = j[a + 496 + (t << 4) + 4 >> 1] | 0;
                    while (1) {
                        if ((e | 0) >= (k | 0)) {
                            e = 1;
                            break c;
                        }
                        g = f[l >> 2] | 0;
                        if ((f[g + (e * 24 | 0) >> 2] | 0) < (c | 0)) {
                            u = g + (e * 24 | 0) + 12 | 0;
                            d[u >> 1] = i | j[u >> 1];
                        }
                        e = e + 1 | 0;
                    }
                }
            while (0);
        return e | 0;
    }
    function cb(a, c, e, g) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        var i = 0;
        i = f[a + 492 >> 2] | 0;
        if (!(1 << (h[(f[(f[a >> 2] | 0) + 76 >> 2] | 0) + c >> 0] | 0) & 7864320)) {
            d[a + 496 + (i << 4) + 6 >> 1] = d[a + 496 + (i << 4) + 4 >> 1] | 0;
            b[a + 496 + (i << 4) + 8 >> 0] = g;
            g = ((g & 127) > (e & 127) ? g : e) & 1;
            f[a + 496 + (i << 4) + 12 >> 2] = g & 255;
            b[a + 496 + (i << 4) + 10 >> 0] = g;
            b[a + 496 + (i << 4) + 9 >> 0] = g;
            f[a + 496 + (i << 4) >> 2] = c;
        }
        return;
    }
    function db(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0;
        g = a + 492 | 0;
        h = f[g >> 2] | 0;
        e = a + 496 + (h << 4) | 0;
        b[a + 496 + (h << 4) + 10 >> 0] = 10;
        a = d[a + 496 + (h << 4) + 6 >> 1] | 0;
        f[g >> 2] = h + 1;
        d[e + 22 >> 1] = a;
        d[e + 20 >> 1] = a;
        b[e + 24 >> 0] = c;
        c = c & 1;
        f[e + 28 >> 2] = c & 255;
        b[e + 26 >> 0] = c;
        b[e + 25 >> 0] = c;
        f[e + 16 >> 2] = 0;
        return;
    }
    function eb(a) {
        a = a | 0;
        var c = 0, d = 0;
        d = a + 492 | 0;
        c = (f[d >> 2] | 0) + -1 | 0;
        f[d >> 2] = c;
        b[a + 496 + (c << 4) + 10 >> 0] = 10;
        return;
    }
    function fb(a, c, e) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, h = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        p = f[a + 492 >> 2] | 0;
        q = a + 484 | 0;
        n = f[q >> 2] | 0;
        i = b[a + 496 + (p << 4) + 8 >> 0] & 1;
        g = i & 255;
        h = d[n + (c * 24 | 0) + 12 >> 1] | 0;
        if (!(i << 24 >> 24))
            if (!(h & 1))
                k = 4;
            else {
                g = 0;
                h = 0;
                k = 7;
            }
        else if (!(h & 2))
            k = 4;
        else {
            g = 1;
            h = 0;
            k = 7;
        }
        do
            if ((k | 0) == 4)
                if (!(h & 3)) {
                    d[a + 496 + (p << 4) + 6 >> 1] = c;
                    g = 10;
                    break;
                } else {
                    h = f[n + (c * 24 | 0) + 16 >> 2] | 0;
                    g = (h | 0) == (g | 0) ? i : h & 255;
                    h = (j[a + 496 + (p << 4) + 4 >> 1] | 0 | 0) != (c | 0);
                    k = 7;
                    break;
                }
        while (0);
        a:
            do
                if ((k | 0) == 7) {
                    o = n + (c * 24 | 0) | 0;
                    b[(f[(f[a >> 2] | 0) + 76 >> 2] | 0) + (f[o >> 2] | 0) >> 0] = g;
                    b[(f[(f[a >> 2] | 0) + 76 >> 2] | 0) + e >> 0] = g;
                    hb(a, c, f[o >> 2] | 0, g);
                    if (!h) {
                        i = a + 496 + (p << 4) + 6 | 0;
                        h = d[a + 496 + (p << 4) + 4 >> 1] | 0;
                        c = c & 65535;
                        while (1) {
                            d[i >> 1] = c;
                            if ((c & 65535) <= (h & 65535))
                                break a;
                            if ((f[(f[q >> 2] | 0) + (((c & 65535) + -1 | 0) * 24 | 0) >> 2] | 0) == (f[o >> 2] | 0))
                                c = c + -1 << 16 >> 16;
                            else
                                break a;
                        }
                    }
                    m = j[a + 496 + (p << 4) + 4 >> 1] | 0;
                    k = c;
                    l = 0 - e | 0;
                    h = n + (c * 24 | 0) + 4 | 0;
                    while (1) {
                        f[h >> 2] = l;
                        h = k + -1 | 0;
                        if ((k | 0) <= (m | 0))
                            break;
                        i = f[q >> 2] | 0;
                        if ((f[i + (h * 24 | 0) >> 2] | 0) != (f[o >> 2] | 0))
                            break;
                        k = h;
                        l = 0;
                        h = i + (h * 24 | 0) + 4 | 0;
                    }
                    i = j[a + 496 + (p << 4) + 6 >> 1] | 0;
                    while (1) {
                        c = c + 1 | 0;
                        if ((c | 0) >= (i | 0))
                            break a;
                        h = f[q >> 2] | 0;
                        if ((f[h + (c * 24 | 0) >> 2] | 0) >= (e | 0))
                            break a;
                        h = h + (c * 24 | 0) + 4 | 0;
                        if ((f[h >> 2] | 0) <= 0)
                            continue;
                        f[h >> 2] = 0;
                    }
                }
            while (0);
        return g | 0;
    }
    function gb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0;
        l = f[a + 492 >> 2] | 0;
        m = a + 496 + (l << 4) + 6 | 0;
        e = d[m >> 1] | 0;
        g = e & 65535;
        j = a + 488 | 0;
        if ((f[j >> 2] | 0) <= (g | 0)) {
            i = f[a >> 2] | 0;
            h = i + 56 | 0;
            i = i + 32 | 0;
            if (!((Ka(h, i, 1, g * 48 | 0) | 0) << 24 >> 24))
                e = 0;
            else {
                e = a + 484 | 0;
                g = f[e >> 2] | 0;
                if ((g | 0) == (a + 4 | 0))
                    Fc(f[h >> 2] | 0, g | 0, 480) | 0;
                g = f[h >> 2] | 0;
                f[e >> 2] = g;
                f[j >> 2] = ((f[i >> 2] | 0) >>> 0) / 24 | 0;
                e = d[m >> 1] | 0;
                k = 7;
            }
        } else {
            g = f[a + 484 >> 2] | 0;
            k = 7;
        }
        if ((k | 0) == 7) {
            k = e & 65535;
            f[g + (k * 24 | 0) >> 2] = c;
            f[g + (k * 24 | 0) + 4 >> 2] = b & 65535;
            f[g + (k * 24 | 0) + 16 >> 2] = f[a + 496 + (l << 4) + 12 >> 2];
            f[g + (k * 24 | 0) + 8 >> 2] = f[a + 496 + (l << 4) >> 2];
            d[g + (k * 24 | 0) + 12 >> 1] = 0;
            d[m >> 1] = e + 1 << 16 >> 16;
            e = 1;
        }
        return e | 0;
    }
    function hb(a, c, d, e) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        var g = 0, h = 0, i = 0, k = 0, l = 0, m = 0, n = 0;
        m = f[(f[a >> 2] | 0) + 76 >> 2] | 0;
        g = c + 1 | 0;
        h = e & 255;
        i = a + 496 + (f[a + 492 >> 2] << 4) + 6 | 0;
        c = (f[a + 484 >> 2] | 0) + (g * 24 | 0) | 0;
        while (1) {
            if ((g | 0) >= (j[i >> 1] | 0 | 0))
                break;
            k = c + 4 | 0;
            if ((f[k >> 2] | 0) <= -1) {
                if ((f[c + 8 >> 2] | 0) > (d | 0))
                    break;
                l = f[c >> 2] | 0;
                if ((l | 0) > (d | 0)) {
                    if ((f[c + 16 >> 2] | 0) == (h | 0))
                        break;
                    b[m + l >> 0] = e;
                    n = 0 - (f[k >> 2] | 0) | 0;
                    b[m + n >> 0] = e;
                    f[k >> 2] = 0;
                    hb(a, g, l, e);
                    hb(a, g, n, e);
                }
            }
            c = c + 24 | 0;
            g = g + 1 | 0;
        }
        return;
    }
    function ib(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, k = 0;
        g = f[a + 100 >> 2] | 0;
        h = f[a + 104 >> 2] | 0;
        c = 0;
        e = 10;
        a:
            while (1) {
                if ((c | 0) >= (h | 0))
                    break;
                d = c + 1 | 0;
                b = j[g + (c << 1) >> 1] | 0;
                if ((d | 0) == (h | 0) | (b & 64512 | 0) != 55296)
                    c = d;
                else {
                    k = j[g + (d << 1) >> 1] | 0;
                    i = (k & 64512 | 0) == 56320;
                    b = i ? (b << 10) + -56613888 + k | 0 : b;
                    c = i ? c + 2 | 0 : d;
                }
                b = Ya(a, b) | 0;
                d = b & 255;
                if (e << 24 >> 24 != 10) {
                    e = (b & 255 | 0) == 7 ? 10 : e;
                    continue;
                }
                switch (d << 24 >> 24) {
                case 13:
                case 1:
                case 0:
                    break;
                default: {
                        e = 10;
                        continue a;
                    }
                }
                e = d;
            }
        return e | 0;
    }
    function jb(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0;
        c = f[a + 136 >> 2] | 0;
        d = a + 140 | 0;
        b = f[d >> 2] | 0;
        if ((b | 0) == (a + 144 | 0))
            if ((c | 0) >= 11) {
                c = a + 60 | 0;
                if (!((Ka(c, a + 36 | 0, 1, 160) | 0) << 24 >> 24))
                    b = 0;
                else {
                    a = f[c >> 2] | 0;
                    f[d >> 2] = a;
                    c = a + 80 | 0;
                    do {
                        f[a >> 2] = f[b >> 2];
                        a = a + 4 | 0;
                        b = b + 4 | 0;
                    } while ((a | 0) < (c | 0));
                    b = 1;
                }
            } else
                b = 1;
        else {
            b = a + 60 | 0;
            if (!((Ka(b, a + 36 | 0, 1, c << 4) | 0) << 24 >> 24))
                b = 0;
            else {
                f[d >> 2] = f[b >> 2];
                b = 1;
            }
        }
        return b | 0;
    }
    function kb(a) {
        a = a | 0;
        var b = 0;
        do
            if (!a)
                a = 0;
            else {
                b = f[a >> 2] | 0;
                if ((b | 0) != (a | 0)) {
                    if (!b) {
                        a = 0;
                        break;
                    }
                    if ((f[b >> 2] | 0) != (b | 0)) {
                        a = 0;
                        break;
                    }
                }
                a = f[a + 16 >> 2] | 0;
            }
        while (0);
        return a | 0;
    }
    function lb(a) {
        a = a | 0;
        var b = 0;
        do
            if (!a)
                a = 0;
            else {
                b = f[a >> 2] | 0;
                if ((b | 0) != (a | 0)) {
                    if (!b) {
                        a = 0;
                        break;
                    }
                    if ((f[b >> 2] | 0) != (b | 0)) {
                        a = 0;
                        break;
                    }
                }
                a = f[a + 136 >> 2] | 0;
            }
        while (0);
        return a | 0;
    }
    function mb(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        a:
            do
                if (d | 0 ? (f[d >> 2] | 0) <= 0 : 0) {
                    do
                        if (a | 0) {
                            e = f[a >> 2] | 0;
                            if ((e | 0) != (a | 0)) {
                                if (!e)
                                    break;
                                if ((f[e >> 2] | 0) != (e | 0))
                                    break;
                            }
                            if ((b | 0) >= 0 ? (f[a + 136 >> 2] | 0) > (b | 0) : 0) {
                                if (!c)
                                    break a;
                                f[c >> 2] = f[(f[e + 140 >> 2] | 0) + (b << 3) >> 2];
                                break a;
                            }
                            f[d >> 2] = 1;
                            break a;
                        }
                    while (0);
                    f[d >> 2] = 27;
                }
            while (0);
        return;
    }
    function nb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        a:
            do
                if ((c | 0) != 0 ? (f[c >> 2] | 0) <= 0 : 0) {
                    do
                        if (a | 0) {
                            e = f[a >> 2] | 0;
                            if ((e | 0) != (a | 0)) {
                                if (!e)
                                    break;
                                if ((f[e >> 2] | 0) != (e | 0))
                                    break;
                            }
                            if ((b | 0) >= 0 ? (f[e + 16 >> 2] | 0) > (b | 0) : 0) {
                                d = f[e + 140 >> 2] | 0;
                                a = 0;
                                while (1)
                                    if ((f[d + (a << 3) >> 2] | 0) > (b | 0))
                                        break;
                                    else
                                        a = a + 1 | 0;
                                mb(e, a, 0, c);
                                break a;
                            }
                            f[c >> 2] = 1;
                            a = -1;
                            break a;
                        }
                    while (0);
                    f[c >> 2] = 27;
                    a = -1;
                } else
                    a = -1;
            while (0);
        return a | 0;
    }
    function ob(a, b, c, e, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        l = g & 65535;
        a:
            do
                switch (l & 11) {
                case 0: {
                        if ((e | 0) < (b | 0)) {
                            f[h >> 2] = 15;
                            g = b;
                            break a;
                        } else {
                            k = b;
                            g = c;
                        }
                        while (1) {
                            i = k + -1 | 0;
                            c = k + -2 | 0;
                            if ((k | 0) > 1 ? (d[a + (i << 1) >> 1] & -1024) << 16 >> 16 == -9216 : 0)
                                i = (d[a + (c << 1) >> 1] & -1024) << 16 >> 16 == -10240 ? c : i;
                            c = i;
                            do {
                                o = c;
                                c = c + 1 | 0;
                                p = g;
                                g = g + 2 | 0;
                                d[p >> 1] = d[a + (o << 1) >> 1] | 0;
                            } while ((c | 0) < (k | 0));
                            if ((i | 0) > 0)
                                k = i;
                            else {
                                g = b;
                                break;
                            }
                        }
                        break;
                    }
                case 1: {
                        if ((e | 0) < (b | 0)) {
                            f[h >> 2] = 15;
                            g = b;
                            break a;
                        } else {
                            h = b;
                            e = c;
                        }
                        while (1) {
                            c = h;
                            while (1) {
                                i = c + -1 | 0;
                                g = j[a + (i << 1) >> 1] | 0;
                                if ((c | 0) > 1 & (g & 64512 | 0) == 56320) {
                                    c = c + -2 | 0;
                                    o = j[a + (c << 1) >> 1] | 0;
                                    p = (o & 64512 | 0) == 55296;
                                    g = p ? g + -56613888 + (o << 10) | 0 : g;
                                    c = p ? c : i;
                                } else
                                    c = i;
                                if ((c | 0) <= 0) {
                                    k = 0;
                                    break;
                                }
                                if (!(1 << ((Xb(g) | 0) << 24 >> 24) & 448)) {
                                    k = 1;
                                    break;
                                }
                            }
                            i = c;
                            g = e;
                            do {
                                o = i;
                                i = i + 1 | 0;
                                p = g;
                                g = g + 2 | 0;
                                d[p >> 1] = d[a + (o << 1) >> 1] | 0;
                            } while ((i | 0) < (h | 0));
                            if (k) {
                                h = c;
                                e = g;
                            } else {
                                g = b;
                                break;
                            }
                        }
                        break;
                    }
                default: {
                        o = (l & 8 | 0) != 0;
                        if (o) {
                            i = a;
                            k = b;
                            g = 0;
                            while (1) {
                                n = i;
                                i = i + 2 | 0;
                                n = j[n >> 1] | 0;
                                g = g + ((((n + -8294 | 0) >>> 0 < 4 | ((n & 65532 | 0) == 8204 | (n + -8234 | 0) >>> 0 < 5)) ^ 1) & 1) | 0;
                                if ((k | 0) <= 1)
                                    break;
                                else
                                    k = k + -1 | 0;
                            }
                            a = i + (0 - b << 1) | 0;
                        } else
                            g = b;
                        if ((g | 0) > (e | 0)) {
                            f[h >> 2] = 15;
                            break a;
                        }
                        n = (l & 1 | 0) != 0;
                        m = (l & 2 | 0) == 0;
                        l = b;
                        while (1) {
                            k = l + -1 | 0;
                            i = j[a + (k << 1) >> 1] | 0;
                            if ((l | 0) > 1 & (i & 64512 | 0) == 56320) {
                                b = l + -2 | 0;
                                e = j[a + (b << 1) >> 1] | 0;
                                h = (e & 64512 | 0) == 55296;
                                i = h ? i + -56613888 + (e << 10) | 0 : i;
                                k = h ? b : k;
                            }
                            b:
                                do
                                    if (n & (k | 0) > 0)
                                        while (1) {
                                            if (!(1 << ((Xb(i) | 0) << 24 >> 24) & 448))
                                                break b;
                                            e = k + -1 | 0;
                                            i = j[a + (e << 1) >> 1] | 0;
                                            if ((k | 0) > 1 & (i & 64512 | 0) == 56320) {
                                                k = k + -2 | 0;
                                                h = j[a + (k << 1) >> 1] | 0;
                                                b = (h & 64512 | 0) == 55296;
                                                i = b ? i + -56613888 + (h << 10) | 0 : i;
                                                k = b ? k : e;
                                            } else
                                                k = e;
                                            if ((k | 0) <= 0) {
                                                k = 0;
                                                break;
                                            }
                                        }
                                while (0);
                            if (o) {
                                if ((i & -4 | 0) != 8204)
                                    switch (i | 0) {
                                    case 8234:
                                    case 8235:
                                    case 8236:
                                    case 8237:
                                    case 8238:
                                    case 8294:
                                    case 8295:
                                    case 8296:
                                    case 8297:
                                        break;
                                    default:
                                        p = 35;
                                    }
                            } else
                                p = 35;
                            c:
                                do
                                    if ((p | 0) == 35) {
                                        p = 0;
                                        if (m)
                                            i = k;
                                        else {
                                            i = bc(i) | 0;
                                            if (i >>> 0 < 65536) {
                                                h = 1;
                                                e = c;
                                            } else {
                                                d[c >> 1] = (i >>> 10) + 55232;
                                                h = 2;
                                                i = i & 1023 | 56320;
                                                e = c + 2 | 0;
                                            }
                                            d[e >> 1] = i;
                                            i = h + k | 0;
                                            c = c + (h << 1) | 0;
                                        }
                                        while (1) {
                                            if ((i | 0) >= (l | 0))
                                                break c;
                                            d[c >> 1] = d[a + (i << 1) >> 1] | 0;
                                            i = i + 1 | 0;
                                            c = c + 2 | 0;
                                        }
                                    }
                                while (0);
                            if ((k | 0) > 0)
                                l = k;
                            else
                                break;
                        }
                    }
                }
            while (0);
        return g | 0;
    }
    function pb(a, c, e, g, i) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        i = i | 0;
        var j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0;
        z = u;
        u = u + 16 | 0;
        x = z + 4 | 0;
        y = z;
        a:
            do
                if ((i | 0) != 0 ? (f[i >> 2] | 0) <= 0 : 0) {
                    if (((a | 0 ? (w = f[a + 8 >> 2] | 0, w | 0) : 0) ? (j = f[a + 16 >> 2] | 0, (j | e | 0) >= 0) : 0) ? (k = (c | 0) == 0, !(k & (e | 0) > 0)) : 0) {
                        do
                            if (!k) {
                                if (!(w >>> 0 >= c >>> 0 & w >>> 0 < (c + (e << 1) | 0) >>> 0)) {
                                    if (w >>> 0 > c >>> 0)
                                        break;
                                    if ((w + (f[a + 12 >> 2] << 1) | 0) >>> 0 <= c >>> 0)
                                        break;
                                }
                                f[i >> 2] = 1;
                                j = 0;
                                break a;
                            }
                        while (0);
                        if (!j) {
                            Vb(c, e, 0, i) | 0;
                            j = 0;
                            break;
                        }
                        t = ub(a, i) | 0;
                        if ((f[i >> 2] | 0) > 0) {
                            j = 0;
                            break;
                        }
                        k = f[a + 92 >> 2] | 0;
                        v = g & -13;
                        v = (k & 2 | 0) == 0 ? (k & 1 | 0) == 0 ? g : v | 4 : v | 8;
                        v = ((f[a + 88 >> 2] | 0) + -3 | 0) >>> 0 < 4 ? v : v & -5;
                        k = v & 65535;
                        j = (k & 4 | 0) != 0;
                        b:
                            do
                                if (!(k & 16)) {
                                    if (!j) {
                                        n = k & 65533;
                                        l = c;
                                        j = e;
                                        m = 0;
                                        while (1) {
                                            if ((m | 0) >= (t | 0))
                                                break b;
                                            s = (zb(a, m, x, y) | 0) == 0;
                                            k = w + (f[x >> 2] << 1) | 0;
                                            g = f[y >> 2] | 0;
                                            if (s)
                                                k = qb(k, g, l, j, n, i) | 0;
                                            else
                                                k = ob(k, g, l, j, v, i) | 0;
                                            f[y >> 2] = k;
                                            l = (l | 0) == 0 ? 0 : l + (k << 1) | 0;
                                            j = j - k | 0;
                                            m = m + 1 | 0;
                                        }
                                    }
                                    q = f[a + 76 >> 2] | 0;
                                    r = a + 228 | 0;
                                    s = a + 84 | 0;
                                    p = k & 65533;
                                    j = e;
                                    o = 0;
                                    k = c;
                                    while (1) {
                                        if ((o | 0) >= (t | 0))
                                            break b;
                                        A = zb(a, o, x, y) | 0;
                                        l = f[x >> 2] | 0;
                                        n = w + (l << 1) | 0;
                                        g = f[(f[r >> 2] | 0) + (o * 12 | 0) + 8 >> 2] | 0;
                                        g = (g | 0) > 0 ? g : 0;
                                        m = (b[s >> 0] | 0) != 0;
                                        do
                                            if (!A) {
                                                if (m)
                                                    g = g | (b[q + l >> 0] | 0) != 0;
                                                l = 8207 - (g & 1) << 16 >> 16;
                                                if (g & 5) {
                                                    if ((j | 0) > 0) {
                                                        d[k >> 1] = l;
                                                        k = k + 2 | 0;
                                                    }
                                                    j = j + -1 | 0;
                                                }
                                                l = qb(n, f[y >> 2] | 0, k, j, p, i) | 0;
                                                f[y >> 2] = l;
                                                k = (k | 0) == 0 ? 0 : k + (l << 1) | 0;
                                                j = j - l | 0;
                                                if (b[s >> 0] | 0)
                                                    g = (b[q + (l + -1 + (f[x >> 2] | 0)) >> 0] | 0) == 0 ? g : g | 2;
                                                if (!(g & 10))
                                                    break;
                                                if ((j | 0) > 0) {
                                                    d[k >> 1] = 8207 - ((g & 2) >>> 1) << 16 >> 16;
                                                    k = k + 2 | 0;
                                                }
                                                j = j + -1 | 0;
                                            } else {
                                                if (m)
                                                    g = (1 << h[q + (l + -1 + (f[y >> 2] | 0)) >> 0] & 8194 | 0) == 0 ? g | 4 : g;
                                                l = 8207 - (g & 1) << 16 >> 16;
                                                if (g & 5) {
                                                    if ((j | 0) > 0) {
                                                        d[k >> 1] = l;
                                                        k = k + 2 | 0;
                                                    }
                                                    j = j + -1 | 0;
                                                }
                                                A = ob(n, f[y >> 2] | 0, k, j, v, i) | 0;
                                                f[y >> 2] = A;
                                                k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                                j = j - A | 0;
                                                if (b[s >> 0] | 0)
                                                    g = (1 << h[q + (f[x >> 2] | 0) >> 0] & 8194 | 0) == 0 ? g | 8 : g;
                                                if (!(g & 10))
                                                    break;
                                                if ((j | 0) > 0) {
                                                    d[k >> 1] = 8207 - ((g & 2) >>> 1) << 16 >> 16;
                                                    k = k + 2 | 0;
                                                }
                                                j = j + -1 | 0;
                                            }
                                        while (0);
                                        o = o + 1 | 0;
                                    }
                                } else {
                                    if (!j) {
                                        n = k & 65533;
                                        m = c;
                                        k = t;
                                        j = e;
                                        while (1) {
                                            l = k + -1 | 0;
                                            if ((k | 0) <= 0)
                                                break b;
                                            A = (zb(a, l, x, y) | 0) == 0;
                                            k = w + (f[x >> 2] << 1) | 0;
                                            g = f[y >> 2] | 0;
                                            if (A)
                                                g = ob(k, g, m, j, n, i) | 0;
                                            else
                                                g = qb(k, g, m, j, v, i) | 0;
                                            f[y >> 2] = g;
                                            m = (m | 0) == 0 ? 0 : m + (g << 1) | 0;
                                            k = l;
                                            j = j - g | 0;
                                        }
                                    }
                                    p = f[a + 76 >> 2] | 0;
                                    o = k & 65533;
                                    k = c;
                                    g = t;
                                    j = e;
                                    while (1) {
                                        n = g + -1 | 0;
                                        if ((g | 0) <= 0)
                                            break b;
                                        A = zb(a, n, x, y) | 0;
                                        g = f[x >> 2] | 0;
                                        m = w + (g << 1) | 0;
                                        if (!A) {
                                            l = f[y >> 2] | 0;
                                            if (b[p + (g + -1 + l) >> 0] | 0) {
                                                if ((j | 0) > 0) {
                                                    d[k >> 1] = 8206;
                                                    k = k + 2 | 0;
                                                }
                                                j = j + -1 | 0;
                                            }
                                            A = ob(m, l, k, j, o, i) | 0;
                                            f[y >> 2] = A;
                                            k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                            j = j - A | 0;
                                            if (!(b[p + (f[x >> 2] | 0) >> 0] | 0)) {
                                                g = n;
                                                continue;
                                            }
                                            if ((j | 0) > 0) {
                                                d[k >> 1] = 8206;
                                                k = k + 2 | 0;
                                            }
                                            g = n;
                                            j = j + -1 | 0;
                                            continue;
                                        } else {
                                            if (!(1 << h[p + g >> 0] & 8194)) {
                                                if ((j | 0) > 0) {
                                                    d[k >> 1] = 8207;
                                                    k = k + 2 | 0;
                                                }
                                                j = j + -1 | 0;
                                            }
                                            A = qb(m, f[y >> 2] | 0, k, j, v, i) | 0;
                                            f[y >> 2] = A;
                                            k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                            j = j - A | 0;
                                            if (1 << h[p + (A + -1 + (f[x >> 2] | 0)) >> 0] & 8194 | 0) {
                                                g = n;
                                                continue;
                                            }
                                            if ((j | 0) > 0) {
                                                d[k >> 1] = 8207;
                                                k = k + 2 | 0;
                                            }
                                            g = n;
                                            j = j + -1 | 0;
                                            continue;
                                        }
                                    }
                                }
                            while (0);
                        j = Vb(c, e, e - j | 0, i) | 0;
                        break;
                    }
                    f[i >> 2] = 1;
                    j = 0;
                } else
                    j = 0;
            while (0);
        u = z;
        return j | 0;
    }
    function qb(a, b, c, e, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, k = 0, l = 0, m = 0;
        a:
            do
                switch (g & 10) {
                case 0: {
                        if ((e | 0) < (b | 0)) {
                            f[h >> 2] = 15;
                            g = b;
                            break a;
                        } else {
                            i = b;
                            g = c;
                            while (1) {
                                d[g >> 1] = d[a >> 1] | 0;
                                if ((i | 0) > 1) {
                                    a = a + 2 | 0;
                                    i = i + -1 | 0;
                                    g = g + 2 | 0;
                                } else {
                                    g = b;
                                    break;
                                }
                            }
                        }
                        break;
                    }
                case 2: {
                        if ((e | 0) < (b | 0)) {
                            f[h >> 2] = 15;
                            g = b;
                            break a;
                        } else {
                            m = 0;
                            i = 0;
                        }
                        while (1) {
                            k = i + 1 | 0;
                            g = j[a + (i << 1) >> 1] | 0;
                            if ((k | 0) == (b | 0) | (g & 64512 | 0) != 55296)
                                i = k;
                            else {
                                h = j[a + (k << 1) >> 1] | 0;
                                e = (h & 64512 | 0) == 56320;
                                g = e ? (g << 10) + -56613888 + h | 0 : g;
                                i = e ? i + 2 | 0 : k;
                            }
                            g = bc(g) | 0;
                            if (g >>> 0 < 65536) {
                                l = m;
                                k = 1;
                            } else {
                                d[c + (m << 1) >> 1] = (g >>> 10) + 55232;
                                l = m + 1 | 0;
                                g = g & 1023 | 56320;
                                k = 2;
                            }
                            d[c + (l << 1) >> 1] = g;
                            if ((i | 0) < (b | 0))
                                m = k + m | 0;
                            else {
                                g = b;
                                break;
                            }
                        }
                        break;
                    }
                case 8: {
                        l = e;
                        i = b;
                        b:
                            while (1) {
                                k = a;
                                a = a + 2 | 0;
                                k = d[k >> 1] | 0;
                                c:
                                    do
                                        if ((k & -4) << 16 >> 16 == 8204)
                                            g = l;
                                        else {
                                            switch (k << 16 >> 16) {
                                            case 8234:
                                            case 8235:
                                            case 8236:
                                            case 8237:
                                            case 8238:
                                            case 8294:
                                            case 8295:
                                            case 8296:
                                            case 8297: {
                                                    g = l;
                                                    break c;
                                                }
                                            default: {
                                                }
                                            }
                                            g = l + -1 | 0;
                                            if ((l | 0) < 1) {
                                                m = 15;
                                                break b;
                                            }
                                            d[c >> 1] = k;
                                            c = c + 2 | 0;
                                        }
                                    while (0);
                                if ((i | 0) <= 1)
                                    break;
                                else {
                                    l = g;
                                    i = i + -1 | 0;
                                }
                            }
                        d:
                            do
                                if ((m | 0) == 15) {
                                    f[h >> 2] = 15;
                                    while (1) {
                                        if ((i | 0) <= 1)
                                            break d;
                                        h = j[a >> 1] | 0;
                                        g = g + ((((h + -8294 | 0) >>> 0 < 4 | ((h & 65532 | 0) == 8204 | (h + -8234 | 0) >>> 0 < 5)) ^ 1) << 31 >> 31) | 0;
                                        i = i + -1 | 0;
                                        a = a + 2 | 0;
                                    }
                                }
                            while (0);
                        g = e - g | 0;
                        break;
                    }
                default: {
                        g = 0;
                        i = e;
                        e:
                            while (1) {
                                k = j[a >> 1] | 0;
                                if ((b | 0) == 1 | (k & 64512 | 0) != 55296)
                                    l = 1;
                                else {
                                    m = j[a + 2 >> 1] | 0;
                                    l = (m & 64512 | 0) == 56320;
                                    k = l ? (k << 10) + -56613888 + m | 0 : k;
                                    l = l ? 2 : 1;
                                }
                                a = a + (l << 1) | 0;
                                b = b - l | 0;
                                f:
                                    do
                                        if ((k & -4 | 0) != 8204) {
                                            switch (k | 0) {
                                            case 8234:
                                            case 8235:
                                            case 8236:
                                            case 8237:
                                            case 8238:
                                            case 8294:
                                            case 8295:
                                            case 8296:
                                            case 8297:
                                                break f;
                                            default: {
                                                }
                                            }
                                            i = i - l | 0;
                                            if ((i | 0) < 0)
                                                break e;
                                            k = bc(k) | 0;
                                            if (k >>> 0 < 65536) {
                                                l = g;
                                                m = 1;
                                            } else {
                                                d[c + (g << 1) >> 1] = (k >>> 10) + 55232;
                                                l = g + 1 | 0;
                                                m = 2;
                                                k = k & 1023 | 56320;
                                            }
                                            d[c + (l << 1) >> 1] = k;
                                            g = m + g | 0;
                                        }
                                    while (0);
                                if ((b | 0) <= 0)
                                    break a;
                            }
                        f[h >> 2] = 15;
                        g = b;
                        while (1) {
                            if ((g | 0) <= 0)
                                break;
                            h = j[a >> 1] | 0;
                            i = i + ((((h + -8294 | 0) >>> 0 < 4 | ((h & 65532 | 0) == 8204 | (h + -8234 | 0) >>> 0 < 5)) ^ 1) << 31 >> 31) | 0;
                            g = g + -1 | 0;
                            a = a + 2 | 0;
                        }
                        g = e - i | 0;
                    }
                }
            while (0);
        return g | 0;
    }
    function rb(a, c, e, g, h) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        do
            if (h | 0 ? (f[h >> 2] | 0) <= 0 : 0) {
                if (a | 0 ? (f[a >> 2] | 0) == (a | 0) : 0) {
                    if (!((c | 0) > -1 & (e | 0) > (c | 0))) {
                        f[h >> 2] = 1;
                        break;
                    }
                    if ((e | 0) >= 0 ? (f[a + 16 >> 2] | 0) >= (e | 0) : 0) {
                        if (!g) {
                            f[h >> 2] = 1;
                            break;
                        }
                        p = nb(a, c, h) | 0;
                        if ((p | 0) != (nb(a, e + -1 | 0, h) | 0)) {
                            f[h >> 2] = 1;
                            break;
                        }
                        f[g >> 2] = 0;
                        l = a + 8 | 0;
                        f[g + 8 >> 2] = (f[l >> 2] | 0) + (c << 1);
                        o = e - c | 0;
                        f[g + 16 >> 2] = o;
                        f[g + 12 >> 2] = o;
                        m = g + 20 | 0;
                        f[m >> 2] = o;
                        if ((b[a + 98 >> 0] | 0) != 0 ? (i = f[a + 140 >> 2] | 0, (f[i >> 2] | 0) <= (c | 0)) : 0) {
                            p = f[a + 136 >> 2] | 0;
                            h = Ma(p, i, c) | 0;
                            i = p;
                        } else {
                            h = b[a + 97 >> 0] | 0;
                            i = f[a + 136 >> 2] | 0;
                        }
                        p = g + 97 | 0;
                        b[p >> 0] = h;
                        f[g + 136 >> 2] = i;
                        f[g + 228 >> 2] = 0;
                        f[g + 124 >> 2] = 0;
                        f[g + 88 >> 2] = f[a + 88 >> 2];
                        f[g + 92 >> 2] = f[a + 92 >> 2];
                        k = g + 352 | 0;
                        f[k >> 2] = 0;
                        if ((f[a + 352 >> 2] | 0) > 0) {
                            j = c;
                            h = 0;
                            while (1) {
                                if ((j | 0) >= (e | 0))
                                    break;
                                i = d[(f[l >> 2] | 0) + (j << 1) >> 1] | 0;
                                if ((i & -4) << 16 >> 16 == 8204)
                                    n = 23;
                                else
                                    switch (i << 16 >> 16) {
                                    case 8234:
                                    case 8235:
                                    case 8236:
                                    case 8237:
                                    case 8238:
                                    case 8294:
                                    case 8295:
                                    case 8296:
                                    case 8297: {
                                            n = 23;
                                            break;
                                        }
                                    default: {
                                        }
                                    }
                                if ((n | 0) == 23) {
                                    n = 0;
                                    h = h + 1 | 0;
                                    f[k >> 2] = h;
                                }
                                j = j + 1 | 0;
                            }
                            f[m >> 2] = o - h;
                        }
                        f[g + 76 >> 2] = (f[a + 76 >> 2] | 0) + c;
                        l = (f[a + 80 >> 2] | 0) + c | 0;
                        f[g + 80 >> 2] = l;
                        f[g + 224 >> 2] = -1;
                        h = f[a + 120 >> 2] | 0;
                        a:
                            do
                                if ((h | 0) == 2) {
                                    sb(g);
                                    k = g + 132 | 0;
                                    j = f[k >> 2] | 0;
                                    b:
                                        do
                                            if (!j)
                                                h = b[p >> 0] & 1;
                                            else {
                                                h = b[l >> 0] & 1;
                                                if ((j | 0) < (o | 0) ? (b[p >> 0] & 1) != h << 24 >> 24 : 0) {
                                                    h = 2;
                                                    break;
                                                } else
                                                    i = 1;
                                                while (1) {
                                                    if ((i | 0) == (j | 0))
                                                        break b;
                                                    if ((b[l + i >> 0] & 1) == h << 24 >> 24)
                                                        i = i + 1 | 0;
                                                    else {
                                                        h = 2;
                                                        break;
                                                    }
                                                }
                                            }
                                        while (0);
                                    f[g + 120 >> 2] = h & 255;
                                    switch (h & 3) {
                                    case 0: {
                                            h = (b[p >> 0] | 0) + 1 << 24 >> 24 & -2;
                                            break;
                                        }
                                    case 1: {
                                            h = b[p >> 0] | 1;
                                            break;
                                        }
                                    default:
                                        break a;
                                    }
                                    b[p >> 0] = h;
                                    f[k >> 2] = 0;
                                } else {
                                    f[g + 120 >> 2] = h;
                                    p = f[a + 132 >> 2] | 0;
                                    f[g + 132 >> 2] = (p | 0) > (c | 0) ? (p | 0) < (e | 0) ? p - c | 0 : o : 0;
                                }
                            while (0);
                        f[g >> 2] = a;
                        break;
                    }
                    f[h >> 2] = 1;
                    break;
                }
                f[h >> 2] = 27;
            }
        while (0);
        return;
    }
    function sb(a) {
        a = a | 0;
        var c = 0, d = 0, e = 0, g = 0, i = 0;
        e = f[a + 76 >> 2] | 0;
        g = f[a + 80 >> 2] | 0;
        c = f[a + 16 >> 2] | 0;
        i = b[a + 97 >> 0] | 0;
        a:
            do
                if ((b[e + (c + -1) >> 0] | 0) != 7) {
                    while (1) {
                        if ((c | 0) <= 0)
                            break;
                        d = c + -1 | 0;
                        if (!(1 << h[e + d >> 0] & 8248192))
                            break;
                        else
                            c = d;
                    }
                    while (1) {
                        if ((c | 0) <= 0)
                            break a;
                        d = c + -1 | 0;
                        if ((b[g + d >> 0] | 0) == i << 24 >> 24)
                            c = d;
                        else
                            break;
                    }
                }
            while (0);
        f[a + 132 >> 2] = c;
        return;
    }
    function tb(a, c) {
        a = a | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0, i = 0;
        a:
            do
                if ((c | 0) != 0 ? (f[c >> 2] | 0) <= 0 : 0) {
                    do
                        if (a | 0) {
                            d = f[a >> 2] | 0;
                            if ((d | 0) != (a | 0)) {
                                if (!d)
                                    break;
                                if ((f[d >> 2] | 0) != (d | 0))
                                    break;
                            }
                            e = f[a + 16 >> 2] | 0;
                            if ((e | 0) < 1) {
                                f[c >> 2] = 1;
                                d = 0;
                                break a;
                            }
                            g = a + 132 | 0;
                            h = f[g >> 2] | 0;
                            if ((e | 0) == (h | 0)) {
                                d = f[a + 80 >> 2] | 0;
                                break a;
                            }
                            d = a + 52 | 0;
                            if (!((Ka(d, a + 28 | 0, b[a + 72 >> 0] | 0, e) | 0) << 24 >> 24)) {
                                f[c >> 2] = 7;
                                d = 0;
                                break a;
                            }
                            d = f[d >> 2] | 0;
                            c = a + 80 | 0;
                            if ((h | 0) > 0 ? (i = f[c >> 2] | 0, (d | 0) != (i | 0)) : 0)
                                Fc(d | 0, i | 0, h | 0) | 0;
                            Gc(d + h | 0, b[a + 97 >> 0] | 0, e - h | 0) | 0;
                            f[g >> 2] = e;
                            f[c >> 2] = d;
                            break a;
                        }
                    while (0);
                    f[c >> 2] = 27;
                    d = 0;
                } else
                    d = 0;
            while (0);
        return d | 0;
    }
    function ub(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        a:
            do
                if ((b | 0) != 0 ? (f[b >> 2] | 0) <= 0 : 0) {
                    do
                        if (a | 0) {
                            c = f[a >> 2] | 0;
                            if ((c | 0) != (a | 0)) {
                                if (!c)
                                    break;
                                if ((f[c >> 2] | 0) != (c | 0))
                                    break;
                            }
                            vb(a, b);
                            if ((f[b >> 2] | 0) > 0) {
                                a = -1;
                                break a;
                            }
                            a = f[a + 224 >> 2] | 0;
                            break a;
                        }
                    while (0);
                    f[b >> 2] = 27;
                    a = -1;
                } else
                    a = -1;
            while (0);
        return a | 0;
    }
    function vb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        s = a + 224 | 0;
        a:
            do
                if ((f[s >> 2] | 0) <= -1) {
                    do
                        if ((f[a + 120 >> 2] | 0) == 2) {
                            p = f[a + 16 >> 2] | 0;
                            r = f[a + 80 >> 2] | 0;
                            q = f[a + 132 >> 2] | 0;
                            e = 0;
                            i = 0;
                            g = -2;
                            while (1) {
                                if ((e | 0) >= (q | 0))
                                    break;
                                o = b[r + e >> 0] | 0;
                                e = e + 1 | 0;
                                i = i + (o << 24 >> 24 != g << 24 >> 24 & 1) | 0;
                                g = o;
                            }
                            if ((p | 0) == (q | 0) & (i | 0) == 1) {
                                wb(a, b[r >> 0] | 0);
                                break;
                            }
                            l = (p | 0) > (q | 0);
                            o = i + (l & 1) | 0;
                            e = a + 64 | 0;
                            if (!((Ka(e, a + 40 | 0, b[a + 73 >> 0] | 0, o * 12 | 0) | 0) << 24 >> 24))
                                break a;
                            n = f[e >> 2] | 0;
                            m = 0;
                            e = 126;
                            k = 0;
                            i = 0;
                            while (1) {
                                g = b[r + i >> 0] | 0;
                                e = (g & 255) < (e & 255) ? g : e;
                                k = (g & 255) > (k & 255) ? g : k;
                                j = i;
                                while (1) {
                                    j = j + 1 | 0;
                                    if ((j | 0) >= (q | 0)) {
                                        g = 0;
                                        break;
                                    }
                                    if ((b[r + j >> 0] | 0) != g << 24 >> 24) {
                                        g = 1;
                                        break;
                                    }
                                }
                                f[n + (m * 12 | 0) >> 2] = i;
                                f[n + (m * 12 | 0) + 4 >> 2] = j - i;
                                f[n + (m * 12 | 0) + 8 >> 2] = 0;
                                m = m + 1 | 0;
                                if (!g)
                                    break;
                                else
                                    i = j;
                            }
                            if (l) {
                                f[n + (m * 12 | 0) >> 2] = q;
                                f[n + (m * 12 | 0) + 4 >> 2] = p - q;
                                q = b[a + 97 >> 0] | 0;
                                e = (q & 255) < (e & 255) ? q : e;
                            }
                            f[a + 228 >> 2] = n;
                            f[s >> 2] = o;
                            xb(a, e, k);
                            e = 0;
                            g = 0;
                            while (1) {
                                if ((g | 0) >= (o | 0))
                                    break;
                                p = n + (g * 12 | 0) | 0;
                                q = f[p >> 2] | 0;
                                f[p >> 2] = h[r + q >> 0] << 31 | q;
                                p = n + (g * 12 | 0) + 4 | 0;
                                q = (f[p >> 2] | 0) + e | 0;
                                f[p >> 2] = q;
                                e = q;
                                g = g + 1 | 0;
                            }
                            if ((m | 0) < (o | 0)) {
                                q = h[a + 97 >> 0] | 0;
                                r = n + ((q & 1 | 0 ? 0 : m) * 12 | 0) | 0;
                                f[r >> 2] = q << 31 | f[r >> 2];
                            }
                        } else
                            wb(a, b[a + 97 >> 0] | 0);
                    while (0);
                    e = f[a + 336 >> 2] | 0;
                    b:
                        do
                            if ((e | 0) > 0) {
                                r = f[a + 348 >> 2] | 0;
                                g = r + (e << 3) | 0;
                                i = a + 228 | 0;
                                e = r;
                                while (1) {
                                    if (e >>> 0 >= g >>> 0)
                                        break b;
                                    r = yb(f[s >> 2] | 0, f[i >> 2] | 0, f[e >> 2] | 0, c) | 0;
                                    r = (f[i >> 2] | 0) + (r * 12 | 0) + 8 | 0;
                                    f[r >> 2] = f[r >> 2] | f[e + 4 >> 2];
                                    e = e + 8 | 0;
                                }
                            }
                        while (0);
                    if ((f[a + 352 >> 2] | 0) > 0) {
                        e = f[a + 8 >> 2] | 0;
                        j = e + (f[a + 16 >> 2] << 1) | 0;
                        k = e;
                        g = a + 228 | 0;
                        while (1) {
                            if (e >>> 0 >= j >>> 0)
                                break a;
                            i = d[e >> 1] | 0;
                            if ((i & -4) << 16 >> 16 == 8204)
                                t = 31;
                            else
                                switch (i << 16 >> 16) {
                                case 8234:
                                case 8235:
                                case 8236:
                                case 8237:
                                case 8238:
                                case 8294:
                                case 8295:
                                case 8296:
                                case 8297: {
                                        t = 31;
                                        break;
                                    }
                                default: {
                                    }
                                }
                            if ((t | 0) == 31) {
                                t = 0;
                                a = yb(f[s >> 2] | 0, f[g >> 2] | 0, e - k >> 1, c) | 0;
                                a = (f[g >> 2] | 0) + (a * 12 | 0) + 8 | 0;
                                f[a >> 2] = (f[a >> 2] | 0) + -1;
                            }
                            e = e + 2 | 0;
                        }
                    }
                }
            while (0);
        return;
    }
    function wb(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        c = a + 232 | 0;
        f[a + 228 >> 2] = c;
        f[a + 224 >> 2] = 1;
        f[c >> 2] = (b & 255) << 31;
        f[a + 236 >> 2] = f[a + 16 >> 2];
        f[a + 240 >> 2] = 0;
        return;
    }
    function xb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        o = u;
        u = u + 16 | 0;
        n = o;
        a:
            do
                if (((b | 1) & 255) < (c & 255)) {
                    l = b + 1 << 24 >> 24;
                    m = f[a + 228 >> 2] | 0;
                    i = f[a + 80 >> 2] | 0;
                    j = a + 132 | 0;
                    k = a + 16 | 0;
                    g = (f[a + 224 >> 2] | 0) + (((f[j >> 2] | 0) < (f[k >> 2] | 0)) << 31 >> 31) | 0;
                    b = c;
                    b:
                        while (1) {
                            b = b + -1 << 24 >> 24;
                            if ((b & 255) < (l & 255))
                                break;
                            else
                                a = 0;
                            while (1) {
                                while (1) {
                                    if ((a | 0) >= (g | 0))
                                        continue b;
                                    if ((h[i + (f[m + (a * 12 | 0) >> 2] | 0) >> 0] | 0) >= (b & 255)) {
                                        c = a;
                                        break;
                                    }
                                    a = a + 1 | 0;
                                }
                                while (1) {
                                    e = c + 1 | 0;
                                    if ((e | 0) >= (g | 0)) {
                                        d = c;
                                        break;
                                    }
                                    if ((h[i + (f[m + (e * 12 | 0) >> 2] | 0) >> 0] | 0) < (b & 255)) {
                                        d = c;
                                        break;
                                    } else
                                        c = e;
                                }
                                while (1) {
                                    if ((a | 0) >= (d | 0))
                                        break;
                                    q = m + (a * 12 | 0) | 0;
                                    f[n >> 2] = f[q >> 2];
                                    f[n + 4 >> 2] = f[q + 4 >> 2];
                                    f[n + 8 >> 2] = f[q + 8 >> 2];
                                    p = m + (d * 12 | 0) | 0;
                                    f[q >> 2] = f[p >> 2];
                                    f[q + 4 >> 2] = f[p + 4 >> 2];
                                    f[q + 8 >> 2] = f[p + 8 >> 2];
                                    f[p >> 2] = f[n >> 2];
                                    f[p + 4 >> 2] = f[n + 4 >> 2];
                                    f[p + 8 >> 2] = f[n + 8 >> 2];
                                    d = d + -1 | 0;
                                    a = a + 1 | 0;
                                }
                                if ((e | 0) == (g | 0))
                                    continue b;
                                else
                                    a = c + 2 | 0;
                            }
                        }
                    if (!(l & 1)) {
                        b = g + (((f[j >> 2] | 0) == (f[k >> 2] | 0)) << 31 >> 31) | 0;
                        a = 0;
                        while (1) {
                            if ((a | 0) >= (b | 0))
                                break a;
                            p = m + (a * 12 | 0) | 0;
                            f[n >> 2] = f[p >> 2];
                            f[n + 4 >> 2] = f[p + 4 >> 2];
                            f[n + 8 >> 2] = f[p + 8 >> 2];
                            q = m + (b * 12 | 0) | 0;
                            f[p >> 2] = f[q >> 2];
                            f[p + 4 >> 2] = f[q + 4 >> 2];
                            f[p + 8 >> 2] = f[q + 8 >> 2];
                            f[q >> 2] = f[n >> 2];
                            f[q + 4 >> 2] = f[n + 4 >> 2];
                            f[q + 8 >> 2] = f[n + 8 >> 2];
                            b = b + -1 | 0;
                            a = a + 1 | 0;
                        }
                    }
                }
            while (0);
        u = o;
        return;
    }
    function yb(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0;
        g = 0;
        e = 0;
        while (1) {
            if ((e | 0) >= (a | 0)) {
                i = 6;
                break;
            }
            h = f[b + (e * 12 | 0) + 4 >> 2] | 0;
            j = f[b + (e * 12 | 0) >> 2] & 2147483647;
            if ((j | 0) <= (c | 0) ? (h - g + j | 0) > (c | 0) : 0)
                break;
            g = h;
            e = e + 1 | 0;
        }
        if ((i | 0) == 6) {
            f[d >> 2] = 27;
            e = 0;
        }
        return e | 0;
    }
    function zb(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0, i = 0;
        i = u;
        u = u + 16 | 0;
        e = i;
        f[e >> 2] = 0;
        do
            if (a) {
                g = f[a >> 2] | 0;
                if ((g | 0) != (a | 0)) {
                    if (!g) {
                        h = 5;
                        break;
                    }
                    if ((f[g >> 2] | 0) != (g | 0)) {
                        h = 5;
                        break;
                    }
                }
                vb(a, e);
                if ((f[e >> 2] | 0) > 0)
                    a = 0;
                else {
                    if ((b | 0) >= 0 ? (f[a + 224 >> 2] | 0) > (b | 0) : 0) {
                        a = f[a + 228 >> 2] | 0;
                        e = f[a + (b * 12 | 0) >> 2] | 0;
                        if (c | 0)
                            f[c >> 2] = e & 2147483647;
                        if (d | 0) {
                            if ((b | 0) > 0)
                                a = (f[a + (b * 12 | 0) + 4 >> 2] | 0) - (f[a + ((b + -1 | 0) * 12 | 0) + 4 >> 2] | 0) | 0;
                            else
                                a = f[a + 4 >> 2] | 0;
                            f[d >> 2] = a;
                        }
                        a = e >>> 31;
                        break;
                    }
                    f[e >> 2] = 1;
                    a = 0;
                }
            } else
                h = 5;
        while (0);
        if ((h | 0) == 5) {
            f[e >> 2] = 27;
            a = 0;
        }
        u = i;
        return a | 0;
    }
    function Ab(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        a:
            do
                if (c | 0 ? (f[c >> 2] | 0) <= 0 : 0) {
                    if (!b) {
                        f[c >> 2] = 1;
                        break;
                    }
                    ub(a, c) | 0;
                    if ((f[c >> 2] | 0) < 1 ? (p = f[a + 228 >> 2] | 0, k = a + 224 | 0, l = p + ((f[k >> 2] | 0) * 12 | 0) | 0, m = a + 20 | 0, (f[m >> 2] | 0) >= 1) : 0) {
                        j = p;
                        e = 0;
                        c = b;
                        while (1) {
                            if (j >>> 0 >= l >>> 0)
                                break;
                            g = f[j >> 2] | 0;
                            i = f[j + 4 >> 2] | 0;
                            if ((g | 0) > -1)
                                while (1) {
                                    h = c + 4 | 0;
                                    f[c >> 2] = g;
                                    e = e + 1 | 0;
                                    if ((e | 0) < (i | 0)) {
                                        g = g + 1 | 0;
                                        c = h;
                                    } else {
                                        c = h;
                                        break;
                                    }
                                }
                            else {
                                h = i - e + (g & 2147483647) | 0;
                                while (1) {
                                    h = h + -1 | 0;
                                    g = c + 4 | 0;
                                    f[c >> 2] = h;
                                    e = e + 1 | 0;
                                    if ((e | 0) >= (i | 0)) {
                                        c = g;
                                        break;
                                    } else
                                        c = g;
                                }
                            }
                            j = j + 12 | 0;
                        }
                        if ((f[a + 336 >> 2] | 0) > 0) {
                            e = f[k >> 2] | 0;
                            g = 0;
                            c = 0;
                            while (1) {
                                if ((c | 0) >= (e | 0))
                                    break;
                                o = f[p + (c * 12 | 0) + 8 >> 2] | 0;
                                g = g + ((o & 5 | 0) != 0 & 1) + ((o & 10 | 0) != 0 & 1) | 0;
                                c = c + 1 | 0;
                            }
                            c = f[m >> 2] | 0;
                            while (1) {
                                k = e + -1 | 0;
                                if (!((e | 0) > 0 & (g | 0) > 0))
                                    break a;
                                l = f[p + (k * 12 | 0) + 8 >> 2] | 0;
                                h = c + -1 | 0;
                                if (l & 10) {
                                    f[b + (h << 2) >> 2] = -1;
                                    c = h;
                                    g = g + -1 | 0;
                                }
                                if ((e | 0) > 1)
                                    j = f[p + ((e + -2 | 0) * 12 | 0) + 4 >> 2] | 0;
                                else
                                    j = 0;
                                i = (g | 0) > 0;
                                e = f[p + (k * 12 | 0) + 4 >> 2] | 0;
                                h = c;
                                while (1) {
                                    c = e + -1 | 0;
                                    if (!(i & (e | 0) > (j | 0)))
                                        break;
                                    o = h + -1 | 0;
                                    f[b + (o << 2) >> 2] = f[b + (c << 2) >> 2];
                                    e = c;
                                    h = o;
                                }
                                c = h + -1 | 0;
                                if (!(l & 5)) {
                                    c = h;
                                    e = k;
                                    continue;
                                }
                                f[b + (c << 2) >> 2] = -1;
                                e = k;
                                g = g + -1 | 0;
                            }
                        }
                        if ((f[a + 352 >> 2] | 0) > 0) {
                            o = f[k >> 2] | 0;
                            m = a + 8 | 0;
                            c = 0;
                            a = 0;
                            e = 0;
                            while (1) {
                                if ((a | 0) >= (o | 0))
                                    break a;
                                n = f[p + (a * 12 | 0) + 4 >> 2] | 0;
                                l = n - e | 0;
                                g = (f[p + (a * 12 | 0) + 8 >> 2] | 0) == 0;
                                b:
                                    do
                                        if ((c | 0) == (e | 0) & g)
                                            c = l + c | 0;
                                        else {
                                            if (g)
                                                while (1) {
                                                    if ((e | 0) >= (n | 0))
                                                        break b;
                                                    f[b + (c << 2) >> 2] = f[b + (e << 2) >> 2];
                                                    e = e + 1 | 0;
                                                    c = c + 1 | 0;
                                                }
                                            j = f[p + (a * 12 | 0) >> 2] | 0;
                                            i = j & 2147483647;
                                            j = (j | 0) > -1;
                                            k = l + -1 + i | 0;
                                            h = 0;
                                            while (1) {
                                                if ((h | 0) >= (l | 0))
                                                    break b;
                                                e = j ? h + i | 0 : k - h | 0;
                                                g = d[(f[m >> 2] | 0) + (e << 1) >> 1] | 0;
                                                c:
                                                    do
                                                        if ((g & -4) << 16 >> 16 != 8204) {
                                                            switch (g << 16 >> 16) {
                                                            case 8234:
                                                            case 8235:
                                                            case 8236:
                                                            case 8237:
                                                            case 8238:
                                                            case 8294:
                                                            case 8295:
                                                            case 8296:
                                                            case 8297:
                                                                break c;
                                                            default: {
                                                                }
                                                            }
                                                            f[b + (c << 2) >> 2] = e;
                                                            c = c + 1 | 0;
                                                        }
                                                    while (0);
                                                h = h + 1 | 0;
                                            }
                                        }
                                    while (0);
                                a = a + 1 | 0;
                                e = n;
                            }
                        }
                    }
                }
            while (0);
        return;
    }
    function Bb(a, b, c, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        var h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0;
        o = u;
        u = u + 656 | 0;
        j = o + 32 | 0;
        l = o + 56 | 0;
        m = o + 28 | 0;
        n = o + 24 | 0;
        k = o;
        if (!g) {
            n = 0;
            u = o;
            return n | 0;
        }
        if ((Cb(f[g >> 2] | 0) | 0) << 24 >> 24) {
            n = 0;
            u = o;
            return n | 0;
        }
        if (!((a | 0) == 0 | (b | 0) < -1) ? (h = (c | 0) == 0, !((e | 0) < 0 | h & (e | 0) != 0)) : 0) {
            if ((b | 0) == -1)
                b = Tb(a) | 0;
            if ((b | 0) < 1) {
                Vb(c, e, 0, g) | 0;
                n = 0;
                u = o;
                return n | 0;
            }
            do
                if (!h) {
                    if (!(a >>> 0 <= c >>> 0 & (a + (b << 1) | 0) >>> 0 > c >>> 0) ? !(c >>> 0 <= a >>> 0 & (c + (e << 1) | 0) >>> 0 > a >>> 0) : 0)
                        break;
                    f[g >> 2] = 1;
                    n = 0;
                    u = o;
                    return n | 0;
                }
            while (0);
            f[m >> 2] = 0;
            f[n >> 2] = 0;
            h = Eb(a, b) | 0;
            if ((h | 0) > (e | 0)) {
                f[g >> 2] = 15;
                n = h;
                u = o;
                return n | 0;
            }
            h = (b | 0) > (h | 0) ? b : h;
            if ((h | 0) >= 301) {
                i = Qb(h << 1) | 0;
                if (!i) {
                    f[g >> 2] = 7;
                    n = 0;
                    u = o;
                    return n | 0;
                }
            } else {
                i = l;
                h = 300;
            }
            Ub(i, a, b) | 0;
            if ((h | 0) > (b | 0))
                Gc(i + (b << 1) | 0, 0, h - b << 1 | 0) | 0;
            Fb(i, b, m, n);
            Gb(i, b, f[m >> 2] | 0, f[n >> 2] | 0);
            d[k >> 1] = 8203;
            d[k + 2 >> 1] = 0;
            f[k + 4 >> 2] = 3;
            f[k + 8 >> 2] = 2;
            f[k + 12 >> 2] = 262144;
            f[k + 16 >> 2] = 393216;
            f[k + 20 >> 2] = 0;
            f[j >> 2] = f[k >> 2];
            f[j + 4 >> 2] = f[k + 4 >> 2];
            f[j + 8 >> 2] = f[k + 8 >> 2];
            f[j + 12 >> 2] = f[k + 12 >> 2];
            f[j + 16 >> 2] = f[k + 16 >> 2];
            f[j + 20 >> 2] = f[k + 20 >> 2];
            b = Hb(i, b, g, j) | 0;
            Fb(i, b, m, n);
            Gb(i, b, f[m >> 2] | 0, f[n >> 2] | 0);
            Ub(c, i, Pb(b, e) | 0) | 0;
            if ((i | 0) != (l | 0))
                Sb(i);
            if ((b | 0) > (e | 0)) {
                f[g >> 2] = 15;
                n = b;
                u = o;
                return n | 0;
            } else {
                n = Vb(c, e, b, g) | 0;
                u = o;
                return n | 0;
            }
        }
        f[g >> 2] = 1;
        n = 0;
        u = o;
        return n | 0;
    }
    function Cb(a) {
        a = a | 0;
        return (a | 0) > 0 | 0;
    }
    function Db(a) {
        a = a | 0;
        var b = 0;
        b = a & 65535;
        if ((a + -1570 & 65535) < 178) {
            b = d[1210 + (b + -1570 << 1) >> 1] | 0;
            return b | 0;
        }
        if (a << 16 >> 16 == 8205) {
            b = 3;
            return b | 0;
        }
        if ((a + -8301 & 65535) < 3) {
            b = 4;
            return b | 0;
        }
        if ((a + 1200 & 65535) < 275) {
            b = h[67301 + (b + -64336) >> 0] | 0;
            return b | 0;
        }
        if ((a + 400 & 65535) >= 141) {
            b = 0;
            return b | 0;
        }
        b = h[67576 + (b + -65136) >> 0] | 0;
        return b | 0;
    }
    function Eb(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, f = 0, g = 0, h = 0;
        g = b + -1 | 0;
        f = 0;
        c = b;
        while (1) {
            if ((f | 0) >= (b | 0))
                break;
            e = d[a + (f << 1) >> 1] | 0;
            if ((f | 0) < (g | 0) & e << 16 >> 16 == 1604 ? (Nb(d[a + (f + 1 << 1) >> 1] | 0) | 0) != 0 : 0)
                h = 6;
            else if (Ob(e) | 0)
                h = 6;
            if ((h | 0) == 6) {
                h = 0;
                c = c + -1 | 0;
            }
            f = f + 1 | 0;
        }
        return c | 0;
    }
    function Fb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, h = 0;
        h = 0;
        while (1) {
            g = (h | 0) < (b | 0);
            if (g & (d[a + (h << 1) >> 1] | 0) == 32)
                h = h + 1 | 0;
            else
                break;
        }
        if (g)
            g = 0;
        else {
            a = 0;
            f[c >> 2] = h;
            f[e >> 2] = a;
            return;
        }
        while (1) {
            b = b + -1 | 0;
            if ((d[a + (b << 1) >> 1] | 0) != 32)
                break;
            else
                g = g + 1 | 0;
        }
        f[c >> 2] = h;
        f[e >> 2] = g;
        return;
    }
    function Gb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var f = 0, g = 0;
        b = b - e | 0;
        while (1) {
            b = b + -1 | 0;
            if ((c | 0) >= (b | 0))
                break;
            g = a + (c << 1) | 0;
            f = d[g >> 1] | 0;
            e = a + (b << 1) | 0;
            d[g >> 1] = d[e >> 1] | 0;
            d[e >> 1] = f;
            c = c + 1 | 0;
        }
        return;
    }
    function Hb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0;
        B = u;
        u = u + 32 | 0;
        z = B;
        j = 0;
        while (1) {
            if ((j | 0) >= (b | 0))
                break;
            k = a + (j << 1) | 0;
            g = d[k >> 1] | 0;
            i = g & 65535;
            if ((g + 1200 & 65535) < 176) {
                g = d[576 + (i + -64336 << 1) >> 1] | 0;
                if (g << 16 >> 16)
                    A = 7;
            } else if ((g + 400 & 65535) < 141) {
                g = d[928 + (i + -65136 << 1) >> 1] | 0;
                A = 7;
            } else
                A = 7;
            if ((A | 0) == 7) {
                A = 0;
                d[k >> 1] = g;
            }
            j = j + 1 | 0;
        }
        w = b + -1 | 0;
        y = w;
        m = 0;
        p = Db(d[a + (w << 1) >> 1] | 0) | 0;
        j = 0;
        k = 0;
        q = 0;
        r = 0;
        o = 0;
        i = -2;
        while (1) {
            if ((w | 0) == -1)
                break;
            n = p & 65535;
            if ((n & 65280 | 0) == 0 ? ((Db(d[a + (w << 1) >> 1] | 0) | 0) & 4) == 0 : 0) {
                v = m;
                n = i;
                g = w;
            } else
                A = 13;
            do
                if ((A | 0) == 13) {
                    A = 0;
                    g = w + -1 | 0;
                    v = m;
                    x = i;
                    a:
                        while (1) {
                            l = (x | 0) < 0;
                            i = g;
                            while (1) {
                                if (!l)
                                    break a;
                                if ((i | 0) == -1) {
                                    g = -1;
                                    v = 0;
                                    x = 3000;
                                    continue a;
                                }
                                m = Db(d[a + (i << 1) >> 1] | 0) | 0;
                                t = (m & 4) == 0;
                                g = i + ((t ^ 1) << 31 >> 31) | 0;
                                if (t) {
                                    v = m;
                                    x = i;
                                    continue a;
                                } else
                                    i = g;
                            }
                        }
                    if ((j & 16) == 0 | (n & 32 | 0) == 0) {
                        s = p;
                        t = o;
                        g = w;
                    } else {
                        g = a + (w << 1) | 0;
                        i = Jb(d[g >> 1] | 0) | 0;
                        if (!(i << 16 >> 16))
                            g = w;
                        else {
                            d[g >> 1] = -1;
                            d[a + (y << 1) >> 1] = i;
                            g = y;
                        }
                        s = Db(i) | 0;
                        j = k;
                        t = 1;
                    }
                    if ((g | 0) > 0) {
                        if ((d[a + (g + -1 << 1) >> 1] | 0) == 32) {
                            p = d[a + (g << 1) >> 1] | 0;
                            w = (Kb(p) | 0) == 0;
                            q = p << 16 >> 16 == 1574 & w ? 1 : q;
                            r = w ? r : 1;
                        }
                    } else if (!g) {
                        p = d[a >> 1] | 0;
                        w = (Kb(p) | 0) == 0;
                        q = p << 16 >> 16 == 1574 & w ? 1 : q;
                        r = w ? r : 1;
                    }
                    m = v & 65535;
                    n = j & 65535;
                    p = s & 65535;
                    w = p & 3;
                    o = h[67229 + ((m & 3) << 4) + ((n & 3) << 2) + w >> 0] | 0;
                    if ((w | 0) != 1) {
                        l = a + (g << 1) | 0;
                        i = d[l >> 1] | 0;
                        if (Lb(i) | 0)
                            if ((n & 2 | 0) == 0 | (m & 1 | 0) == 0 | (i & -2) << 16 >> 16 == 1612)
                                o = 0;
                            else
                                o = n >>> 4 & 1 ^ 1 | m >>> 5 & 1 ^ 1;
                    } else {
                        i = a + (g << 1) | 0;
                        o = o & 1;
                        l = i;
                        i = d[i >> 1] | 0;
                    }
                    if (((i ^ 1536) & 65535) < 256) {
                        if (Lb(i) | 0) {
                            d[l >> 1] = o + 65136 + (h[67293 + ((i & 65535) + -1611) >> 0] | 0);
                            p = s;
                            o = t;
                            n = x;
                            break;
                        }
                        i = p >>> 8;
                        if (p & 8 | 0) {
                            d[l >> 1] = i + 64336 + o;
                            p = s;
                            o = t;
                            n = x;
                            break;
                        }
                        if ((i | 0) != 0 & (p & 4 | 0) == 0) {
                            d[l >> 1] = i + 65136 + o;
                            p = s;
                            o = t;
                            n = x;
                        } else {
                            p = s;
                            o = t;
                            n = x;
                        }
                    } else {
                        p = s;
                        o = t;
                        n = x;
                    }
                }
            while (0);
            i = (p & 4) == 0;
            k = i ? j : k;
            j = i ? p : j;
            i = i ? g : y;
            l = g + -1 | 0;
            if ((l | 0) == (n | 0)) {
                y = i;
                m = v;
                p = v;
                i = -2;
                w = l;
                continue;
            }
            if (!g) {
                y = i;
                m = v;
                i = n;
                w = l;
                continue;
            }
            y = i;
            m = v;
            p = Db(d[a + (l << 1) >> 1] | 0) | 0;
            i = n;
            w = l;
        }
        if (o) {
            f[z >> 2] = f[e >> 2];
            f[z + 4 >> 2] = f[e + 4 >> 2];
            f[z + 8 >> 2] = f[e + 8 >> 2];
            f[z + 12 >> 2] = f[e + 12 >> 2];
            f[z + 16 >> 2] = f[e + 16 >> 2];
            f[z + 20 >> 2] = f[e + 20 >> 2];
            b = Mb(a, b, b, c, z) | 0;
        }
        if (!(q | r)) {
            A = b;
            u = B;
            return A | 0;
        }
        A = Ib(b) | 0;
        u = B;
        return A | 0;
    }
    function Ib(a) {
        a = a | 0;
        return a | 0;
    }
    function Jb(a) {
        a = a | 0;
        switch (a << 16 >> 16) {
        case 1570: {
                a = 1628;
                break;
            }
        case 1571: {
                a = 1629;
                break;
            }
        case 1573: {
                a = 1630;
                break;
            }
        case 1575: {
                a = 1631;
                break;
            }
        default:
            a = 0;
        }
        return a | 0;
    }
    function Kb(a) {
        a = a | 0;
        return (a + -1587 & 65535) < 4 | 0;
    }
    function Lb(a) {
        a = a | 0;
        return (a + -1611 & 65535) < 8 | 0;
    }
    function Mb(a, b, c, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        var h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0;
        m = (b << 1) + 2 | 0;
        n = Qb(m) | 0;
        if (!n) {
            f[e >> 2] = 7;
            n = 0;
            return n | 0;
        }
        Gc(n | 0, 0, m | 0) | 0;
        c = 0;
        h = 0;
        e = 0;
        while (1) {
            if ((e | 0) >= (b | 0))
                break;
            i = d[a + (e << 1) >> 1] | 0;
            if (i << 16 >> 16 == -1) {
                c = c + 1 | 0;
                h = h + -1 | 0;
            } else
                d[n + (h << 1) >> 1] = i;
            h = h + 1 | 0;
            e = e + 1 | 0;
        }
        while (1) {
            if ((c | 0) <= -1)
                break;
            d[n + (e << 1) >> 1] = 0;
            e = e + -1 | 0;
            c = c + -1 | 0;
        }
        Ub(a, n, b) | 0;
        if (f[g + 4 >> 2] | 0) {
            c = Tb(a) | 0;
            if (!(f[g + 12 >> 2] | 0)) {
                j = 1;
                k = 0;
                l = 14;
            }
        } else {
            j = (f[g + 12 >> 2] | 0) == 0;
            k = 1;
            l = 14;
        }
        if ((l | 0) == 14) {
            Gc(n | 0, 0, m | 0) | 0;
            c = b;
            e = 0;
            i = b;
            while (1) {
                if ((i | 0) <= -1) {
                    c = 0;
                    break;
                }
                h = d[a + (i << 1) >> 1] | 0;
                if (k & h << 16 >> 16 == -1 | j & h << 16 >> 16 == -2) {
                    c = c + 1 | 0;
                    e = e + 1 | 0;
                } else
                    d[n + (c << 1) >> 1] = h;
                c = c + -1 | 0;
                i = i + -1 | 0;
            }
            while (1) {
                if ((c | 0) >= (e | 0))
                    break;
                d[n + (c << 1) >> 1] = 32;
                c = c + 1 | 0;
            }
            Ub(a, n, b) | 0;
            c = b;
        }
        k = (f[g + 8 >> 2] | 0) == 0;
        g = (f[g + 16 >> 2] | 0) == 0;
        j = g | k ^ 1;
        if (k | g) {
            Gc(n | 0, 0, m | 0) | 0;
            h = 0;
            c = 0;
            e = 0;
            while (1) {
                if ((e | 0) >= (b | 0))
                    break;
                i = d[a + (e << 1) >> 1] | 0;
                if (k & i << 16 >> 16 == -1 | j & i << 16 >> 16 == -2) {
                    h = h + -1 | 0;
                    c = c + 1 | 0;
                } else
                    d[n + (h << 1) >> 1] = i;
                h = h + 1 | 0;
                e = e + 1 | 0;
            }
            while (1) {
                if ((c | 0) <= -1)
                    break;
                d[n + (e << 1) >> 1] = 32;
                e = e + -1 | 0;
                c = c + -1 | 0;
            }
            Ub(a, n, b) | 0;
            c = b;
        }
        Sb(n);
        n = c;
        return n | 0;
    }
    function Nb(a) {
        a = a | 0;
        switch (a << 16 >> 16) {
        case 1573:
        case 1571:
        case 1570: {
                a = 1;
                break;
            }
        default:
            a = a << 16 >> 16 == 1575 & 1;
        }
        return a | 0;
    }
    function Ob(a) {
        a = a | 0;
        return (a & -16) << 16 >> 16 == -400 | 0;
    }
    function Pb(a, b) {
        a = a | 0;
        b = b | 0;
        return ((a | 0) > (b | 0) ? b : a) | 0;
    }
    function Qb(a) {
        a = a | 0;
        if (!a)
            a = 68640;
        else
            a = dc(a) | 0;
        return a | 0;
    }
    function Rb(a, b) {
        a = a | 0;
        b = b | 0;
        do
            if ((a | 0) != 68640)
                if (!b) {
                    ec(a);
                    a = 68640;
                    break;
                } else {
                    a = fc(a, b) | 0;
                    break;
                }
            else
                a = Qb(b) | 0;
        while (0);
        return a | 0;
    }
    function Sb(a) {
        a = a | 0;
        if ((a | 0) != 68640)
            ec(a);
        return;
    }
    function Tb(a) {
        a = a | 0;
        var b = 0;
        b = a;
        while (1)
            if (!(d[b >> 1] | 0))
                break;
            else
                b = b + 2 | 0;
        return b - a >> 1 | 0;
    }
    function Ub(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        if ((c | 0) <= 0)
            return a | 0;
        Fc(a | 0, b | 0, c << 1 | 0) | 0;
        return a | 0;
    }
    function Vb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        if (!e)
            return c | 0;
        if ((c | 0) < 0 | (Wb(f[e >> 2] | 0) | 0) << 24 >> 24 == 0)
            return c | 0;
        if ((c | 0) >= (b | 0)) {
            f[e >> 2] = (c | 0) == (b | 0) ? -124 : 15;
            return c | 0;
        }
        d[a + (c << 1) >> 1] = 0;
        if ((f[e >> 2] | 0) != -124)
            return c | 0;
        f[e >> 2] = 0;
        return c | 0;
    }
    function Wb(a) {
        a = a | 0;
        return (a | 0) < 1 | 0;
    }
    function Xb(a) {
        a = a | 0;
        var b = 0, c = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    c = 7;
                    break;
                }
                if (a >>> 0 > 1114111)
                    b = 4536;
                else {
                    b = (a >>> 5 & 63) + (j[1566 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    c = 7;
                }
            } else {
                b = a >>> 5;
                c = 7;
            }
        while (0);
        if ((c | 0) == 7)
            b = ((j[1566 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        return d[1566 + (b << 1) >> 1] & 31 | 0;
    }
    function Yb(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        c = f[a + 20 >> 2] | 0;
        do
            if (b >>> 0 >= 55296) {
                if (b >>> 0 < 65536) {
                    a = ((j[c + (((b | 0) < 56320 ? 320 : 0) + (b >>> 5) << 1) >> 1] | 0) << 2) + (b & 31) | 0;
                    break;
                }
                if (b >>> 0 > 1114111) {
                    a = (f[a + 32 >> 2] | 0) + 128 | 0;
                    break;
                }
                if ((f[a + 52 >> 2] | 0) > (b | 0)) {
                    a = ((j[c + ((b >>> 5 & 63) + (j[c + ((b >>> 11) + 2080 << 1) >> 1] | 0) << 1) >> 1] | 0) << 2) + (b & 31) | 0;
                    break;
                } else {
                    a = f[a + 56 >> 2] | 0;
                    break;
                }
            } else
                a = ((j[c + (b >>> 5 << 1) >> 1] | 0) << 2) + (b & 31) | 0;
        while (0);
        return d[c + (a << 1) >> 1] & 31 | 0;
    }
    function Zb(a) {
        a = a | 0;
        var b = 0, c = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    c = 7;
                    break;
                }
                if (a >>> 0 > 1114111)
                    b = 3624;
                else {
                    b = (a >>> 5 & 63) + (j[43126 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    c = 7;
                }
            } else {
                b = a >>> 5;
                c = 7;
            }
        while (0);
        if ((c | 0) == 7)
            b = ((j[43126 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        return _b(a, d[43126 + (b << 1) >> 1] | 0) | 0;
    }
    function _b(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        b = b << 16 >> 16 >> 13;
        a:
            do
                if ((b | 0) == -4) {
                    b = 0;
                    while (1) {
                        if ((b | 0) >= 26)
                            break a;
                        c = f[392 + (b << 2) >> 2] | 0;
                        d = c & 2097151;
                        if ((d | 0) == (a | 0))
                            break;
                        if ((d | 0) > (a | 0))
                            break a;
                        else
                            b = b + 1 | 0;
                    }
                    a = f[392 + (c >>> 21 << 2) >> 2] & 2097151;
                } else
                    a = b + a | 0;
            while (0);
        return a | 0;
    }
    function $b(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        c = f[a + 20 >> 2] | 0;
        do
            if (b >>> 0 >= 55296) {
                if (b >>> 0 < 65536) {
                    a = ((j[c + (((b | 0) < 56320 ? 320 : 0) + (b >>> 5) << 1) >> 1] | 0) << 2) + (b & 31) | 0;
                    break;
                }
                if (b >>> 0 > 1114111) {
                    a = (f[a + 32 >> 2] | 0) + 128 | 0;
                    break;
                }
                if ((f[a + 52 >> 2] | 0) > (b | 0)) {
                    a = ((j[c + ((b >>> 5 & 63) + (j[c + ((b >>> 11) + 2080 << 1) >> 1] | 0) << 1) >> 1] | 0) << 2) + (b & 31) | 0;
                    break;
                } else {
                    a = f[a + 56 >> 2] | 0;
                    break;
                }
            } else
                a = ((j[c + (b >>> 5 << 1) >> 1] | 0) << 2) + (b & 31) | 0;
        while (0);
        return (d[c + (a << 1) >> 1] & 768) >>> 8 | 0;
    }
    function ac(a) {
        a = a | 0;
        var b = 0, c = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    c = 7;
                    break;
                }
                if (a >>> 0 > 1114111)
                    b = 3624;
                else {
                    b = (a >>> 5 & 63) + (j[43126 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    c = 7;
                }
            } else {
                b = a >>> 5;
                c = 7;
            }
        while (0);
        if ((c | 0) == 7)
            b = ((j[43126 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        b = d[43126 + (b << 1) >> 1] | 0;
        if (b & 768)
            a = _b(a, b) | 0;
        return a | 0;
    }
    function bc(a) {
        a = a | 0;
        return Zb(a) | 0;
    }
    function cc(a) {
        a = a | 0;
        return ac(a) | 0;
    }
    function dc(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        t = u;
        u = u + 16 | 0;
        n = t;
        do
            if (a >>> 0 < 245) {
                k = a >>> 0 < 11 ? 16 : a + 11 & -8;
                a = k >>> 3;
                m = f[17166] | 0;
                c = m >>> a;
                if (c & 3 | 0) {
                    b = (c & 1 ^ 1) + a | 0;
                    a = 68704 + (b << 1 << 2) | 0;
                    c = a + 8 | 0;
                    d = f[c >> 2] | 0;
                    e = d + 8 | 0;
                    g = f[e >> 2] | 0;
                    if ((g | 0) == (a | 0))
                        f[17166] = m & ~(1 << b);
                    else {
                        f[g + 12 >> 2] = a;
                        f[c >> 2] = g;
                    }
                    s = b << 3;
                    f[d + 4 >> 2] = s | 3;
                    s = d + s + 4 | 0;
                    f[s >> 2] = f[s >> 2] | 1;
                    s = e;
                    u = t;
                    return s | 0;
                }
                l = f[17168] | 0;
                if (k >>> 0 > l >>> 0) {
                    if (c | 0) {
                        b = 2 << a;
                        b = c << a & (b | 0 - b);
                        b = (b & 0 - b) + -1 | 0;
                        i = b >>> 12 & 16;
                        b = b >>> i;
                        c = b >>> 5 & 8;
                        b = b >>> c;
                        g = b >>> 2 & 4;
                        b = b >>> g;
                        a = b >>> 1 & 2;
                        b = b >>> a;
                        d = b >>> 1 & 1;
                        d = (c | i | g | a | d) + (b >>> d) | 0;
                        b = 68704 + (d << 1 << 2) | 0;
                        a = b + 8 | 0;
                        g = f[a >> 2] | 0;
                        i = g + 8 | 0;
                        c = f[i >> 2] | 0;
                        if ((c | 0) == (b | 0)) {
                            a = m & ~(1 << d);
                            f[17166] = a;
                        } else {
                            f[c + 12 >> 2] = b;
                            f[a >> 2] = c;
                            a = m;
                        }
                        s = d << 3;
                        h = s - k | 0;
                        f[g + 4 >> 2] = k | 3;
                        e = g + k | 0;
                        f[e + 4 >> 2] = h | 1;
                        f[g + s >> 2] = h;
                        if (l | 0) {
                            d = f[17171] | 0;
                            b = l >>> 3;
                            c = 68704 + (b << 1 << 2) | 0;
                            b = 1 << b;
                            if (!(a & b)) {
                                f[17166] = a | b;
                                b = c;
                                a = c + 8 | 0;
                            } else {
                                a = c + 8 | 0;
                                b = f[a >> 2] | 0;
                            }
                            f[a >> 2] = d;
                            f[b + 12 >> 2] = d;
                            f[d + 8 >> 2] = b;
                            f[d + 12 >> 2] = c;
                        }
                        f[17168] = h;
                        f[17171] = e;
                        s = i;
                        u = t;
                        return s | 0;
                    }
                    i = f[17167] | 0;
                    if (i) {
                        c = (i & 0 - i) + -1 | 0;
                        h = c >>> 12 & 16;
                        c = c >>> h;
                        g = c >>> 5 & 8;
                        c = c >>> g;
                        j = c >>> 2 & 4;
                        c = c >>> j;
                        d = c >>> 1 & 2;
                        c = c >>> d;
                        a = c >>> 1 & 1;
                        a = f[68968 + ((g | h | j | d | a) + (c >>> a) << 2) >> 2] | 0;
                        c = (f[a + 4 >> 2] & -8) - k | 0;
                        d = f[a + 16 + (((f[a + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
                        if (!d) {
                            j = a;
                            g = c;
                        } else {
                            do {
                                h = (f[d + 4 >> 2] & -8) - k | 0;
                                j = h >>> 0 < c >>> 0;
                                c = j ? h : c;
                                a = j ? d : a;
                                d = f[d + 16 + (((f[d + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
                            } while ((d | 0) != 0);
                            j = a;
                            g = c;
                        }
                        h = j + k | 0;
                        if (h >>> 0 > j >>> 0) {
                            e = f[j + 24 >> 2] | 0;
                            b = f[j + 12 >> 2] | 0;
                            do
                                if ((b | 0) == (j | 0)) {
                                    a = j + 20 | 0;
                                    b = f[a >> 2] | 0;
                                    if (!b) {
                                        a = j + 16 | 0;
                                        b = f[a >> 2] | 0;
                                        if (!b) {
                                            c = 0;
                                            break;
                                        }
                                    }
                                    while (1) {
                                        c = b + 20 | 0;
                                        d = f[c >> 2] | 0;
                                        if (d | 0) {
                                            b = d;
                                            a = c;
                                            continue;
                                        }
                                        c = b + 16 | 0;
                                        d = f[c >> 2] | 0;
                                        if (!d)
                                            break;
                                        else {
                                            b = d;
                                            a = c;
                                        }
                                    }
                                    f[a >> 2] = 0;
                                    c = b;
                                } else {
                                    c = f[j + 8 >> 2] | 0;
                                    f[c + 12 >> 2] = b;
                                    f[b + 8 >> 2] = c;
                                    c = b;
                                }
                            while (0);
                            do
                                if (e | 0) {
                                    b = f[j + 28 >> 2] | 0;
                                    a = 68968 + (b << 2) | 0;
                                    if ((j | 0) == (f[a >> 2] | 0)) {
                                        f[a >> 2] = c;
                                        if (!c) {
                                            f[17167] = i & ~(1 << b);
                                            break;
                                        }
                                    } else {
                                        f[e + 16 + (((f[e + 16 >> 2] | 0) != (j | 0) & 1) << 2) >> 2] = c;
                                        if (!c)
                                            break;
                                    }
                                    f[c + 24 >> 2] = e;
                                    b = f[j + 16 >> 2] | 0;
                                    if (b | 0) {
                                        f[c + 16 >> 2] = b;
                                        f[b + 24 >> 2] = c;
                                    }
                                    b = f[j + 20 >> 2] | 0;
                                    if (b | 0) {
                                        f[c + 20 >> 2] = b;
                                        f[b + 24 >> 2] = c;
                                    }
                                }
                            while (0);
                            if (g >>> 0 < 16) {
                                s = g + k | 0;
                                f[j + 4 >> 2] = s | 3;
                                s = j + s + 4 | 0;
                                f[s >> 2] = f[s >> 2] | 1;
                            } else {
                                f[j + 4 >> 2] = k | 3;
                                f[h + 4 >> 2] = g | 1;
                                f[h + g >> 2] = g;
                                if (l | 0) {
                                    d = f[17171] | 0;
                                    b = l >>> 3;
                                    c = 68704 + (b << 1 << 2) | 0;
                                    b = 1 << b;
                                    if (!(b & m)) {
                                        f[17166] = b | m;
                                        b = c;
                                        a = c + 8 | 0;
                                    } else {
                                        a = c + 8 | 0;
                                        b = f[a >> 2] | 0;
                                    }
                                    f[a >> 2] = d;
                                    f[b + 12 >> 2] = d;
                                    f[d + 8 >> 2] = b;
                                    f[d + 12 >> 2] = c;
                                }
                                f[17168] = g;
                                f[17171] = h;
                            }
                            s = j + 8 | 0;
                            u = t;
                            return s | 0;
                        } else
                            m = k;
                    } else
                        m = k;
                } else
                    m = k;
            } else if (a >>> 0 <= 4294967231) {
                a = a + 11 | 0;
                k = a & -8;
                j = f[17167] | 0;
                if (j) {
                    d = 0 - k | 0;
                    a = a >>> 8;
                    if (a)
                        if (k >>> 0 > 16777215)
                            i = 31;
                        else {
                            m = (a + 1048320 | 0) >>> 16 & 8;
                            r = a << m;
                            l = (r + 520192 | 0) >>> 16 & 4;
                            r = r << l;
                            i = (r + 245760 | 0) >>> 16 & 2;
                            i = 14 - (l | m | i) + (r << i >>> 15) | 0;
                            i = k >>> (i + 7 | 0) & 1 | i << 1;
                        }
                    else
                        i = 0;
                    c = f[68968 + (i << 2) >> 2] | 0;
                    a:
                        do
                            if (!c) {
                                c = 0;
                                a = 0;
                                r = 57;
                            } else {
                                a = 0;
                                h = c;
                                g = k << ((i | 0) == 31 ? 0 : 25 - (i >>> 1) | 0);
                                c = 0;
                                while (1) {
                                    e = (f[h + 4 >> 2] & -8) - k | 0;
                                    if (e >>> 0 < d >>> 0)
                                        if (!e) {
                                            d = 0;
                                            c = h;
                                            a = h;
                                            r = 61;
                                            break a;
                                        } else {
                                            a = h;
                                            d = e;
                                        }
                                    e = f[h + 20 >> 2] | 0;
                                    h = f[h + 16 + (g >>> 31 << 2) >> 2] | 0;
                                    c = (e | 0) == 0 | (e | 0) == (h | 0) ? c : e;
                                    e = (h | 0) == 0;
                                    if (e) {
                                        r = 57;
                                        break;
                                    } else
                                        g = g << ((e ^ 1) & 1);
                                }
                            }
                        while (0);
                    if ((r | 0) == 57) {
                        if ((c | 0) == 0 & (a | 0) == 0) {
                            a = 2 << i;
                            a = (a | 0 - a) & j;
                            if (!a) {
                                m = k;
                                break;
                            }
                            m = (a & 0 - a) + -1 | 0;
                            h = m >>> 12 & 16;
                            m = m >>> h;
                            g = m >>> 5 & 8;
                            m = m >>> g;
                            i = m >>> 2 & 4;
                            m = m >>> i;
                            l = m >>> 1 & 2;
                            m = m >>> l;
                            c = m >>> 1 & 1;
                            a = 0;
                            c = f[68968 + ((g | h | i | l | c) + (m >>> c) << 2) >> 2] | 0;
                        }
                        if (!c) {
                            i = a;
                            h = d;
                        } else
                            r = 61;
                    }
                    if ((r | 0) == 61)
                        while (1) {
                            r = 0;
                            l = (f[c + 4 >> 2] & -8) - k | 0;
                            m = l >>> 0 < d >>> 0;
                            d = m ? l : d;
                            a = m ? c : a;
                            c = f[c + 16 + (((f[c + 16 >> 2] | 0) == 0 & 1) << 2) >> 2] | 0;
                            if (!c) {
                                i = a;
                                h = d;
                                break;
                            } else
                                r = 61;
                        }
                    if ((i | 0) != 0 ? h >>> 0 < ((f[17168] | 0) - k | 0) >>> 0 : 0) {
                        g = i + k | 0;
                        if (g >>> 0 <= i >>> 0) {
                            s = 0;
                            u = t;
                            return s | 0;
                        }
                        e = f[i + 24 >> 2] | 0;
                        b = f[i + 12 >> 2] | 0;
                        do
                            if ((b | 0) == (i | 0)) {
                                a = i + 20 | 0;
                                b = f[a >> 2] | 0;
                                if (!b) {
                                    a = i + 16 | 0;
                                    b = f[a >> 2] | 0;
                                    if (!b) {
                                        b = 0;
                                        break;
                                    }
                                }
                                while (1) {
                                    c = b + 20 | 0;
                                    d = f[c >> 2] | 0;
                                    if (d | 0) {
                                        b = d;
                                        a = c;
                                        continue;
                                    }
                                    c = b + 16 | 0;
                                    d = f[c >> 2] | 0;
                                    if (!d)
                                        break;
                                    else {
                                        b = d;
                                        a = c;
                                    }
                                }
                                f[a >> 2] = 0;
                            } else {
                                s = f[i + 8 >> 2] | 0;
                                f[s + 12 >> 2] = b;
                                f[b + 8 >> 2] = s;
                            }
                        while (0);
                        do
                            if (e) {
                                a = f[i + 28 >> 2] | 0;
                                c = 68968 + (a << 2) | 0;
                                if ((i | 0) == (f[c >> 2] | 0)) {
                                    f[c >> 2] = b;
                                    if (!b) {
                                        d = j & ~(1 << a);
                                        f[17167] = d;
                                        break;
                                    }
                                } else {
                                    f[e + 16 + (((f[e + 16 >> 2] | 0) != (i | 0) & 1) << 2) >> 2] = b;
                                    if (!b) {
                                        d = j;
                                        break;
                                    }
                                }
                                f[b + 24 >> 2] = e;
                                a = f[i + 16 >> 2] | 0;
                                if (a | 0) {
                                    f[b + 16 >> 2] = a;
                                    f[a + 24 >> 2] = b;
                                }
                                a = f[i + 20 >> 2] | 0;
                                if (a) {
                                    f[b + 20 >> 2] = a;
                                    f[a + 24 >> 2] = b;
                                    d = j;
                                } else
                                    d = j;
                            } else
                                d = j;
                        while (0);
                        do
                            if (h >>> 0 >= 16) {
                                f[i + 4 >> 2] = k | 3;
                                f[g + 4 >> 2] = h | 1;
                                f[g + h >> 2] = h;
                                b = h >>> 3;
                                if (h >>> 0 < 256) {
                                    c = 68704 + (b << 1 << 2) | 0;
                                    a = f[17166] | 0;
                                    b = 1 << b;
                                    if (!(a & b)) {
                                        f[17166] = a | b;
                                        b = c;
                                        a = c + 8 | 0;
                                    } else {
                                        a = c + 8 | 0;
                                        b = f[a >> 2] | 0;
                                    }
                                    f[a >> 2] = g;
                                    f[b + 12 >> 2] = g;
                                    f[g + 8 >> 2] = b;
                                    f[g + 12 >> 2] = c;
                                    break;
                                }
                                b = h >>> 8;
                                if (b)
                                    if (h >>> 0 > 16777215)
                                        b = 31;
                                    else {
                                        r = (b + 1048320 | 0) >>> 16 & 8;
                                        s = b << r;
                                        q = (s + 520192 | 0) >>> 16 & 4;
                                        s = s << q;
                                        b = (s + 245760 | 0) >>> 16 & 2;
                                        b = 14 - (q | r | b) + (s << b >>> 15) | 0;
                                        b = h >>> (b + 7 | 0) & 1 | b << 1;
                                    }
                                else
                                    b = 0;
                                c = 68968 + (b << 2) | 0;
                                f[g + 28 >> 2] = b;
                                a = g + 16 | 0;
                                f[a + 4 >> 2] = 0;
                                f[a >> 2] = 0;
                                a = 1 << b;
                                if (!(a & d)) {
                                    f[17167] = a | d;
                                    f[c >> 2] = g;
                                    f[g + 24 >> 2] = c;
                                    f[g + 12 >> 2] = g;
                                    f[g + 8 >> 2] = g;
                                    break;
                                }
                                a = h << ((b | 0) == 31 ? 0 : 25 - (b >>> 1) | 0);
                                c = f[c >> 2] | 0;
                                while (1) {
                                    if ((f[c + 4 >> 2] & -8 | 0) == (h | 0)) {
                                        r = 97;
                                        break;
                                    }
                                    d = c + 16 + (a >>> 31 << 2) | 0;
                                    b = f[d >> 2] | 0;
                                    if (!b) {
                                        r = 96;
                                        break;
                                    } else {
                                        a = a << 1;
                                        c = b;
                                    }
                                }
                                if ((r | 0) == 96) {
                                    f[d >> 2] = g;
                                    f[g + 24 >> 2] = c;
                                    f[g + 12 >> 2] = g;
                                    f[g + 8 >> 2] = g;
                                    break;
                                } else if ((r | 0) == 97) {
                                    r = c + 8 | 0;
                                    s = f[r >> 2] | 0;
                                    f[s + 12 >> 2] = g;
                                    f[r >> 2] = g;
                                    f[g + 8 >> 2] = s;
                                    f[g + 12 >> 2] = c;
                                    f[g + 24 >> 2] = 0;
                                    break;
                                }
                            } else {
                                s = h + k | 0;
                                f[i + 4 >> 2] = s | 3;
                                s = i + s + 4 | 0;
                                f[s >> 2] = f[s >> 2] | 1;
                            }
                        while (0);
                        s = i + 8 | 0;
                        u = t;
                        return s | 0;
                    } else
                        m = k;
                } else
                    m = k;
            } else
                m = -1;
        while (0);
        c = f[17168] | 0;
        if (c >>> 0 >= m >>> 0) {
            b = c - m | 0;
            a = f[17171] | 0;
            if (b >>> 0 > 15) {
                s = a + m | 0;
                f[17171] = s;
                f[17168] = b;
                f[s + 4 >> 2] = b | 1;
                f[a + c >> 2] = b;
                f[a + 4 >> 2] = m | 3;
            } else {
                f[17168] = 0;
                f[17171] = 0;
                f[a + 4 >> 2] = c | 3;
                s = a + c + 4 | 0;
                f[s >> 2] = f[s >> 2] | 1;
            }
            s = a + 8 | 0;
            u = t;
            return s | 0;
        }
        h = f[17169] | 0;
        if (h >>> 0 > m >>> 0) {
            q = h - m | 0;
            f[17169] = q;
            s = f[17172] | 0;
            r = s + m | 0;
            f[17172] = r;
            f[r + 4 >> 2] = q | 1;
            f[s + 4 >> 2] = m | 3;
            s = s + 8 | 0;
            u = t;
            return s | 0;
        }
        if (!(f[17284] | 0)) {
            f[17286] = 4096;
            f[17285] = 4096;
            f[17287] = -1;
            f[17288] = -1;
            f[17289] = 0;
            f[17277] = 0;
            f[17284] = n & -16 ^ 1431655768;
            a = 4096;
        } else
            a = f[17286] | 0;
        i = m + 48 | 0;
        j = m + 47 | 0;
        g = a + j | 0;
        e = 0 - a | 0;
        k = g & e;
        if (k >>> 0 <= m >>> 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        a = f[17276] | 0;
        if (a | 0 ? (l = f[17274] | 0, n = l + k | 0, n >>> 0 <= l >>> 0 | n >>> 0 > a >>> 0) : 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        b:
            do
                if (!(f[17277] & 4)) {
                    d = f[17172] | 0;
                    c:
                        do
                            if (d) {
                                a = 69112;
                                while (1) {
                                    c = f[a >> 2] | 0;
                                    if (c >>> 0 <= d >>> 0 ? (q = a + 4 | 0, (c + (f[q >> 2] | 0) | 0) >>> 0 > d >>> 0) : 0)
                                        break;
                                    a = f[a + 8 >> 2] | 0;
                                    if (!a) {
                                        r = 118;
                                        break c;
                                    }
                                }
                                b = g - h & e;
                                if (b >>> 0 < 2147483647) {
                                    d = Hc(b | 0) | 0;
                                    if ((d | 0) == ((f[a >> 2] | 0) + (f[q >> 2] | 0) | 0)) {
                                        if ((d | 0) != (-1 | 0))
                                            break b;
                                    } else
                                        r = 126;
                                } else
                                    b = 0;
                            } else
                                r = 118;
                        while (0);
                    do
                        if ((r | 0) == 118) {
                            a = Hc(0) | 0;
                            if ((a | 0) != (-1 | 0) ? (b = a, o = f[17285] | 0, p = o + -1 | 0, b = ((p & b | 0) == 0 ? 0 : (p + b & 0 - o) - b | 0) + k | 0, o = f[17274] | 0, p = b + o | 0, b >>> 0 > m >>> 0 & b >>> 0 < 2147483647) : 0) {
                                q = f[17276] | 0;
                                if (q | 0 ? p >>> 0 <= o >>> 0 | p >>> 0 > q >>> 0 : 0) {
                                    b = 0;
                                    break;
                                }
                                d = Hc(b | 0) | 0;
                                if ((d | 0) == (a | 0)) {
                                    d = a;
                                    break b;
                                } else
                                    r = 126;
                            } else
                                b = 0;
                        }
                    while (0);
                    do
                        if ((r | 0) == 126) {
                            c = 0 - b | 0;
                            if (!(i >>> 0 > b >>> 0 & (b >>> 0 < 2147483647 & (d | 0) != (-1 | 0))))
                                if ((d | 0) == (-1 | 0)) {
                                    b = 0;
                                    break;
                                } else
                                    break b;
                            a = f[17286] | 0;
                            a = j - b + a & 0 - a;
                            if (a >>> 0 >= 2147483647)
                                break b;
                            if ((Hc(a | 0) | 0) == (-1 | 0)) {
                                Hc(c | 0) | 0;
                                b = 0;
                                break;
                            } else {
                                b = a + b | 0;
                                break b;
                            }
                        }
                    while (0);
                    f[17277] = f[17277] | 4;
                    r = 133;
                } else {
                    b = 0;
                    r = 133;
                }
            while (0);
        if ((r | 0) == 133) {
            if (k >>> 0 >= 2147483647) {
                s = 0;
                u = t;
                return s | 0;
            }
            d = Hc(k | 0) | 0;
            q = Hc(0) | 0;
            a = q - d | 0;
            c = a >>> 0 > (m + 40 | 0) >>> 0;
            if ((d | 0) == (-1 | 0) | c ^ 1 | d >>> 0 < q >>> 0 & ((d | 0) != (-1 | 0) & (q | 0) != (-1 | 0)) ^ 1) {
                s = 0;
                u = t;
                return s | 0;
            } else
                b = c ? a : b;
        }
        a = (f[17274] | 0) + b | 0;
        f[17274] = a;
        if (a >>> 0 > (f[17275] | 0) >>> 0)
            f[17275] = a;
        j = f[17172] | 0;
        do
            if (j) {
                a = 69112;
                while (1) {
                    c = f[a >> 2] | 0;
                    e = a + 4 | 0;
                    g = f[e >> 2] | 0;
                    if ((d | 0) == (c + g | 0)) {
                        r = 143;
                        break;
                    }
                    h = f[a + 8 >> 2] | 0;
                    if (!h)
                        break;
                    else
                        a = h;
                }
                if (((r | 0) == 143 ? (f[a + 12 >> 2] & 8 | 0) == 0 : 0) ? d >>> 0 > j >>> 0 & c >>> 0 <= j >>> 0 : 0) {
                    f[e >> 2] = g + b;
                    s = (f[17169] | 0) + b | 0;
                    q = j + 8 | 0;
                    q = (q & 7 | 0) == 0 ? 0 : 0 - q & 7;
                    r = j + q | 0;
                    q = s - q | 0;
                    f[17172] = r;
                    f[17169] = q;
                    f[r + 4 >> 2] = q | 1;
                    f[j + s + 4 >> 2] = 40;
                    f[17173] = f[17288];
                    break;
                }
                if (d >>> 0 < (f[17170] | 0) >>> 0)
                    f[17170] = d;
                c = d + b | 0;
                a = 69112;
                while (1) {
                    if ((f[a >> 2] | 0) == (c | 0)) {
                        r = 151;
                        break;
                    }
                    a = f[a + 8 >> 2] | 0;
                    if (!a) {
                        c = 69112;
                        break;
                    }
                }
                if ((r | 0) == 151)
                    if (!(f[a + 12 >> 2] & 8)) {
                        f[a >> 2] = d;
                        l = a + 4 | 0;
                        f[l >> 2] = (f[l >> 2] | 0) + b;
                        l = d + 8 | 0;
                        l = d + ((l & 7 | 0) == 0 ? 0 : 0 - l & 7) | 0;
                        b = c + 8 | 0;
                        b = c + ((b & 7 | 0) == 0 ? 0 : 0 - b & 7) | 0;
                        k = l + m | 0;
                        i = b - l - m | 0;
                        f[l + 4 >> 2] = m | 3;
                        do
                            if ((j | 0) != (b | 0)) {
                                if ((f[17171] | 0) == (b | 0)) {
                                    s = (f[17168] | 0) + i | 0;
                                    f[17168] = s;
                                    f[17171] = k;
                                    f[k + 4 >> 2] = s | 1;
                                    f[k + s >> 2] = s;
                                    break;
                                }
                                a = f[b + 4 >> 2] | 0;
                                if ((a & 3 | 0) == 1) {
                                    h = a & -8;
                                    d = a >>> 3;
                                    d:
                                        do
                                            if (a >>> 0 < 256) {
                                                a = f[b + 8 >> 2] | 0;
                                                c = f[b + 12 >> 2] | 0;
                                                if ((c | 0) == (a | 0)) {
                                                    f[17166] = f[17166] & ~(1 << d);
                                                    break;
                                                } else {
                                                    f[a + 12 >> 2] = c;
                                                    f[c + 8 >> 2] = a;
                                                    break;
                                                }
                                            } else {
                                                g = f[b + 24 >> 2] | 0;
                                                a = f[b + 12 >> 2] | 0;
                                                do
                                                    if ((a | 0) == (b | 0)) {
                                                        d = b + 16 | 0;
                                                        c = d + 4 | 0;
                                                        a = f[c >> 2] | 0;
                                                        if (!a) {
                                                            a = f[d >> 2] | 0;
                                                            if (!a) {
                                                                a = 0;
                                                                break;
                                                            } else
                                                                c = d;
                                                        }
                                                        while (1) {
                                                            d = a + 20 | 0;
                                                            e = f[d >> 2] | 0;
                                                            if (e | 0) {
                                                                a = e;
                                                                c = d;
                                                                continue;
                                                            }
                                                            d = a + 16 | 0;
                                                            e = f[d >> 2] | 0;
                                                            if (!e)
                                                                break;
                                                            else {
                                                                a = e;
                                                                c = d;
                                                            }
                                                        }
                                                        f[c >> 2] = 0;
                                                    } else {
                                                        s = f[b + 8 >> 2] | 0;
                                                        f[s + 12 >> 2] = a;
                                                        f[a + 8 >> 2] = s;
                                                    }
                                                while (0);
                                                if (!g)
                                                    break;
                                                c = f[b + 28 >> 2] | 0;
                                                d = 68968 + (c << 2) | 0;
                                                do
                                                    if ((f[d >> 2] | 0) != (b | 0)) {
                                                        f[g + 16 + (((f[g + 16 >> 2] | 0) != (b | 0) & 1) << 2) >> 2] = a;
                                                        if (!a)
                                                            break d;
                                                    } else {
                                                        f[d >> 2] = a;
                                                        if (a | 0)
                                                            break;
                                                        f[17167] = f[17167] & ~(1 << c);
                                                        break d;
                                                    }
                                                while (0);
                                                f[a + 24 >> 2] = g;
                                                c = b + 16 | 0;
                                                d = f[c >> 2] | 0;
                                                if (d | 0) {
                                                    f[a + 16 >> 2] = d;
                                                    f[d + 24 >> 2] = a;
                                                }
                                                c = f[c + 4 >> 2] | 0;
                                                if (!c)
                                                    break;
                                                f[a + 20 >> 2] = c;
                                                f[c + 24 >> 2] = a;
                                            }
                                        while (0);
                                    b = b + h | 0;
                                    e = h + i | 0;
                                } else
                                    e = i;
                                b = b + 4 | 0;
                                f[b >> 2] = f[b >> 2] & -2;
                                f[k + 4 >> 2] = e | 1;
                                f[k + e >> 2] = e;
                                b = e >>> 3;
                                if (e >>> 0 < 256) {
                                    c = 68704 + (b << 1 << 2) | 0;
                                    a = f[17166] | 0;
                                    b = 1 << b;
                                    if (!(a & b)) {
                                        f[17166] = a | b;
                                        b = c;
                                        a = c + 8 | 0;
                                    } else {
                                        a = c + 8 | 0;
                                        b = f[a >> 2] | 0;
                                    }
                                    f[a >> 2] = k;
                                    f[b + 12 >> 2] = k;
                                    f[k + 8 >> 2] = b;
                                    f[k + 12 >> 2] = c;
                                    break;
                                }
                                b = e >>> 8;
                                do
                                    if (!b)
                                        b = 0;
                                    else {
                                        if (e >>> 0 > 16777215) {
                                            b = 31;
                                            break;
                                        }
                                        r = (b + 1048320 | 0) >>> 16 & 8;
                                        s = b << r;
                                        q = (s + 520192 | 0) >>> 16 & 4;
                                        s = s << q;
                                        b = (s + 245760 | 0) >>> 16 & 2;
                                        b = 14 - (q | r | b) + (s << b >>> 15) | 0;
                                        b = e >>> (b + 7 | 0) & 1 | b << 1;
                                    }
                                while (0);
                                d = 68968 + (b << 2) | 0;
                                f[k + 28 >> 2] = b;
                                a = k + 16 | 0;
                                f[a + 4 >> 2] = 0;
                                f[a >> 2] = 0;
                                a = f[17167] | 0;
                                c = 1 << b;
                                if (!(a & c)) {
                                    f[17167] = a | c;
                                    f[d >> 2] = k;
                                    f[k + 24 >> 2] = d;
                                    f[k + 12 >> 2] = k;
                                    f[k + 8 >> 2] = k;
                                    break;
                                }
                                a = e << ((b | 0) == 31 ? 0 : 25 - (b >>> 1) | 0);
                                c = f[d >> 2] | 0;
                                while (1) {
                                    if ((f[c + 4 >> 2] & -8 | 0) == (e | 0)) {
                                        r = 192;
                                        break;
                                    }
                                    d = c + 16 + (a >>> 31 << 2) | 0;
                                    b = f[d >> 2] | 0;
                                    if (!b) {
                                        r = 191;
                                        break;
                                    } else {
                                        a = a << 1;
                                        c = b;
                                    }
                                }
                                if ((r | 0) == 191) {
                                    f[d >> 2] = k;
                                    f[k + 24 >> 2] = c;
                                    f[k + 12 >> 2] = k;
                                    f[k + 8 >> 2] = k;
                                    break;
                                } else if ((r | 0) == 192) {
                                    r = c + 8 | 0;
                                    s = f[r >> 2] | 0;
                                    f[s + 12 >> 2] = k;
                                    f[r >> 2] = k;
                                    f[k + 8 >> 2] = s;
                                    f[k + 12 >> 2] = c;
                                    f[k + 24 >> 2] = 0;
                                    break;
                                }
                            } else {
                                s = (f[17169] | 0) + i | 0;
                                f[17169] = s;
                                f[17172] = k;
                                f[k + 4 >> 2] = s | 1;
                            }
                        while (0);
                        s = l + 8 | 0;
                        u = t;
                        return s | 0;
                    } else
                        c = 69112;
                while (1) {
                    a = f[c >> 2] | 0;
                    if (a >>> 0 <= j >>> 0 ? (s = a + (f[c + 4 >> 2] | 0) | 0, s >>> 0 > j >>> 0) : 0)
                        break;
                    c = f[c + 8 >> 2] | 0;
                }
                e = s + -47 | 0;
                a = e + 8 | 0;
                a = e + ((a & 7 | 0) == 0 ? 0 : 0 - a & 7) | 0;
                e = j + 16 | 0;
                a = a >>> 0 < e >>> 0 ? j : a;
                r = a + 8 | 0;
                c = b + -40 | 0;
                p = d + 8 | 0;
                p = (p & 7 | 0) == 0 ? 0 : 0 - p & 7;
                q = d + p | 0;
                p = c - p | 0;
                f[17172] = q;
                f[17169] = p;
                f[q + 4 >> 2] = p | 1;
                f[d + c + 4 >> 2] = 40;
                f[17173] = f[17288];
                c = a + 4 | 0;
                f[c >> 2] = 27;
                f[r >> 2] = f[17278];
                f[r + 4 >> 2] = f[17279];
                f[r + 8 >> 2] = f[17280];
                f[r + 12 >> 2] = f[17281];
                f[17278] = d;
                f[17279] = b;
                f[17281] = 0;
                f[17280] = r;
                b = a + 24 | 0;
                do {
                    r = b;
                    b = b + 4 | 0;
                    f[b >> 2] = 7;
                } while ((r + 8 | 0) >>> 0 < s >>> 0);
                if ((a | 0) != (j | 0)) {
                    g = a - j | 0;
                    f[c >> 2] = f[c >> 2] & -2;
                    f[j + 4 >> 2] = g | 1;
                    f[a >> 2] = g;
                    b = g >>> 3;
                    if (g >>> 0 < 256) {
                        c = 68704 + (b << 1 << 2) | 0;
                        a = f[17166] | 0;
                        b = 1 << b;
                        if (!(a & b)) {
                            f[17166] = a | b;
                            b = c;
                            a = c + 8 | 0;
                        } else {
                            a = c + 8 | 0;
                            b = f[a >> 2] | 0;
                        }
                        f[a >> 2] = j;
                        f[b + 12 >> 2] = j;
                        f[j + 8 >> 2] = b;
                        f[j + 12 >> 2] = c;
                        break;
                    }
                    b = g >>> 8;
                    if (b)
                        if (g >>> 0 > 16777215)
                            c = 31;
                        else {
                            r = (b + 1048320 | 0) >>> 16 & 8;
                            s = b << r;
                            q = (s + 520192 | 0) >>> 16 & 4;
                            s = s << q;
                            c = (s + 245760 | 0) >>> 16 & 2;
                            c = 14 - (q | r | c) + (s << c >>> 15) | 0;
                            c = g >>> (c + 7 | 0) & 1 | c << 1;
                        }
                    else
                        c = 0;
                    d = 68968 + (c << 2) | 0;
                    f[j + 28 >> 2] = c;
                    f[j + 20 >> 2] = 0;
                    f[e >> 2] = 0;
                    b = f[17167] | 0;
                    a = 1 << c;
                    if (!(b & a)) {
                        f[17167] = b | a;
                        f[d >> 2] = j;
                        f[j + 24 >> 2] = d;
                        f[j + 12 >> 2] = j;
                        f[j + 8 >> 2] = j;
                        break;
                    }
                    a = g << ((c | 0) == 31 ? 0 : 25 - (c >>> 1) | 0);
                    c = f[d >> 2] | 0;
                    while (1) {
                        if ((f[c + 4 >> 2] & -8 | 0) == (g | 0)) {
                            r = 213;
                            break;
                        }
                        d = c + 16 + (a >>> 31 << 2) | 0;
                        b = f[d >> 2] | 0;
                        if (!b) {
                            r = 212;
                            break;
                        } else {
                            a = a << 1;
                            c = b;
                        }
                    }
                    if ((r | 0) == 212) {
                        f[d >> 2] = j;
                        f[j + 24 >> 2] = c;
                        f[j + 12 >> 2] = j;
                        f[j + 8 >> 2] = j;
                        break;
                    } else if ((r | 0) == 213) {
                        r = c + 8 | 0;
                        s = f[r >> 2] | 0;
                        f[s + 12 >> 2] = j;
                        f[r >> 2] = j;
                        f[j + 8 >> 2] = s;
                        f[j + 12 >> 2] = c;
                        f[j + 24 >> 2] = 0;
                        break;
                    }
                }
            } else {
                s = f[17170] | 0;
                if ((s | 0) == 0 | d >>> 0 < s >>> 0)
                    f[17170] = d;
                f[17278] = d;
                f[17279] = b;
                f[17281] = 0;
                f[17175] = f[17284];
                f[17174] = -1;
                f[17179] = 68704;
                f[17178] = 68704;
                f[17181] = 68712;
                f[17180] = 68712;
                f[17183] = 68720;
                f[17182] = 68720;
                f[17185] = 68728;
                f[17184] = 68728;
                f[17187] = 68736;
                f[17186] = 68736;
                f[17189] = 68744;
                f[17188] = 68744;
                f[17191] = 68752;
                f[17190] = 68752;
                f[17193] = 68760;
                f[17192] = 68760;
                f[17195] = 68768;
                f[17194] = 68768;
                f[17197] = 68776;
                f[17196] = 68776;
                f[17199] = 68784;
                f[17198] = 68784;
                f[17201] = 68792;
                f[17200] = 68792;
                f[17203] = 68800;
                f[17202] = 68800;
                f[17205] = 68808;
                f[17204] = 68808;
                f[17207] = 68816;
                f[17206] = 68816;
                f[17209] = 68824;
                f[17208] = 68824;
                f[17211] = 68832;
                f[17210] = 68832;
                f[17213] = 68840;
                f[17212] = 68840;
                f[17215] = 68848;
                f[17214] = 68848;
                f[17217] = 68856;
                f[17216] = 68856;
                f[17219] = 68864;
                f[17218] = 68864;
                f[17221] = 68872;
                f[17220] = 68872;
                f[17223] = 68880;
                f[17222] = 68880;
                f[17225] = 68888;
                f[17224] = 68888;
                f[17227] = 68896;
                f[17226] = 68896;
                f[17229] = 68904;
                f[17228] = 68904;
                f[17231] = 68912;
                f[17230] = 68912;
                f[17233] = 68920;
                f[17232] = 68920;
                f[17235] = 68928;
                f[17234] = 68928;
                f[17237] = 68936;
                f[17236] = 68936;
                f[17239] = 68944;
                f[17238] = 68944;
                f[17241] = 68952;
                f[17240] = 68952;
                s = b + -40 | 0;
                q = d + 8 | 0;
                q = (q & 7 | 0) == 0 ? 0 : 0 - q & 7;
                r = d + q | 0;
                q = s - q | 0;
                f[17172] = r;
                f[17169] = q;
                f[r + 4 >> 2] = q | 1;
                f[d + s + 4 >> 2] = 40;
                f[17173] = f[17288];
            }
        while (0);
        b = f[17169] | 0;
        if (b >>> 0 <= m >>> 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        q = b - m | 0;
        f[17169] = q;
        s = f[17172] | 0;
        r = s + m | 0;
        f[17172] = r;
        f[r + 4 >> 2] = q | 1;
        f[s + 4 >> 2] = m | 3;
        s = s + 8 | 0;
        u = t;
        return s | 0;
    }
    function ec(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0;
        if (!a)
            return;
        c = a + -8 | 0;
        e = f[17170] | 0;
        a = f[a + -4 >> 2] | 0;
        b = a & -8;
        j = c + b | 0;
        do
            if (!(a & 1)) {
                d = f[c >> 2] | 0;
                if (!(a & 3))
                    return;
                h = c + (0 - d) | 0;
                g = d + b | 0;
                if (h >>> 0 < e >>> 0)
                    return;
                if ((f[17171] | 0) == (h | 0)) {
                    a = j + 4 | 0;
                    b = f[a >> 2] | 0;
                    if ((b & 3 | 0) != 3) {
                        i = h;
                        b = g;
                        break;
                    }
                    f[17168] = g;
                    f[a >> 2] = b & -2;
                    f[h + 4 >> 2] = g | 1;
                    f[h + g >> 2] = g;
                    return;
                }
                c = d >>> 3;
                if (d >>> 0 < 256) {
                    a = f[h + 8 >> 2] | 0;
                    b = f[h + 12 >> 2] | 0;
                    if ((b | 0) == (a | 0)) {
                        f[17166] = f[17166] & ~(1 << c);
                        i = h;
                        b = g;
                        break;
                    } else {
                        f[a + 12 >> 2] = b;
                        f[b + 8 >> 2] = a;
                        i = h;
                        b = g;
                        break;
                    }
                }
                e = f[h + 24 >> 2] | 0;
                a = f[h + 12 >> 2] | 0;
                do
                    if ((a | 0) == (h | 0)) {
                        c = h + 16 | 0;
                        b = c + 4 | 0;
                        a = f[b >> 2] | 0;
                        if (!a) {
                            a = f[c >> 2] | 0;
                            if (!a) {
                                a = 0;
                                break;
                            } else
                                b = c;
                        }
                        while (1) {
                            c = a + 20 | 0;
                            d = f[c >> 2] | 0;
                            if (d | 0) {
                                a = d;
                                b = c;
                                continue;
                            }
                            c = a + 16 | 0;
                            d = f[c >> 2] | 0;
                            if (!d)
                                break;
                            else {
                                a = d;
                                b = c;
                            }
                        }
                        f[b >> 2] = 0;
                    } else {
                        i = f[h + 8 >> 2] | 0;
                        f[i + 12 >> 2] = a;
                        f[a + 8 >> 2] = i;
                    }
                while (0);
                if (e) {
                    b = f[h + 28 >> 2] | 0;
                    c = 68968 + (b << 2) | 0;
                    if ((f[c >> 2] | 0) == (h | 0)) {
                        f[c >> 2] = a;
                        if (!a) {
                            f[17167] = f[17167] & ~(1 << b);
                            i = h;
                            b = g;
                            break;
                        }
                    } else {
                        f[e + 16 + (((f[e + 16 >> 2] | 0) != (h | 0) & 1) << 2) >> 2] = a;
                        if (!a) {
                            i = h;
                            b = g;
                            break;
                        }
                    }
                    f[a + 24 >> 2] = e;
                    b = h + 16 | 0;
                    c = f[b >> 2] | 0;
                    if (c | 0) {
                        f[a + 16 >> 2] = c;
                        f[c + 24 >> 2] = a;
                    }
                    b = f[b + 4 >> 2] | 0;
                    if (b) {
                        f[a + 20 >> 2] = b;
                        f[b + 24 >> 2] = a;
                        i = h;
                        b = g;
                    } else {
                        i = h;
                        b = g;
                    }
                } else {
                    i = h;
                    b = g;
                }
            } else {
                i = c;
                h = c;
            }
        while (0);
        if (h >>> 0 >= j >>> 0)
            return;
        a = j + 4 | 0;
        d = f[a >> 2] | 0;
        if (!(d & 1))
            return;
        if (!(d & 2)) {
            if ((f[17172] | 0) == (j | 0)) {
                j = (f[17169] | 0) + b | 0;
                f[17169] = j;
                f[17172] = i;
                f[i + 4 >> 2] = j | 1;
                if ((i | 0) != (f[17171] | 0))
                    return;
                f[17171] = 0;
                f[17168] = 0;
                return;
            }
            if ((f[17171] | 0) == (j | 0)) {
                j = (f[17168] | 0) + b | 0;
                f[17168] = j;
                f[17171] = h;
                f[i + 4 >> 2] = j | 1;
                f[h + j >> 2] = j;
                return;
            }
            e = (d & -8) + b | 0;
            c = d >>> 3;
            do
                if (d >>> 0 < 256) {
                    b = f[j + 8 >> 2] | 0;
                    a = f[j + 12 >> 2] | 0;
                    if ((a | 0) == (b | 0)) {
                        f[17166] = f[17166] & ~(1 << c);
                        break;
                    } else {
                        f[b + 12 >> 2] = a;
                        f[a + 8 >> 2] = b;
                        break;
                    }
                } else {
                    g = f[j + 24 >> 2] | 0;
                    a = f[j + 12 >> 2] | 0;
                    do
                        if ((a | 0) == (j | 0)) {
                            c = j + 16 | 0;
                            b = c + 4 | 0;
                            a = f[b >> 2] | 0;
                            if (!a) {
                                a = f[c >> 2] | 0;
                                if (!a) {
                                    c = 0;
                                    break;
                                } else
                                    b = c;
                            }
                            while (1) {
                                c = a + 20 | 0;
                                d = f[c >> 2] | 0;
                                if (d | 0) {
                                    a = d;
                                    b = c;
                                    continue;
                                }
                                c = a + 16 | 0;
                                d = f[c >> 2] | 0;
                                if (!d)
                                    break;
                                else {
                                    a = d;
                                    b = c;
                                }
                            }
                            f[b >> 2] = 0;
                            c = a;
                        } else {
                            c = f[j + 8 >> 2] | 0;
                            f[c + 12 >> 2] = a;
                            f[a + 8 >> 2] = c;
                            c = a;
                        }
                    while (0);
                    if (g | 0) {
                        a = f[j + 28 >> 2] | 0;
                        b = 68968 + (a << 2) | 0;
                        if ((f[b >> 2] | 0) == (j | 0)) {
                            f[b >> 2] = c;
                            if (!c) {
                                f[17167] = f[17167] & ~(1 << a);
                                break;
                            }
                        } else {
                            f[g + 16 + (((f[g + 16 >> 2] | 0) != (j | 0) & 1) << 2) >> 2] = c;
                            if (!c)
                                break;
                        }
                        f[c + 24 >> 2] = g;
                        a = j + 16 | 0;
                        b = f[a >> 2] | 0;
                        if (b | 0) {
                            f[c + 16 >> 2] = b;
                            f[b + 24 >> 2] = c;
                        }
                        a = f[a + 4 >> 2] | 0;
                        if (a | 0) {
                            f[c + 20 >> 2] = a;
                            f[a + 24 >> 2] = c;
                        }
                    }
                }
            while (0);
            f[i + 4 >> 2] = e | 1;
            f[h + e >> 2] = e;
            if ((i | 0) == (f[17171] | 0)) {
                f[17168] = e;
                return;
            }
        } else {
            f[a >> 2] = d & -2;
            f[i + 4 >> 2] = b | 1;
            f[h + b >> 2] = b;
            e = b;
        }
        a = e >>> 3;
        if (e >>> 0 < 256) {
            c = 68704 + (a << 1 << 2) | 0;
            b = f[17166] | 0;
            a = 1 << a;
            if (!(b & a)) {
                f[17166] = b | a;
                a = c;
                b = c + 8 | 0;
            } else {
                b = c + 8 | 0;
                a = f[b >> 2] | 0;
            }
            f[b >> 2] = i;
            f[a + 12 >> 2] = i;
            f[i + 8 >> 2] = a;
            f[i + 12 >> 2] = c;
            return;
        }
        a = e >>> 8;
        if (a)
            if (e >>> 0 > 16777215)
                a = 31;
            else {
                h = (a + 1048320 | 0) >>> 16 & 8;
                j = a << h;
                g = (j + 520192 | 0) >>> 16 & 4;
                j = j << g;
                a = (j + 245760 | 0) >>> 16 & 2;
                a = 14 - (g | h | a) + (j << a >>> 15) | 0;
                a = e >>> (a + 7 | 0) & 1 | a << 1;
            }
        else
            a = 0;
        d = 68968 + (a << 2) | 0;
        f[i + 28 >> 2] = a;
        f[i + 20 >> 2] = 0;
        f[i + 16 >> 2] = 0;
        b = f[17167] | 0;
        c = 1 << a;
        do
            if (b & c) {
                b = e << ((a | 0) == 31 ? 0 : 25 - (a >>> 1) | 0);
                c = f[d >> 2] | 0;
                while (1) {
                    if ((f[c + 4 >> 2] & -8 | 0) == (e | 0)) {
                        a = 73;
                        break;
                    }
                    d = c + 16 + (b >>> 31 << 2) | 0;
                    a = f[d >> 2] | 0;
                    if (!a) {
                        a = 72;
                        break;
                    } else {
                        b = b << 1;
                        c = a;
                    }
                }
                if ((a | 0) == 72) {
                    f[d >> 2] = i;
                    f[i + 24 >> 2] = c;
                    f[i + 12 >> 2] = i;
                    f[i + 8 >> 2] = i;
                    break;
                } else if ((a | 0) == 73) {
                    h = c + 8 | 0;
                    j = f[h >> 2] | 0;
                    f[j + 12 >> 2] = i;
                    f[h >> 2] = i;
                    f[i + 8 >> 2] = j;
                    f[i + 12 >> 2] = c;
                    f[i + 24 >> 2] = 0;
                    break;
                }
            } else {
                f[17167] = b | c;
                f[d >> 2] = i;
                f[i + 24 >> 2] = d;
                f[i + 12 >> 2] = i;
                f[i + 8 >> 2] = i;
            }
        while (0);
        j = (f[17174] | 0) + -1 | 0;
        f[17174] = j;
        if (!j)
            a = 69120;
        else
            return;
        while (1) {
            a = f[a >> 2] | 0;
            if (!a)
                break;
            else
                a = a + 8 | 0;
        }
        f[17174] = -1;
        return;
    }
    function fc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        if (!a) {
            b = dc(b) | 0;
            return b | 0;
        }
        if (b >>> 0 > 4294967231) {
            b = 0;
            return b | 0;
        }
        c = gc(a + -8 | 0, b >>> 0 < 11 ? 16 : b + 11 & -8) | 0;
        if (c | 0) {
            b = c + 8 | 0;
            return b | 0;
        }
        c = dc(b) | 0;
        if (!c) {
            b = 0;
            return b | 0;
        }
        d = f[a + -4 >> 2] | 0;
        d = (d & -8) - ((d & 3 | 0) == 0 ? 8 : 4) | 0;
        Fc(c | 0, a | 0, (d >>> 0 < b >>> 0 ? d : b) | 0) | 0;
        ec(a);
        b = c;
        return b | 0;
    }
    function gc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0;
        l = a + 4 | 0;
        m = f[l >> 2] | 0;
        c = m & -8;
        i = a + c | 0;
        if (!(m & 3)) {
            if (b >>> 0 < 256) {
                a = 0;
                return a | 0;
            }
            if (c >>> 0 >= (b + 4 | 0) >>> 0 ? (c - b | 0) >>> 0 <= f[17286] << 1 >>> 0 : 0)
                return a | 0;
            a = 0;
            return a | 0;
        }
        if (c >>> 0 >= b >>> 0) {
            c = c - b | 0;
            if (c >>> 0 <= 15)
                return a | 0;
            k = a + b | 0;
            f[l >> 2] = m & 1 | b | 2;
            f[k + 4 >> 2] = c | 3;
            m = i + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            hc(k, c);
            return a | 0;
        }
        if ((f[17172] | 0) == (i | 0)) {
            k = (f[17169] | 0) + c | 0;
            c = k - b | 0;
            d = a + b | 0;
            if (k >>> 0 <= b >>> 0) {
                a = 0;
                return a | 0;
            }
            f[l >> 2] = m & 1 | b | 2;
            f[d + 4 >> 2] = c | 1;
            f[17172] = d;
            f[17169] = c;
            return a | 0;
        }
        if ((f[17171] | 0) == (i | 0)) {
            d = (f[17168] | 0) + c | 0;
            if (d >>> 0 < b >>> 0) {
                a = 0;
                return a | 0;
            }
            c = d - b | 0;
            if (c >>> 0 > 15) {
                k = a + b | 0;
                d = a + d | 0;
                f[l >> 2] = m & 1 | b | 2;
                f[k + 4 >> 2] = c | 1;
                f[d >> 2] = c;
                d = d + 4 | 0;
                f[d >> 2] = f[d >> 2] & -2;
                d = k;
            } else {
                f[l >> 2] = m & 1 | d | 2;
                d = a + d + 4 | 0;
                f[d >> 2] = f[d >> 2] | 1;
                d = 0;
                c = 0;
            }
            f[17168] = c;
            f[17171] = d;
            return a | 0;
        }
        d = f[i + 4 >> 2] | 0;
        if (d & 2 | 0) {
            a = 0;
            return a | 0;
        }
        j = (d & -8) + c | 0;
        if (j >>> 0 < b >>> 0) {
            a = 0;
            return a | 0;
        }
        k = j - b | 0;
        e = d >>> 3;
        do
            if (d >>> 0 < 256) {
                d = f[i + 8 >> 2] | 0;
                c = f[i + 12 >> 2] | 0;
                if ((c | 0) == (d | 0)) {
                    f[17166] = f[17166] & ~(1 << e);
                    break;
                } else {
                    f[d + 12 >> 2] = c;
                    f[c + 8 >> 2] = d;
                    break;
                }
            } else {
                h = f[i + 24 >> 2] | 0;
                c = f[i + 12 >> 2] | 0;
                do
                    if ((c | 0) == (i | 0)) {
                        e = i + 16 | 0;
                        d = e + 4 | 0;
                        c = f[d >> 2] | 0;
                        if (!c) {
                            c = f[e >> 2] | 0;
                            if (!c) {
                                e = 0;
                                break;
                            } else
                                g = e;
                        } else
                            g = d;
                        while (1) {
                            e = c + 20 | 0;
                            d = f[e >> 2] | 0;
                            if (d | 0) {
                                c = d;
                                g = e;
                                continue;
                            }
                            d = c + 16 | 0;
                            e = f[d >> 2] | 0;
                            if (!e)
                                break;
                            else {
                                c = e;
                                g = d;
                            }
                        }
                        f[g >> 2] = 0;
                        e = c;
                    } else {
                        e = f[i + 8 >> 2] | 0;
                        f[e + 12 >> 2] = c;
                        f[c + 8 >> 2] = e;
                        e = c;
                    }
                while (0);
                if (h | 0) {
                    c = f[i + 28 >> 2] | 0;
                    d = 68968 + (c << 2) | 0;
                    if ((f[d >> 2] | 0) == (i | 0)) {
                        f[d >> 2] = e;
                        if (!e) {
                            f[17167] = f[17167] & ~(1 << c);
                            break;
                        }
                    } else {
                        f[h + 16 + (((f[h + 16 >> 2] | 0) != (i | 0) & 1) << 2) >> 2] = e;
                        if (!e)
                            break;
                    }
                    f[e + 24 >> 2] = h;
                    c = i + 16 | 0;
                    d = f[c >> 2] | 0;
                    if (d | 0) {
                        f[e + 16 >> 2] = d;
                        f[d + 24 >> 2] = e;
                    }
                    c = f[c + 4 >> 2] | 0;
                    if (c | 0) {
                        f[e + 20 >> 2] = c;
                        f[c + 24 >> 2] = e;
                    }
                }
            }
        while (0);
        if (k >>> 0 < 16) {
            f[l >> 2] = m & 1 | j | 2;
            m = a + j + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            return a | 0;
        } else {
            i = a + b | 0;
            f[l >> 2] = m & 1 | b | 2;
            f[i + 4 >> 2] = k | 3;
            m = a + j + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            hc(i, k);
            return a | 0;
        }
        return 0;
    }
    function hc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        i = a + b | 0;
        c = f[a + 4 >> 2] | 0;
        do
            if (!(c & 1)) {
                e = f[a >> 2] | 0;
                if (!(c & 3))
                    return;
                h = a + (0 - e) | 0;
                b = e + b | 0;
                if ((f[17171] | 0) == (h | 0)) {
                    a = i + 4 | 0;
                    c = f[a >> 2] | 0;
                    if ((c & 3 | 0) != 3)
                        break;
                    f[17168] = b;
                    f[a >> 2] = c & -2;
                    f[h + 4 >> 2] = b | 1;
                    f[i >> 2] = b;
                    return;
                }
                d = e >>> 3;
                if (e >>> 0 < 256) {
                    a = f[h + 8 >> 2] | 0;
                    c = f[h + 12 >> 2] | 0;
                    if ((c | 0) == (a | 0)) {
                        f[17166] = f[17166] & ~(1 << d);
                        break;
                    } else {
                        f[a + 12 >> 2] = c;
                        f[c + 8 >> 2] = a;
                        break;
                    }
                }
                g = f[h + 24 >> 2] | 0;
                a = f[h + 12 >> 2] | 0;
                do
                    if ((a | 0) == (h | 0)) {
                        d = h + 16 | 0;
                        c = d + 4 | 0;
                        a = f[c >> 2] | 0;
                        if (!a) {
                            a = f[d >> 2] | 0;
                            if (!a) {
                                a = 0;
                                break;
                            } else
                                c = d;
                        }
                        while (1) {
                            d = a + 20 | 0;
                            e = f[d >> 2] | 0;
                            if (e | 0) {
                                a = e;
                                c = d;
                                continue;
                            }
                            d = a + 16 | 0;
                            e = f[d >> 2] | 0;
                            if (!e)
                                break;
                            else {
                                a = e;
                                c = d;
                            }
                        }
                        f[c >> 2] = 0;
                    } else {
                        e = f[h + 8 >> 2] | 0;
                        f[e + 12 >> 2] = a;
                        f[a + 8 >> 2] = e;
                    }
                while (0);
                if (g) {
                    c = f[h + 28 >> 2] | 0;
                    d = 68968 + (c << 2) | 0;
                    if ((f[d >> 2] | 0) == (h | 0)) {
                        f[d >> 2] = a;
                        if (!a) {
                            f[17167] = f[17167] & ~(1 << c);
                            break;
                        }
                    } else {
                        f[g + 16 + (((f[g + 16 >> 2] | 0) != (h | 0) & 1) << 2) >> 2] = a;
                        if (!a)
                            break;
                    }
                    f[a + 24 >> 2] = g;
                    c = h + 16 | 0;
                    d = f[c >> 2] | 0;
                    if (d | 0) {
                        f[a + 16 >> 2] = d;
                        f[d + 24 >> 2] = a;
                    }
                    c = f[c + 4 >> 2] | 0;
                    if (c) {
                        f[a + 20 >> 2] = c;
                        f[c + 24 >> 2] = a;
                    }
                }
            } else
                h = a;
        while (0);
        a = i + 4 | 0;
        d = f[a >> 2] | 0;
        if (!(d & 2)) {
            if ((f[17172] | 0) == (i | 0)) {
                i = (f[17169] | 0) + b | 0;
                f[17169] = i;
                f[17172] = h;
                f[h + 4 >> 2] = i | 1;
                if ((h | 0) != (f[17171] | 0))
                    return;
                f[17171] = 0;
                f[17168] = 0;
                return;
            }
            if ((f[17171] | 0) == (i | 0)) {
                i = (f[17168] | 0) + b | 0;
                f[17168] = i;
                f[17171] = h;
                f[h + 4 >> 2] = i | 1;
                f[h + i >> 2] = i;
                return;
            }
            e = (d & -8) + b | 0;
            c = d >>> 3;
            do
                if (d >>> 0 < 256) {
                    a = f[i + 8 >> 2] | 0;
                    b = f[i + 12 >> 2] | 0;
                    if ((b | 0) == (a | 0)) {
                        f[17166] = f[17166] & ~(1 << c);
                        break;
                    } else {
                        f[a + 12 >> 2] = b;
                        f[b + 8 >> 2] = a;
                        break;
                    }
                } else {
                    g = f[i + 24 >> 2] | 0;
                    b = f[i + 12 >> 2] | 0;
                    do
                        if ((b | 0) == (i | 0)) {
                            c = i + 16 | 0;
                            a = c + 4 | 0;
                            b = f[a >> 2] | 0;
                            if (!b) {
                                b = f[c >> 2] | 0;
                                if (!b) {
                                    c = 0;
                                    break;
                                } else
                                    a = c;
                            }
                            while (1) {
                                c = b + 20 | 0;
                                d = f[c >> 2] | 0;
                                if (d | 0) {
                                    b = d;
                                    a = c;
                                    continue;
                                }
                                c = b + 16 | 0;
                                d = f[c >> 2] | 0;
                                if (!d)
                                    break;
                                else {
                                    b = d;
                                    a = c;
                                }
                            }
                            f[a >> 2] = 0;
                            c = b;
                        } else {
                            c = f[i + 8 >> 2] | 0;
                            f[c + 12 >> 2] = b;
                            f[b + 8 >> 2] = c;
                            c = b;
                        }
                    while (0);
                    if (g | 0) {
                        b = f[i + 28 >> 2] | 0;
                        a = 68968 + (b << 2) | 0;
                        if ((f[a >> 2] | 0) == (i | 0)) {
                            f[a >> 2] = c;
                            if (!c) {
                                f[17167] = f[17167] & ~(1 << b);
                                break;
                            }
                        } else {
                            f[g + 16 + (((f[g + 16 >> 2] | 0) != (i | 0) & 1) << 2) >> 2] = c;
                            if (!c)
                                break;
                        }
                        f[c + 24 >> 2] = g;
                        b = i + 16 | 0;
                        a = f[b >> 2] | 0;
                        if (a | 0) {
                            f[c + 16 >> 2] = a;
                            f[a + 24 >> 2] = c;
                        }
                        b = f[b + 4 >> 2] | 0;
                        if (b | 0) {
                            f[c + 20 >> 2] = b;
                            f[b + 24 >> 2] = c;
                        }
                    }
                }
            while (0);
            f[h + 4 >> 2] = e | 1;
            f[h + e >> 2] = e;
            if ((h | 0) == (f[17171] | 0)) {
                f[17168] = e;
                return;
            }
        } else {
            f[a >> 2] = d & -2;
            f[h + 4 >> 2] = b | 1;
            f[h + b >> 2] = b;
            e = b;
        }
        b = e >>> 3;
        if (e >>> 0 < 256) {
            c = 68704 + (b << 1 << 2) | 0;
            a = f[17166] | 0;
            b = 1 << b;
            if (!(a & b)) {
                f[17166] = a | b;
                b = c;
                a = c + 8 | 0;
            } else {
                a = c + 8 | 0;
                b = f[a >> 2] | 0;
            }
            f[a >> 2] = h;
            f[b + 12 >> 2] = h;
            f[h + 8 >> 2] = b;
            f[h + 12 >> 2] = c;
            return;
        }
        b = e >>> 8;
        if (b)
            if (e >>> 0 > 16777215)
                b = 31;
            else {
                g = (b + 1048320 | 0) >>> 16 & 8;
                i = b << g;
                d = (i + 520192 | 0) >>> 16 & 4;
                i = i << d;
                b = (i + 245760 | 0) >>> 16 & 2;
                b = 14 - (d | g | b) + (i << b >>> 15) | 0;
                b = e >>> (b + 7 | 0) & 1 | b << 1;
            }
        else
            b = 0;
        d = 68968 + (b << 2) | 0;
        f[h + 28 >> 2] = b;
        f[h + 20 >> 2] = 0;
        f[h + 16 >> 2] = 0;
        a = f[17167] | 0;
        c = 1 << b;
        if (!(a & c)) {
            f[17167] = a | c;
            f[d >> 2] = h;
            f[h + 24 >> 2] = d;
            f[h + 12 >> 2] = h;
            f[h + 8 >> 2] = h;
            return;
        }
        a = e << ((b | 0) == 31 ? 0 : 25 - (b >>> 1) | 0);
        c = f[d >> 2] | 0;
        while (1) {
            if ((f[c + 4 >> 2] & -8 | 0) == (e | 0)) {
                b = 69;
                break;
            }
            d = c + 16 + (a >>> 31 << 2) | 0;
            b = f[d >> 2] | 0;
            if (!b) {
                b = 68;
                break;
            } else {
                a = a << 1;
                c = b;
            }
        }
        if ((b | 0) == 68) {
            f[d >> 2] = h;
            f[h + 24 >> 2] = c;
            f[h + 12 >> 2] = h;
            f[h + 8 >> 2] = h;
            return;
        } else if ((b | 0) == 69) {
            g = c + 8 | 0;
            i = f[g >> 2] | 0;
            f[i + 12 >> 2] = h;
            f[g >> 2] = h;
            f[h + 8 >> 2] = i;
            f[h + 12 >> 2] = c;
            f[h + 24 >> 2] = 0;
            return;
        }
    }
    function ic(a, b) {
        a = a | 0;
        b = b | 0;
        if (a >>> 0 < 9) {
            b = dc(b) | 0;
            return b | 0;
        } else {
            b = jc(a, b) | 0;
            return b | 0;
        }
        return 0;
    }
    function jc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        a = a >>> 0 > 16 ? a : 16;
        if (a + -1 & a) {
            c = 16;
            while (1)
                if (c >>> 0 < a >>> 0)
                    c = c << 1;
                else {
                    a = c;
                    break;
                }
        }
        if ((-64 - a | 0) >>> 0 <= b >>> 0) {
            h = 0;
            return h | 0;
        }
        g = b >>> 0 < 11 ? 16 : b + 11 & -8;
        c = dc(g + 12 + a | 0) | 0;
        if (!c) {
            h = 0;
            return h | 0;
        }
        e = c + -8 | 0;
        do
            if (a + -1 & c) {
                d = (c + a + -1 & 0 - a) + -8 | 0;
                b = e;
                d = (d - b | 0) >>> 0 > 15 ? d : d + a | 0;
                b = d - b | 0;
                a = c + -4 | 0;
                i = f[a >> 2] | 0;
                c = (i & -8) - b | 0;
                if (!(i & 3)) {
                    f[d >> 2] = (f[e >> 2] | 0) + b;
                    f[d + 4 >> 2] = c;
                    a = d;
                    b = d;
                    break;
                } else {
                    i = d + 4 | 0;
                    f[i >> 2] = c | f[i >> 2] & 1 | 2;
                    c = d + c + 4 | 0;
                    f[c >> 2] = f[c >> 2] | 1;
                    f[a >> 2] = b | f[a >> 2] & 1 | 2;
                    f[i >> 2] = f[i >> 2] | 1;
                    hc(e, b);
                    a = d;
                    b = d;
                    break;
                }
            } else {
                a = e;
                b = e;
            }
        while (0);
        a = a + 4 | 0;
        c = f[a >> 2] | 0;
        if (c & 3 | 0 ? (h = c & -8, h >>> 0 > (g + 16 | 0) >>> 0) : 0) {
            i = h - g | 0;
            e = b + g | 0;
            f[a >> 2] = g | c & 1 | 2;
            f[e + 4 >> 2] = i | 3;
            h = b + h + 4 | 0;
            f[h >> 2] = f[h >> 2] | 1;
            hc(e, i);
        }
        i = b + 8 | 0;
        return i | 0;
    }
    function kc(a) {
        a = a | 0;
        return;
    }
    function lc(a) {
        a = a | 0;
        Bc(a);
        return;
    }
    function mc(a) {
        a = a | 0;
        return;
    }
    function nc(a) {
        a = a | 0;
        return;
    }
    function oc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0;
        h = u;
        u = u + 64 | 0;
        e = h;
        if (!(sc(a, b) | 0))
            if ((b | 0) != 0 ? (g = wc(b, 8) | 0, (g | 0) != 0) : 0) {
                b = e + 4 | 0;
                d = b + 52 | 0;
                do {
                    f[b >> 2] = 0;
                    b = b + 4 | 0;
                } while ((b | 0) < (d | 0));
                f[e >> 2] = g;
                f[e + 8 >> 2] = a;
                f[e + 12 >> 2] = -1;
                f[e + 48 >> 2] = 1;
                ua[f[(f[g >> 2] | 0) + 28 >> 2] & 3](g, e, f[c >> 2] | 0, 1);
                if ((f[e + 24 >> 2] | 0) == 1) {
                    f[c >> 2] = f[e + 16 >> 2];
                    b = 1;
                } else
                    b = 0;
            } else
                b = 0;
        else
            b = 1;
        u = h;
        return b | 0;
    }
    function pc(a, b, c, d, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        if (sc(a, f[b + 8 >> 2] | 0) | 0)
            vc(b, c, d, e);
        return;
    }
    function qc(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var h = 0;
        do
            if (!(sc(a, f[c + 8 >> 2] | 0) | 0)) {
                if (sc(a, f[c >> 2] | 0) | 0) {
                    if ((f[c + 16 >> 2] | 0) != (d | 0) ? (h = c + 20 | 0, (f[h >> 2] | 0) != (d | 0)) : 0) {
                        f[c + 32 >> 2] = e;
                        f[h >> 2] = d;
                        g = c + 40 | 0;
                        f[g >> 2] = (f[g >> 2] | 0) + 1;
                        if ((f[c + 36 >> 2] | 0) == 1 ? (f[c + 24 >> 2] | 0) == 2 : 0)
                            b[c + 54 >> 0] = 1;
                        f[c + 44 >> 2] = 4;
                        break;
                    }
                    if ((e | 0) == 1)
                        f[c + 32 >> 2] = 1;
                }
            } else
                uc(c, d, e);
        while (0);
        return;
    }
    function rc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        if (sc(a, f[b + 8 >> 2] | 0) | 0)
            tc(b, c, d);
        return;
    }
    function sc(a, b) {
        a = a | 0;
        b = b | 0;
        return (a | 0) == (b | 0) | 0;
    }
    function tc(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0;
        e = a + 16 | 0;
        g = f[e >> 2] | 0;
        do
            if (g) {
                if ((g | 0) != (c | 0)) {
                    d = a + 36 | 0;
                    f[d >> 2] = (f[d >> 2] | 0) + 1;
                    f[a + 24 >> 2] = 2;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                a = a + 24 | 0;
                if ((f[a >> 2] | 0) == 2)
                    f[a >> 2] = d;
            } else {
                f[e >> 2] = c;
                f[a + 24 >> 2] = d;
                f[a + 36 >> 2] = 1;
            }
        while (0);
        return;
    }
    function uc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0;
        if ((f[a + 4 >> 2] | 0) == (b | 0) ? (d = a + 28 | 0, (f[d >> 2] | 0) != 1) : 0)
            f[d >> 2] = c;
        return;
    }
    function vc(a, c, d, e) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        var g = 0;
        b[a + 53 >> 0] = 1;
        do
            if ((f[a + 4 >> 2] | 0) == (d | 0)) {
                b[a + 52 >> 0] = 1;
                g = a + 16 | 0;
                d = f[g >> 2] | 0;
                if (!d) {
                    f[g >> 2] = c;
                    f[a + 24 >> 2] = e;
                    f[a + 36 >> 2] = 1;
                    if (!((e | 0) == 1 ? (f[a + 48 >> 2] | 0) == 1 : 0))
                        break;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                if ((d | 0) != (c | 0)) {
                    e = a + 36 | 0;
                    f[e >> 2] = (f[e >> 2] | 0) + 1;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                g = a + 24 | 0;
                d = f[g >> 2] | 0;
                if ((d | 0) == 2) {
                    f[g >> 2] = e;
                    d = e;
                }
                if ((d | 0) == 1 ? (f[a + 48 >> 2] | 0) == 1 : 0)
                    b[a + 54 >> 0] = 1;
            }
        while (0);
        return;
    }
    function wc(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        q = u;
        u = u + 64 | 0;
        n = q;
        p = f[a >> 2] | 0;
        o = a + (f[p + -8 >> 2] | 0) | 0;
        p = f[p + -4 >> 2] | 0;
        f[n >> 2] = c;
        f[n + 4 >> 2] = a;
        f[n + 8 >> 2] = 24;
        g = n + 12 | 0;
        h = n + 16 | 0;
        i = n + 20 | 0;
        j = n + 24 | 0;
        k = n + 28 | 0;
        l = n + 32 | 0;
        m = n + 40 | 0;
        a = sc(p, c) | 0;
        c = g;
        e = c + 40 | 0;
        do {
            f[c >> 2] = 0;
            c = c + 4 | 0;
        } while ((c | 0) < (e | 0));
        d[g + 40 >> 1] = 0;
        b[g + 42 >> 0] = 0;
        a:
            do
                if (a) {
                    f[n + 48 >> 2] = 1;
                    wa[f[(f[p >> 2] | 0) + 20 >> 2] & 3](p, n, o, o, 1, 0);
                    a = (f[j >> 2] | 0) == 1 ? o : 0;
                } else {
                    va[f[(f[p >> 2] | 0) + 24 >> 2] & 3](p, n, o, 1, 0);
                    switch (f[n + 36 >> 2] | 0) {
                    case 0: {
                            a = (f[m >> 2] | 0) == 1 & (f[k >> 2] | 0) == 1 & (f[l >> 2] | 0) == 1 ? f[i >> 2] | 0 : 0;
                            break a;
                        }
                    case 1:
                        break;
                    default: {
                            a = 0;
                            break a;
                        }
                    }
                    if ((f[j >> 2] | 0) != 1 ? !((f[m >> 2] | 0) == 0 & (f[k >> 2] | 0) == 1 & (f[l >> 2] | 0) == 1) : 0) {
                        a = 0;
                        break;
                    }
                    a = f[h >> 2] | 0;
                }
            while (0);
        u = q;
        return a | 0;
    }
    function xc(a) {
        a = a | 0;
        Bc(a);
        return;
    }
    function yc(a, b, c, d, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        if (sc(a, f[b + 8 >> 2] | 0) | 0)
            vc(b, c, d, e);
        else {
            a = f[a + 8 >> 2] | 0;
            wa[f[(f[a >> 2] | 0) + 20 >> 2] & 3](a, b, c, d, e, g);
        }
        return;
    }
    function zc(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var h = 0, i = 0, j = 0, k = 0;
        do
            if (!(sc(a, f[c + 8 >> 2] | 0) | 0)) {
                if (!(sc(a, f[c >> 2] | 0) | 0)) {
                    j = f[a + 8 >> 2] | 0;
                    va[f[(f[j >> 2] | 0) + 24 >> 2] & 3](j, c, d, e, g);
                    break;
                }
                if ((f[c + 16 >> 2] | 0) != (d | 0) ? (h = c + 20 | 0, (f[h >> 2] | 0) != (d | 0)) : 0) {
                    f[c + 32 >> 2] = e;
                    i = c + 44 | 0;
                    if ((f[i >> 2] | 0) == 4)
                        break;
                    e = c + 52 | 0;
                    b[e >> 0] = 0;
                    k = c + 53 | 0;
                    b[k >> 0] = 0;
                    a = f[a + 8 >> 2] | 0;
                    wa[f[(f[a >> 2] | 0) + 20 >> 2] & 3](a, c, d, d, 1, g);
                    if (b[k >> 0] | 0)
                        if (!(b[e >> 0] | 0)) {
                            e = 3;
                            j = 11;
                        } else
                            e = 3;
                    else {
                        e = 4;
                        j = 11;
                    }
                    if ((j | 0) == 11) {
                        f[h >> 2] = d;
                        k = c + 40 | 0;
                        f[k >> 2] = (f[k >> 2] | 0) + 1;
                        if ((f[c + 36 >> 2] | 0) == 1 ? (f[c + 24 >> 2] | 0) == 2 : 0)
                            b[c + 54 >> 0] = 1;
                    }
                    f[i >> 2] = e;
                    break;
                }
                if ((e | 0) == 1)
                    f[c + 32 >> 2] = 1;
            } else
                uc(c, d, e);
        while (0);
        return;
    }
    function Ac(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        if (sc(a, f[b + 8 >> 2] | 0) | 0)
            tc(b, c, d);
        else {
            a = f[a + 8 >> 2] | 0;
            ua[f[(f[a >> 2] | 0) + 28 >> 2] & 3](a, b, c, d);
        }
        return;
    }
    function Bc(a) {
        a = a | 0;
        ec(a);
        return;
    }
    function Cc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        e = u;
        u = u + 16 | 0;
        d = e;
        f[d >> 2] = f[c >> 2];
        a = sa[f[(f[a >> 2] | 0) + 16 >> 2] & 1](a, b, d) | 0;
        if (a)
            f[c >> 2] = f[d >> 2];
        u = e;
        return a & 1 | 0;
    }
    function Dc(a) {
        a = a | 0;
        if (!a)
            a = 0;
        else
            a = (wc(a, 80) | 0) != 0 & 1;
        return a | 0;
    }
    function Ec() {
    }
    function Fc(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0;
        if ((d | 0) >= 8192)
            return oa(a | 0, c | 0, d | 0) | 0;
        h = a | 0;
        g = a + d | 0;
        if ((a & 3) == (c & 3)) {
            while (a & 3) {
                if (!d)
                    return h | 0;
                b[a >> 0] = b[c >> 0] | 0;
                a = a + 1 | 0;
                c = c + 1 | 0;
                d = d - 1 | 0;
            }
            d = g & -4 | 0;
            e = d - 64 | 0;
            while ((a | 0) <= (e | 0)) {
                f[a >> 2] = f[c >> 2];
                f[a + 4 >> 2] = f[c + 4 >> 2];
                f[a + 8 >> 2] = f[c + 8 >> 2];
                f[a + 12 >> 2] = f[c + 12 >> 2];
                f[a + 16 >> 2] = f[c + 16 >> 2];
                f[a + 20 >> 2] = f[c + 20 >> 2];
                f[a + 24 >> 2] = f[c + 24 >> 2];
                f[a + 28 >> 2] = f[c + 28 >> 2];
                f[a + 32 >> 2] = f[c + 32 >> 2];
                f[a + 36 >> 2] = f[c + 36 >> 2];
                f[a + 40 >> 2] = f[c + 40 >> 2];
                f[a + 44 >> 2] = f[c + 44 >> 2];
                f[a + 48 >> 2] = f[c + 48 >> 2];
                f[a + 52 >> 2] = f[c + 52 >> 2];
                f[a + 56 >> 2] = f[c + 56 >> 2];
                f[a + 60 >> 2] = f[c + 60 >> 2];
                a = a + 64 | 0;
                c = c + 64 | 0;
            }
            while ((a | 0) < (d | 0)) {
                f[a >> 2] = f[c >> 2];
                a = a + 4 | 0;
                c = c + 4 | 0;
            }
        } else {
            d = g - 4 | 0;
            while ((a | 0) < (d | 0)) {
                b[a >> 0] = b[c >> 0] | 0;
                b[a + 1 >> 0] = b[c + 1 >> 0] | 0;
                b[a + 2 >> 0] = b[c + 2 >> 0] | 0;
                b[a + 3 >> 0] = b[c + 3 >> 0] | 0;
                a = a + 4 | 0;
                c = c + 4 | 0;
            }
        }
        while ((a | 0) < (g | 0)) {
            b[a >> 0] = b[c >> 0] | 0;
            a = a + 1 | 0;
            c = c + 1 | 0;
        }
        return h | 0;
    }
    function Gc(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0, i = 0;
        h = a + d | 0;
        c = c & 255;
        if ((d | 0) >= 67) {
            while (a & 3) {
                b[a >> 0] = c;
                a = a + 1 | 0;
            }
            e = h & -4 | 0;
            g = e - 64 | 0;
            i = c | c << 8 | c << 16 | c << 24;
            while ((a | 0) <= (g | 0)) {
                f[a >> 2] = i;
                f[a + 4 >> 2] = i;
                f[a + 8 >> 2] = i;
                f[a + 12 >> 2] = i;
                f[a + 16 >> 2] = i;
                f[a + 20 >> 2] = i;
                f[a + 24 >> 2] = i;
                f[a + 28 >> 2] = i;
                f[a + 32 >> 2] = i;
                f[a + 36 >> 2] = i;
                f[a + 40 >> 2] = i;
                f[a + 44 >> 2] = i;
                f[a + 48 >> 2] = i;
                f[a + 52 >> 2] = i;
                f[a + 56 >> 2] = i;
                f[a + 60 >> 2] = i;
                a = a + 64 | 0;
            }
            while ((a | 0) < (e | 0)) {
                f[a >> 2] = i;
                a = a + 4 | 0;
            }
        }
        while ((a | 0) < (h | 0)) {
            b[a >> 0] = c;
            a = a + 1 | 0;
        }
        return h - d | 0;
    }
    function Hc(a) {
        a = a | 0;
        var b = 0, c = 0;
        c = a + 15 & -16 | 0;
        b = f[r >> 2] | 0;
        a = b + c | 0;
        if ((c | 0) > 0 & (a | 0) < (b | 0) | (a | 0) < 0) {
            ca() | 0;
            na(12);
            return -1;
        }
        f[r >> 2] = a;
        if ((a | 0) > (ba() | 0) ? (aa() | 0) == 0 : 0) {
            f[r >> 2] = b;
            na(12);
            return -1;
        }
        return b | 0;
    }
    function Ic(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return ra[a & 0](b | 0, c | 0) | 0;
    }
    function Jc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        return sa[a & 1](b | 0, c | 0, d | 0) | 0;
    }
    function Kc(a, b) {
        a = a | 0;
        b = b | 0;
        ta[a & 7](b | 0);
    }
    function Lc(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        ua[a & 3](b | 0, c | 0, d | 0, e | 0);
    }
    function Mc(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        va[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0);
    }
    function Nc(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        wa[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function Oc(a, b) {
        a = a | 0;
        b = b | 0;
        _(0);
        return 0;
    }
    function Pc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        _(1);
        return 0;
    }
    function Qc(a) {
        a = a | 0;
        _(2);
    }
    function Rc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        _(3);
    }
    function Sc(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        _(4);
    }
    function Tc(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        _(5);
    }
    var ra = [Oc];
    var sa = [
        Pc,
        oc
    ];
    var ta = [
        Qc,
        kc,
        lc,
        mc,
        nc,
        xc,
        Qc,
        Qc
    ];
    var ua = [
        Rc,
        rc,
        Ac,
        Rc
    ];
    var va = [
        Sc,
        qc,
        zc,
        Sc
    ];
    var wa = [
        Tc,
        pc,
        yc,
        Tc
    ];
    return {
        ___cxa_can_catch: Cc,
        ___cxa_is_pointer_type: Dc,
        _bidi_getLine: Ha,
        _bidi_getParagraphEndIndex: Ga,
        _bidi_processText: Fa,
        _emscripten_replace_memory: qa,
        _free: ec,
        _malloc: dc,
        _memalign: ic,
        _memcpy: Fc,
        _memset: Gc,
        _sbrk: Hc,
        _ushape_arabic: Ea,
        dynCall_iii: Ic,
        dynCall_iiii: Jc,
        dynCall_vi: Kc,
        dynCall_viiii: Lc,
        dynCall_viiiii: Mc,
        dynCall_viiiiii: Nc,
        establishStackSpace: Aa,
        getTempRet0: Da,
        runPostSets: Ec,
        setTempRet0: Ca,
        setThrew: Ba,
        stackAlloc: xa,
        stackRestore: za,
        stackSave: ya
    };
}(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var ___cxa_can_catch = Module['___cxa_can_catch'] = asm['___cxa_can_catch'];
var ___cxa_is_pointer_type = Module['___cxa_is_pointer_type'] = asm['___cxa_is_pointer_type'];
var _bidi_getLine = Module['_bidi_getLine'] = asm['_bidi_getLine'];
var _bidi_getParagraphEndIndex = Module['_bidi_getParagraphEndIndex'] = asm['_bidi_getParagraphEndIndex'];
var _bidi_processText = Module['_bidi_processText'] = asm['_bidi_processText'];
var _emscripten_replace_memory = Module['_emscripten_replace_memory'] = asm['_emscripten_replace_memory'];
var _free = Module['_free'] = asm['_free'];
var _malloc = Module['_malloc'] = asm['_malloc'];
var _memalign = Module['_memalign'] = asm['_memalign'];
var _memcpy = Module['_memcpy'] = asm['_memcpy'];
var _memset = Module['_memset'] = asm['_memset'];
var _sbrk = Module['_sbrk'] = asm['_sbrk'];
var _ushape_arabic = Module['_ushape_arabic'] = asm['_ushape_arabic'];
var establishStackSpace = Module['establishStackSpace'] = asm['establishStackSpace'];
var getTempRet0 = Module['getTempRet0'] = asm['getTempRet0'];
var runPostSets = Module['runPostSets'] = asm['runPostSets'];
var setTempRet0 = Module['setTempRet0'] = asm['setTempRet0'];
var setThrew = Module['setThrew'] = asm['setThrew'];
var stackAlloc = Module['stackAlloc'] = asm['stackAlloc'];
var stackRestore = Module['stackRestore'] = asm['stackRestore'];
var stackSave = Module['stackSave'] = asm['stackSave'];
var dynCall_iii = Module['dynCall_iii'] = asm['dynCall_iii'];
var dynCall_iiii = Module['dynCall_iiii'] = asm['dynCall_iiii'];
var dynCall_vi = Module['dynCall_vi'] = asm['dynCall_vi'];
var dynCall_viiii = Module['dynCall_viiii'] = asm['dynCall_viiii'];
var dynCall_viiiii = Module['dynCall_viiiii'] = asm['dynCall_viiiii'];
var dynCall_viiiiii = Module['dynCall_viiiiii'] = asm['dynCall_viiiiii'];
Module['asm'] = asm;
Module['ccall'] = ccall;
Module['UTF16ToString'] = UTF16ToString;
Module['stringToUTF16'] = stringToUTF16;
if (memoryInitializer) {
    if (!isDataURI(memoryInitializer)) {
        if (typeof Module['locateFile'] === 'function') {
            memoryInitializer = Module['locateFile'](memoryInitializer);
        } else if (Module['memoryInitializerPrefixURL']) {
            memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
        }
    }
    if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
        var data = Module['readBinary'](memoryInitializer);
        HEAPU8.set(data, GLOBAL_BASE);
    } else {
        addRunDependency('memory initializer');
        var applyMemoryInitializer = function (data) {
            if (data.byteLength)
                data = new Uint8Array(data);
            HEAPU8.set(data, GLOBAL_BASE);
            if (Module['memoryInitializerRequest'])
                delete Module['memoryInitializerRequest'].response;
            removeRunDependency('memory initializer');
        };
        function doBrowserLoad() {
            Module['readAsync'](memoryInitializer, applyMemoryInitializer, function () {
                throw 'could not load memory initializer ' + memoryInitializer;
            });
        }
        var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
        if (memoryInitializerBytes) {
            applyMemoryInitializer(memoryInitializerBytes.buffer);
        } else if (Module['memoryInitializerRequest']) {
            function useRequest() {
                var request = Module['memoryInitializerRequest'];
                var response = request.response;
                if (request.status !== 200 && request.status !== 0) {
                    var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
                    if (data) {
                        response = data.buffer;
                    } else {
                        console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
                        doBrowserLoad();
                        return;
                    }
                }
                applyMemoryInitializer(response);
            }
            if (Module['memoryInitializerRequest'].response) {
                setTimeout(useRequest, 0);
            } else {
                Module['memoryInitializerRequest'].addEventListener('load', useRequest);
            }
        } else {
            doBrowserLoad();
        }
    }
}
function ExitStatus(status) {
    this.name = 'ExitStatus';
    this.message = 'Program terminated with exit(' + status + ')';
    this.status = status;
}
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
dependenciesFulfilled = function runCaller() {
    if (!Module['calledRun'])
        run();
    if (!Module['calledRun'])
        dependenciesFulfilled = runCaller;
};
function run(args) {
    args = args || Module['arguments'];
    if (runDependencies > 0) {
        return;
    }
    preRun();
    if (runDependencies > 0)
        return;
    if (Module['calledRun'])
        return;
    function doRun() {
        if (Module['calledRun'])
            return;
        Module['calledRun'] = true;
        if (ABORT)
            return;
        ensureInitRuntime();
        preMain();
        if (Module['onRuntimeInitialized'])
            Module['onRuntimeInitialized']();
        postRun();
    }
    if (Module['setStatus']) {
        Module['setStatus']('Running...');
        setTimeout(function () {
            setTimeout(function () {
                Module['setStatus']('');
            }, 1);
            doRun();
        }, 1);
    } else {
        doRun();
    }
}
Module['run'] = run;
function exit(status, implicit) {
    if (implicit && Module['noExitRuntime'] && status === 0) {
        return;
    }
    if (Module['noExitRuntime']) {
    } else {
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;
        exitRuntime();
        if (Module['onExit'])
            Module['onExit'](status);
    }
    if (ENVIRONMENT_IS_NODE) {
        process['exit'](status);
    }
    Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;
function abort(what) {
    if (Module['onAbort']) {
        Module['onAbort'](what);
    }
    if (what !== undefined) {
        Module.print(what);
        Module.printErr(what);
        what = JSON.stringify(what);
    } else {
        what = '';
    }
    ABORT = true;
    EXITSTATUS = 1;
    throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}
Module['abort'] = abort;
if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function')
        Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
        Module['preInit'].pop()();
    }
}
Module['noExitRuntime'] = true;
run();
'use strict';

function applyArabicShaping(input) {
    if (!input)
        { return input; }

    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var returnStringPtr = Module.ccall('ushape_arabic', 'number', ['number', 'number'], [stringInputPtr, input.length]);
    Module._free(stringInputPtr);

    if (returnStringPtr === 0)
        { return input; }

    var result = Module.UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);

    return result;
}

function mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount) {
    var mergedParagraphLineBreakPoints = [];

    for (var i = 0; i < paragraphCount; i++) {
        var paragraphEndIndex = Module.ccall('bidi_getParagraphEndIndex', 'number', ['number'], [i]);
        // TODO: Handle error?

        for (var i$1 = 0, list = lineBreakPoints; i$1 < list.length; i$1 += 1) {
            var lineBreakPoint = list[i$1];

            if (lineBreakPoint < paragraphEndIndex &&
                (!mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1] || lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1]))
                { mergedParagraphLineBreakPoints.push(lineBreakPoint); }
        }
        mergedParagraphLineBreakPoints.push(paragraphEndIndex);
    }

    for (var i$2 = 0, list$1 = lineBreakPoints; i$2 < list$1.length; i$2 += 1) {
        var lineBreakPoint$1 = list$1[i$2];

        if (lineBreakPoint$1 > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1])
            { mergedParagraphLineBreakPoints.push(lineBreakPoint$1); }
    }

    return mergedParagraphLineBreakPoints;
}

function processBidirectionalText(input, lineBreakPoints) {
    if (!input) {
        return [input];
    }

    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var paragraphCount = Module.ccall('bidi_processText', 'number', ['number', 'number'], [stringInputPtr, input.length]);

    if (paragraphCount === 0) {
        Module._free(stringInputPtr);
        return [input]; // TODO: throw exception?
    }

    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    var startIndex = 0;
    var lines = [];

    for (var i = 0, list = mergedParagraphLineBreakPoints; i < list.length; i += 1) {
        var lineBreakPoint = list[i];

        var returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [startIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(Module.UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);

        startIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

self.registerRTLTextPlugin({'applyArabicShaping': applyArabicShaping, 'processBidirectionalText': processBidirectionalText});
})();

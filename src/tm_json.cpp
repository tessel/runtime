// Copyright 2014 Technical Machine, Inc. See the COPYRIGHT
// file at the top-level directory of this distribution.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

//
// Wrapper around the rapidjson parse and stringify functions. This allows
// any C file to include the header tm_json.h and be able to call rapidjson
//

#include "tm_json.h"
#include <rapidjson/reader.h>
#include <rapidjson/writer.h>
#include <rapidjson/rapidjson.h>
#include <rapidjson/filereadstream.h>
#include <rapidjson/stringbuffer.h>
#include "tm_json_writer.h"

/* Used to call functions in the rapidjson namespace */
using namespace rapidjson;

struct StateReaderHandler : public BaseReaderHandler<> {
    StateReaderHandler() : rh_() {}

    void Default() { rh_.Default(rh_.State); }
    void Null() { rh_.Null(rh_.State); }
    void Bool(bool value) { rh_.Bool(rh_.State, value); }
    void Int(int value) { rh_.Int(rh_.State, value); }
    void Uint(unsigned value) { rh_.Uint(rh_.State, value); }
    void Int64(int64_t value) { rh_.Int64(rh_.State, value); }
    void Uint64(uint64_t value) { rh_.Uint64(rh_.State, value); }
    void Double(double value) { rh_.Double(rh_.State, value); }
    void String(const Ch* str, SizeType size, bool copy) { rh_.String(rh_.State, str, size, copy); }
    void StartObject() { rh_.StartObject(rh_.State); }
    void EndObject(SizeType size) { rh_.EndObject(rh_.State, size); }
    void StartArray() { rh_.StartArray(rh_.State); }
    void EndArray(SizeType size) { rh_.EndArray(rh_.State, size); }

    tm_json_r_handler_t rh_;
};

/* Converts string to input stream and feeds it to rapidjson Parse function */
extern "C" parse_error_t tm_json_parse(tm_json_r_handler_t rh,const char* json_s) {

  // create an input stream from the stringified json input
  StringStream is(json_s);

  // create a defaults flags GenericReader object
  Reader reader;

  StateReaderHandler handler;
  handler.rh_ = rh;

  // call rapidjson's Parser using the input stream and the given handler
  reader.Parse(is,handler);

  // return the error code and the offset
  parse_error_t ret;
  ret.code = reader.GetParseErrorCode();
  ret.offset = reader.GetErrorOffset();
  return ret;

}

/* Creates a new Writer object and returns it to C as a void pointer */
extern "C" tm_json_w_handler_t tm_json_write_create(const char* indentation, size_t indentCharCount) {

  // create the writer handler
  tm_json_w_handler_t wh;
  
  // allocate the writer and assugn in in the struct
  StringBuffer* sb = new StringBuffer();
  wh.stringBuffer = static_cast<tm_json_stringbuffer_t>(sb);

  // allocate the string buffer and assign it in the struct
  PrettyWriter<StringBuffer>* w = new PrettyWriter<StringBuffer>(*sb);
  wh.writer = static_cast<tm_json_writer_t>(w);
  w->SetIndent(indentation, indentCharCount);

  // return the actual write handler containing void pointers
  return wh;
}

/* Writes out a String using rapidjson functions */
extern "C" int tm_json_write_string(tm_json_w_handler_t wh, const char* value, size_t len) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->String(value, len);
  return 0;
}

/* Writes out a Bool using rapidjson functions */
extern "C" int tm_json_write_boolean (tm_json_w_handler_t wh, int value) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->Bool(value);
  return 0;
}

/* Writes out a Number using rapidjson functions */
extern "C" int tm_json_write_number (tm_json_w_handler_t wh, double value) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->SetDoublePrecision(12);
  w->Double(value);
  return 0;
}

/* Writes out Null using rapidjson functions */
extern "C" int tm_json_write_null (tm_json_w_handler_t wh) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->Null();
  return 0;
}

/* Writes out an object start using rapidjson functions */
extern "C" int tm_json_write_object_start (tm_json_w_handler_t wh) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->StartObject();
  return 0;
}

/* Writes out an object end using rapidjson functions */
extern "C" int tm_json_write_object_end (tm_json_w_handler_t wh) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->EndObject();
  return 0;
}

/* Writes out an array start using rapidjson functions */
extern "C" int tm_json_write_array_start (tm_json_w_handler_t wh) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->StartArray();
  return 0;
}

/* Writes out an array end using rapidjson functions */
extern "C" int tm_json_write_array_end (tm_json_w_handler_t wh) {
  PrettyWriter<StringBuffer>* w = static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  w->EndArray();
  return 0;
}

/* Returns Writer<StringBuffer>::getString() */
extern "C" const char* tm_json_write_result (tm_json_w_handler_t wh) {
  StringBuffer* sb = static_cast<StringBuffer*>(wh.stringBuffer);
  return sb->GetString();
}

/* Frees the writer, string buffer, and the struct holding them all */
extern "C" int tm_json_write_destroy(tm_json_w_handler_t wh) {
  delete static_cast<PrettyWriter<StringBuffer>*>(wh.writer);
  delete static_cast<StringBuffer*>(wh.stringBuffer);
  return 0;
}

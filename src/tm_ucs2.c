#include <utf8proc.h>

#include "tm.h"

int32_t tm_ucs2_str_charat (const uint8_t* buf, ssize_t buf_len, ssize_t index)
{
	// This is silly, don't do this.
	if (buf_len < 0) {
		buf_len = strlen((char*) buf);
	}

	const uint8_t* ptr = buf;
	int32_t dst = 0;
	while (index >= 0) {
		ssize_t bytes_read = utf8proc_iterate(ptr, buf_len, &dst);
		if (dst == -1) {
			return dst;
		}
		ptr += bytes_read;
		buf_len -= bytes_read;
		index -= dst & 0x10000 ? 2 : 1;
	}

	return index == -2
		? (dst - 0x10000) / 0x400 + 0xD800
		: dst > 0xFFFF
			? (dst - 0x10000) % 0x400 + 0xDC00
			: dst & 0xFFFF;
}

// convert UCS-2 index to offset in CESU-8 string
size_t tm_ucs2_str_lookup_16to8 (const uint8_t* buf, size_t len, size_t ucs2_index, size_t* seq_len)
{
  const uint8_t* const orig_buf = buf;
  ssize_t bytes_read;
  size_t ucs2_position = 0;
	while (ucs2_position <= ucs2_index) {        // NOTE: we read _past_ ucs2_index to get seq_len
    if (len == 0) {
      bytes_read = 0;
      break;
    }
    int32_t uchar;
		bytes_read = utf8proc_iterate(buf, len, &uchar);
    if (uchar < 0) {      // NOTE: it seems colony-compiler is sanitizing, so (currently) this shouldn't happen
      // "replace" ptr[0]
      uchar = 0xFFFD;
      bytes_read = 1;
    }
		buf += bytes_read;
		len -= bytes_read;
    // NOTE: this logic (*somewhat* incorrectly) won't split surrogate pair if `buf` is UTF-8 instead of CESU-8
    //       we can't do any better here; IMO the correct solution is for colony-compiler to ensure CESU for us
    // HOWEVER: utf8proc_iterate is very strict about UTF-8 correctness! so _that_ will be fun…
    ucs2_position += (uchar > 0xFFFF) ? 2 : 1;
	}
  *seq_len = bytes_read;
	return (buf - bytes_read) - orig_buf;
}


// convert offset in UTF-8/CESU-8 string to UCS-2 index [converts lengths, really]
size_t tm_ucs2_str_lookup_8to16 (const uint8_t* buf, size_t len)
{
  size_t ucs2_position = 0;
	while (len) {
    int32_t uchar;
		ssize_t bytes_read = utf8proc_iterate(buf, len, &uchar);
    if (uchar < 0) {
      // "convert" ptr[0] to noncharacter
      uchar = 0xFFFF;
      bytes_read = 1;
    }
		buf += bytes_read;
		len -= bytes_read;
    ucs2_position += (uchar > 0xFFFF) ? 2 : 1;
	}
	return ucs2_position;
}

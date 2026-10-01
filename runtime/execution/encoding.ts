/**
 * Seira 0.0.10-s — Encoding & Byte/Text Boundary Foundation
 *
 * Implements deterministic encoding and decoding for:
 * - UTF-8 (default text boundary)
 * - ASCII
 * - UTF-16 (LE and BE)
 * - UTF-32 (LE and BE)
 *
 * Strict Unicode scalar semantics:
 * - Never leaks JavaScript UTF-16 surrogate halves.
 * - Deterministic Result-based error handling (InvalidEncoding, UnexpectedEof, UnsupportedEncoding).
 * - Zero panics on invalid input.
 */

export type EncodeResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: string };

export type DecodeResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

function normalizeEncodingName(enc: string): string {
  const lower = enc.toLowerCase().trim();
  if (lower === 'utf-8' || lower === 'utf8') return 'utf-8';
  if (lower === 'ascii' || lower === 'us-ascii') return 'ascii';
  if (lower === 'utf-16' || lower === 'utf16' || lower === 'utf-16le' || lower === 'utf16le') return 'utf-16le';
  if (lower === 'utf-16be' || lower === 'utf16be') return 'utf-16be';
  if (lower === 'utf-32' || lower === 'utf32' || lower === 'utf-32le' || lower === 'utf32le') return 'utf-32le';
  if (lower === 'utf-32be' || lower === 'utf32be') return 'utf-32be';
  return lower;
}

/**
 * Encodes a Seira String into raw bytes using the specified encoding.
 */
export function encodeText(text: string, encoding: string = 'utf-8'): EncodeResult {
  const norm = normalizeEncodingName(encoding);

  switch (norm) {
    case 'utf-8': {
      const bytes: number[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        if (cp <= 0x7f) {
          bytes.push(cp);
        } else if (cp <= 0x7ff) {
          bytes.push(0xc0 | (cp >> 6));
          bytes.push(0x80 | (cp & 0x3f));
        } else if (cp <= 0xffff) {
          bytes.push(0xe0 | (cp >> 12));
          bytes.push(0x80 | ((cp >> 6) & 0x3f));
          bytes.push(0x80 | (cp & 0x3f));
        } else if (cp <= 0x10ffff) {
          bytes.push(0xf0 | (cp >> 18));
          bytes.push(0x80 | ((cp >> 12) & 0x3f));
          bytes.push(0x80 | ((cp >> 6) & 0x3f));
          bytes.push(0x80 | (cp & 0x3f));
        }
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    case 'ascii': {
      const bytes: number[] = [];
      let idx = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        if (cp > 0x7f) {
          return {
            ok: false,
            error: `InvalidEncoding: Character '${ch}' (U+${cp.toString(16).toUpperCase()}) at index ${idx} is outside ASCII range (0-127)`,
          };
        }
        bytes.push(cp);
        idx++;
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    case 'utf-16le': {
      const bytes: number[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        if (cp <= 0xffff) {
          bytes.push(cp & 0xff, (cp >> 8) & 0xff);
        } else {
          const adjusted = cp - 0x10000;
          const high = Math.floor(adjusted / 0x400) + 0xd800;
          const low = (adjusted % 0x400) + 0xdc00;
          bytes.push(high & 0xff, (high >> 8) & 0xff);
          bytes.push(low & 0xff, (low >> 8) & 0xff);
        }
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    case 'utf-16be': {
      const bytes: number[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        if (cp <= 0xffff) {
          bytes.push((cp >> 8) & 0xff, cp & 0xff);
        } else {
          const adjusted = cp - 0x10000;
          const high = Math.floor(adjusted / 0x400) + 0xd800;
          const low = (adjusted % 0x400) + 0xdc00;
          bytes.push((high >> 8) & 0xff, high & 0xff);
          bytes.push((low >> 8) & 0xff, low & 0xff);
        }
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    case 'utf-32le': {
      const bytes: number[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        bytes.push(cp & 0xff, (cp >> 8) & 0xff, (cp >> 16) & 0xff, (cp >> 24) & 0xff);
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    case 'utf-32be': {
      const bytes: number[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) continue;
        bytes.push((cp >> 24) & 0xff, (cp >> 16) & 0xff, (cp >> 8) & 0xff, cp & 0xff);
      }
      return { ok: true, bytes: new Uint8Array(bytes) };
    }

    default:
      return { ok: false, error: `UnsupportedEncoding: '${encoding}' is not supported.` };
  }
}

/**
 * Decodes raw bytes into a Seira String using the specified encoding.
 */
export function decodeBytes(bytes: Uint8Array, encoding: string = 'utf-8'): DecodeResult {
  const norm = normalizeEncodingName(encoding);

  switch (norm) {
    case 'utf-8': {
      let result = '';
      let i = 0;
      const len = bytes.length;

      while (i < len) {
        const b0 = bytes[i];
        if (b0 <= 0x7f) {
          result += String.fromCharCode(b0);
          i++;
        } else if ((b0 & 0xe0) === 0xc0) {
          if (b0 < 0xc2) {
            return { ok: false, error: `InvalidEncoding: Overlong 2-byte UTF-8 sequence starting with 0x${b0.toString(16)} at index ${i}` };
          }
          if (i + 1 >= len) {
            return { ok: false, error: `UnexpectedEof: Truncated 2-byte UTF-8 sequence at index ${i}` };
          }
          const b1 = bytes[i + 1];
          if ((b1 & 0xc0) !== 0x80) {
            return { ok: false, error: `InvalidEncoding: Invalid UTF-8 continuation byte 0x${b1.toString(16)} at index ${i + 1}` };
          }
          const cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
          result += String.fromCodePoint(cp);
          i += 2;
        } else if ((b0 & 0xf0) === 0xe0) {
          if (i + 2 >= len) {
            return { ok: false, error: `UnexpectedEof: Truncated 3-byte UTF-8 sequence at index ${i}` };
          }
          const b1 = bytes[i + 1];
          const b2 = bytes[i + 2];
          if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) {
            return { ok: false, error: `InvalidEncoding: Invalid UTF-8 continuation byte in 3-byte sequence at index ${i}` };
          }
          const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
          if (cp < 0x800) {
            return { ok: false, error: `InvalidEncoding: Overlong 3-byte UTF-8 sequence at index ${i}` };
          }
          if (cp >= 0xd800 && cp <= 0xdfff) {
            return { ok: false, error: `InvalidEncoding: UTF-8 sequence encodes surrogate code point U+${cp.toString(16).toUpperCase()} at index ${i}` };
          }
          result += String.fromCodePoint(cp);
          i += 3;
        } else if ((b0 & 0xf8) === 0xf0) {
          if (b0 > 0xf4) {
            return { ok: false, error: `InvalidEncoding: Invalid UTF-8 start byte 0x${b0.toString(16)} (above Unicode max) at index ${i}` };
          }
          if (i + 3 >= len) {
            return { ok: false, error: `UnexpectedEof: Truncated 4-byte UTF-8 sequence at index ${i}` };
          }
          const b1 = bytes[i + 1];
          const b2 = bytes[i + 2];
          const b3 = bytes[i + 3];
          if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) {
            return { ok: false, error: `InvalidEncoding: Invalid UTF-8 continuation byte in 4-byte sequence at index ${i}` };
          }
          const cp = ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
          if (cp < 0x10000) {
            return { ok: false, error: `InvalidEncoding: Overlong 4-byte UTF-8 sequence at index ${i}` };
          }
          if (cp > 0x10ffff) {
            return { ok: false, error: `InvalidEncoding: Code point U+${cp.toString(16).toUpperCase()} exceeds Unicode max U+10FFFF at index ${i}` };
          }
          result += String.fromCodePoint(cp);
          i += 4;
        } else {
          return { ok: false, error: `InvalidEncoding: Unexpected UTF-8 byte 0x${b0.toString(16)} at index ${i}` };
        }
      }
      return { ok: true, text: result };
    }

    case 'ascii': {
      let result = '';
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b > 0x7f) {
          return {
            ok: false,
            error: `InvalidEncoding: Byte 0x${b.toString(16)} at index ${i} is outside ASCII range (0-127)`,
          };
        }
        result += String.fromCharCode(b);
      }
      return { ok: true, text: result };
    }

    case 'utf-16le': {
      if (bytes.length % 2 !== 0) {
        return { ok: false, error: `UnexpectedEof: Incomplete UTF-16 code unit (byte length ${bytes.length} is odd)` };
      }
      let result = '';
      let i = 0;
      while (i < bytes.length) {
        const u0 = bytes[i] | (bytes[i + 1] << 8);
        i += 2;
        if (u0 >= 0xd800 && u0 <= 0xdbff) {
          if (i >= bytes.length) {
            return { ok: false, error: `UnexpectedEof: Truncated UTF-16 surrogate pair (missing low surrogate)` };
          }
          const u1 = bytes[i] | (bytes[i + 1] << 8);
          i += 2;
          if (u1 < 0xdc00 || u1 > 0xdfff) {
            return { ok: false, error: `InvalidEncoding: Expected low surrogate (0xDC00-0xDFFF) but got 0x${u1.toString(16).toUpperCase()}` };
          }
          const cp = 0x10000 + ((u0 - 0xd800) * 0x400) + (u1 - 0xdc00);
          result += String.fromCodePoint(cp);
        } else if (u0 >= 0xdc00 && u0 <= 0xdfff) {
          return { ok: false, error: `InvalidEncoding: Isolated low surrogate 0x${u0.toString(16).toUpperCase()} without high surrogate` };
        } else {
          result += String.fromCodePoint(u0);
        }
      }
      return { ok: true, text: result };
    }

    case 'utf-16be': {
      if (bytes.length % 2 !== 0) {
        return { ok: false, error: `UnexpectedEof: Incomplete UTF-16 code unit (byte length ${bytes.length} is odd)` };
      }
      let result = '';
      let i = 0;
      while (i < bytes.length) {
        const u0 = (bytes[i] << 8) | bytes[i + 1];
        i += 2;
        if (u0 >= 0xd800 && u0 <= 0xdbff) {
          if (i >= bytes.length) {
            return { ok: false, error: `UnexpectedEof: Truncated UTF-16 surrogate pair (missing low surrogate)` };
          }
          const u1 = (bytes[i] << 8) | bytes[i + 1];
          i += 2;
          if (u1 < 0xdc00 || u1 > 0xdfff) {
            return { ok: false, error: `InvalidEncoding: Expected low surrogate (0xDC00-0xDFFF) but got 0x${u1.toString(16).toUpperCase()}` };
          }
          const cp = 0x10000 + ((u0 - 0xd800) * 0x400) + (u1 - 0xdc00);
          result += String.fromCodePoint(cp);
        } else if (u0 >= 0xdc00 && u0 <= 0xdfff) {
          return { ok: false, error: `InvalidEncoding: Isolated low surrogate 0x${u0.toString(16).toUpperCase()} without high surrogate` };
        } else {
          result += String.fromCodePoint(u0);
        }
      }
      return { ok: true, text: result };
    }

    case 'utf-32le': {
      if (bytes.length % 4 !== 0) {
        return { ok: false, error: `UnexpectedEof: Incomplete UTF-32 code point (byte length ${bytes.length} is not a multiple of 4)` };
      }
      let result = '';
      for (let i = 0; i < bytes.length; i += 4) {
        const cp = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
        if (cp < 0 || cp > 0x10ffff) {
          return { ok: false, error: `InvalidEncoding: Code point 0x${cp.toString(16).toUpperCase()} exceeds valid Unicode range (0-0x10FFFF)` };
        }
        if (cp >= 0xd800 && cp <= 0xdfff) {
          return { ok: false, error: `InvalidEncoding: Code point 0x${cp.toString(16).toUpperCase()} is in reserved surrogate range` };
        }
        result += String.fromCodePoint(cp);
      }
      return { ok: true, text: result };
    }

    case 'utf-32be': {
      if (bytes.length % 4 !== 0) {
        return { ok: false, error: `UnexpectedEof: Incomplete UTF-32 code point (byte length ${bytes.length} is not a multiple of 4)` };
      }
      let result = '';
      for (let i = 0; i < bytes.length; i += 4) {
        const cp = (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3];
        if (cp < 0 || cp > 0x10ffff) {
          return { ok: false, error: `InvalidEncoding: Code point 0x${cp.toString(16).toUpperCase()} exceeds valid Unicode range (0-0x10FFFF)` };
        }
        if (cp >= 0xd800 && cp <= 0xdfff) {
          return { ok: false, error: `InvalidEncoding: Code point 0x${cp.toString(16).toUpperCase()} is in reserved surrogate range` };
        }
        result += String.fromCodePoint(cp);
      }
      return { ok: true, text: result };
    }

    default:
      return { ok: false, error: `UnsupportedEncoding: '${encoding}' is not supported.` };
  }
}

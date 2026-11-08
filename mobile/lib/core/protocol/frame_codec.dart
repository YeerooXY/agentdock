import 'dart:convert';
import 'dart:io';

const _maxFrameBytes = 5 * 1024 * 1024;

class _FrameBytes implements Sink<List<int>> {
  final bytes = <int>[];
  @override
  void add(List<int> chunk) {
    if (bytes.length + chunk.length > _maxFrameBytes) {
      throw const FormatException('Frame too large');
    }
    bytes.addAll(chunk);
  }

  @override
  void close() {}
}

/// Text frames pass through; binary frames are gzip. Both are limited to
/// 5 MB, including after decompression.
String decodeFrame(dynamic raw) {
  if (raw is String) {
    if (raw.length > _maxFrameBytes) {
      throw const FormatException('Frame too large');
    }
    return raw;
  }
  if (raw is! List<int> || raw.length > _maxFrameBytes) {
    throw const FormatException('Frame too large');
  }
  final output = _FrameBytes();
  final decoder = gzip.decoder.startChunkedConversion(output);
  decoder.add(raw);
  decoder.close();
  return utf8.decode(output.bytes);
}

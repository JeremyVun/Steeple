import 'dart:convert';

import 'package:flutter/services.dart';

import '../api/app_error.dart';

/// Backs every `Fake*Repository` (MOBILE_CONTRACTS §11): fixture JSON served
/// through the REAL `fromJson` (never hand-built objects), ~300 ms simulated
/// latency, and a settable [nextError] for error-state UI work.
class FixtureLoader {
  FixtureLoader({this.latency = const Duration(milliseconds: 300)});

  final Duration latency;

  /// Thrown (once) by the next [load] call, then cleared.
  AppError? nextError;

  Future<T> load<T>(String name, T Function(Map<String, dynamic> json) fromJson) async {
    final raw = await _read(name);
    return fromJson(raw as Map<String, dynamic>);
  }

  /// Same contract as [load], for fixtures whose JSON root is an array
  /// (e.g. `[{id, name, slug}]`) rather than an object.
  Future<List<T>> loadList<T>(
    String name,
    T Function(Map<String, dynamic> json) fromJson,
  ) async {
    final raw = await _read(name);
    return (raw as List<dynamic>).map((e) => fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<dynamic> _read(String name) async {
    await Future<void>.delayed(latency);
    final error = nextError;
    if (error != null) {
      nextError = null;
      throw error;
    }
    final raw = await rootBundle.loadString('test/fixtures/$name.json');
    return jsonDecode(raw);
  }
}

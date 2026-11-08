/// The connection identity that per-console services key their data by.
/// Services read it; only the client changes it.
abstract interface class ConsoleScope {
  /// Certificate pin of the paired PC, or empty when unpaired.
  String get activePC;

  /// Transport generation. Every reconnect or PC switch increments it.
  int get generation;

  /// The PC's console list in its wire shape.
  List<Map<String, dynamic>> get sessions;

  /// One console in its wire shape, or null when the PC no longer lists it.
  Map<String, dynamic>? sessionMap(String id);
}

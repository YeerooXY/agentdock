import 'package:flutter/foundation.dart';

/// A notifier that anyone can fire; used for the narrow DockClient channels.
class DockSignal extends ChangeNotifier {
  int count = 0;
  void fire() {
    count++;
    notifyListeners();
  }
}

import 'package:flutter/widgets.dart';

import 'app/dock_app.dart';
import 'dock_client.dart';
import 'console_theme.dart';

export 'app/dock_app.dart' show DockApp;
export 'app/dock_home.dart' show DockHome;
export 'core/format.dart' show formatBytes;
export 'core/widgets/dock_mark.dart' show DockMark;
export 'core/widgets/status_dot.dart' show StatusDot;
export 'dock_style.dart' show blue, pink, ink;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(DockApp(client: DockClient()..restore()));
}

// Compatibility export for existing terminal consumers.
final terminalTheme = ConsoleTheme.named('classic').terminal;

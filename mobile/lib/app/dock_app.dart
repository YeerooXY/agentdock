import 'package:flutter/material.dart';

import '../build_counts.dart';
import '../dock_client.dart';
import '../dock_style.dart';
import 'app_theme.dart';
import 'dock_home.dart';

class DockApp extends StatelessWidget {
  final DockClient client;
  const DockApp({super.key, required this.client});
  // One ThemeData per app theme; the client notifies often for output.
  static final _themes = <String, ThemeData>{};
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: client.appearanceSignal,
    builder: (context, _) {
      BuildCounts.hit('app.theme');
      DockAccent.theme = client.appearance.theme;
      return _app(
        _themes.putIfAbsent(client.appearance.themeId, buildDockTheme),
      );
    },
  );

  Widget _app(ThemeData theme) => MaterialApp(
    title: 'Paddock',
    debugShowCheckedModeBanner: false,
    theme: theme,
    builder: (context, child) => AnimatedBuilder(
      animation: client.appearanceSignal,
      builder: (context, _) {
        final systemScale = MediaQuery.textScalerOf(context).scale(1);
        // Keep Android accessibility scaling, while allowing a small app-level
        // adjustment so dense terminal controls remain usable on small screens.
        final effective = (systemScale * client.textScale).clamp(.85, 1.55);
        return MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(effective)),
          child: child!,
        );
      },
    ),
    home: AnimatedBuilder(
      animation: client.connectionSignal,
      builder: (_, _) {
        BuildCounts.hit('app.home');
        return DockHome(key: ValueKey(client.activePC), client: client);
      },
    ),
  );
}

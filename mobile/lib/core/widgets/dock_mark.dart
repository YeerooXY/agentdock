import 'package:flutter/material.dart';

import '../../dock_style.dart';

/// The app mark, drawn in the active theme's accent gradient.
class DockMark extends StatelessWidget {
  const DockMark({super.key});
  @override
  Widget build(BuildContext context) => ShaderMask(
    shaderCallback: (rect) =>
        LinearGradient(colors: [blue, pink]).createShader(rect),
    child: const Icon(Icons.auto_awesome, color: Colors.white),
  );
}

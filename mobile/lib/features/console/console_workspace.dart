import 'dart:math';

import 'package:flutter/material.dart';

/// Console page layout: the overview beside the terminal on tablets, or one
/// of them at a time on phones.
///
/// Both children keep the same element path across the tablet breakpoint.
/// Offstage keeps the terminal's full phone width while browsing consoles.
class ConsoleWorkspace extends StatelessWidget {
  const ConsoleWorkspace({
    super.key,
    required this.tablet,
    required this.overviewShown,
    required this.terminal,
    required this.overview,
  });

  final bool tablet;

  /// Phone layout showing the overview instead of the terminal.
  final bool overviewShown;
  final Widget terminal;
  final Widget overview;

  @override
  Widget build(BuildContext context) {
    final overviewVisible = tablet || overviewShown;
    final paneWidth = min(360.0, MediaQuery.sizeOf(context).width * .4);
    return Stack(
      children: [
        Positioned.fill(
          left: tablet ? paneWidth + 1 : 0,
          child: Offstage(offstage: overviewShown, child: terminal),
        ),
        Positioned(
          left: 0,
          top: 0,
          bottom: 0,
          right: tablet ? null : 0,
          width: tablet ? paneWidth : null,
          child: Offstage(offstage: !overviewVisible, child: overview),
        ),
        Positioned(
          left: paneWidth,
          top: 0,
          bottom: 0,
          width: 1,
          child: Offstage(
            offstage: !tablet,
            child: const VerticalDivider(width: 1),
          ),
        ),
      ],
    );
  }
}

import 'package:flutter/material.dart';

import '../connection_panel.dart';
import '../dock_client.dart';
import '../dock_style.dart';
import '../image_jobs_page.dart';
import '../tasks_page.dart';

/// Home page indexes. Index 1 is unused; remaining values stay stable.
abstract final class HomePages {
  static const console = 0, usage = 2, settings = 3, projects = 4;
}

/// App bar title for pages other than Console.
class HomePageTitle extends StatelessWidget {
  const HomePageTitle({super.key, required this.page});
  final int page;

  @override
  Widget build(BuildContext context) => Text(
    page == HomePages.projects
        ? 'Projects'
        : page == HomePages.usage
        ? 'Usage'
        : 'Settings',
    overflow: TextOverflow.ellipsis,
    maxLines: 1,
    style: TextStyle(fontSize: 20, color: pink, fontWeight: FontWeight.w600),
  );
}

/// Tasks sit in the bar, not a row of their own, so the console keeps its height.
class TasksButton extends StatelessWidget {
  const TasksButton({super.key, required this.client});
  final DockClient client;

  @override
  Widget build(BuildContext context) {
    final attention = tasksNeedingAttention(client.state['tasks']);
    return IconButton(
      tooltip: attention > 0 ? 'Tasks: $attention need you' : 'Tasks',
      onPressed: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => TasksPage(client: client)),
      ),
      icon: Badge(
        isLabelVisible: attention > 0,
        label: Text('$attention'),
        child: Icon(
          attention > 0
              ? Icons.assignment_late_outlined
              : Icons.assignment_outlined,
          color: blue,
        ),
      ),
    );
  }
}

/// Connection status with Retry and the PC address settings.
class DisconnectedBanner extends StatelessWidget {
  const DisconnectedBanner({
    super.key,
    required this.client,
    required this.onRetry,
  });
  final DockClient client;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
    color: const Color(0xff2b2035),
    child: Row(
      children: [
        const Icon(Icons.wifi_off, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(client.status, style: const TextStyle(fontSize: 12)),
        ),
        TextButton(onPressed: onRetry, child: const Text('Retry')),
        IconButton(
          tooltip: 'PC address',
          icon: const Icon(Icons.tune, size: 20),
          onPressed: () => openConnection(context, client),
        ),
      ],
    ),
  );
}

class ImageJobsChip extends StatelessWidget {
  const ImageJobsChip({super.key, required this.client});
  final DockClient client;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerRight,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ActionChip(
        avatar: const Icon(Icons.image_outlined, size: 18),
        label: const Text('Image job running'),
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ImageJobsPage(client: client)),
        ),
      ),
    ),
  );
}

class HomeNavigationBar extends StatelessWidget {
  const HomeNavigationBar({
    super.key,
    required this.page,
    required this.projectAccess,
    required this.onPage,
  });

  final int page;
  final bool projectAccess;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    final destinations = [
      HomePages.console,
      if (projectAccess) HomePages.projects,
      HomePages.usage,
      HomePages.settings,
    ];
    return NavigationBar(
      height: 64,
      labelBehavior:
          MediaQuery.textScalerOf(context).scale(14) > 22 ||
              (projectAccess && MediaQuery.sizeOf(context).width < 380)
          ? NavigationDestinationLabelBehavior.onlyShowSelected
          : NavigationDestinationLabelBehavior.alwaysShow,
      selectedIndex: destinations.contains(page)
          ? destinations.indexOf(page)
          : (projectAccess ? destinations.indexOf(HomePages.projects) : 0),
      onDestinationSelected: (value) => onPage(destinations[value]),
      destinations: [
        NavigationDestination(
          icon: Icon(Icons.terminal, color: blue),
          label: 'Console',
        ),
        if (projectAccess)
          NavigationDestination(
            icon: Icon(Icons.folder_outlined, color: blue),
            label: 'Projects',
          ),
        NavigationDestination(
          icon: Icon(Icons.bar_chart_rounded, color: blue),
          label: 'Usage',
        ),
        NavigationDestination(
          icon: Icon(Icons.settings_outlined, color: blue),
          label: 'Settings',
        ),
      ],
    );
  }
}

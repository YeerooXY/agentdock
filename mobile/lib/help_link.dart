import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class HelpLink extends StatelessWidget {
  const HelpLink({super.key});
  @override
  Widget build(BuildContext context) => TextButton(
    onPressed: () async {
      try {
        final opened = await launchUrl(
          Uri.parse(
            'https://github.com/YeerooXY/agentdock/blob/main/docs/android-setup.md',
          ),
          mode: LaunchMode.externalApplication,
        );
        if (!opened) {
          throw StateError('No browser available');
        }
      } catch (_) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Open the setup guide from Paddock on your PC.'),
            ),
          );
        }
      }
    },
    child: const Text('Privacy & setup guide'),
  );
}

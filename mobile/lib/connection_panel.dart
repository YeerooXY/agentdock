import 'package:flutter/material.dart';

import 'dock_client.dart';
import 'dock_style.dart';

void openConnection(BuildContext context, DockClient client) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => ConnectionPage(client: client)),
  );
}

class ConnectionPage extends StatefulWidget {
  final DockClient client;
  const ConnectionPage({super.key, required this.client});

  @override
  State<ConnectionPage> createState() => _ConnectionPageState();
}

class _ConnectionPageState extends State<ConnectionPage> {
  late final address = TextEditingController(
    text:
        (widget.client.pairing?['manualUrl'] ?? widget.client.pairing?['url'])
            as String? ??
        '',
  );
  bool busy = false;
  String error = '';

  @override
  void dispose() {
    address.dispose();
    super.dispose();
  }

  Future<void> save() async {
    setState(() {
      busy = true;
      error = '';
    });
    try {
      await widget.client.updateAddress(address.text);
    } catch (e) {
      if (mounted) {
        setState(
          () => error = e is FormatException
              ? e.message
              : 'Could not save the address. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('PC connection')),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: AnimatedBuilder(
          animation: widget.client,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.client.pairing?['name'] as String? ?? 'Your PC',
                style: const TextStyle(color: pink, fontSize: 22),
              ),
              const SizedBox(height: 12),
              Semantics(liveRegion: true, child: Text(widget.client.status)),
              const SizedBox(height: 24),
              TextField(
                controller: address,
                keyboardType: TextInputType.url,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(
                  labelText: 'PC address',
                  hintText: 'https://my-dock.duckdns.org:47831',
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'If your home IP changed, enter its new address or hostname with the port. Your saved PC identity still has to match.',
                style: TextStyle(height: 1.5, color: muted),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: busy ? null : save,
                icon: const Icon(Icons.link),
                label: Text(busy ? 'Connecting…' : 'Save & reconnect'),
              ),
              if (error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(error, style: const TextStyle(color: pink)),
                  ),
                ),
              const SizedBox(height: 24),
              const Text(
              'For a stable address, configure a dynamic DNS hostname in PC → Phone setup. Keep Dock running and your router forwarding rules active.',
                style: TextStyle(height: 1.5, color: muted),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

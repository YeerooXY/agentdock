import 'package:flutter/material.dart';

import 'console_surface.dart';
import 'console_theme.dart';
import 'dock_client.dart';
import 'dock_style.dart';

class ConsoleAppearanceControls extends StatefulWidget {
  final DockClient client;
  const ConsoleAppearanceControls({super.key, required this.client});
  @override
  State<ConsoleAppearanceControls> createState() =>
      _ConsoleAppearanceControlsState();
}

class _ConsoleAppearanceControlsState extends State<ConsoleAppearanceControls> {
  bool _saving = false;
  int _replay = 0;
  String _error = '';

  Future<void> _save(ConsoleAppearance value) async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = '';
    });
    try {
      await widget.client.setConsoleAppearance(value);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not save appearance. Try again.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.client,
    builder: (context, _) {
      final a = widget.client.appearance, theme = a.theme;
      final reduced = consoleMotionReduced(context);
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Phone theme', style: TextStyle(fontSize: 18, color: blue)),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            key: ValueKey(theme.id),
            initialValue: theme.id,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Theme',
              helperText: 'Colors the whole app and the console',
            ),
            items: ConsoleTheme.all
                .map(
                  (t) => DropdownMenuItem(
                    value: t.id,
                    child: Row(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: t.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Flexible(
                          child: Text(t.label, overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
            onChanged: _saving ? null : (id) => _save(a.copyWith(themeId: id)),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 156 * MediaQuery.textScalerOf(context).scale(1),
            child: ConsoleSurface(
              appearance: a,
              openingKey: _replay,
              playOpening: true,
              openingRequest: _replay,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Preview',
                      style: TextStyle(
                        color: theme.foreground,
                        fontSize: 13,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'PS >',
                      style: TextStyle(
                        color: theme.terminal.cursor,
                        fontSize: 15,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const Spacer(),
                    Text(
                      theme.effect,
                      style: TextStyle(color: theme.foreground, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: a.openingAnimations && !reduced
                  ? () => setState(() => _replay++)
                  : null,
              icon: const Icon(Icons.replay, size: 18),
              label: const Text('Replay opening'),
            ),
          ),
          DropdownButtonFormField<String>(
            key: ValueKey('lighting-${a.lighting}'),
            initialValue: a.lighting,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Lighting'),
            items: lightingStyles.entries
                .map(
                  (e) => DropdownMenuItem(value: e.key, child: Text(e.value)),
                )
                .toList(),
            onChanged: _saving ? null : (id) => _save(a.copyWith(lighting: id)),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            key: ValueKey('speed-${a.lightingSpeed}'),
            initialValue: a.lightingSpeed,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Lighting speed'),
            items: const [
              DropdownMenuItem(value: 'slow', child: Text('Slow')),
              DropdownMenuItem(value: 'normal', child: Text('Normal')),
              DropdownMenuItem(value: 'fast', child: Text('Fast')),
            ],
            onChanged: _saving
                ? null
                : (id) => _save(a.copyWith(lightingSpeed: id)),
          ),
          const SizedBox(height: 16),
          Text('Stars: ${starLevels[a.starLevel]}'),
          Slider(
            value: a.starLevel.toDouble(),
            max: 4,
            divisions: 4,
            label: starLevels[a.starLevel],
            semanticFormatterCallback: (v) => starLevels[v.round()],
            onChanged: _saving
                ? null
                : (value) => _save(a.copyWith(starLevel: value.round())),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Theme textures'),
            subtitle: const Text(
              'Painted backgrounds, such as frost for Arctic',
            ),
            value: a.textures,
            onChanged: _saving
                ? null
                : (value) => _save(a.copyWith(textures: value)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Ambient motion'),
            value: a.ambientMotion,
            subtitle: const Text('Drifting stars and lighting effects'),
            onChanged: _saving
                ? null
                : (value) => _save(a.copyWith(ambientMotion: value)),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Console animations'),
            subtitle: const Text('Theme openings and session effects'),
            value: a.openingAnimations,
            onChanged: _saving
                ? null
                : (value) => _save(a.copyWith(openingAnimations: value)),
          ),
          if (reduced)
            const Text(
              'Motion is paused by your device’s accessibility settings.',
              style: TextStyle(color: muted, fontSize: 12),
            ),
          if (_error.isNotEmpty)
            Semantics(
              liveRegion: true,
              child: Text(
                _error,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
        ],
      );
    },
  );
}

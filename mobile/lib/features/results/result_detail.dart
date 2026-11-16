import 'dart:convert';

import 'package:flutter/material.dart';

import '../../dock_client.dart';

import '../../dock_style.dart' show pink;

class ResultDetail extends StatefulWidget {
  final DockClient client;
  final Map<String, dynamic> item;
  const ResultDetail({super.key, required this.client, required this.item});
  @override
  State<ResultDetail> createState() => _ResultDetailState();
}

class _ResultDetailState extends State<ResultDetail> {
  Map<String, dynamic>? content;
  String error = '';
  bool full = false;
  late Map<String, dynamic> item;
  int version = 0;
  @override
  void initState() {
    super.initState();
    item = widget.item;
    load();
  }

  Future<void> load() async {
    final current = ++version, id = item['id'];
    try {
      final result = await widget.client.request('images.preview', {
        'id': id,
        'thumbnail': !full,
      });
      if (mounted && current == version) {
        setState(() {
          content = result as Map<String, dynamic>;
          error = '';
        });
      }
      if (!mounted || current != version) return;
    } catch (e) {
      if (mounted && current == version) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(item['title'] as String, overflow: TextOverflow.ellipsis),
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error.isNotEmpty) Text(error, style: TextStyle(color: pink)),
          if (content == null && error.isEmpty)
            const Center(child: CircularProgressIndicator()),
          if (content?['image'] != null) ...[
            InteractiveViewer(
              child: Image.memory(
                base64Decode((content!['image'] as String).split(',').last),
                semanticLabel: item['title'] as String,
              ),
            ),
            if (!full)
              TextButton(
                onPressed: () {
                  full = true;
                  load();
                },
                child: const Text('Load larger image'),
              ),
          ],
        ],
      ),
    ),
  );
}

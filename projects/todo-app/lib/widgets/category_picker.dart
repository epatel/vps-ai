import 'package:flutter/material.dart';

/// Compact picker: a DropdownButtonFormField of existing categories plus
/// a "+ New category…" sentinel that opens a text-entry dialog.
class CategoryPicker extends StatelessWidget {
  final String value;
  final List<String> categories;
  final ValueChanged<String> onChanged;
  final String label;

  const CategoryPicker({
    super.key,
    required this.value,
    required this.categories,
    required this.onChanged,
    this.label = 'Category',
  });

  static const _newSentinel = '__new__';

  Future<void> _promptForNew(BuildContext context) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New category'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'e.g. School',
            border: OutlineInputBorder(),
          ),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    if (name != null && name.isNotEmpty) {
      onChanged(name);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Build items: existing categories (deduped with current value) + sentinel.
    final items = <String>{...categories, value}.toList()
      ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

    return DropdownButtonFormField<String>(
      value: value,
      isDense: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
      ),
      items: [
        ...items.map((c) => DropdownMenuItem(value: c, child: Text(c))),
        const DropdownMenuItem(
          value: _newSentinel,
          child: Row(
            children: [
              Icon(Icons.add, size: 18),
              SizedBox(width: 8),
              Text('New category…'),
            ],
          ),
        ),
      ],
      onChanged: (v) {
        if (v == null) return;
        if (v == _newSentinel) {
          _promptForNew(context);
        } else {
          onChanged(v);
        }
      },
    );
  }
}

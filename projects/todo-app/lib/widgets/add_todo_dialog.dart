import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'package:flutter/material.dart';
import 'image_attachment_section.dart';

class AddTodoDialog extends StatefulWidget {
  final String? initialTitle;
  final String? initialDescription;
  final List<PendingImage>? initialImages;
  final List<String>? pendingServerImageIds;

  const AddTodoDialog({
    super.key,
    this.initialTitle,
    this.initialDescription,
    this.initialImages,
    this.pendingServerImageIds,
  });

  @override
  State<AddTodoDialog> createState() => _AddTodoDialogState();
}

class _AddTodoDialogState extends State<AddTodoDialog> {
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _descriptionFocus = FocusNode();
  final _formKey = GlobalKey<FormState>();
  final List<PendingImage> _pendingImages = [];
  late final List<String> _serverPendingIds;

  late final JSFunction _pasteListener;

  void _handlePaste(web.ClipboardEvent event) {
    final items = event.clipboardData?.items;
    if (items == null) return;
    for (int i = 0; i < items.length; i++) {
      final item = items[i];
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        final blob = item.getAsFile();
        if (blob == null) continue;
        final reader = web.FileReader();
        reader.onload = (web.Event e) {
          final result = reader.result;
          if (result != null) {
            final bytes = (result as JSArrayBuffer).toDart.asUint8List();
            setState(() {
              _pendingImages.add(PendingImage(
                bytes: bytes,
                filename: 'pasted-image.png',
              ));
            });
          }
        }.toJS;
        reader.readAsArrayBuffer(blob);
        return;
      }
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.initialTitle != null) {
      _titleController.text = widget.initialTitle!;
    }
    if (widget.initialDescription != null) {
      _descriptionController.text = widget.initialDescription!;
    }
    if (widget.initialImages != null) {
      _pendingImages.addAll(widget.initialImages!);
    }
    _serverPendingIds = List<String>.from(widget.pendingServerImageIds ?? []);
    _pasteListener = _handlePaste.toJS;
    web.document.addEventListener('paste', _pasteListener);
  }

  @override
  void dispose() {
    web.document.removeEventListener('paste', _pasteListener);
    _titleController.dispose();
    _descriptionController.dispose();
    _descriptionFocus.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, {
      'title': _titleController.text.trim(),
      'description': _descriptionController.text.trim(),
      'pendingImages': _pendingImages,
      'serverPendingIds': _serverPendingIds,
    });
  }

  void _insertCheckbox() {
    final text = _descriptionController.text;
    final selection = _descriptionController.selection;
    final offset = selection.isValid ? selection.baseOffset : text.length;

    // If inserting in the middle, ensure we're at a line start
    String prefix = '';
    if (offset > 0 && text.isNotEmpty && text[offset - 1] != '\n') {
      prefix = '\n';
    }
    const checkbox = '[ ] ';
    final insert = '$prefix$checkbox';

    final newText = text.substring(0, offset) + insert + text.substring(offset);
    _descriptionController.text = newText;
    final cursorPos = offset + insert.length;
    _descriptionController.selection = TextSelection.collapsed(offset: cursorPos);
    // Focus the description field
    _descriptionFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final dialogWidth = MediaQuery.of(context).size.width * 0.9;
    final maxWidth = dialogWidth.clamp(400.0, 600.0);

    return AlertDialog(
      title: const Text('New Todo'),
      content: SizedBox(
        width: maxWidth,
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Title',
                  border: OutlineInputBorder(),
                ),
                autofocus: true,
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Please enter a title';
                  }
                  return null;
                },
                onFieldSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                focusNode: _descriptionFocus,
                decoration: InputDecoration(
                  labelText: 'Description (optional)',
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.check_box_outlined),
                    tooltip: 'Add checkbox item',
                    onPressed: _insertCheckbox,
                  ),
                  helperText: 'Paste images with Ctrl+V',
                  helperStyle: TextStyle(
                    fontStyle: FontStyle.italic,
                    color: Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
                  ),
                ),
                maxLines: 5,
              ),
              ImageAttachmentSection(
                pendingImages: _pendingImages,
                serverPendingImageIds: _serverPendingIds,
                onAddPending: (p) => setState(() => _pendingImages.add(p)),
                onRemovePending: (i) => setState(() => _pendingImages.removeAt(i)),
                onRemoveServerPending: (i) => setState(() => _serverPendingIds.removeAt(i)),
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.end,
                children: [
                  ActionChip(
                    label: const Text('Cancel'),
                    onPressed: () => Navigator.pop(context),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.add, size: 18),
                    label: const Text('Add'),
                    onPressed: _submit,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

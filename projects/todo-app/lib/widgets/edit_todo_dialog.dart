import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'package:flutter/material.dart';
import '../models/todo.dart';
import '../models/todo_image.dart';
import 'image_attachment_section.dart';

class EditTodoDialog extends StatefulWidget {
  final Todo todo;

  const EditTodoDialog({super.key, required this.todo});

  @override
  State<EditTodoDialog> createState() => _EditTodoDialogState();
}

class _EditTodoDialogState extends State<EditTodoDialog> {
  late final TextEditingController _titleController;
  late final TextEditingController _descriptionController;
  final _descriptionFocus = FocusNode();
  final _formKey = GlobalKey<FormState>();
  final List<PendingImage> _pendingImages = [];
  late List<TodoImage> _existingImages;
  final List<String> _deletedImageIds = [];

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
    _titleController = TextEditingController(text: widget.todo.title);
    _descriptionController = TextEditingController(text: widget.todo.description);
    _existingImages = List.of(widget.todo.images);
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
      'action': 'save',
      'title': _titleController.text.trim(),
      'description': _descriptionController.text.trim(),
      'pendingImages': _pendingImages,
      'deletedImageIds': _deletedImageIds,
    });
  }

  Future<void> _confirmDelete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Todo'),
        content: Text('Delete "${widget.todo.title}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      Navigator.pop(context, {'action': 'delete'});
    }
  }

  void _insertCheckbox() {
    final text = _descriptionController.text;
    final selection = _descriptionController.selection;
    final offset = selection.isValid ? selection.baseOffset : text.length;

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
    _descriptionFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final dialogWidth = MediaQuery.of(context).size.width * 0.9;
    final maxWidth = dialogWidth.clamp(400.0, 600.0);

    return AlertDialog(
      title: const Text('Edit Todo'),
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
                existingImages: _existingImages,
                pendingImages: _pendingImages,
                onAddPending: (p) => setState(() => _pendingImages.add(p)),
                onRemovePending: (i) => setState(() => _pendingImages.removeAt(i)),
                onDeleteExisting: (id) => setState(() {
                  _existingImages.removeWhere((img) => img.id == id);
                  _deletedImageIds.add(id);
                }),
              ),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.end,
                children: [
                  if (!widget.todo.archived)
                    ActionChip(
                      avatar: const Icon(Icons.archive_outlined, size: 18),
                      label: const Text('Archive'),
                      onPressed: () => Navigator.pop(context, {'action': 'archive'}),
                    ),
                  if (widget.todo.archived) ...[
                    ActionChip(
                      avatar: const Icon(Icons.unarchive_outlined, size: 18),
                      label: const Text('Unarchive'),
                      onPressed: () => Navigator.pop(context, {'action': 'unarchive'}),
                    ),
                    ActionChip(
                      avatar: Icon(Icons.delete_outlined, size: 18, color: Theme.of(context).colorScheme.error),
                      label: Text('Delete', style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      onPressed: _confirmDelete,
                    ),
                  ],
                  ActionChip(
                    label: const Text('Cancel'),
                    onPressed: () => Navigator.pop(context),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.check, size: 18),
                    label: const Text('Save'),
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

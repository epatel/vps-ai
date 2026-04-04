import 'dart:async';
import 'dart:typed_data';
import 'package:web/web.dart' as web;
import 'dart:js_interop';

class SharedData {
  final String title;
  final String description;
  final bool hasSharedImages;

  SharedData({
    required this.title,
    required this.description,
    this.hasSharedImages = false,
  });
}

class SharedImage {
  final Uint8List bytes;
  final String name;

  SharedImage({required this.bytes, required this.name});
}

/// Checks the current URL for Web Share Target query parameters.
SharedData? consumeShareParams() {
  final uri = Uri.base;
  final title = uri.queryParameters['title'];
  final text = uri.queryParameters['text'];
  final url = uri.queryParameters['url'];
  final sharedImages = uri.queryParameters['shared_images'];

  if (title == null && text == null && url == null && sharedImages == null) {
    return null;
  }

  final todoTitle = (title != null && title.isNotEmpty)
      ? title
      : (text ?? url ?? 'Shared item');
  final parts = <String>[];
  if (url != null && url.isNotEmpty) parts.add(url);
  if (text != null && text.isNotEmpty && text != todoTitle) parts.add(text);
  final todoDescription = parts.join('\n');

  // Clean up URL
  final cleanUri = uri.replace(queryParameters: {});
  web.window.history.replaceState(null, '', cleanUri.toString());

  return SharedData(
    title: todoTitle,
    description: todoDescription,
    hasSharedImages: sharedImages == '1',
  );
}

/// Read shared images from IndexedDB (stored by the service worker).
Future<List<SharedImage>> readSharedImages() async {
  final completer = Completer<List<SharedImage>>();

  final request = web.window.self.indexedDB.open('share-target-db', 1);
  request.onupgradeneeded = (web.Event event) {
    final db = request.result as web.IDBDatabase;
    if (!db.objectStoreNames.contains('shared-files')) {
      final options = {'autoIncrement': true}.jsify();
      db.createObjectStore('shared-files', options as web.IDBObjectStoreParameters);
    }
  }.toJS;
  request.onsuccess = (web.Event event) {
    final db = request.result as web.IDBDatabase;
    final tx = db.transaction('shared-files'.toJS, 'readonly');
    final store = tx.objectStore('shared-files');
    final getAll = store.getAll();

    getAll.onsuccess = (web.Event e) {
      final results = <SharedImage>[];
      final items = getAll.result as JSArray;
      for (int i = 0; i < items.length; i++) {
        final item = items[i] as JSObject;
        final name = (item['name'] as JSString).toDart;
        final data = (item['data'] as JSArrayBuffer).toDart;
        results.add(SharedImage(
          bytes: data.asUint8List(),
          name: name,
        ));
      }

      // Clear the store
      final clearTx = db.transaction('shared-files'.toJS, 'readwrite');
      clearTx.objectStore('shared-files').clear();

      completer.complete(results);
    }.toJS;

    getAll.onerror = (web.Event e) {
      completer.complete([]);
    }.toJS;
  }.toJS;

  request.onerror = (web.Event event) {
    completer.complete([]);
  }.toJS;

  return completer.future;
}

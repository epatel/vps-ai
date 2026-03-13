# Flutter Demo

A Flutter web demo app with a counter feature, using Provider for state management. Built and deployed automatically via GitHub Actions.

## Running locally

```bash
flutter pub get
flutter run -d chrome
```

## Build

```bash
flutter build web --base-href /flutter_demo/ --release
```

A GitHub Actions workflow automatically builds the web output when changes are pushed to `projects/flutter_demo/` on `main`.

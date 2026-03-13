import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'features/counter/counter_page.dart';
import 'features/counter/counter_provider.dart';

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => CounterProvider()),
      ],
      child: MaterialApp(
        title: 'Flutter Demo',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        ),
        home: const CounterPage(title: 'Flutter Demo Home Page'),
      ),
    );
  }
}

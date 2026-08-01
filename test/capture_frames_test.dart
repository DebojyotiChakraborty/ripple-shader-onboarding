import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:ripple_shader_onboarding/onboarding_screen.dart';

void main() {
  testWidgets('capture ripple frames', (tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      const MaterialApp(
        debugShowCheckedModeBanner: false,
        home: OnboardingScreen(),
      ),
    );

    // Let the shader + image finish loading in real async, then settle.
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();

    const step = Duration(milliseconds: 600);
    for (var i = 0; i < 8; i++) {
      await tester.pump(step);
      await expectLater(
        find.byType(OnboardingScreen),
        matchesGoldenFile('captures/frame_$i.png'),
      );
    }
  });
}

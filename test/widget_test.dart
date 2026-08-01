import 'package:flutter_test/flutter_test.dart';

import 'package:ripple_shader_onboarding/main.dart';
import 'package:ripple_shader_onboarding/onboarding_screen.dart';

void main() {
  testWidgets('renders the onboarding screen', (tester) async {
    await tester.pumpWidget(const RippleOnboardingApp());
    await tester.pump();

    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Fallback ripple origin (screen fraction) until the asterisk's real
/// position is measured after the first layout; the epicentre then tracks
/// the centre of the asterisk circle exactly.
const _rippleCenterFallback = Offset(0.5, 0.67);

/// One spin-burst / ripple cycle, seconds. Must equal PERIOD in
/// shaders/ripple.frag: a ring is born at every cycle start, exactly when
/// the asterisk starts spinning.
const _cycle = 3.2;

/// Within a cycle the asterisk accelerates hard, then settles slowly
/// (easeInOutCubicEmphasized) over this many seconds — one full turn —
/// and rests for the remainder of the cycle.
const _spinDuration = 2.2;

/// Ripple styles selectable from the hamburger menu.
enum RippleStyle {
  ridge('Ridge ripple'),
  classic('Classic ripple');

  const RippleStyle(this.label);

  final String label;
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen>
    with TickerProviderStateMixin {
  ui.FragmentShader? _shader;
  ui.Image? _background;
  late final Ticker _ticker;
  final _time = ValueNotifier<double>(0);
  final _center = ValueNotifier<Offset>(_rippleCenterFallback);
  final _circleKey = GlobalKey();
  RippleStyle _style = RippleStyle.ridge;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((elapsed) {
      _time.value = elapsed.inMicroseconds / Duration.microsecondsPerSecond;
    });
    _load();
  }

  Future<void> _load() async {
    final program = await ui.FragmentProgram.fromAsset('shaders/ripple.frag');
    final bytes = await rootBundle.load('assets/back-img.jpg');
    final image = await decodeImageFromList(bytes.buffer.asUint8List());
    if (!mounted) {
      image.dispose();
      return;
    }
    setState(() {
      _shader = program.fragmentShader();
      _background = image;
    });
    _ticker.start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _time.dispose();
    _center.dispose();
    _background?.dispose();
    _shader?.dispose();
    super.dispose();
  }

  /// Aligns the ripple epicentre with the asterisk circle's centre as laid
  /// out on screen (the CustomPaint fills the screen, so global coordinates
  /// map 1:1 onto shader space).
  void _syncRippleCenter() {
    if (!mounted) return;
    final box = _circleKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final screen = MediaQuery.sizeOf(context);
    final c = box.localToGlobal(box.size.center(Offset.zero));
    final fraction = Offset(c.dx / screen.width, c.dy / screen.height);
    if ((fraction - _center.value).distance > 0.0005) {
      _center.value = fraction;
    }
  }

  /// Rotation angle in radians at ticker time [t]: a fast-attack,
  /// slow-settle turn at each cycle start, holding still until the next.
  static double _spinAngle(double t) {
    final u = ((t % _cycle) / _spinDuration).clamp(0.0, 1.0);
    return Curves.easeInOutCubicEmphasized.transform(u) * 2 * math.pi;
  }

  @override
  Widget build(BuildContext context) {
    final shader = _shader;
    final background = _background;
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncRippleCenter());

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (shader != null && background != null)
            CustomPaint(
              painter: _RipplePainter(
                shader: shader,
                image: background,
                time: _time,
                center: _center,
                style: _style,
              ),
            ),
          // Soft scrim so the copy stays readable over the artwork.
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: [0.4, 0.75, 1.0],
                colors: [
                  Colors.transparent,
                  Color(0x33000000),
                  Color(0x66000000),
                ],
              ),
            ),
          ),
          SafeArea(
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    children: [
                      const Spacer(flex: 55),
                      Container(
                        key: _circleKey,
                        width: 104,
                        height: 104,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0x17FFFFFF),
                        ),
                        child: AnimatedBuilder(
                          animation: _time,
                          builder: (context, child) => Transform.rotate(
                            angle: _spinAngle(_time.value),
                            child: child,
                          ),
                          child: SvgPicture.asset(
                            'assets/ring.svg',
                            width: 48,
                            height: 48,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 14,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0x12FFFFFF),
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: const Text(
                          'Enter a realm of digital personalization '
                          'like never before',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Color(0xF2FFFFFF),
                            fontSize: 14,
                            height: 1.55,
                            fontWeight: FontWeight.w400,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ),
                      const Spacer(flex: 9),
                      const _GetStartedButton(),
                      const SizedBox(height: 16),
                    ],
                  ),
                ),
                Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4, right: 8),
                    child: _StyleMenu(
                      selected: _style,
                      onSelected: (style) => setState(() => _style = style),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StyleMenu extends StatelessWidget {
  const _StyleMenu({required this.selected, required this.onSelected});

  final RippleStyle selected;
  final ValueChanged<RippleStyle> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<RippleStyle>(
      icon: const Icon(Icons.menu, color: Colors.white),
      tooltip: 'Ripple style',
      color: const Color(0xF21C1E24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final style in RippleStyle.values)
          PopupMenuItem(
            value: style,
            child: Row(
              children: [
                Icon(
                  style == selected ? Icons.check : null,
                  size: 18,
                  color: Colors.white,
                ),
                const SizedBox(width: 10),
                Text(
                  style.label,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _GetStartedButton extends StatelessWidget {
  const _GetStartedButton();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton(
        onPressed: () {},
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: const Color(0xFF16181D),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
          ),
        ),
        child: const Text('Get Started'),
      ),
    );
  }
}

class _RipplePainter extends CustomPainter {
  _RipplePainter({
    required this.shader,
    required this.image,
    required this.time,
    required this.center,
    required this.style,
  }) : super(repaint: Listenable.merge([time, center]));

  final ui.FragmentShader shader;
  final ui.Image image;
  final ValueNotifier<double> time;
  final ValueNotifier<Offset> center;
  final RippleStyle style;

  @override
  void paint(Canvas canvas, Size size) {
    shader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      // Keep the phase stable over long sessions: the pattern repeats
      // every ring period, so only time modulo a large multiple matters.
      // 240 is an exact multiple of _cycle, so the spin stays in phase.
      ..setFloat(2, time.value % 240)
      ..setFloat(3, center.value.dx)
      ..setFloat(4, center.value.dy)
      ..setFloat(5, image.width.toDouble())
      ..setFloat(6, image.height.toDouble())
      ..setFloat(7, style == RippleStyle.ridge ? 0 : 1)
      ..setImageSampler(0, image);

    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_RipplePainter oldDelegate) =>
      oldDelegate.shader != shader ||
      oldDelegate.image != image ||
      oldDelegate.style != style;
}

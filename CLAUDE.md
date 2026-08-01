# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Flutter app whose single screen is a shader-driven onboarding experience: expanding water-ripple rings refract a full-bleed background image, recreating the reference animation in `design-animation-inspiration/demo.mp4`.

## Commands

- `flutter run -d macos` (or `-d ios` / `-d chrome` etc.) — run the app
- `flutter analyze` — static analysis (flutter_lints via `analysis_options.yaml`)
- `flutter test` — run all tests
- `flutter test test/widget_test.dart` — run a single test file
- `flutter test test/capture_frames_test.dart --update-goldens` — re-render `test/captures/frame_*.png`, real shader frames at fixed timestamps; the fast way to eyeball shader changes without launching the app (and required after any intentional shader/layout change, since plain `flutter test` compares against these)
- `flutter pub get` — after changing `pubspec.yaml`

Shaders are recompiled by the normal build; a plain hot reload does not reload an edited `.frag` file — use hot restart (`R`) or rebuild.

## Architecture

The ripple effect is split between GLSL and Dart; changing it usually means touching both sides in sync:

- `shaders/ripple.frag` — a Flutter runtime effect (registered under `flutter: shaders:` in `pubspec.yaml`). Two ripple styles selected by the `uStyle` uniform: 0 = "ridge" (default; sharp-edged lens pulse matching the reference — crisp outer cutoff, long smeared inner tail) and 1 = "classic" (radial derivative-of-gaussian glass torus). Both refract the background texture and add a specular rim / trailing shadow. Ring timing/size constants (`PERIOD`, `SPEED`, per-style widths/amps) live at the top of this file — distances are normalized to screen height so the animation is resolution-independent.
- `lib/onboarding_screen.dart` — loads the shader (`FragmentProgram.fromAsset`) and the background image (`assets/back-img.jpg` decoded to `ui.Image`), then drives `uTime` with a `Ticker` feeding a `ValueNotifier` that a `CustomPainter` repaints on (no `setState` per frame). **Uniform order in `_RipplePainter.paint` must match the declaration order in `ripple.frag`** (floats are flattened: uSize.xy, uTime, uCenter.xy, uImgSize.xy, uStyle; the image sampler is set separately via `setImageSampler`). The image's `BoxFit.cover` mapping is done inside the shader (`coverUV`), so the painter passes raw image dimensions.
- **Spin/ripple sync**: the asterisk spins in bursts (fast attack, slow settle via `easeInOutCubicEmphasized`, then a pause) driven off the same ticker time as the shader. `_cycle` in `onboarding_screen.dart` must equal `PERIOD` in `ripple.frag` (3.2s) so a ring is born exactly at each spin start; the painter's `% 240` phase clamp must stay an exact multiple of the cycle.
- The screen overlay (spinning `assets/ring.svg` asterisk inside a translucent circle, copy text on a translucent rounded panel, Get Started button, and a top-right hamburger `PopupMenuButton` that switches `RippleStyle`) is plain widgets stacked above the shader; the ripple origin tracks the laid-out centre of the asterisk circle (measured post-frame via a `GlobalKey` and fed to `uCenter` through a `ValueNotifier`), with `_rippleCenterFallback` used only before the first layout.

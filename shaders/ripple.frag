#version 460 core

// Water-ripple refraction over a background image, in two styles.
//
// Style 0 "ridge" (default, matches the reference video): each ring is a
// glassy lens whose displacement peaks right at the wavefront and decays
// with a long tail toward the center. Outside the front it cuts off almost
// instantly, which reads as a crisp ridge/edge; inside, the steep gradient
// smears the image radially. Measured from the reference: a narrow dark
// line sits right at the leading edge with the subtle specular rim just
// inside it, displacement is ~0.03 H and constant over the ring's life,
// and rings leave the screen at full strength (no on-screen dissolve).
//
// Style 1 "classic": the original derivative-of-gaussian pulse (a
// travelling "glass torus") — content just inside the wavefront is pushed
// outward and content just outside is pulled inward.
//
// Ring births are periodic at PERIOD, phase-locked to uTime = 0. The Dart
// side starts the asterisk spin burst at the same phase, so a new ring is
// born exactly when a spin starts. Keep PERIOD equal to the spin cycle in
// onboarding_screen.dart.
//
// All distances are normalized so y spans [0, 1] and x is
// aspect-corrected: ring speed/width look identical on any screen.

precision highp float;

#include <flutter/runtime_effect.glsl>

uniform vec2 uSize;      // widget size, logical px
uniform float uTime;     // seconds
uniform vec2 uCenter;    // ripple origin, normalized [0..1]
uniform vec2 uImgSize;   // background image size, px
uniform float uStyle;    // 0 = ridge (reference), 1 = classic water ripple

uniform sampler2D uImage;

out vec4 fragColor;

const float PERIOD = 3.2;    // seconds between ring births = spin cycle
const float SPEED = 0.0765;  // ring expansion, screen-heights per second (measured)
const int RINGS = 4;

// Ridge style, all measured from the reference video (units: screen heights).
// The smear tail is an exponential tau: visible extent is ~3x this value,
// matching the reference's 0.05-0.07 H decay band.
const float RIDGE_SHARP = 0.004;  // outer falloff — near-step crisp edge
const float RIDGE_TAIL = 0.025;   // inner falloff tau — the smeared band
const float RIDGE_AMP = 0.033;    // peak displacement at the wavefront
const float RIDGE_DARK_POS = -0.006;   // dark leading line: centre (inside edge)
const float RIDGE_DARK_SIGMA = 0.0035; // ... and width (FWHM ~0.008 H)
const float RIDGE_RIM_POS = -0.010;    // specular rim just inside the dark line
const float RIDGE_RIM_SIGMA = 0.0022;

// The dark line holds near-full strength while the ring grows (measured
// over sky: -45/255 through r~0.36) then collapses late (-8/255 by
// r~0.55); the rim tracks it, staying a subtle +3..+6/255 net after the
// overlapping dark tail is subtracted.
// Applied multiplicatively: it dims bright sky strongly but cannot floor
// already-dark content to black (matching the reference's behaviour).
float ridgeDarkGain(float r) {
  return mix(0.26, 0.03, smoothstep(0.40, 0.55, r));
}

// Classic style.
const float SIGMA = 0.048;  // half-width of a ring band
const float AMP = 0.045;    // peak refraction displacement
const float RIM_GAIN = 0.14;    // leading-edge highlight strength
const float SHADE_GAIN = 0.10;  // trailing shadow strength

// BoxFit.cover mapping from screen uv to image uv.
vec2 coverUV(vec2 uv) {
  float screenAspect = uSize.x / uSize.y;
  float imageAspect = uImgSize.x / uImgSize.y;
  vec2 scale = screenAspect > imageAspect
      ? vec2(1.0, imageAspect / screenAspect)
      : vec2(screenAspect / imageAspect, 1.0);
  return 0.5 + (uv - 0.5) * scale;
}

void main() {
  vec2 uv = FlutterFragCoord().xy / uSize;
  float aspect = uSize.x / uSize.y;

  // Height-normalized, aspect-corrected coordinates around the origin.
  vec2 p = (uv - uCenter) * vec2(aspect, 1.0);
  float d = length(p);
  vec2 dir = d > 1e-5 ? p / d : vec2(0.0);

  bool ridge = uStyle < 0.5;

  float disp = 0.0;
  float rim = 0.0;
  float shade = 0.0;

  for (int i = 0; i < RINGS; i++) {
    float age = mod(uTime, PERIOD) + float(i) * PERIOD;
    float r = age * SPEED;

    // Quick swell after birth (the ring is already sharp when it emerges
    // from behind the asterisk disc); no on-screen dissolve — rings exit
    // the screen at full strength, the late fade only retires them.
    float a = smoothstep(0.0, 0.35, age) * (1.0 - smoothstep(0.85, 1.15, r));
    if (a < 0.002) continue;

    float x = d - r;

    if (ridge) {
      // Lens pulse: peak at the front, sharp outside, long tail inside.
      float prof = x > 0.0 ? exp(-x / RIDGE_SHARP) : exp(x / RIDGE_TAIL);
      float dg = ridgeDarkGain(r);
      // NOTE: explicit squares, not pow(t, 2.0) — pow with a negative base
      // is undefined in GLSL and poisons every pixel inside the ring.
      float tr = (x - RIDGE_RIM_POS) / RIDGE_RIM_SIGMA;
      float td = (x - RIDGE_DARK_POS) / RIDGE_DARK_SIGMA;
      disp += a * -prof;
      rim += a * (0.45 * dg + 0.012) * exp(-0.5 * tr * tr);
      shade += a * dg * exp(-0.5 * td * td);
    } else {
      // Crisp leading (outer) edge, soft trailing side.
      float xs = x / (SIGMA * (x > 0.0 ? 0.7 : 1.4));
      float g = exp(-0.5 * xs * xs);
      float tr = (xs - 1.1) / 0.4;
      float td = (xs + 0.8) / 1.1;
      disp += a * -xs * g;
      rim += a * exp(-0.5 * tr * tr);
      shade += a * exp(-0.5 * td * td);
    }
  }

  vec2 offset = dir * (disp * (ridge ? RIDGE_AMP : AMP));
  vec2 sampleUv = uv + offset / vec2(aspect, 1.0);

  vec3 col = texture(uImage, coverUV(sampleUv)).rgb;

  // Specular rim and dark leading line. Ridge gains are folded in per-ring
  // (radius dependent): its rim is guarded only against true clipping and
  // its dark line dims multiplicatively. The classic style keeps its
  // stronger sky guard and global subtractive tints.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (ridge) {
    col += vec3(0.92, 0.94, 0.90) * rim * (1.0 - 0.7 * smoothstep(0.85, 1.0, lum));
    col *= 1.0 - min(shade, 0.8);
  } else {
    col += vec3(0.92, 0.94, 0.90) * rim * RIM_GAIN * (1.0 - smoothstep(0.55, 0.95, lum));
    col -= vec3(0.10, 0.12, 0.10) * shade * SHADE_GAIN;
  }

  fragColor = vec4(col, 1.0);
}

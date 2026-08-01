#version 460 core

// Water-ripple refraction over a background image, in two styles.
//
// Style 0 "ridge" (default, matches the reference video): each ring is a
// glassy lens whose displacement peaks right at the wavefront and decays
// with a long tail toward the center. Outside the front it cuts off almost
// instantly, which reads as a crisp ridge/edge; inside, the steep gradient
// smears the image radially. A thin specular line rides the edge.
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

const float PERIOD = 3.2;   // seconds between ring births = spin cycle
const float SPEED = 0.09;   // ring expansion, screen-heights per second
const int RINGS = 4;

// Ridge style: sharp outer cutoff, long inner tail.
const float RIDGE_SHARP = 0.005;  // outer falloff — the crisp edge
const float RIDGE_TAIL = 0.085;   // inner falloff — the smeared band
const float RIDGE_AMP = 0.05;     // peak displacement at the wavefront

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

    // Swell in after birth, dissolve once the ring has left the screen.
    float a = smoothstep(0.0, 0.45, age) * (1.0 - smoothstep(0.70, 0.95, r));
    if (a < 0.002) continue;

    float x = d - r;

    if (ridge) {
      // Lens pulse: peak at the front, sharp outside, long tail inside.
      float prof = x > 0.0 ? exp(-x / RIDGE_SHARP) : exp(x / RIDGE_TAIL);
      disp += a * -prof;
      rim += a * exp(-0.5 * pow(x / 0.005, 2.0));
      shade += a * exp(-0.5 * pow((x + 0.030) / 0.035, 2.0));
    } else {
      // Crisp leading (outer) edge, soft trailing side.
      float xs = x / (SIGMA * (x > 0.0 ? 0.7 : 1.4));
      float g = exp(-0.5 * xs * xs);
      disp += a * -xs * g;
      rim += a * exp(-0.5 * pow((xs - 1.1) / 0.4, 2.0));
      shade += a * exp(-0.5 * pow((xs + 0.8) / 1.1, 2.0));
    }
  }

  vec2 offset = dir * (disp * (ridge ? RIDGE_AMP : AMP));
  vec2 sampleUv = uv + offset / vec2(aspect, 1.0);

  vec3 col = texture(uImage, coverUV(sampleUv)).rgb;

  // Specular rim, held back on already-bright pixels so the sky can't clip.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += vec3(0.92, 0.94, 0.90) * rim * RIM_GAIN * (1.0 - smoothstep(0.55, 0.95, lum));
  col -= vec3(0.10, 0.12, 0.10) * shade * SHADE_GAIN;

  fragColor = vec4(col, 1.0);
}

import type { BurnHandle } from './burn';
import { RenderBudget } from './performance';
import { transitionScale, fadePaper } from './scene-utils';

/** Bound vertex count even on very large or unusually narrow sheets. */
export function pixelGrid(width: number, height: number) {
  const limit = width <= 700 ? 5000 : 10000;
  let size = Math.max(5, Math.sqrt(width * height / limit));
  let columns = Math.max(1, Math.ceil(width / size));
  let rows = Math.max(1, Math.ceil(height / size));
  while (columns * rows > limit) {
    size *= 1.02;
    columns = Math.max(1, Math.ceil(width / size));
    rows = Math.max(1, Math.ceil(height / size));
  }
  return { columns, rows };
}

const timing = `
float birth(vec2 cell, float seed) {
  float wave = .5 + .5 * sin(cell.x * 9. + cell.y * 4.);
  return .1 + 2.5 * (cell.y * .70 + cell.x * .04 + wave * .10 + seed * .16);
}`;
const paperVertex = `
precision mediump float;
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`;
const paperFragment = `
precision mediump float;
uniform sampler2D u_paper;
uniform sampler2D u_seeds;
uniform vec2 u_grid;
uniform float u_time;
varying vec2 v_uv;
${timing}
void main() {
  vec2 cell = (floor(v_uv * u_grid) + .5) / u_grid;
  float seed = texture2D(u_seeds, cell).r;
  if (u_time >= birth(cell, seed)) discard;
  gl_FragColor = texture2D(u_paper, v_uv);
}`;
const dustVertex = `
precision mediump float;
attribute vec3 a_particle;
uniform vec2 u_resolution;
uniform vec2 u_grid;
uniform float u_scale;
uniform float u_time;
varying float v_alpha;
varying vec2 v_rotation;
varying float v_shape;
varying float v_fold;
varying float v_tone;
varying float v_softness;
${timing}
void main() {
  vec2 uv = a_particle.xy;
  float seed = a_particle.z;
  float age = u_time - birth(uv, seed);
  float life = .85 + seed * .35;
  float t = clamp(age / life, 0., 1.);
  v_alpha = (1. - smoothstep(.28, 1., t)) * step(0., age);
  float angle = seed * 6.28318 + age * (seed - .5) * 3.
    + sin(age * 5. + seed * 19.) * .3;
  v_rotation = vec2(cos(angle), sin(angle));
  v_shape = seed;
  // Thin flakes briefly turn edge-on, rather than spinning like confetti.
  v_fold = .38 + .62 * abs(cos(age * (2. + seed * 3.) + seed * 5.));
  v_tone = .88 + seed * .12;
  v_softness = .1;
  if (age < 0. || age >= life) {
    gl_Position = vec4(2., 2., 0., 1.); gl_PointSize = 1.; return;
  }
  float phase = seed * 38. + uv.y * 12.;
  // Start at the exact source position, then accelerate into a curling gust.
  float gust = age * age;
  vec2 travel = vec2(
    gust * (100. + seed * 200.) + sin(age * 7. + phase) * age * 22.,
    age * (14. + seed * 26.) + gust * (115. + seed * 180.)
      + sin(age * 5. + phase) * age * 10.);
  vec2 position = uv + travel / u_resolution;
  gl_Position = vec4(position * 2. - 1., 0., 1.);
  float size = max(u_resolution.x / u_grid.x, u_resolution.y / u_grid.y);
  float flakeSize = .55 + fract(seed * 31.7) * .85;
  gl_PointSize = max(.6, size * flakeSize * u_scale * (1. - .94 * smoothstep(0., 1., t)));
  v_softness = min(.5, 1. / gl_PointSize);
}`;
const dustFragment = `
precision mediump float;
uniform vec3 u_particleColor;
varying float v_alpha;
varying vec2 v_rotation;
varying float v_shape;
varying float v_fold;
varying float v_tone;
varying float v_softness;
void main() {
  if (v_alpha < .005) discard;
  vec2 p = gl_PointCoord * 2. - 1.;
  p = mat2(v_rotation.x, -v_rotation.y, v_rotation.y, v_rotation.x) * p;
  p.x /= v_fold;
  float phase = v_shape * 23.;
  // Asymmetric, bent flakes with chipped edges instead of regular polygons.
  p.x += sin(p.y * 5. + phase) * .13;
  vec2 flake = p * vec2(1., 1.15 + v_shape * 1.3);
  float torn = sin(p.y * 17. + phase) * .055
    + sin(p.x * 23. - p.y * 11. + phase * 1.7) * .045;
  float edge = length(flake) - .64 + torn;
  vec2 chip = vec2(.36 - v_shape * .12, -.20 + v_shape * .32);
  edge = max(edge, .17 - length(flake - chip));
  float softness = min(.45, v_softness / v_fold);
  float alpha = v_alpha * (1. - smoothstep(-softness, softness, edge));
  if (alpha < .005) discard;
  float fibre = .94 + .06 * sin(p.y * 24. + phase);
  gl_FragColor = vec4(u_particleColor * v_tone * fibre * alpha, alpha);
}`;

/** A paper mask and GPU point sprites: two draws, no DOM/CPU particle loop. */
export function disintegratePaper(host: HTMLDivElement, snapshot: HTMLCanvasElement, ready: () => void): BurnHandle {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true,
    antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (!gl) return fadePaper(host, snapshot, ready);
  const textures: WebGLTexture[] = [], buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [];
  const release = () => {
    for (const texture of textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      gl.deleteTexture(texture);
    }
    buffers.forEach(b => gl.deleteBuffer(b)); shaders.forEach(s => gl.deleteShader(s));
    programs.forEach(p => gl.deleteProgram(p));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.width = canvas.height = 0;
  };
  const initial = host.getBoundingClientRect();
  const grid = pixelGrid(Math.max(1, initial.width), Math.max(1, initial.height));
  const count = grid.columns * grid.rows;
  let sheet!: WebGLProgram, dust!: WebGLProgram, quad!: WebGLBuffer, points!: WebGLBuffer;
  try {
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram(); if (!p) throw new Error('program'); programs.push(p);
      for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type); if (!s) throw new Error('shader'); shaders.push(s);
        gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader compilation');
        gl.attachShader(p, s);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(p);
      gl.uniform1i(gl.getUniformLocation(p, 'u_paper'), 0);
      gl.uniform2f(gl.getUniformLocation(p, 'u_grid'), grid.columns, grid.rows);
      return p;
    };
    sheet = program(paperVertex, paperFragment); dust = program(dustVertex, dustFragment);
    const dark = document.documentElement.dataset.theme === 'dark';
    // Warm mineral greys: pale ash on the dark desk, graphite ash on light.
    const ash = dark ? [170, 166, 158] : [119, 115, 108];
    gl.uniform3f(gl.getUniformLocation(dust, 'u_particleColor'),
      ash[0] / 255, ash[1] / 255, ash[2] / 255);
    const texture = (unit: number, filter: number) => {
      const t = gl.createTexture(); if (!t) throw new Error('texture'); textures.push(t);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    texture(0, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snapshot);
    const seeds = new Uint8Array(count * 4), particles = new Float32Array(count * 3);
    let seed = 82971;
    for (let y = 0; y < grid.rows; y++) for (let x = 0; x < grid.columns; x++) {
      const i = y * grid.columns + x;
      seed = Math.imul(seed, 1664525) + 1013904223 | 0;
      seeds[i * 4] = seeds[i * 4 + 1] = seeds[i * 4 + 2] = seed >>> 24; seeds[i * 4 + 3] = 255;
      particles.set([(x + .5) / grid.columns, (y + .5) / grid.rows, seeds[i * 4] / 255], i * 3);
    }
    texture(1, gl.NEAREST); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, grid.columns, grid.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, seeds);
    gl.useProgram(sheet); gl.uniform1i(gl.getUniformLocation(sheet, 'u_seeds'), 1);
    const buffer = (data: Float32Array) => {
      const b = gl.createBuffer(); if (!b) throw new Error('buffer'); buffers.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b;
    };
    quad = buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])); points = buffer(particles);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('upload');
  } catch { release(); return fadePaper(host, snapshot, ready); }

  const budget = new RenderBudget();
  const paperTime = gl.getUniformLocation(sheet, 'u_time'), dustTime = gl.getUniformLocation(dust, 'u_time');
  const resolution = gl.getUniformLocation(dust, 'u_resolution'), rasterScale = gl.getUniformLocation(dust, 'u_scale');
  const paperPosition = gl.getAttribLocation(sheet, 'a_position'), dustPosition = gl.getAttribLocation(dust, 'a_particle');
  const layout = () => {
    const rect = host.getBoundingClientRect(), width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const scale = transitionScale(width, height, devicePixelRatio, budget.level);
    canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(dust); gl.uniform2f(resolution, width, height); gl.uniform1f(rasterScale, scale);
  };
  host.append(canvas); layout();
  const resize = new ResizeObserver(layout); resize.observe(host);
  let stopped = false, frame = 0, resolve!: () => void;
  const finished = new Promise<void>(done => { resolve = done; });
  const finish = () => {
    if (stopped) return;
    stopped = true; cancelAnimationFrame(frame); clearTimeout(timeout); resize.disconnect();
    canvas.removeEventListener('webglcontextlost', lost); canvas.remove(); release();
    snapshot.width = snapshot.height = 0; resolve();
  };
  const lost = (event: Event) => { event.preventDefault(); finish(); };
  canvas.addEventListener('webglcontextlost', lost);
  const timeout = setTimeout(finish, 6000), start = performance.now(); let previous = start;
  const draw = (now: number) => {
    if (stopped) return;
    try {
      const time = (now - start) / 1000;
      if (time >= 4) { finish(); return; }
      if (now > previous && budget.observe((now - previous) / 1000)) layout();
      previous = now;
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND); gl.useProgram(sheet); gl.uniform1f(paperTime, time);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(paperPosition);
      gl.vertexAttribPointer(paperPosition, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disableVertexAttribArray(paperPosition);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(dust); gl.uniform1f(dustTime, time);
      gl.bindBuffer(gl.ARRAY_BUFFER, points); gl.enableVertexAttribArray(dustPosition);
      gl.vertexAttribPointer(dustPosition, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, count); gl.disableVertexAttribArray(dustPosition);
      frame = requestAnimationFrame(draw);
    } catch { finish(); }
  };
  draw(start); ready();
  return { finished, cancel: finish };
}

/**
 * Animated "swirling paint" background for the launcher, in the spirit of
 * Balatro's menu backdrop. Rendered at low resolution and scaled up with
 * pixelated filtering. Falls back to the CSS gradient on <body> when WebGL
 * is unavailable, draws a single still frame for prefers-reduced-motion,
 * and is torn down by stopBackground() before the game starts.
 */
(function () {
    const canvas = document.getElementById("bg")
    if (!canvas) return

    const SCALE = 1 / 4 // Render resolution relative to CSS pixels.
    const FRAME_MS = 1000 / 30

    let gl = null
    try {
        gl = canvas.getContext("webgl", { antialias: false, depth: false, stencil: false, powerPreference: "low-power" })
    } catch {
        gl = null
    }
    if (!gl) {
        canvas.remove()
        return
    }

    const vertexSource = `
        attribute vec2 pos;
        void main() { gl_Position = vec4(pos, 0.0, 1.0); }
    `

    const fragmentSource = `
        precision mediump float;
        uniform vec2 res;
        uniform float t;

        const vec3 RED  = vec3(0.80, 0.25, 0.21);
        const vec3 BLUE = vec3(0.03, 0.40, 0.66);
        const vec3 DARK = vec3(0.09, 0.13, 0.14);

        void main() {
            vec2 uv = (gl_FragCoord.xy - 0.5 * res) / length(res) * 2.0;
            float r = length(uv);

            // Swirl: rotate more towards the centre, slowly over time.
            float a = atan(uv.y, uv.x) + 2.2 / (0.45 + r) + t * 0.05;
            vec2 p = vec2(cos(a), sin(a)) * r * 9.0;

            // Fold the plane a few times for a smeared-paint look.
            for (int i = 0; i < 5; i++) {
                float fi = float(i);
                p += 0.7 * vec2(
                    sin(p.y * 0.75 + t * 0.21 + fi * 1.7),
                    cos(p.x * 0.75 - t * 0.17 + fi * 2.3)
                );
            }

            float v = 0.5 + 0.5 * sin(p.x * 0.9 + p.y * 0.6);
            float w = 0.5 + 0.5 * sin(p.y * 0.8 - p.x * 0.5 + t * 0.15);

            // Hard-ish bands, like posterised paint.
            float redBand = smoothstep(0.55, 0.62, v);
            float blueBand = smoothstep(0.5, 0.57, w) * (1.0 - redBand);

            vec3 col = DARK;
            col = mix(col, RED, redBand);
            col = mix(col, BLUE, blueBand);

            // Thin lighter streaks along the band edges.
            float streak = (1.0 - smoothstep(0.0, 0.035, abs(v - 0.585))) + (1.0 - smoothstep(0.0, 0.035, abs(w - 0.535))) * (1.0 - redBand);
            col += streak * 0.07;

            // Keep it subdued so the panels stay readable, and darken the edges.
            col *= 0.6 * (1.0 - 0.3 * smoothstep(0.5, 1.4, r));
            gl_FragColor = vec4(col, 1.0);
        }
    `

    function compile(type, source) {
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed")
        }
        return shader
    }

    let program
    try {
        program = gl.createProgram()
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource))
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource))
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || "Shader link failed")
        }
    } catch (err) {
        console.warn("Background disabled:", err)
        canvas.remove()
        return
    }

    gl.useProgram(program)

    // One triangle that covers the whole screen.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const posLocation = gl.getAttribLocation(program, "pos")
    gl.enableVertexAttribArray(posLocation)
    gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0)

    const resLocation = gl.getUniformLocation(program, "res")
    const timeLocation = gl.getUniformLocation(program, "t")

    function resize() {
        const width = Math.max(1, Math.round(window.innerWidth * SCALE))
        const height = Math.max(1, Math.round(window.innerHeight * SCALE))
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
            gl.viewport(0, 0, width, height)
        }
    }

    const start = performance.now()
    // Start part-way in, so the still frame isn't the plain initial state.
    const T0 = 40

    function draw(now) {
        resize()
        gl.uniform2f(resLocation, canvas.width, canvas.height)
        gl.uniform1f(timeLocation, T0 + (now - start) / 1000)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null

    let frame = 0
    let last = 0
    let stopped = false

    function loop(now) {
        if (stopped) return
        frame = requestAnimationFrame(loop)
        if (now - last < FRAME_MS) return
        last = now
        draw(now)
    }

    function startOrStill() {
        cancelAnimationFrame(frame)
        if (stopped) return
        if (reducedMotion && reducedMotion.matches) {
            draw(start)
        } else {
            frame = requestAnimationFrame(loop)
        }
    }

    window.addEventListener("resize", () => {
        if (!stopped && reducedMotion && reducedMotion.matches) draw(start)
    })
    if (reducedMotion && reducedMotion.addEventListener) {
        reducedMotion.addEventListener("change", startOrStill)
    }

    startOrStill()

    /** Stop rendering and release the WebGL context (called before the game starts). */
    window.stopBackground = function () {
        if (stopped) return
        stopped = true
        cancelAnimationFrame(frame)
        const lose = gl.getExtension("WEBGL_lose_context")
        if (lose) lose.loseContext()
        canvas.remove()
    }
})()

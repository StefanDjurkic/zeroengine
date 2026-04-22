// Bundled sample apps shared by the landing home (index.html) and the
// Playground (jspp.html). Each entry is effectively a .zeroapp bundle:
// a JSPP program + a display mode. Opening one stashes it in sessionStorage
// under "zeroengine.pending-app" and navigates to jspp.html, which picks it
// up and boots the app view.
export const SAMPLE_APPS = [
    {
        key: "bouncy",
        icon: "[B]",
        name: "Bouncy Balls",
        description: "24 colored balls bouncing inside a 640x520 box with dt-based physics.",
        mode: "2d",
        source:
`let N = 24;
let balls = [];
for (let i = 0; i < N; i = i + 1) {
    balls.push({
        x:  40 + rand() * 560,
        y:  40 + rand() * 440,
        vx: -140 + rand() * 280,
        vy: -140 + rand() * 280,
        r:  10 + rand() * 14,
        cr: randInt(120, 255),
        cg: randInt(120, 255),
        cb: randInt(120, 255)
    });
}
let lastT = 0.0;
function tick(t) {
    let dt = t - lastT;
    if (dt < 0.0) { dt = 0.0; }
    if (dt > 0.1) { dt = 0.1; }
    lastT = t;
    clear(12, 18, 28);
    for (let i = 0; i < N; i = i + 1) {
        let b = balls[i];
        b.x = b.x + b.vx * dt;
        b.y = b.y + b.vy * dt;
        if (b.x < b.r)         { b.x = b.r;         b.vx = -b.vx; }
        if (b.x > 640.0 - b.r) { b.x = 640.0 - b.r; b.vx = -b.vx; }
        if (b.y < b.r)         { b.y = b.r;         b.vy = -b.vy; }
        if (b.y > 520.0 - b.r) { b.y = 520.0 - b.r; b.vy = -b.vy; }
        drawCircle(b.x, b.y, b.r, b.cr, b.cg, b.cb);
    }
}
print("bouncy balls armed:", N);
`
    },
    {
        key: "particles",
        icon: "[P]",
        name: "Particle Field",
        description: "400 particles on rotating, pulsing orbits. Heavy per-frame workload — watch C++ chew through it.",
        mode: "2d",
        source:
`let N = 400;
let ps = [];
for (let i = 0; i < N; i = i + 1) {
    ps.push({
        r:  80 + rand() * 220,
        a:  rand() * 6.28,
        sp: 0.2 + rand() * 1.4,
        ph: rand() * 6.28,
        rad: 2 + rand() * 3.5,
        cr: randInt(120, 255),
        cg: randInt(120, 255),
        cb: randInt(120, 255)
    });
}
function tick(t) {
    clear(6, 9, 18);
    for (let i = 0; i < N; i = i + 1) {
        let p = ps[i];
        let a = p.a + t * p.sp;
        let pulse = 1.0 + Math.sin(t * 2.0 + p.ph) * 0.25;
        let x = 320 + Math.cos(a) * p.r * pulse;
        let y = 260 + Math.sin(a) * p.r * pulse;
        drawCircle(x, y, p.rad, p.cr, p.cg, p.cb);
    }
}
print("particles armed:", N);
`
    },
    {
        key: "starfield",
        icon: "[S]",
        name: "Starfield",
        description: "Warp-speed starfield: 300 stars streaking outward from the center.",
        mode: "2d",
        source:
`let N = 300;
let stars = [];
for (let i = 0; i < N; i = i + 1) {
    stars.push({
        a: rand() * 6.2831,
        r: rand() * 320.0,
        sp: 60.0 + rand() * 220.0,
        br: randInt(140, 255)
    });
}
function tick(t) {
    clear(2, 4, 10);
    for (let i = 0; i < N; i = i + 1) {
        let s = stars[i];
        s.r = s.r + s.sp * 0.016;
        if (s.r > 340.0) { s.r = 4.0 + rand() * 20.0; s.a = rand() * 6.2831; }
        let x = 320.0 + Math.cos(s.a) * s.r;
        let y = 260.0 + Math.sin(s.a) * s.r;
        let sz = 0.5 + s.r * 0.008;
        drawCircle(x, y, sz, s.br, s.br, s.br);
    }
}
print("starfield armed:", N);
`
    },
    {
        key: "pendulum",
        icon: "[T]",
        name: "Pendulum Clock",
        description: "A swinging double-pendulum with a trailing comet of past positions.",
        mode: "2d",
        source:
`let L1 = 140.0;
let L2 = 120.0;
let trailN = 90;
let trail = [];
for (let i = 0; i < trailN; i = i + 1) { trail.push({ x: 320.0, y: 260.0 }); }
let head = 0;
function tick(t) {
    clear(8, 12, 22);
    let a1 = Math.sin(t * 1.3) * 1.2;
    let a2 = Math.sin(t * 1.9 + 0.7) * 1.8;
    let x1 = 320.0 + Math.sin(a1) * L1;
    let y1 = 180.0 + Math.cos(a1) * L1;
    let x2 = x1    + Math.sin(a1 + a2) * L2;
    let y2 = y1    + Math.cos(a1 + a2) * L2;
    trail[head].x = x2;
    trail[head].y = y2;
    head = head + 1;
    if (head >= trailN) { head = 0; }
    for (let i = 0; i < trailN; i = i + 1) {
        let p = trail[i];
        let age = i - head;
        if (age < 0) { age = age + trailN; }
        let fade = age * 2;
        drawCircle(p.x, p.y, 2.0, 120 + fade, 200, 255 - fade);
    }
    drawLine(320.0, 180.0, x1, y1, 180, 200, 220);
    drawLine(x1, y1, x2, y2, 180, 200, 220);
    drawCircle(320.0, 180.0, 5.0, 220, 220, 220);
    drawCircle(x1, y1, 8.0, 34, 211, 238);
    drawCircle(x2, y2, 12.0, 167, 139, 250);
}
print("pendulum armed");
`
    },
    {
        key: "ripples",
        icon: "[R]",
        name: "Ripples",
        description: "Concentric ripples expanding from randomly seeded points.",
        mode: "2d",
        source:
`let NR = 8;
let ripples = [];
for (let i = 0; i < NR; i = i + 1) {
    ripples.push({
        x: 80.0 + rand() * 480.0,
        y: 60.0 + rand() * 400.0,
        born: rand() * -2.0,
        cr: randInt(120, 255),
        cg: randInt(120, 255),
        cb: randInt(120, 255)
    });
}
function tick(t) {
    clear(4, 6, 14);
    for (let i = 0; i < NR; i = i + 1) {
        let r = ripples[i];
        let age = t - r.born;
        if (age > 3.0) {
            r.x = 80.0 + rand() * 480.0;
            r.y = 60.0 + rand() * 400.0;
            r.born = t;
            r.cr = randInt(120, 255);
            r.cg = randInt(120, 255);
            r.cb = randInt(120, 255);
            age = 0.0;
        }
        let rad = age * 120.0;
        drawCircle(r.x, r.y, rad,        r.cr, r.cg, r.cb);
        drawCircle(r.x, r.y, rad * 0.7,  r.cr, r.cg, r.cb);
        drawCircle(r.x, r.y, rad * 0.45, r.cr, r.cg, r.cb);
    }
}
print("ripples armed:", NR);
`
    },
    {
        key: "cube3d",
        icon: "[3]",
        name: "3D Rotating Cube",
        description: "Drives a real Three.js cube via setRotation / setFaceColor. Pure JSPP, no JS.",
        mode: "3d",
        source:
`function tick(t) {
    setRotation(t * 0.7, t * 1.1);
    setScale(1.0 + Math.sin(t * 2.0) * 0.1);
    for (let i = 0; i < 6; i = i + 1) {
        let hue = t + i * 1.05;
        let r = 128 + Math.sin(hue)        * 120;
        let g = 128 + Math.sin(hue + 2.09) * 120;
        let b = 128 + Math.sin(hue + 4.18) * 120;
        setFaceColor(i, r, g, b);
    }
}
print("cube armed");
`
    }
];

export function appToPending(app) {
    return {
        name: app.name,
        version: app.version || "0.1.0",
        description: app.description,
        author: "ZeroEngine Samples",
        mode: app.mode,
        icon: app.icon,
        entry: app.key + ".jspp",
        source: app.source,
        root: "<built-in sample>",
        loadedAt: Date.now(),
    };
}

// Персональный скрипт шаблона resources/views/welcome.blade.php: игра «Блоха».
// Блоха бежит сама, игрок прыгает через расчёски и проскакивает под каплями шампуня.
// Чем дольше удерживается прыжок, тем выше прыгает блоха.

const W = 600; // логическая ширина поля
const H = 200; // логическая высота поля (холст 3:1)
const GROUND_Y = 172; // линия земли

const FLEA_X = 56;
const FLEA_W = 34;
const FLEA_H = 24;

const GRAVITY = 2400; // ед./с²
const JUMP_SPEED = 520; // начальная скорость прыжка
const HOLD_GRAVITY = 0.35; // доля гравитации, пока прыжок удерживается
const HOLD_MAX = 0.22; // сколько секунд удержание продлевает подъём

const START_SPEED = 300;
const MAX_SPEED = 680;
const ACCELERATION = 7; // прирост скорости в секунду

const RESTART_DELAY = 450; // мс: защита от случайного рестарта сразу после столкновения
const BEST_KEY = 'flea-game-best';
const CHARACTER_KEY = 'flea-game-character';

// Персонажи отличаются только внешним видом: физика и хитбокс у всех одинаковые.
const CHARACTERS = {
    flea: { ready: 'Блоха готова' },
    ladybug: { ready: 'Божья коровка готова' },
    ant: { ready: 'Муравей готов' },
};
const DEFAULT_CHARACTER = 'flea';

const COLOR_VARS = {
    sky: '--color-flea-sky',
    ground: '--color-flea-ground',
    body: '--color-flea-body',
    legs: '--color-flea-legs',
    shine: '--color-flea-shine',
    comb: '--color-flea-comb',
    drop: '--color-flea-drop',
    text: '--color-flea-text',
    ladybugBody: '--color-ladybug-body',
    ladybugSpots: '--color-ladybug-spots',
    ladybugHead: '--color-ladybug-head',
    ladybugLegs: '--color-ladybug-legs',
    antBody: '--color-ant-body',
    antLegs: '--color-ant-legs',
};

// Лапки: точка крепления относительно центра тела, сдвиг фазы бега, размах шага.
const FLEA_LEGS = [
    { hip: 8, offset: 0, reach: 4 },
    { hip: 1, offset: 2.1, reach: 3 },
    { hip: -6, offset: 4.2, reach: 7, hind: true },
];
const SHORT_LEGS = [
    { hip: 7, offset: 0, reach: 3 },
    { hip: 0, offset: 2.1, reach: 3 },
    { hip: -7, offset: 4.2, reach: 3 },
];
const ANT_LEGS = [
    { hip: 3, offset: 0, reach: 6 },
    { hip: 0, offset: 2.1, reach: 6 },
    { hip: -3, offset: 4.2, reach: 6 },
];

const BUTTON_LABELS = {
    idle: 'Играть',
    running: 'Сначала',
    paused: 'Продолжить',
    over: 'Ещё раз',
};

function initFleaGame(root) {
    const canvas = root.querySelector('[data-flea-canvas]');
    const startButton = root.querySelector('[data-flea-start]');
    const scoreEl = root.querySelector('[data-flea-score]');
    const bestEl = root.querySelector('[data-flea-best]');
    const characterPicker = root.querySelector('[data-flea-characters]');
    const characterInputs = root.querySelectorAll('[data-flea-character]');
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx || !startButton) {
        return;
    }

    const colors = {};
    let font = 'system-ui, sans-serif';

    let state = 'idle'; // idle | running | paused | over
    let speed = START_SPEED;
    let distance = 0;
    let score = 0;
    let best = readBest();
    let character = readCharacter();
    let shownScore = -1;
    let overAt = 0;

    const flea = { y: 0, vy: 0, holding: false, holdTime: 0, squash: 0, phase: 0 };
    let obstacles = [];
    let spawnIn = 0;
    let groundOffset = 0;

    let frameId = 0;
    let unitsPerPx = 1; // сколько логических единиц в одном CSS-пикселе холста
    let lastTime = 0;

    // ---------- Подготовка ----------

    function readColors() {
        const styles = getComputedStyle(document.documentElement);

        for (const [key, cssVar] of Object.entries(COLOR_VARS)) {
            colors[key] = styles.getPropertyValue(cssVar).trim();
        }

        font = getComputedStyle(document.body).fontFamily || font;
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();

        if (rect.width === 0) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        unitsPerPx = W / rect.width;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
        render();
    }

    function readBest() {
        try {
            return Number.parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
        } catch {
            return 0;
        }
    }

    function saveBest() {
        try {
            localStorage.setItem(BEST_KEY, String(best));
        } catch {
            // localStorage недоступен (приватный режим и т. п.) — рекорд живёт до перезагрузки
        }
    }

    function readCharacter() {
        try {
            const saved = localStorage.getItem(CHARACTER_KEY);

            return Object.hasOwn(CHARACTERS, saved ?? '') ? saved : DEFAULT_CHARACTER;
        } catch {
            return DEFAULT_CHARACTER;
        }
    }

    function saveCharacter() {
        try {
            localStorage.setItem(CHARACTER_KEY, character);
        } catch {
            // без localStorage выбор действует до перезагрузки
        }
    }

    function selectCharacter(next) {
        if (!Object.hasOwn(CHARACTERS, next)) {
            return;
        }

        character = next;
        root.dataset.character = character;

        for (const input of characterInputs) {
            input.checked = input.value === character;
        }

        render();
    }

    // ---------- Состояния ----------

    function reset() {
        speed = START_SPEED;
        distance = 0;
        score = 0;
        obstacles = [];
        spawnIn = W * 0.6;
        groundOffset = 0;
        Object.assign(flea, { y: 0, vy: 0, holding: false, holdTime: 0, squash: 0, phase: 0 });
    }

    function setState(next) {
        state = next;
        startButton.textContent = BUTTON_LABELS[state];
        root.dataset.state = state;

        // Персонажа меняем только вне забега.
        if (characterPicker) {
            characterPicker.disabled = state === 'running';
        }
    }

    function start() {
        reset();
        setState('running');
        updateHud(true);
        runLoop();
    }

    function resume() {
        setState('running');
        runLoop();
    }

    function pause() {
        if (state !== 'running') {
            return;
        }

        setState('paused');
        flea.holding = false;
        render();
    }

    function gameOver() {
        setState('over');
        overAt = performance.now();
        flea.holding = false;

        if (score > best) {
            best = score;
            saveBest();
        }

        updateHud(true);
        render();
    }

    // ---------- Управление ----------

    function jump() {
        if (flea.y > 0 || flea.vy > 0) {
            return;
        }

        flea.vy = JUMP_SPEED;
        flea.holding = true;
        flea.holdTime = 0;
    }

    function press() {
        if (state === 'running') {
            jump();
        } else if (state === 'paused') {
            resume();
        } else if (state === 'idle' || (state === 'over' && performance.now() - overAt > RESTART_DELAY)) {
            start();
            jump();
        }
    }

    function release() {
        flea.holding = false;
    }

    function isJumpKey(event) {
        return event.code === 'Space' || event.code === 'ArrowUp';
    }

    function capturesKeys() {
        return state === 'running' || document.activeElement === canvas;
    }

    document.addEventListener('keydown', (event) => {
        if (!isJumpKey(event) || !capturesKeys()) {
            return;
        }

        event.preventDefault();

        if (!event.repeat) {
            press();
        }
    });

    document.addEventListener('keyup', (event) => {
        if (isJumpKey(event)) {
            release();
        }
    });

    canvas.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        canvas.focus({ preventScroll: true });
        press();
    });

    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => {
        release();
        pause();
    });

    for (const input of characterInputs) {
        input.addEventListener('change', () => {
            if (input.checked) {
                selectCharacter(input.value);
                saveCharacter();
            }
        });
    }

    startButton.addEventListener('click', () => {
        if (state === 'paused') {
            resume();
        } else {
            start();
        }

        canvas.focus({ preventScroll: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pause();
        }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        readColors();
        render();
    });

    // ---------- Игровой цикл ----------

    function runLoop() {
        cancelAnimationFrame(frameId);
        lastTime = performance.now();
        frameId = requestAnimationFrame(tick);
    }

    function tick(now) {
        const dt = Math.min((now - lastTime) / 1000, 1 / 30);
        lastTime = now;

        if (state === 'running') {
            update(dt);
        }

        render();

        if (state === 'running') {
            frameId = requestAnimationFrame(tick);
        }
    }

    function update(dt) {
        speed = Math.min(MAX_SPEED, speed + ACCELERATION * dt);
        distance += speed * dt;
        score = Math.floor(distance / 10);
        groundOffset += speed * dt;

        updateFlea(dt);
        updateObstacles(dt);

        if (obstacles.some(hitsFlea)) {
            gameOver();

            return;
        }

        updateHud(false);
    }

    function updateFlea(dt) {
        flea.squash = Math.max(0, flea.squash - dt * 4);

        if (flea.y <= 0 && flea.vy <= 0) {
            flea.phase += dt * speed / 22;

            return;
        }

        const held = flea.holding && flea.holdTime < HOLD_MAX && flea.vy > 0;
        flea.holdTime += dt;
        flea.vy -= GRAVITY * (held ? HOLD_GRAVITY : 1) * dt;
        flea.y += flea.vy * dt;

        if (flea.y <= 0) {
            flea.y = 0;
            flea.vy = 0;
            flea.holding = false;
            flea.squash = 0.6;
        }
    }

    function updateObstacles(dt) {
        for (const obstacle of obstacles) {
            obstacle.x -= speed * dt;
            obstacle.age += dt;
        }

        obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);

        spawnIn -= speed * dt;

        if (spawnIn <= 0) {
            const obstacle = createObstacle();
            obstacles.push(obstacle);
            // Минимальный разрыв — чтобы после любого прыжка блоха успела приземлиться.
            const minGap = speed * 0.9 + 90;
            spawnIn = obstacle.w + minGap * (1 + Math.random() * 0.7);
        }
    }

    function createObstacle() {
        const roll = Math.random();

        if (score >= 250 && roll < 0.25) {
            // Капля шампуня: висит над землёй, под ней проходим по земле.
            return { type: 'drop', x: W + 10, w: 18, h: 24, bottom: 36, age: 0 };
        }

        if (score >= 100 && roll < 0.55) {
            // Высокая расчёска: нужен долгий прыжок.
            const teeth = 3 + Math.floor(Math.random() * 2);

            return { type: 'comb', x: W + 10, w: teeth * 5 + 1, h: 64 + Math.random() * 8, bottom: 0, teeth, age: 0 };
        }

        const teeth = 3 + Math.floor(Math.random() * 6);

        return { type: 'comb', x: W + 10, w: teeth * 5 + 1, h: 24 + Math.random() * 10, bottom: 0, teeth, age: 0 };
    }

    function obstacleBottom(obstacle) {
        if (obstacle.type === 'drop') {
            return obstacle.bottom + Math.sin(obstacle.age * 5) * 3;
        }

        return obstacle.bottom;
    }

    function hitsFlea(obstacle) {
        const inset = 5;
        const fleaLeft = FLEA_X + inset;
        const fleaRight = FLEA_X + FLEA_W - inset;
        const fleaBottom = flea.y + 2;
        const fleaTop = flea.y + FLEA_H - inset;

        const pad = obstacle.type === 'drop' ? 3 : 1.5;
        const left = obstacle.x + pad;
        const right = obstacle.x + obstacle.w - pad;
        const bottom = obstacleBottom(obstacle) + (obstacle.type === 'drop' ? pad : 0);
        const top = obstacleBottom(obstacle) + obstacle.h - pad;

        return fleaRight > left && fleaLeft < right && fleaTop > bottom && fleaBottom < top;
    }

    function updateHud(force) {
        if (force || score !== shownScore) {
            shownScore = score;
            scoreEl.textContent = String(score);
        }

        bestEl.textContent = String(best);
    }

    // ---------- Отрисовка ----------

    function render() {
        ctx.fillStyle = colors.sky;
        ctx.fillRect(0, 0, W, H);

        drawGround();
        obstacles.forEach(drawObstacle);
        drawPlayer();
        drawOverlay();
    }

    function drawGround() {
        ctx.fillStyle = colors.ground;
        ctx.fillRect(0, GROUND_Y, W, 1.5);

        // Шерстинки под землёй, бегут вместе с полем.
        const step = 12;
        const shift = groundOffset % step;
        const base = Math.floor(groundOffset / step);

        ctx.strokeStyle = colors.ground;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();

        for (let i = 0; i <= W / step + 1; i++) {
            const seed = hash(base + i);
            const x = i * step - shift + seed * 6;
            const length = 3 + seed * 6;
            const y = GROUND_Y + 4 + ((seed * 7) % 1) * 12;

            ctx.moveTo(x, y);
            ctx.lineTo(x - 2, y + length);
        }

        ctx.stroke();
    }

    function hash(n) {
        const s = Math.sin(n * 127.1) * 43758.5453;

        return s - Math.floor(s);
    }

    function drawObstacle(obstacle) {
        if (obstacle.type === 'drop') {
            drawDrop(obstacle);
        } else {
            drawComb(obstacle);
        }
    }

    function drawComb(obstacle) {
        const top = GROUND_Y - obstacle.h;
        const spine = 6;

        ctx.fillStyle = colors.comb;
        ctx.beginPath();
        ctx.roundRect(obstacle.x, top, obstacle.w, spine, 2);
        ctx.fill();

        for (let i = 0; i < obstacle.teeth; i++) {
            ctx.beginPath();
            ctx.roundRect(obstacle.x + 1 + i * 5, top + spine - 1, 3, obstacle.h - spine + 1, [0, 0, 1.5, 1.5]);
            ctx.fill();
        }
    }

    function drawDrop(obstacle) {
        const bottomY = GROUND_Y - obstacleBottom(obstacle);
        const topY = bottomY - obstacle.h;
        const r = obstacle.w / 2;
        const cx = obstacle.x + r;
        const cy = bottomY - r;

        ctx.fillStyle = colors.drop;
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.bezierCurveTo(cx + r * 0.3, topY + obstacle.h * 0.3, cx + r, cy - r * 0.4, cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI);
        ctx.bezierCurveTo(cx - r, cy - r * 0.4, cx - r * 0.3, topY + obstacle.h * 0.3, cx, topY);
        ctx.fill();

        ctx.globalAlpha = 0.7;
        ctx.fillStyle = colors.shine;
        ctx.beginPath();
        ctx.ellipse(cx - r * 0.4, cy - r * 0.2, r * 0.18, r * 0.35, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawPlayer() {
        const bottom = GROUND_Y - flea.y;
        const left = FLEA_X;
        const onGround = flea.y <= 0;

        // Сжатие при приземлении и вытягивание при взлёте.
        let squash = flea.squash * 0.25;

        if (!onGround && flea.vy > 150) {
            squash = -0.12;
        }

        ctx.save();
        ctx.translate(left + FLEA_W / 2, bottom);
        ctx.scale(1 + squash, 1 - squash);
        ctx.translate(-(left + FLEA_W / 2), -bottom);

        if (character === 'ladybug') {
            drawLadybug(left, bottom, onGround);
        } else if (character === 'ant') {
            drawAnt(left, bottom, onGround);
        } else {
            drawFlea(left, bottom, onGround);
        }

        ctx.restore();
    }

    function drawFlea(left, bottom, onGround) {
        const cx = left + 14;
        const cy = bottom - 13;

        drawLegs(cx, cy, bottom, onGround, { color: colors.legs, width: 1.8, legs: FLEA_LEGS });

        // Тело
        ctx.fillStyle = colors.body;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 13, 9, -0.18, 0, Math.PI * 2);
        ctx.fill();

        // Сегменты брюшка
        ctx.strokeStyle = colors.legs;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();

        for (const dx of [-6, -1, 4]) {
            ctx.moveTo(cx + dx, cy - 8);
            ctx.quadraticCurveTo(cx + dx - 2, cy, cx + dx, cy + 8);
        }

        ctx.stroke();
        ctx.globalAlpha = 1;

        // Голова
        ctx.fillStyle = colors.body;
        ctx.beginPath();
        ctx.ellipse(cx + 13, cy - 3, 6.5, 5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Хоботок и усик
        ctx.strokeStyle = colors.legs;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 18, cy);
        ctx.lineTo(cx + 21, cy + 5);
        ctx.moveTo(cx + 15, cy - 7);
        ctx.quadraticCurveTo(cx + 19, cy - 13, cx + 23, cy - 11);
        ctx.stroke();

        // Глаз
        ctx.fillStyle = colors.legs;
        ctx.beginPath();
        ctx.arc(cx + 15, cy - 4, 1.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = colors.shine;
        ctx.beginPath();
        ctx.arc(cx + 15.6, cy - 4.6, 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Блик на спинке
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.ellipse(cx - 2, cy - 5, 6, 2, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawLadybug(left, bottom, onGround) {
        const cx = left + 15;
        const base = bottom - 4;

        drawLegs(cx, bottom - 9, bottom, onGround, { color: colors.ladybugLegs, width: 1.6, legs: SHORT_LEGS });

        // Голова и усики
        ctx.fillStyle = colors.ladybugHead;
        ctx.beginPath();
        ctx.arc(cx + 13, base - 4, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = colors.ladybugLegs;
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 15, base - 8);
        ctx.quadraticCurveTo(cx + 18, base - 13, cx + 21, base - 12);
        ctx.stroke();

        ctx.fillStyle = colors.shine;
        ctx.beginPath();
        ctx.arc(cx + 15.5, base - 5, 1.1, 0, Math.PI * 2);
        ctx.fill();

        // Купол надкрылий
        ctx.fillStyle = colors.ladybugBody;
        ctx.beginPath();
        ctx.ellipse(cx, base, 14, 13, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();

        // Точки
        ctx.fillStyle = colors.ladybugSpots;

        for (const [dx, dy, r] of [[-7, -7, 2.6], [1, -10, 2.4], [8, -5, 2.1], [-2, -3, 2], [-11, -2, 1.6]]) {
            ctx.beginPath();
            ctx.arc(cx + dx, base + dy, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Блик
        ctx.fillStyle = colors.shine;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.ellipse(cx - 3, base - 10, 5, 1.8, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawAnt(left, bottom, onGround) {
        drawLegs(left + 18, bottom - 15, bottom, onGround, { color: colors.antLegs, width: 1.4, legs: ANT_LEGS });

        ctx.fillStyle = colors.antBody;

        // Брюшко, грудь и голова
        ctx.beginPath();
        ctx.ellipse(left + 7, bottom - 12, 8, 6, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(left + 18, bottom - 12, 5.5, 3.2, -0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(left + 27, bottom - 14, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Перемычки между сегментами, жвалы и коленчатые усики
        ctx.strokeStyle = colors.antBody;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(left + 13, bottom - 12);
        ctx.lineTo(left + 23, bottom - 13);
        ctx.stroke();

        ctx.strokeStyle = colors.antLegs;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(left + 30, bottom - 12);
        ctx.lineTo(left + 33, bottom - 10);
        ctx.moveTo(left + 27, bottom - 18);
        ctx.lineTo(left + 28, bottom - 24);
        ctx.lineTo(left + 34, bottom - 22);
        ctx.stroke();

        // Глаз и блик на брюшке
        ctx.fillStyle = colors.shine;
        ctx.beginPath();
        ctx.arc(left + 28.5, bottom - 15, 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.ellipse(left + 5, bottom - 15, 4, 1.6, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function drawLegs(cx, cy, bottom, onGround, { color, width, legs }) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        for (const leg of legs) {
            const hipX = cx + leg.hip;
            const hipY = cy + 5;
            let footX;
            let footY;

            if (onGround) {
                const swing = Math.sin(flea.phase + leg.offset);
                const lift = Math.max(0, Math.cos(flea.phase + leg.offset));
                footX = hipX + swing * leg.reach;
                footY = bottom - lift * 3;
            } else {
                // В полёте лапки вытянуты назад, задняя — сильнее.
                footX = hipX - (leg.hind ? 10 : 5);
                footY = bottom - (leg.hind ? 1 : 3);
            }

            const kneeX = leg.hind ? hipX - 6 : (hipX + footX) / 2 + 2;
            const kneeY = leg.hind ? hipY - 2 : (hipY + footY) / 2 - 2;

            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
        }

        ctx.stroke();
    }

    function drawOverlay() {
        const messages = {
            idle: [CHARACTERS[character].ready, 'Пробел, ↑ или касание — старт'],
            paused: ['Пауза', 'Пробел или касание — продолжить'],
            over: [`Игра окончена: ${score}`, 'Пробел или касание — ещё раз'],
        };
        const message = messages[state];

        if (!message) {
            return;
        }

        ctx.fillStyle = colors.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Текст держит читаемый размер на экране при любой ширине поля.
        const titleSize = Math.min(30, Math.max(20, 18 * unitsPerPx));
        const hintSize = Math.min(24, Math.max(13, 13 * unitsPerPx));
        const hintY = 62 + titleSize / 2 + hintSize;

        ctx.font = `600 ${titleSize}px ${font}`;
        ctx.fillText(message[0], W / 2, 62);
        ctx.font = `400 ${hintSize}px ${font}`;
        ctx.globalAlpha = 0.75;
        ctx.fillText(message[1], W / 2, hintY);
        ctx.globalAlpha = 1;
    }

    // ---------- Запуск ----------

    readColors();
    selectCharacter(character);
    setState('idle');
    updateHud(true);
    new ResizeObserver(resize).observe(canvas);
    resize();
}

const fleaGame = document.querySelector('[data-flea-game]');

if (fleaGame) {
    initFleaGame(fleaGame);
}

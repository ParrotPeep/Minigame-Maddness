const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const mapPath   = window.MAP_IMAGE    || "../Pixle platformer/SampleA.png";
const hitboxPath = window.HITBOX_IMAGE || "../Pixle platformer/hitboxSampleA.png";
const walk0Path = window.WALK_FRAME_0  || "../Pixle platformer/Tiles/Characters/tile_0000.png";
const walk1Path = window.WALK_FRAME_1  || "../Pixle platformer/Tiles/Characters/tile_0001.png";
const coin0Path = window.COIN_FRAME_0  || "../Pixle platformer/Tiles/tile_0151.png";
const coin1Path = window.COIN_FRAME_1  || "../Pixle platformer/Tiles/tile_0152.png";
const keyPath   = window.KEY_SPRITE    || "../Pixle platformer/Tiles/tile_0027.png";

// Kill zone for the double spike tile near the tree base
const fallbackKillZones = [
  { x: 455, y: 478, w: 48, h: 47 },
];

const fallbackSolids = [
  { x: 0, y: 460, w: 918, h: 55 },
  { x: 0, y: 280, w: 243, h: 46 },
  { x: 66, y: 326, w: 177, h: 66 },
  { x: 32, y: 390, w: 104, h: 30 },
  { x: 104, y: 423, w: 139, h: 37 },
  { x: 250, y: 350, w: 31, h: 40 },
  { x: 420, y: 398, w: 147, h: 62 },
  { x: 714, y: 390, w: 104, h: 70 },
  { x: 752, y: 260, w: 95, h: 130 },
  { x: 442, y: 286, w: 62, h: 10 },
];

const world = {
  width: 918,
  height: 515,
  gravity: 1700,
  solids: fallbackSolids,
  killZones: fallbackKillZones,
};

const player = {
  x: 350,
  y: 820,
  w: 72,
  h: 72,
  vx: 0,
  vy: 0,
  speed: 220,
  jumpVel: -760,
  grounded: false,
  facing: 1,
  animTimer: 0,
  animIndex: 0,
  idlePulse: 0,
};

// Collision box matches the inner green body, not the full bubble sprite.
const playerHitbox = {
  offsetX: 18,
  offsetY: 45,
  w: 36,
  h: 27,
};

const render = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

const camera = {
  x: 0,
  y: 0,
  viewW: 320,
  viewH: 180,
};

const keys = new Set();
let last = 0;

const assets = {
  map: null,
  hitbox: null,
  walk0: null,
  walk1: null,
  coin0: null,
  coin1: null,
  key: null,
};

// Collectibles — scaled from SampleA (918×515) to new world (1536×1024)
// SampleA positions: coins ~(638,52) (658,80) (597,108) | key ~(322,275)
const collectibles = [
  { type: 'coin', x: 1067, y: 103, w: 48, h: 48, collected: false },
  { type: 'coin', x: 1101, y: 159, w: 48, h: 48, collected: false },
  { type: 'coin', x:  998, y: 215, w: 48, h: 48, collected: false },
  { type: 'key',  x:  608, y: 462, w: 48, h: 28, collected: false },
];
let coinAnimTimer = 0;
let coinAnimFrame = 0;

// Mystery box — yellow floating block left of the tree
const mysteryBoxes = [
  { x: 420, y: 260, w: 48, h: 48, used: false },
];
let mysteryCoins = 0;

// Bounce pad on the cloud platform (upper-right area)
const bouncePads = [
  { x: 1020, y: 210, w: 48, h: 16 },
];
const bounceVel = -1400;

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));

start();

async function start() {
  assets.map   = await loadImageSafe(mapPath);
  assets.hitbox = await loadImageSafe(hitboxPath);
  assets.walk0 = await loadImageSafe(walk0Path);
  assets.walk1 = await loadImageSafe(walk1Path);
  assets.coin0 = await loadImageSafe(coin0Path);
  assets.coin1 = await loadImageSafe(coin1Path);
  assets.key   = await loadImageSafe(keyPath);

  if (assets.map) {
    world.width  = assets.map.width;
    world.height = assets.map.height;
  }
  if (assets.hitbox) {
    const { solids: maskSolids, killZones: maskKillZones } = buildSolidsFromMask(assets.hitbox, world.width, world.height);
    if (maskSolids.length > 0) world.solids = maskSolids;
    if (maskKillZones.length > 0) world.killZones = maskKillZones;
  }

  resize();
  requestAnimationFrame(loop);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const coverScale = Math.max(canvas.width / world.width, canvas.height / world.height);
  render.scale = Math.max(1, coverScale);

  camera.viewW = canvas.width / render.scale;
  camera.viewH = canvas.height / render.scale;

  render.offsetX = 0;
  render.offsetY = 0;
}

function loop(ts) {
  const dt = Math.min((ts - last) / 1000 || 0, 0.033);
  last = ts;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function update(dt) {
  const left = keys.has("ArrowLeft") || keys.has("KeyA");
  const right = keys.has("ArrowRight") || keys.has("KeyD");
  const jump = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("Space");

  if (left === right) {
    player.vx = 0;
  } else if (left) {
    player.vx = -player.speed;
    player.facing = -1;
  } else {
    player.vx = player.speed;
    player.facing = 1;
  }

  if (jump && player.grounded) {
    player.vy = player.jumpVel;
    player.grounded = false;
  }

  player.vy += world.gravity * dt;

  player.x += player.vx * dt;
  resolveAxis("x");

  player.y += player.vy * dt;
  player.grounded = false;
  resolveAxis("y");

  if (Math.abs(player.vx) > 0 && player.grounded) {
    player.animTimer += dt;
    if (player.animTimer >= 0.12) {
      player.animTimer = 0;
      player.animIndex = (player.animIndex + 1) % 2;
    }
  } else {
    player.animIndex = 0;
    player.animTimer = 0;
  }

  player.idlePulse += dt * 6;

  camera.x = clamp(player.x - camera.viewW * 0.45, 0, Math.max(0, world.width - camera.viewW));
  camera.y = clamp(player.y - camera.viewH * 0.55, 0, Math.max(0, world.height - camera.viewH));

  const body = getPlayerBody();
  for (const zone of world.killZones) {
    if (overlap(body, zone)) {
      respawn();
      break;
    }
  }

  for (const item of collectibles) {
    if (!item.collected && overlap(body, item)) {
      item.collected = true;
    }
  }

  coinAnimTimer += dt;
  if (coinAnimTimer >= 0.15) {
    coinAnimTimer = 0;
    coinAnimFrame = (coinAnimFrame + 1) % 2;
  }

  if (player.y > world.height + 120) {
    respawn();
  }
}

function resolveAxis(axis) {
  const body = getPlayerBody();

  for (const solid of world.solids) {
    if (!overlap(body, solid)) continue;

    if (axis === "x") {
      if (player.vx > 0) player.x = solid.x - playerHitbox.offsetX - playerHitbox.w;
      else if (player.vx < 0) player.x = solid.x + solid.w - playerHitbox.offsetX;
      player.vx = 0;
    } else {
      if (player.vy > 0) {
        player.y = solid.y - playerHitbox.offsetY - playerHitbox.h;
        player.grounded = true;
      } else if (player.vy < 0) {
        player.y = solid.y + solid.h - playerHitbox.offsetY;
      }
      player.vy = 0;
    }

    body.x = player.x + playerHitbox.offsetX;
    body.y = player.y + playerHitbox.offsetY;
  }

  // Mystery boxes — solid from all sides; hitting from below awards a coin
  for (const box of mysteryBoxes) {
    if (!overlap(body, box)) continue;

    if (axis === "x") {
      if (player.vx > 0) player.x = box.x - playerHitbox.offsetX - playerHitbox.w;
      else if (player.vx < 0) player.x = box.x + box.w - playerHitbox.offsetX;
      player.vx = 0;
    } else {
      if (player.vy > 0) {
        player.y = box.y - playerHitbox.offsetY - playerHitbox.h;
        player.grounded = true;
      } else if (player.vy < 0) {
        player.y = box.y + box.h - playerHitbox.offsetY;
        if (!box.used) {
          box.used = true;
          mysteryCoins++;
        }
      }
      player.vy = 0;
    }

    body.x = player.x + playerHitbox.offsetX;
    body.y = player.y + playerHitbox.offsetY;
  }

  // Bounce pads — launch player upward on landing
  if (axis === "y" && player.vy > 0) {
    for (const pad of bouncePads) {
      if (!overlap(body, pad)) continue;
      player.y = pad.y - playerHitbox.offsetY - playerHitbox.h;
      player.vy = bounceVel;
      player.grounded = false;
      body.x = player.x + playerHitbox.offsetX;
      body.y = player.y + playerHitbox.offsetY;
    }
  }
}

function draw() {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(render.offsetX, render.offsetY);
  ctx.scale(render.scale, render.scale);

  if (assets.map) {
    ctx.drawImage(
      assets.map,
      Math.round(-camera.x),
      Math.round(-camera.y),
      world.width,
      world.height
    );
  } else {
    ctx.fillStyle = "#b8d7db";
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  }

  for (const item of collectibles) {
    if (item.collected) continue;
    const sprite = item.type === 'key'
      ? assets.key
      : (coinAnimFrame === 0 ? assets.coin0 : assets.coin1);
    if (sprite) {
      ctx.drawImage(sprite, item.x - camera.x, item.y - camera.y, item.w, item.h);
    }
  }

  ctx.restore();

  // Draw player in screen space with integer-sized pixels for a crisper sprite.
  drawPlayer();
  drawHUD();
}

function drawHUD() {
  const coinsCollected = collectibles.filter(c => c.type === 'coin' && c.collected).length + mysteryCoins;
  const totalCoins = collectibles.filter(c => c.type === 'coin').length + mysteryBoxes.length;
  const hasKey = collectibles.find(c => c.type === 'key')?.collected;

  const pad = 12;
  const coinSize = 24;

  ctx.save();

  // Coin icon
  const coinSprite = coinAnimFrame === 0 ? assets.coin0 : assets.coin1;
  if (coinSprite) {
    ctx.drawImage(coinSprite, pad, pad, coinSize, coinSize);
  } else {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(pad, pad, coinSize, coinSize);
  }

  // Coin count text
  ctx.font = 'bold 20px Verdana';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;
  ctx.textBaseline = 'top';
  ctx.fillText(`${coinsCollected} / ${totalCoins}`, pad + coinSize + 6, pad + 2);

  // Key icon
  const keyX = pad + coinSize + 6 + ctx.measureText(`${coinsCollected} / ${totalCoins}`).width + 16;
  if (assets.key) {
    ctx.drawImage(assets.key, keyX, pad, 40, 24);
  }
  if (hasKey) {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.fillRect(keyX - 2, pad - 2, 44, 28);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(keyX, pad, 40, 24);
  }

  ctx.restore();
}

function drawPlayer() {
  const frame = player.animIndex === 0 ? assets.walk0 : assets.walk1;
  const idleOffset = player.grounded && Math.abs(player.vx) < 1
    ? -Math.abs(Math.sin(player.idlePulse) * 1.5)
    : 0;

  const worldX = player.x - camera.x;
  const worldY = player.y - camera.y + idleOffset;
  const px = Math.round(worldX * render.scale + render.offsetX);
  const py = Math.round(worldY * render.scale + render.offsetY);
  const pw = Math.max(1, Math.round(player.w * render.scale));
  const ph = Math.max(1, Math.round(player.h * render.scale));

  if (!frame) {
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(px, py, pw, ph);
    return;
  }

  ctx.save();
  if (player.facing === 1) {
    ctx.translate(px + pw, py);
    ctx.scale(-1, 1);
    ctx.drawImage(frame, 0, 0, pw, ph);
  } else {
    ctx.drawImage(frame, px, py, pw, ph);
  }
  ctx.restore();
}

function buildSolidsFromMask(maskImg, worldWidth, worldHeight) {
  const offscreen = document.createElement("canvas");
  offscreen.width = maskImg.width;
  offscreen.height = maskImg.height;

  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(maskImg, 0, 0);

  const { data, width: maskW, height: maskH } = offCtx.getImageData(0, 0, maskImg.width, maskImg.height);

  const offsetX = Math.floor((maskW - worldWidth) / 2);
  const offsetY = Math.floor((maskH - worldHeight) / 2);

  const rowRuns = [];

  for (let y = 0; y < maskH; y += 1) {
    const runs = [];
    let x = 0;

    while (x < maskW) {
      if (!isBlackPixel(data, maskW, x, y)) {
        x += 1;
        continue;
      }

      const start = x;
      while (x < maskW && isBlackPixel(data, maskW, x, y)) x += 1;

      let x0 = start - offsetX;
      let x1 = x - offsetX;
      const wy = y - offsetY;

      if (wy < 0 || wy >= worldHeight) continue;

      x0 = clamp(x0, 0, worldWidth);
      x1 = clamp(x1, 0, worldWidth);

      if (x1 > x0) runs.push({ x: x0, w: x1 - x0 });
    }

    rowRuns.push(runs);
  }

  const killRowRuns = [];
  for (let y = 0; y < maskH; y += 1) {
    const runs = [];
    let x = 0;
    while (x < maskW) {
      if (!isBluePixel(data, maskW, x, y)) { x += 1; continue; }
      const start = x;
      while (x < maskW && isBluePixel(data, maskW, x, y)) x += 1;
      let x0 = clamp(start - offsetX, 0, worldWidth);
      let x1 = clamp(x - offsetX, 0, worldWidth);
      const wy = y - offsetY;
      if (wy >= 0 && wy < worldHeight && x1 > x0) runs.push({ x: x0, w: x1 - x0 });
    }
    killRowRuns.push(runs);
  }

  return { solids: mergeRowRuns(rowRuns, worldHeight), killZones: mergeRowRuns(killRowRuns, worldHeight) };
}

function mergeRowRuns(rowRuns, worldHeight) {
  const solids = [];
  let active = new Map();

  for (let y = 0; y < worldHeight; y += 1) {
    const runs = rowRuns[y] || [];
    const next = new Map();

    for (const run of runs) {
      const key = `${run.x}:${run.w}`;
      const current = active.get(key);

      if (current && current.y + current.h === y) {
        current.h += 1;
        next.set(key, current);
      } else {
        const rect = { x: run.x, y, w: run.w, h: 1 };
        solids.push(rect);
        next.set(key, rect);
      }
    }

    active = next;
  }

  return solids;
}

function isBlackPixel(data, width, x, y) {
  const i = (y * width + x) * 4;
  return data[i+3] > 200 && data[i] < 25 && data[i+1] < 25 && data[i+2] < 25;
}

function isBluePixel(data, width, x, y) {
  const i = (y * width + x) * 4;
  return data[i+3] > 200 && data[i] < 80 && data[i+1] < 80 && data[i+2] > 150;
}


function respawn() {
  player.x = 350;
  player.y = 820;
  player.vx = 0;
  player.vy = 0;
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getPlayerBody() {
  return {
    x: player.x + playerHitbox.offsetX,
    y: player.y + playerHitbox.offsetY,
    w: playerHitbox.w,
    h: playerHitbox.h,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function loadImageSafe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}






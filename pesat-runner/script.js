import * as THREE from 'three';

const lanePositions = [-3, 0, 3];
const obstacleTypes = ['cone', 'barrier', 'crate'];

const state = {
  scene: null,
  camera: null,
  renderer: null,
  clock: new THREE.Clock(),
  worldGroup: null,
  player: null,
  playerRoot: null,
  obstacles: [],
  coins: [],
  roadSegments: [],
  environmentSegments: [],
  score: 0,
  coinCount: 0,
  speed: 1,
  spawnTimer: 0,
  elapsed: 0,
  currentLane: 1,
  targetLane: 1,
  jumpVelocity: 0,
  started: false,
  gameOver: false,
  highScore: Number(localStorage.getItem('pesatRunnerHighScore') || 0),
  audioCtx: null,
  audioReady: false,
  runningCycle: 0,
  pulse: 0,
};

const ui = {
  score: document.getElementById('score'),
  coins: document.getElementById('coins'),
  speed: document.getElementById('speed'),
  menuHighScore: document.getElementById('menu-high-score'),
  menuOverlay: document.getElementById('menu-overlay'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  playBtn: document.getElementById('play-btn'),
  playAgainBtn: document.getElementById('play-again-btn'),
  mainMenuBtn: document.getElementById('main-menu-btn'),
  howBtn: document.getElementById('how-btn'),
  howPanel: document.getElementById('how-panel'),
  finalScore: document.getElementById('final-score'),
  finalCoins: document.getElementById('final-coins'),
  finalHighScore: document.getElementById('final-high-score'),
  floatingText: document.getElementById('floating-text'),
  touchButtons: [...document.querySelectorAll('.touch-btn')],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 4) {
  return String(Math.floor(value)).padStart(digits, '0');
}

function updateHud() {
  ui.score.textContent = formatNumber(state.score, 4);
  ui.coins.textContent = formatNumber(state.coinCount, 2);
  ui.speed.textContent = `${state.speed.toFixed(1)}x`;
  ui.menuHighScore.textContent = formatNumber(state.highScore, 4);
}

function persistHighScore() {
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('pesatRunnerHighScore', String(state.highScore));
  }
}

function showFloatingText(text) {
  ui.floatingText.textContent = text;
  ui.floatingText.classList.remove('show');
  void ui.floatingText.offsetWidth;
  ui.floatingText.classList.add('show');
}

function initAudio() {
  if (state.audioReady) {
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  state.audioCtx = new AudioContextClass();
  state.audioReady = true;
}

function playTone(type, frequency, duration, gainValue, sweep = 0) {
  if (!state.audioReady || !state.audioCtx) return;

  const oscillator = state.audioCtx.createOscillator();
  const gainNode = state.audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, state.audioCtx.currentTime);

  if (sweep !== 0) {
    oscillator.frequency.linearRampToValueAtTime(
      frequency + sweep,
      state.audioCtx.currentTime + duration
    );
  }

  gainNode.gain.setValueAtTime(0.0001, state.audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(gainValue, state.audioCtx.currentTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, state.audioCtx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(state.audioCtx.destination);

  oscillator.start();
  oscillator.stop(state.audioCtx.currentTime + duration);
}

function playJumpSound() {
  initAudio();
  playTone('square', 260, 0.12, 0.06, 70);
}

function playCoinSound() {
  initAudio();
  playTone('triangle', 820, 0.09, 0.085, 180);
}

function playGameOverSound() {
  initAudio();
  playTone('sawtooth', 180, 0.3, 0.08, -80);
}

function createPlayer() {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1d4aa, roughness: 0.9 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x800020, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.5, 0.56), bodyMat);
  torso.position.y = 1.55;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), skinMat);
  head.position.y = 2.65;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.8), hairMat);
  hair.position.set(0, 2.95, -0.05);
  hair.castShadow = true;
  group.add(hair);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.28), darkMat);
  leftArm.position.set(-0.72, 1.7, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.28), darkMat);
  rightArm.position.set(0.72, 1.7, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.2, 0.42), darkMat);
  leftLeg.position.set(-0.28, 0.55, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.2, 0.42), darkMat);
  rightLeg.position.set(0.28, 0.55, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.8), whiteMat);
  leftShoe.position.set(-0.28, -0.18, 0.18);
  leftShoe.castShadow = true;
  group.add(leftShoe);

  const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.8), whiteMat);
  rightShoe.position.set(0.28, -0.18, 0.18);
  rightShoe.castShadow = true;
  group.add(rightShoe);

  state.player = group;
  state.playerRoot = group;
  state.player.position.set(0, 0.95, 0);

  state.player.userData = {
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    leftShoe,
    rightShoe,
  };

  state.scene.add(group);
}

function createRoad() {
  const segmentLength = 30;

  for (let i = 0; i < 8; i += 1) {
    const segment = new THREE.Group();

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.5, segmentLength),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 })
    );
    road.position.y = -0.2;
    road.receiveShadow = true;
    segment.add(road);

    const leftCurb = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, segmentLength),
      new THREE.MeshStandardMaterial({ color: 0x6d6d6d, roughness: 0.7 })
    );
    leftCurb.position.set(-8.4, 0.15, 0);
    segment.add(leftCurb);

    const rightCurb = leftCurb.clone();
    rightCurb.position.x = 8.4;
    segment.add(rightCurb);

    for (let lane = -1; lane <= 1; lane += 1) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.03, 4.2),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      stripe.position.set(lane * 3, 0.08, 0);
      segment.add(stripe);
    }

    segment.position.z = -i * segmentLength;
    state.worldGroup.add(segment);
    state.roadSegments.push(segment);
  }
}

function createEnvironment() {
  const segmentLength = 30;

  for (let i = 0; i < 8; i += 1) {
    const group = new THREE.Group();

    const buildingMaterialA = new THREE.MeshStandardMaterial({ color: 0x9ec8ff, roughness: 0.7 });
    const buildingMaterialB = new THREE.MeshStandardMaterial({ color: 0xffd68a, roughness: 0.8 });
    const buildingMaterialC = new THREE.MeshStandardMaterial({ color: 0xc4a8ff, roughness: 0.8 });
    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.9 });
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5d3826, roughness: 0.9 });

    for (let j = 0; j < 5; j += 1) {
      const buildingMaterial = [buildingMaterialA, buildingMaterialB, buildingMaterialC][j % 3];
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(2.5 + (j % 2) * 1.8, 3 + j * 0.8, 2.4 + (j % 3) * 1.3),
        buildingMaterial
      );
      building.position.set(-12 - (j * 2.2), 1.8 + j * 0.2, -10 + j * 6.3);
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);

      const mirrorBuilding = building.clone();
      mirrorBuilding.position.x = 12 + (j * 2.2);
      group.add(mirrorBuilding);

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8), trunkMaterial);
      trunk.position.y = 0.5;
      tree.add(trunk);

      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 6), treeMaterial);
      crown.position.y = 2.1;
      tree.add(crown);

      tree.position.set(-9 - (j * 2.7), 0, -12 + j * 4.6);
      group.add(tree);

      const treeMirror = tree.clone();
      treeMirror.position.x = 9 + (j * 2.7);
      group.add(treeMirror);
    }

    const streetLamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x4a4a4a }));
    pole.position.y = 1.4;

    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.45), new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.35 }));
    lampHead.position.y = 2.5;
    streetLamp.add(pole, lampHead);

    streetLamp.position.set(-10, 0, 0);
    group.add(streetLamp.clone());
    streetLamp.position.x = 10;
    group.add(streetLamp);

    group.position.z = -i * segmentLength;
    state.worldGroup.add(group);
    state.environmentSegments.push(group);
  }
}

function createWorld() {
  state.worldGroup = new THREE.Group();
  state.scene.add(state.worldGroup);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x9fd8ff, side: THREE.BackSide })
  );
  state.scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xdfefff, 0x6c6c6c, 1.2);
  state.scene.add(hemi);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 18, 8);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.left = -18;
  dirLight.shadow.camera.right = 18;
  dirLight.shadow.camera.top = 18;
  dirLight.shadow.camera.bottom = -18;
  state.scene.add(dirLight);

  createRoad();
  createEnvironment();
}

function createObstacle(type, laneIndex) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xffa000, roughness: 0.8 });

  if (type === 'cone') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.5, 16), material);
    cone.position.y = 0.75;
    cone.castShadow = true;
    group.add(cone);
    group.userData.hitHeight = 1.4;
  } else if (type === 'barrier') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0xd92c2c, roughness: 0.7 }));
    base.position.y = 0.45;
    base.castShadow = true;
    group.add(base);

    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    stripe1.position.set(0, 0.5, 0.38);
    group.add(stripe1);

    const stripe2 = stripe1.clone();
    stripe2.position.z = -0.38;
    group.add(stripe2);

    const stripe3 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.82), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    stripe3.position.set(-0.72, 0.5, 0);
    group.add(stripe3);

    const stripe4 = stripe3.clone();
    stripe4.position.x = 0.72;
    group.add(stripe4);
    group.userData.hitHeight = 1.6;
  } else {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x8d5b2c, roughness: 0.9 })
    );
    crate.position.y = 1.1;
    crate.castShadow = true;
    group.add(crate);
    group.userData.hitHeight = 0.4;
  }

  group.userData.type = type;
  group.userData.laneIndex = laneIndex;
  group.position.x = lanePositions[laneIndex];
  group.position.z = -75;
  group.position.y = 0;

  state.scene.add(group);
  state.obstacles.push(group);
  return group;
}

function createCoin(laneIndex, zPosition) {
  const group = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.12, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf7d64a,
      emissive: 0xd6a400,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      metalness: 0.7,
    })
  );

  coin.rotation.z = Math.PI / 2;
  coin.castShadow = true;
  group.add(coin);

  group.position.set(lanePositions[laneIndex], 1.4, zPosition);
  group.userData.laneIndex = laneIndex;
  group.userData.value = 10;
  state.scene.add(group);
  state.coins.push(group);
  return group;
}

function removeFromScene(object, collection) {
  if (!object) return;
  state.scene.remove(object);
  const index = collection.indexOf(object);
  if (index !== -1) {
    collection.splice(index, 1);
  }
}

function updatePlayer(deltaTime) {
  const armLeft = state.player.userData.leftArm;
  const armRight = state.player.userData.rightArm;
  const legLeft = state.player.userData.leftLeg;
  const legRight = state.player.userData.rightLeg;
  const shoeLeft = state.player.userData.leftShoe;
  const shoeRight = state.player.userData.rightShoe;

  state.player.position.x = THREE.MathUtils.lerp(
    state.player.position.x,
    lanePositions[state.targetLane],
    0.16
  );

  state.player.rotation.z = THREE.MathUtils.lerp(
    state.player.rotation.z,
    (state.targetLane - state.currentLane) * 0.12,
    0.18
  );

  state.runningCycle += deltaTime * (state.speed * 10);
  const swing = Math.sin(state.runningCycle) * 1.1;
  armLeft.rotation.x = swing;
  armRight.rotation.x = -swing;
  legLeft.rotation.x = -swing;
  legRight.rotation.x = swing;
  shoeLeft.rotation.x = legLeft.rotation.x * 0.7;
  shoeRight.rotation.x = legRight.rotation.x * 0.7;

  state.player.position.y += state.jumpVelocity * deltaTime;
  state.jumpVelocity -= 20 * deltaTime;

  if (state.player.position.y <= 0.95) {
    state.player.position.y = 0.95;
    state.jumpVelocity = 0;
  }

  state.currentLane = THREE.MathUtils.lerp(state.currentLane, state.targetLane, 0.2);
}

function updateObstacles(deltaTime) {
  const moveSpeed = state.speed * 24 * deltaTime;

  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = state.obstacles[i];
    obstacle.position.z += moveSpeed;

    if (obstacle.position.z > 18) {
      removeFromScene(obstacle, state.obstacles);
    }
  }

  for (let i = state.coins.length - 1; i >= 0; i -= 1) {
    const coin = state.coins[i];
    coin.position.z += moveSpeed;
    coin.rotation.y += 0.25 + state.speed * 0.08;

    if (coin.position.z > 18) {
      removeFromScene(coin, state.coins);
    }
  }
}

function updateWorld(deltaTime) {
  const moveSpeed = state.speed * 24 * deltaTime;

  for (const segment of state.roadSegments) {
    segment.position.z += moveSpeed;
    if (segment.position.z > 20) {
      segment.position.z -= state.roadSegments.length * 30;
    }
  }

  for (const segment of state.environmentSegments) {
    segment.position.z += moveSpeed;
    if (segment.position.z > 20) {
      segment.position.z -= state.environmentSegments.length * 30;
    }
  }

  state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.player.position.x * 0.3, 0.05);
  state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 6.5 + state.player.position.y * 0.45, 0.05);
  state.camera.lookAt(state.player.position.x * 0.36, 1.7, -28);

  state.elapsed += deltaTime;
  const scaledSpeed = Math.min(1 + Math.floor(state.elapsed / 20) * 0.2, 2.6);
  state.speed = scaledSpeed;
  updateHud();
}

function spawnObjects() {
  state.spawnTimer += 1 / 60;
  const interval = Math.max(1.05, 2.6 - state.speed * 0.6);

  if (state.spawnTimer < interval) {
    return;
  }

  state.spawnTimer = 0;

  const lanePool = [0, 1, 2];
  const safeLane = Math.floor(Math.random() * 3);
  const obstacleLanePool = lanePool.filter((lane) => lane !== safeLane);
  const laneToSpawn = obstacleLanePool[Math.floor(Math.random() * obstacleLanePool.length)];
  const obstacleType = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
  createObstacle(obstacleType, laneToSpawn);

  if (Math.random() < 0.8) {
    const coinLane = Math.floor(Math.random() * 3);
    const coinCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < coinCount; i += 1) {
      createCoin(coinLane, -68 - i * 3.6);
    }
  }
}

function handleCollision() {
  const playerX = state.player.position.x;
  const playerY = state.player.position.y;
  const playerZ = state.player.position.z;

  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = state.obstacles[i];
    const dx = Math.abs(playerX - obstacle.position.x);
    const dz = Math.abs(playerZ - obstacle.position.z);
    const safeJump = obstacle.userData.type !== 'crate' && playerY > 1.6;

    if (dx < 1.05 && dz < 1.8) {
      if (obstacle.userData.type === 'crate' || (!safeJump && obstacle.userData.type !== 'crate')) {
        endGame();
        return;
      }
    }
  }

  for (let i = state.coins.length - 1; i >= 0; i -= 1) {
    const coin = state.coins[i];
    const dx = Math.abs(playerX - coin.position.x);
    const dz = Math.abs(playerZ - coin.position.z);
    const dy = Math.abs(playerY - coin.position.y);

    if (dx < 1.0 && dz < 1.3 && dy < 1.7) {
      state.score += 10;
      state.coinCount += 1;
      showFloatingText('+10');
      playCoinSound();
      removeFromScene(coin, state.coins);
      persistHighScore();
      updateHud();
    }
  }
}

function startGame() {
  initAudio();
  state.started = true;
  state.gameOver = false;
  resetGame();
  ui.menuOverlay.classList.add('hidden');
  ui.gameOverOverlay.classList.add('hidden');
  ui.howPanel.classList.add('hidden');
}

function endGame() {
  if (state.gameOver) return;

  state.gameOver = true;
  state.started = false;
  persistHighScore();
  playGameOverSound();

  ui.finalScore.textContent = formatNumber(state.score, 4);
  ui.finalCoins.textContent = formatNumber(state.coinCount, 2);
  ui.finalHighScore.textContent = formatNumber(state.highScore, 4);
  ui.gameOverOverlay.classList.remove('hidden');
}

function resetGame() {
  for (let i = state.obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = state.obstacles[i];
    state.scene.remove(obstacle);
  }
  state.obstacles = [];

  for (let i = state.coins.length - 1; i >= 0; i -= 1) {
    const coin = state.coins[i];
    state.scene.remove(coin);
  }
  state.coins = [];

  state.score = 0;
  state.coinCount = 0;
  state.speed = 1;
  state.elapsed = 0;
  state.spawnTimer = 0;
  state.runningCycle = 0;
  state.currentLane = 1;
  state.targetLane = 1;
  state.jumpVelocity = 0;
  state.player.position.set(0, 0.95, 0);
  state.player.rotation.set(0, 0, 0);
  updateHud();
}

function handleInput(event) {
  const key = event.key.toLowerCase();

  if (['arrowleft', 'a'].includes(key)) {
    state.targetLane = clamp(state.targetLane - 1, 0, 2);
  }

  if (['arrowright', 'd'].includes(key)) {
    state.targetLane = clamp(state.targetLane + 1, 0, 2);
  }

  if (['arrowup', 'w', ' '].includes(key) || event.code === 'Space') {
    if (state.player.position.y <= 0.96 && !state.gameOver) {
      state.jumpVelocity = 8.5;
      playJumpSound();
    }
  }
}

function handleTouch(action) {
  if (action === 'left') {
    state.targetLane = clamp(state.targetLane - 1, 0, 2);
  }

  if (action === 'right') {
    state.targetLane = clamp(state.targetLane + 1, 0, 2);
  }

  if (action === 'jump') {
    if (state.player.position.y <= 0.96 && !state.gameOver) {
      state.jumpVelocity = 8.5;
      playJumpSound();
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(state.clock.getDelta(), 0.05);

  if (state.started && !state.gameOver) {
    updatePlayer(delta);
    updateWorld(delta);
    spawnObjects();
    updateObstacles(delta);
    handleCollision();
    state.score += delta * 10;
    updateHud();
  }

  state.renderer.render(state.scene, state.camera);
}

function onResize() {
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupEvents() {
  ui.playBtn.addEventListener('click', startGame);
  ui.playAgainBtn.addEventListener('click', startGame);
  ui.mainMenuBtn.addEventListener('click', () => {
    state.started = false;
    state.gameOver = false;
    resetGame();
    ui.gameOverOverlay.classList.add('hidden');
    ui.menuOverlay.classList.remove('hidden');
    ui.howPanel.classList.add('hidden');
  });

  ui.howBtn.addEventListener('click', () => {
    ui.howPanel.classList.toggle('hidden');
  });

  document.addEventListener('keydown', handleInput);

  ui.touchButtons.forEach((button) => {
    button.addEventListener('click', () => handleTouch(button.dataset.action));
  });
  window.addEventListener('resize', onResize);
}

function initScene() {
  state.scene = new THREE.Scene();
  state.scene.background = new THREE.Color(0x9ad7ff);
  state.scene.fog = new THREE.Fog(0x9ad7ff, 28, 110);

  state.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  state.camera.position.set(0, 6.2, 12);

  state.renderer = new THREE.WebGLRenderer({ antialias: true });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(state.renderer.domElement);

  createWorld();
  createPlayer();
  setupEvents();
  ui.menuOverlay.classList.remove('hidden');
  ui.gameOverOverlay.classList.add('hidden');
  ui.howPanel.classList.add('hidden');
  updateHud();
  persistHighScore();
  animate();
}

initScene();

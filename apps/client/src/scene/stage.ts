// Palco 3D: câmera, mesa, avatares, cartas e animações.
import * as THREE from 'three';
import gsap from 'gsap';
import type { Card, Seat } from '@truco/engine';
import type { SignalId } from '@truco/bots';
import { backTex, faceTexture } from './cardArt.ts';
import { buildAvatar, lookToward, playGesture, startIdle, type Avatar } from './avatar.ts';
import { buildEnvironment, TABLE_Y } from './environment.ts';

const CW = 0.085;
const CH = CW * (360 / 256);
const CARD_GEO = new THREE.BoxGeometry(CW, CH, 0.0012);
const EDGE_MAT = new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.7 });
const BACK_MAT = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.55 });
const ON_TABLE = TABLE_Y + 0.004;
/** Cartas na mesa ficam maiores para leitura à distância. */
const TABLE_SCALE = 1.35;

/** Direção do centro da mesa até cada assento. 0 = você (sul), sentido anti-horário. */
const SEAT_DIR: Record<Seat, THREE.Vector3> = {
  0: new THREE.Vector3(0, 0, 1),
  1: new THREE.Vector3(1, 0, 0),
  2: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(-1, 0, 0),
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tween(target: object, vars: gsap.TweenVars): Promise<void> {
  return new Promise((resolve) => {
    gsap.to(target, { ...vars, onComplete: () => resolve() });
  });
}

interface CardMesh extends THREE.Mesh {
  userData: { cardId?: string; index?: number; hover?: boolean };
}

function makeCard(card: Card | null): CardMesh {
  const front = card ? new THREE.MeshStandardMaterial({ map: faceTexture(card), roughness: 0.55 }) : BACK_MAT;
  const mesh = new THREE.Mesh(CARD_GEO, [EDGE_MAT, EDGE_MAT, EDGE_MAT, EDGE_MAT, front, BACK_MAT]) as unknown as CardMesh;
  mesh.castShadow = true;
  mesh.userData = { cardId: card?.id };
  return mesh;
}

function setFace(mesh: CardMesh, card: Card | null) {
  const mats = mesh.material as THREE.Material[];
  mats[4] = card ? new THREE.MeshStandardMaterial({ map: faceTexture(card), roughness: 0.55 }) : BACK_MAT;
  mesh.userData.cardId = card?.id;
}

/** Quaternion de carta deitada na mesa, com o topo apontando para o centro a partir do assento. */
function flatQuat(seat: Seat, faceDown: boolean, jitter = 0): THREE.Quaternion {
  const yaw = (seat * Math.PI) / 2 + jitter;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(faceDown ? Math.PI / 2 : -Math.PI / 2, 0, faceDown ? -yaw : yaw));
}

export interface StageCallbacks {
  onCardClick: (index: number, faceDown: boolean) => void;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly lowQuality: boolean;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly handGroup = new THREE.Group();
  private readonly avatars = new Map<Seat, Avatar>();
  private humanCards: CardMesh[] = [];
  private tableCards: CardMesh[] = [];
  private pileCards: CardMesh[] = [];
  private pileCount = new Map<string, number>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2(-10, -10);
  private hovered: CardMesh | null = null;
  private interactive = false;
  private turnRing: THREE.Mesh;
  private shakeOffset = new THREE.Vector3();
  private readonly basePos = new THREE.Vector3(0, 1.2, 0.98);
  private readonly lookAt = new THREE.Vector3(0, TABLE_Y + 0.08, -0.3);

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: StageCallbacks,
  ) {
    const q = new URLSearchParams(location.search).get('q');
    this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', preserveDrawingBuffer: true });
    // Qualidade baixa: ?q=low, ou automática quando o navegador está sem GPU (renderização por software).
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.lowQuality = q === 'low' || (q !== 'high' && /swiftshader|llvmpipe|software/i.test(gpu));
    this.renderer.setPixelRatio(this.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.02, 30);
    this.scene.add(this.camera);
    this.camera.add(this.handGroup);
    // Luz suave presa à câmera para as cartas da sua mão ficarem legíveis.
    const handLight = new THREE.PointLight(0xfff0dc, 0.5, 1.2, 1);
    handLight.position.set(0, 0.05, 0);
    this.camera.add(handLight);

    buildEnvironment(this.scene);
    this.buildAvatars();

    this.turnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.085, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
    );
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnRing.position.y = TABLE_Y + 0.002;
    this.scene.add(this.turnRing);

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- setup ----------

  private buildAvatars() {
    const looks: Record<1 | 2 | 3, [number, number, number]> = {
      1: [0x8a2f2a, 0xd8a47f, 0xd8c08a], // adversário (direita)
      2: [0x2f5d8a, 0xc68d62, 0xcdb27a], // parceiro (frente)
      3: [0x6d3b7a, 0xe0b48e, 0xb89a62], // adversário (esquerda)
    };
    for (const seat of [1, 2, 3] as const) {
      const [shirt, skin, hat] = looks[seat];
      const av = buildAvatar(shirt, skin, hat);
      this.scene.add(av.root);
      this.avatars.set(seat, av);
      startIdle(av);
    }
    this.placeAvatars(false);
  }

  /** Mesa redonda: os adversários laterais ficam um pouco mais "ao fundo" para caberem na tela. */
  private placeAvatars(portrait: boolean) {
    const spots: Record<1 | 2 | 3, [number, number]> = portrait
      ? { 1: [0.82, -0.72], 2: [0, -1.12], 3: [-0.82, -0.72] }
      : { 1: [1.04, -0.32], 2: [0, -1.12], 3: [-1.04, -0.32] };
    for (const [seat, av] of this.avatars) {
      const [x, z] = spots[seat as 1 | 2 | 3];
      av.root.position.set(x, 0, z);
      av.root.lookAt(0, 0, 0);
    }
    for (const [seat, target] of this.gazeTargets ?? []) this.setGaze(seat, target);
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const portrait = aspect < 0.8;
    this.camera.fov = portrait ? 74 : 58;
    this.basePos.set(0, portrait ? 1.55 : 1.32, portrait ? 1.45 : 1.25);
    this.lookAt.set(0, TABLE_Y + (portrait ? 0.02 : 0.08), portrait ? -0.25 : -0.3);
    this.handGroup.position.set(0, portrait ? -0.17 : -0.165, portrait ? -0.42 : -0.46);
    this.handGroup.scale.setScalar(portrait ? 0.85 : 0.9);
    this.placeAvatars(portrait);
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  private placeCamera() {
    this.camera.position.copy(this.basePos).add(this.shakeOffset);
    this.camera.lookAt(this.lookAt.clone().add(this.shakeOffset.clone().multiplyScalar(0.5)));
  }

  private bindInput() {
    const el = this.renderer.domElement;
    const updatePointer = (e: PointerEvent | MouseEvent) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    el.addEventListener('pointermove', (e) => updatePointer(e));
    el.addEventListener('pointerleave', () => this.pointer.set(-10, -10));
    el.addEventListener('pointerdown', (e) => {
      updatePointer(e);
      const hit = this.pickHumanCard();
      if (hit && this.interactive) {
        e.preventDefault();
        this.cb.onCardClick(hit.userData.index!, e.button === 2);
      }
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pickHumanCard(): CardMesh | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.humanCards, false);
    return (hits[0]?.object as CardMesh) ?? null;
  }

  private frame() {
    // hover
    const hit = this.interactive ? this.pickHumanCard() : null;
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.layoutHumanHand(0.12);
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
    }
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- consultas para o HUD ----------

  /** Posição em tela (px) do ponto de etiqueta de um assento. */
  screenAnchor(seat: Seat): { x: number; y: number; visible: boolean } {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    if (seat === 0) return { x: w / 2, y: h * 0.62, visible: true };
    const av = this.avatars.get(seat)!;
    const v = new THREE.Vector3();
    av.labelAnchor.getWorldPosition(v);
    v.project(this.camera);
    const pad = 70;
    const x = Math.min(w - pad, Math.max(pad, ((v.x + 1) / 2) * w));
    const y = Math.min(h - 120, Math.max(110, ((1 - v.y) / 2) * h));
    return { x, y, visible: v.z < 1 };
  }

  /** Posição em tela (px) do centro de uma carta da sua mão (usado em testes). */
  humanCardScreen(i: number): { x: number; y: number } | null {
    const m = this.humanCards[i];
    if (!m) return null;
    const v = new THREE.Vector3();
    m.getWorldPosition(v);
    v.project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    if (!on) {
      this.hovered = null;
      this.layoutHumanHand(0.15);
    }
  }

  setTurn(seat: Seat | null) {
    const mat = this.turnRing.material as THREE.MeshBasicMaterial;
    if (seat === null) {
      gsap.to(mat, { opacity: 0, duration: 0.2 });
      return;
    }
    const p = SEAT_DIR[seat].clone().multiplyScalar(0.62);
    gsap.to(this.turnRing.position, { x: p.x, z: p.z, duration: 0.3 });
    gsap.to(mat, { opacity: 0.85, duration: 0.3 });
  }

  // ---------- mão do jogador ----------

  private fanSlot(i: number, n: number, lifted: boolean) {
    const mid = (n - 1) / 2;
    const o = i - mid;
    return {
      x: o * 0.058,
      y: -Math.abs(o) * 0.006 + (lifted ? 0.03 : 0),
      z: i * 0.002 + (lifted ? 0.02 : 0),
      rz: -o * 0.11,
    };
  }

  private layoutHumanHand(duration = 0.25) {
    const n = this.humanCards.length;
    this.humanCards.forEach((m, i) => {
      m.userData.index = i;
      const s = this.fanSlot(i, n, m === this.hovered);
      gsap.to(m.position, { x: s.x, y: s.y, z: s.z, duration });
      gsap.to(m.rotation, { x: -0.18, y: 0, z: s.rz, duration });
    });
  }

  // ---------- animações ----------

  private dealerOrigin(dealer: Seat): THREE.Vector3 {
    return SEAT_DIR[dealer].clone().multiplyScalar(0.55).setY(TABLE_Y + 0.08);
  }

  /** Distribui 3 cartas para cada um, a partir do jogador seguinte ao dealer. */
  async deal(dealer: Seat, myCards: (Card | null)[], sfx: () => void) {
    this.clearHumanHand();
    for (const av of this.avatars.values()) av.handGroup.clear();
    const origin = this.dealerOrigin(dealer);
    const order: Seat[] = [];
    let s = ((dealer + 1) % 4) as Seat;
    for (let k = 0; k < 12; k++) {
      order.push(s);
      s = ((s + 1) % 4) as Seat;
    }
    const counts: Record<Seat, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const flights: Promise<void>[] = [];
    for (const seat of order) {
      const idx = counts[seat]++;
      const mesh = makeCard(seat === 0 ? (myCards[idx] ?? null) : null);
      mesh.position.copy(origin);
      mesh.quaternion.copy(flatQuat(dealer, true));
      this.scene.add(mesh);
      if (seat === 0) {
        flights.push(this.flyIntoHuman(mesh, idx));
      } else {
        flights.push(this.flyIntoBot(mesh, seat, idx));
      }
      sfx();
      await sleep(70);
    }
    await Promise.all(flights);
    this.layoutHumanHand(0.2);
  }

  private botSlot(i: number) {
    const o = i - 1;
    return { pos: new THREE.Vector3(o * 0.03, Math.abs(o) * -0.004, o * 0.002), rot: new THREE.Euler(0, Math.PI, o * 0.18) };
  }

  private async flyIntoBot(mesh: CardMesh, seat: Seat, idx: number) {
    const av = this.avatars.get(seat)!;
    const slot = this.botSlot(idx);
    const dummy = new THREE.Object3D();
    dummy.position.copy(slot.pos);
    dummy.rotation.copy(slot.rot);
    av.handGroup.add(dummy);
    dummy.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    dummy.getWorldPosition(pos);
    dummy.getWorldQuaternion(quat);
    av.handGroup.remove(dummy);
    await this.flyTo(mesh, pos, quat, 0.38, 0.06);
    av.handGroup.attach(mesh);
    mesh.position.copy(slot.pos);
    mesh.rotation.copy(slot.rot);
  }

  private async flyIntoHuman(mesh: CardMesh, idx: number) {
    const s = this.fanSlot(idx, 3, false);
    const dummy = new THREE.Object3D();
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(-0.18, 0, s.rz);
    this.handGroup.add(dummy);
    dummy.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    dummy.getWorldPosition(pos);
    dummy.getWorldQuaternion(quat);
    this.handGroup.remove(dummy);
    await this.flyTo(mesh, pos, quat, 0.42, 0.05);
    this.handGroup.attach(mesh);
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.set(-0.18, 0, s.rz);
    mesh.userData.index = idx;
    this.humanCards[idx] = mesh;
  }

  private flyTo(
    mesh: THREE.Object3D,
    toPos: THREE.Vector3,
    toQuat: THREE.Quaternion,
    duration = 0.45,
    arc = 0.08,
    toScale?: number,
  ): Promise<void> {
    const fromPos = mesh.position.clone();
    const fromQuat = mesh.quaternion.clone();
    if (toScale !== undefined) gsap.to(mesh.scale, { x: toScale, y: toScale, z: toScale, duration });
    const o = { t: 0 };
    return tween(o, {
      t: 1,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        mesh.position.lerpVectors(fromPos, toPos, o.t);
        mesh.position.y += Math.sin(o.t * Math.PI) * arc;
        mesh.quaternion.slerpQuaternions(fromQuat, toQuat, o.t);
      },
    });
  }

  private tableSpot(seat: Seat): THREE.Vector3 {
    const n = this.tableCards.length;
    return SEAT_DIR[seat]
      .clone()
      .multiplyScalar(0.22)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02))
      .setY(ON_TABLE + n * 0.0014);
  }

  /** Você joga a carta `index` da sua mão. */
  async playHuman(index: number, faceDown: boolean, card: Card | null) {
    const mesh = this.humanCards[index];
    if (!mesh) return;
    this.humanCards.splice(index, 1);
    this.hovered = null;
    this.scene.attach(mesh);
    if (card && !faceDown) setFace(mesh, card);
    this.layoutHumanHand(0.25);
    await this.flyTo(mesh, this.tableSpot(0), flatQuat(0, faceDown, (Math.random() - 0.5) * 0.3), 0.42, 0.05, TABLE_SCALE);
    this.tableCards.push(mesh);
  }

  /** Bot joga uma carta (card=null quando coberta). */
  async playBot(seat: Seat, card: Card | null, faceDown: boolean) {
    const av = this.avatars.get(seat)!;
    const held = av.handGroup.children[av.handGroup.children.length - 1] as CardMesh | undefined;
    const mesh = held ?? makeCard(null);
    if (held) this.scene.attach(held);
    else {
      av.handGroup.getWorldPosition(mesh.position);
      this.scene.add(mesh);
    }
    setFace(mesh, faceDown ? null : card);
    await this.flyTo(mesh, this.tableSpot(seat), flatQuat(seat, faceDown, (Math.random() - 0.5) * 0.3), 0.45, 0.07, TABLE_SCALE);
    this.tableCards.push(mesh);
  }

  /** Destaca a carta vencedora e recolhe a vaza para o monte de quem ganhou. */
  async collectRound(winningSeat: Seat | null, tie: boolean, winnerIndex: number | null) {
    const winnerMesh = winnerIndex !== null ? this.tableCards[winnerIndex] : undefined;
    if (winnerMesh && !tie) {
      await tween(winnerMesh.position, { y: winnerMesh.position.y + 0.02, duration: 0.18, yoyo: true, repeat: 1 });
    }
    await sleep(450);
    const key = tie || winningSeat === null ? 'tie' : String(winningSeat % 2);
    const base =
      key === 'tie'
        ? new THREE.Vector3(0.42, 0, 0.0)
        : key === '0'
          ? new THREE.Vector3(-0.42, 0, 0.32)
          : new THREE.Vector3(0.0, 0, -0.5);
    const count = this.pileCount.get(key) ?? 0;
    const cards = this.tableCards;
    this.tableCards = [];
    await Promise.all(
      cards.map((m, i) => {
        const pos = base.clone().setY(ON_TABLE + (count * 4 + i) * 0.0014);
        pos.x += count * 0.03;
        return this.flyTo(m, pos, flatQuat(0, true, 0.25 * count + i * 0.04), 0.35, 0.03);
      }),
    );
    this.pileCount.set(key, count + 1);
    this.pileCards.push(...cards);
  }

  /** Recolhe tudo da mesa (fim da mão). */
  async clearTable(dealerNext: Seat) {
    const all = [...this.tableCards, ...this.pileCards];
    for (const av of this.avatars.values()) {
      for (const c of [...av.handGroup.children]) {
        this.scene.attach(c);
        all.push(c as CardMesh);
      }
    }
    for (const m of this.humanCards) {
      this.scene.attach(m);
      all.push(m);
    }
    this.humanCards = [];
    this.tableCards = [];
    this.pileCards = [];
    this.pileCount.clear();
    const target = this.dealerOrigin(dealerNext);
    await Promise.all(all.map((m, i) => sleep(i * 15).then(() => this.flyTo(m, target, flatQuat(dealerNext, true), 0.35, 0.04))));
    for (const m of all) {
      this.scene.remove(m);
      const mats = (m as THREE.Mesh).material as THREE.Material[];
      if (mats[4] !== BACK_MAT) mats[4]!.dispose();
    }
  }

  private clearHumanHand() {
    for (const m of this.humanCards) this.handGroup.remove(m);
    this.humanCards = [];
  }

  /** Tremor de câmera (tapa na mesa / Zap). */
  shake(intensity = 1) {
    const amp = 0.012 * intensity;
    const tl = gsap.timeline({ onComplete: () => this.shakeOffset.set(0, 0, 0) });
    for (let i = 0; i < 8; i++) {
      const f = 1 - i / 8;
      tl.to(this.shakeOffset, {
        x: (Math.random() - 0.5) * amp * f * 2,
        y: (Math.random() - 0.5) * amp * f * 2,
        z: (Math.random() - 0.5) * amp * f,
        duration: 0.035,
      });
    }
    tl.to(this.shakeOffset, { x: 0, y: 0, z: 0, duration: 0.06 });
  }

  /** Cabeça do avatar balança (fala / grito), a partir do olhar atual. */
  nod(seat: Seat, strong = false) {
    const av = this.avatars.get(seat);
    if (!av) return;
    const base = av.gaze.pitch;
    gsap.fromTo(
      av.head.rotation,
      { x: base },
      { x: base + (strong ? 0.28 : 0.14), duration: 0.12, yoyo: true, repeat: strong ? 3 : 1, onComplete: () => void (av.head.rotation.x = base) },
    );
  }

  // ---------- Sinais e olhar ----------

  private gazeTargets = new Map<Seat, Seat | null>();

  /** Ponto (mundo) da "cabeça" de um assento. Você (0) = posição da câmera. */
  seatPoint(seat: Seat): THREE.Vector3 {
    if (seat === 0) return this.basePos.clone();
    const v = new THREE.Vector3();
    this.avatars.get(seat)!.head.getWorldPosition(v);
    return v;
  }

  /** Bot vira a cabeça para outro assento (null = olha a mesa). */
  setGaze(seat: Seat, target: Seat | null) {
    const av = this.avatars.get(seat);
    if (!av) return;
    this.gazeTargets.set(seat, target);
    av.root.updateWorldMatrix(true, true);
    lookToward(av, target === null ? null : this.seatPoint(target));
  }

  /** Executa o gesto do sinal no avatar do assento. */
  gesture(seat: Seat, signal: SignalId, freezeAt?: number): Promise<void> {
    const av = this.avatars.get(seat);
    return av ? playGesture(av, signal, freezeAt) : Promise.resolve();
  }

  /** Posição em tela do rosto de um assento (para testes/zoom). */
  faceScreen(seat: Seat): { x: number; y: number } {
    const v = this.seatPoint(seat).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
}

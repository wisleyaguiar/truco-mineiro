// Avatar estilizado (formas simples) com rosto e corpo animáveis para os sinais secretos (PRD 5.2).
import * as THREE from 'three';
import gsap from 'gsap';
import type { SignalId } from '@truco/bots';
import { TABLE_Y } from './environment.ts';

export interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  /** Grupo onde ficam as cartas que o bot está segurando. */
  handGroup: THREE.Group;
  /** Ponto acima da cabeça para a plaquinha de nome. */
  labelAnchor: THREE.Object3D;
  /** Partes animáveis. */
  parts: {
    torso: THREE.Mesh;
    lids: [THREE.Mesh, THREE.Mesh]; // pálpebras (esquerda, direita), scale.y 0 = aberta, 1 = fechada
    pupils: [THREE.Mesh, THREE.Mesh];
    brows: [THREE.Mesh, THREE.Mesh];
    lips: THREE.Mesh;
    tongue: THREE.Mesh;
    shoulders: [THREE.Group, THREE.Group]; // braço inteiro (ombro + braço + mão), para encolher
  };
  /** Olhar atual (rotação-alvo da cabeça). */
  gaze: { yaw: number; pitch: number };
  busy: boolean;
}

const BROW_Y = 0.052;
const LID_OPEN = 0.05;

export function buildAvatar(shirt: number, skin: number, hat: number): Avatar {
  const root = new THREE.Group();
  const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const skinMat = mat(skin, 0.6);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), mat(shirt));
  torso.position.y = TABLE_Y + 0.12;
  torso.scale.set(1, 1, 0.75);
  torso.castShadow = true;
  root.add(torso);

  // Braços apoiados na mesa, cada um num grupo (ombro + braço + mão) para poder encolher o ombro.
  const shoulders = [-1, 1].map((side) => {
    const g = new THREE.Group();
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 14), mat(shirt));
    shoulder.position.set(side * 0.16, TABLE_Y + 0.26, 0);
    shoulder.castShadow = true;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 10), mat(shirt));
    arm.position.set(side * 0.16, TABLE_Y + 0.08, 0.15);
    arm.rotation.x = Math.PI / 2.4;
    arm.rotation.z = side * -0.35;
    arm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), skinMat);
    hand.position.set(side * 0.08, TABLE_Y + 0.07, 0.3);
    g.add(shoulder, arm, hand);
    root.add(g);
    return g;
  }) as [THREE.Group, THREE.Group];

  const head = new THREE.Group();
  head.position.y = TABLE_Y + 0.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), skinMat);
  skull.scale.set(1, 1.1, 1);
  skull.castShadow = true;
  head.add(skull);

  const pupils: THREE.Mesh[] = [];
  const lids: THREE.Mesh[] = [];
  const brows: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), mat(0xf5f1e8, 0.4));
    white.position.set(side * 0.045, 0.02, 0.1);
    white.scale.set(1, 1, 0.6);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 10), mat(0x1a1a1a, 0.3));
    pupil.position.set(side * 0.045, 0.02, 0.113);
    // Pálpebra: disco de pele na frente do olho, cresce de cima para baixo.
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.023, 12, 12), skinMat);
    lid.geometry.translate(0, -0.023, 0); // pivô no topo
    lid.position.set(side * 0.045, 0.043, 0.11);
    lid.scale.set(1.05, LID_OPEN, 0.85); // frente em z≈0.13, na frente da pupila (0.124)
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.009, 0.012), mat(0x2b1a0e));
    brow.position.set(side * 0.045, BROW_Y, 0.112);
    brow.rotation.z = side * -0.12;
    head.add(white, pupil, lid, brow);
    pupils.push(pupil);
    lids.push(lid);
    brows.push(brow);
  }
  const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), mat(0x2b1a0e));
  moustache.position.set(0, -0.035, 0.118);
  head.add(moustache);
  const lips = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 12), mat(0x9c4a3c, 0.5));
  lips.position.set(0, -0.066, 0.108);
  lips.scale.set(1.6, 0.55, 0.5);
  head.add(lips);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 10), mat(0xe0707a, 0.4));
  tongue.position.set(0, -0.07, 0.11);
  tongue.scale.set(1, 0.6, 0.01);
  head.add(tongue);

  // chapéu de palha
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 32), mat(hat, 0.9));
  brim.position.y = 0.1;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 24), mat(hat, 0.9));
  crown.position.y = 0.155;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.025, 24), mat(0x5a1a12));
  band.position.y = 0.12;
  head.add(brim, crown, band);
  root.add(head);

  const handGroup = new THREE.Group();
  handGroup.position.set(0, TABLE_Y + 0.13, 0.3);
  handGroup.rotation.x = -0.35;
  root.add(handGroup);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.y = TABLE_Y + 0.82;
  root.add(labelAnchor);

  return {
    root,
    head,
    handGroup,
    labelAnchor,
    parts: {
      torso,
      lids: lids as [THREE.Mesh, THREE.Mesh],
      pupils: pupils as [THREE.Mesh, THREE.Mesh],
      brows: brows as [THREE.Mesh, THREE.Mesh],
      lips,
      tongue,
      shoulders,
    },
    gaze: { yaw: 0, pitch: 0.18 },
    busy: false,
  };
}

// ---------- Animações ----------

/** Vira a cabeça para um ponto do mundo (null = olha para a mesa). */
export function lookToward(av: Avatar, world: THREE.Vector3 | null, duration = 0.45) {
  let yaw = 0;
  let pitch = 0.32; // olhando a mesa / as próprias cartas
  if (world) {
    const local = av.root.worldToLocal(world.clone());
    const headPos = av.head.position;
    const dx = local.x - headPos.x;
    const dy = local.y - headPos.y;
    const dz = local.z - headPos.z;
    yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.25, 1.25);
    pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.3, 0.4);
  }
  av.gaze = { yaw, pitch };
  gsap.to(av.head.rotation, { y: yaw, x: pitch, duration, ease: 'power2.inOut', overwrite: 'auto' });
  // pupilas acompanham um pouco
  const px = THREE.MathUtils.clamp(yaw * 0.006, -0.006, 0.006);
  av.parts.pupils.forEach((p, i) => gsap.to(p.position, { x: (i === 0 ? -0.045 : 0.045) + px, duration }));
}

function blinkTl(av: Avatar, which: 'both' | 0 | 1, hold = 0.06) {
  const lids = which === 'both' ? av.parts.lids : [av.parts.lids[which]];
  const tl = gsap.timeline();
  lids.forEach((l) => tl.to(l.scale, { y: 1, duration: 0.07 }, 0));
  lids.forEach((l) => tl.to(l.scale, { y: LID_OPEN, duration: 0.09 }, 0.07 + hold));
  return tl;
}

/** Animações ociosas: piscar e respirar. Retorna função para parar. */
export function startIdle(av: Avatar): () => void {
  let stopped = false;
  const breathe = gsap.to(av.parts.torso.scale, { y: 1.025, duration: 1.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  const loop = () => {
    if (stopped) return;
    if (!av.busy) blinkTl(av, 'both');
    gsap.delayedCall(2 + Math.random() * 3.5, loop);
  };
  gsap.delayedCall(Math.random() * 2, loop);
  return () => {
    stopped = true;
    breathe.kill();
  };
}

/**
 * Executa o gesto de um sinal (~0,6–0,9 s).
 * `freezeAt` (segundos) congela o gesto naquele instante — usado em testes/screenshots.
 */
export function playGesture(av: Avatar, signal: SignalId, freezeAt?: number): Promise<void> {
  const p = av.parts;
  av.busy = true;
  const tl = gsap.timeline({ onComplete: () => void (av.busy = false) });
  switch (signal) {
    case 'zap': // piscar um olho + levantar sobrancelha
      tl.to(p.brows[1].position, { y: BROW_Y + 0.02, duration: 0.12 }, 0)
        .add(blinkTl(av, 0, 0.35), 0.05)
        .to(p.brows[1].position, { y: BROW_Y, duration: 0.15 }, 0.55);
      break;
    case 'copeta': // bico
      tl.to(p.lips.scale, { x: 1.15, y: 1.15, z: 2.4, duration: 0.15 }, 0)
        .to(p.lips.position, { z: 0.124, duration: 0.15 }, 0)
        .to(p.lips.scale, { x: 1.6, y: 0.55, z: 0.5, duration: 0.18 }, 0.6)
        .to(p.lips.position, { z: 0.108, duration: 0.18 }, 0.6);
      break;
    case 'espadilha': // ponta da língua
      tl.to(p.tongue.scale, { z: 1.4, y: 0.9, x: 1.1, duration: 0.14 }, 0)
        .to(p.tongue.position, { z: 0.13, y: -0.08, duration: 0.14 }, 0)
        .to(p.tongue.scale, { z: 0.01, y: 0.6, duration: 0.14 }, 0.55)
        .to(p.tongue.position, { z: 0.11, y: -0.07, duration: 0.14 }, 0.55);
      break;
    case 'picafumo': // encolher um ombro + inclinar a cabeça
      tl.to(p.shoulders[0].position, { y: 0.05, duration: 0.15 }, 0)
        .to(av.head.rotation, { z: 0.22, duration: 0.15 }, 0)
        .to(p.shoulders[0].position, { y: 0, duration: 0.2 }, 0.5)
        .to(av.head.rotation, { z: 0, duration: 0.2 }, 0.5);
      break;
    case 'tres': // três batidinhas nas cartas
      for (let i = 0; i < 3; i++) {
        tl.to(av.handGroup.position, { y: TABLE_Y + 0.17, duration: 0.07 }, i * 0.2).to(
          av.handGroup.position,
          { y: TABLE_Y + 0.13, duration: 0.07 },
          i * 0.2 + 0.08,
        );
      }
      break;
    case 'cego': // fechar os dois olhos
      tl.add(blinkTl(av, 'both', 0.45), 0);
      break;
  }
  if (freezeAt !== undefined) {
    tl.pause(freezeAt);
    return Promise.resolve();
  }
  return new Promise((resolve) => tl.eventCallback('onComplete', () => {
    av.busy = false;
    resolve();
  }));
}

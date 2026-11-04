// Avatar provisório (corpo + cabeça + chapéu). Fase 2 troca por modelo com expressões faciais.
import * as THREE from 'three';
import { TABLE_Y } from './environment.ts';

export interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  /** Grupo onde ficam as cartas que o bot está segurando. */
  handGroup: THREE.Group;
  /** Ponto acima da cabeça para a plaquinha de nome. */
  labelAnchor: THREE.Object3D;
}

export function buildAvatar(shirt: number, skin: number, hat: number): Avatar {
  const root = new THREE.Group();
  const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 16), mat(shirt));
  torso.position.y = TABLE_Y + 0.12;
  torso.scale.set(1, 1, 0.75);
  torso.castShadow = true;
  root.add(torso);

  // braços apoiados na mesa
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 10), mat(shirt));
    arm.position.set(side * 0.16, TABLE_Y + 0.08, 0.15);
    arm.rotation.x = Math.PI / 2.4;
    arm.rotation.z = side * -0.35;
    arm.castShadow = true;
    root.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), mat(skin));
    hand.position.set(side * 0.08, TABLE_Y + 0.07, 0.3);
    root.add(hand);
  }

  const head = new THREE.Group();
  head.position.y = TABLE_Y + 0.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), mat(skin, 0.6));
  skull.scale.set(1, 1.1, 1);
  skull.castShadow = true;
  head.add(skull);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), mat(0x1a1a1a, 0.3));
    eye.position.set(side * 0.045, 0.02, 0.108);
    head.add(eye);
  }
  const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), mat(0x2b1a0e));
  moustache.position.set(0, -0.04, 0.115);
  head.add(moustache);
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

  return { root, head, handGroup, labelAnchor };
}

// Cenário "Boteco Raiz": mesa de madeira com feltro verde, luz quente e alguns objetos.
import * as THREE from 'three';

export const TABLE_Y = 0.76;
export const TABLE_R = 0.85;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

function woodTexture(base: string, line: string, repeat = 1) {
  return canvasTexture(
    512,
    512,
    (ctx) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 140; i++) {
        const y = Math.random() * 512;
        ctx.strokeStyle = line;
        ctx.globalAlpha = 0.08 + Math.random() * 0.18;
        ctx.lineWidth = 1 + Math.random() * 3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
    repeat,
  );
}

function feltTexture() {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#1f5a34';
      ctx.fillRect(0, 0, 256, 256);
      const img = ctx.getImageData(0, 0, 256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 22;
        img.data[i] = img.data[i]! + n;
        img.data[i + 1] = img.data[i + 1]! + n;
        img.data[i + 2] = img.data[i + 2]! + n;
      }
      ctx.putImageData(img, 0, 0);
    },
    4,
  );
}

function bottle(color: number, labelColor: number): THREE.Group {
  const g = new THREE.Group();
  const pts = [
    [0, 0],
    [0.04, 0],
    [0.042, 0.005],
    [0.042, 0.16],
    [0.036, 0.19],
    [0.014, 0.23],
    [0.013, 0.29],
    [0, 0.29],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 24),
    new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }),
  );
  glass.castShadow = true;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: labelColor, roughness: 0.8 }),
  );
  label.position.y = 0.09;
  g.add(glass, label);
  return g;
}

function copoAmericano(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.03, 0.09, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide, flatShading: true }),
  );
  glass.position.y = 0.045;
  const beer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.033, 0.028, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: 0xd99a1e, roughness: 0.3, emissive: 0x3a2200 }),
  );
  beer.position.y = 0.031;
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.033, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0xfff6e0 }));
  foam.position.y = 0.067;
  g.add(glass, beer, foam);
  return g;
}

export interface Environment {
  lamp: THREE.PointLight;
}

export function buildEnvironment(scene: THREE.Scene): Environment {
  scene.background = new THREE.Color(0x140d08);
  scene.fog = new THREE.Fog(0x140d08, 3.5, 8);

  // Luzes
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x2a1a10, 0.55));
  // Luz ambiente quente da lâmpada (sem sombra) + spot com sombra (1 passada, mais leve que PointLight).
  const lamp = new THREE.PointLight(0xffc27a, 4, 6, 1.6);
  lamp.position.set(0, 1.95, 0);
  scene.add(lamp);
  const spot = new THREE.SpotLight(0xffc27a, 14, 4, Math.PI / 3.2, 0.6, 1.4);
  spot.position.set(0, 1.98, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0015;
  scene.add(spot, spot.target);
  const fill = new THREE.DirectionalLight(0xffd9a8, 0.35);
  fill.position.set(1.5, 2.5, 2);
  scene.add(fill);

  // Luminária pendente
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.16, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2f4a2a, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.3 }),
  );
  shade.position.set(0, 2.08, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
  bulb.position.set(0, 2.0, 0);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  wire.position.set(0, 2.75, 0);
  scene.add(shade, bulb, wire);

  // Piso e paredes
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ map: woodTexture('#3b2617', '#1a0f08', 6), roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(
      256,
      256,
      (ctx) => {
        ctx.fillStyle = '#6b3a22';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#4a2716';
        for (let row = 0; row < 8; row++) {
          ctx.fillRect(0, row * 32, 256, 3);
          for (let col = 0; col < 5; col++) ctx.fillRect(((row % 2) * 32 + col * 64) % 256, row * 32, 3, 32);
        }
      },
      3,
    ),
    roughness: 0.95,
  });
  const room = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 7), [wallMat, wallMat, wallMat, wallMat, wallMat, wallMat]);
  room.geometry.scale(-1, 1, 1); // faces para dentro
  room.position.y = 1.7;
  room.receiveShadow = true;
  scene.add(room);

  // Prateleira com garrafas na parede ao fundo
  const shelfMat = new THREE.MeshStandardMaterial({ map: woodTexture('#5a3a20', '#2a170a'), roughness: 0.7 });
  for (let i = 0; i < 2; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.25), shelfMat);
    shelf.position.set(0, 1.3 + i * 0.45, -3.35);
    scene.add(shelf);
    for (let b = 0; b < 9; b++) {
      const colors = [0x2d5a1e, 0x6b3a0a, 0x203a5a, 0x8a6a1a];
      const bt = bottle(colors[(b + i) % colors.length]!, b % 2 ? 0xe8dcc0 : 0xa8322a);
      bt.position.set(-1.05 + b * 0.26, 1.32 + i * 0.45, -3.33);
      scene.add(bt);
    }
  }

  // Mesa
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture('#6b4425', '#2c180a'), roughness: 0.55 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + 0.08, TABLE_R + 0.08, 0.05, 64), wood);
  top.position.y = TABLE_Y - 0.026;
  top.castShadow = true;
  top.receiveShadow = true;
  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE_R - 0.02, 64),
    new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 1 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = TABLE_Y + 0.0005;
  felt.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + 0.02, 0.03, 12, 64), wood);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TABLE_Y;
  rim.castShadow = true;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, TABLE_Y - 0.05, 16), wood);
  leg.position.y = (TABLE_Y - 0.05) / 2;
  leg.castShadow = true;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.04, 32), wood);
  foot.position.y = 0.02;
  scene.add(top, felt, rim, leg, foot);

  // Objetos na mesa
  const copo1 = copoAmericano();
  copo1.position.set(0.55, TABLE_Y, 0.42);
  const copo2 = copoAmericano();
  copo2.position.set(-0.5, TABLE_Y, -0.5);
  const garrafa = bottle(0x5a2e0a, 0xe2d2a8);
  garrafa.position.set(0.62, TABLE_Y, -0.38);
  scene.add(copo1, copo2, garrafa);

  return { lamp };
}

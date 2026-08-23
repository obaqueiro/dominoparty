import { Container, Graphics, Text } from 'pixi.js';

/** Mexican-Train center hub: black octagon with a white starting-double slot (legacy parity). */
export function makeCenter(): Container {
  const c = new Container();
  const octagon = new Graphics();
  const r = 100;
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    // 22.5° offset like the legacy Konva RegularPolygon
    const a = (Math.PI / 4) * i + Math.PI / 8 - Math.PI / 2;
    pts.push(r * Math.cos(a), r * Math.sin(a));
  }
  octagon.poly(pts).fill(0x000000);
  c.addChild(octagon);
  const slot = new Graphics();
  slot.rect(-25, -40, 50, 90).fill(0xffffff);
  c.addChild(slot);
  c.eventMode = 'static';
  c.cursor = 'grab';
  return c;
}

export function makeTrain(): Container {
  const c = new Container();
  const t = new Text({ text: '🚂', style: { fontSize: 35 } });
  t.anchor.set(0.5);
  c.addChild(t);
  c.eventMode = 'static';
  c.cursor = 'grab';
  return c;
}

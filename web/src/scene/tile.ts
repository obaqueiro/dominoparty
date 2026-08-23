import { Container, Graphics, Renderer, Sprite, Texture } from 'pixi.js';
import { DOT_SPECS, FACE_COLOR, TILE_H, TILE_W } from '../pips';

/** Lazily-built shared textures: one face per (top,bottom) pair value, one back. */
export class TileTextures {
  private halves = new Map<number, Texture>();
  private back: Texture | null = null;

  constructor(private renderer: Renderer) {}

  half(n: number): Texture {
    let tex = this.halves.get(n);
    if (!tex) {
      const gfx = new Graphics();
      gfx.rect(0, 0, TILE_W, TILE_W).fill(FACE_COLOR).stroke({ color: 0x000000, width: 1 });
      const spec = DOT_SPECS[n];
      for (const { x, y } of spec.coords) {
        gfx.circle(x, y, spec.size).fill(spec.color);
      }
      tex = this.renderer.generateTexture({ target: gfx, resolution: 2 });
      gfx.destroy();
      this.halves.set(n, tex);
    }
    return tex;
  }

  backFace(): Texture {
    if (!this.back) {
      const gfx = new Graphics();
      gfx.rect(0, 0, TILE_W, TILE_H).fill(FACE_COLOR).stroke({ color: 0x000000, width: 1 });
      gfx.roundRect(6, 26, 28, 28, 4).stroke({ color: 0xd0c4b4, width: 2 });
      this.back = this.renderer.generateTexture({ target: gfx, resolution: 2 });
      gfx.destroy();
    }
    return this.back;
  }
}

/** A domino tile: two pip halves (bottom rendered upside-down, like a real tile) + back face. */
export class TileView extends Container {
  readonly tileName: string;
  private backSprite: Sprite;
  private highlight: Graphics;

  constructor(name: string, textures: TileTextures) {
    super();
    this.tileName = name;
    const [top, bottom] = name.split('x').map(Number);

    const topHalf = new Sprite(textures.half(top));
    const bottomHalf = new Sprite(textures.half(bottom));
    bottomHalf.anchor.set(1, 1);
    bottomHalf.rotation = Math.PI;
    bottomHalf.position.set(0, TILE_W);
    this.addChild(topHalf, bottomHalf);

    this.backSprite = new Sprite(textures.backFace());
    this.backSprite.visible = false;
    this.addChild(this.backSprite);

    this.highlight = new Graphics();
    this.highlight.rect(-2, -2, TILE_W + 4, TILE_H + 4).stroke({ color: 0x4a90e2, width: 2 });
    this.highlight.visible = false;
    this.addChild(this.highlight);

    // Rotate around the tile center.
    this.pivot.set(TILE_W / 2, TILE_H / 2);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  setFlipped(flipped: boolean): void {
    this.backSprite.visible = flipped;
  }

  setHighlight(on: boolean, color = 0x4a90e2): void {
    this.highlight.visible = on;
    this.highlight.tint = color;
  }
}

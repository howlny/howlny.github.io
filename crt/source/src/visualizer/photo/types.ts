export interface PhotoJack {
  x: number;
  y: number;
  r: number;
}

export interface PhotoLed {
  x: number;
  y: number;
  r: number;
  color: string;
  square: boolean;
}

/** lcd: blue LCD, crt: round green tube, video: colour LCD (footage), oled: white OLED, scope: green phosphor. */
export type PhotoScreenKind = "lcd" | "crt" | "video" | "oled" | "scope";

export interface PhotoScreen {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PhotoScreenKind;
  round: boolean;
}

/** grid: white/red LED matrix, pads: lit drum pads, steps: lit step buttons. */
export type PhotoGridKind = "grid" | "pads" | "steps";

export interface PhotoGrid {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  kind: PhotoGridKind;
}

export interface PhotoModuleData {
  /** Source x and width inside the strip image, in strip pixels. */
  sx: number;
  sw: number;
  /** Width / height of the physical panel. */
  aspect: number;
  jacks: PhotoJack[];
  leds: PhotoLed[];
  screens: PhotoScreen[];
  grids: PhotoGrid[];
}

export interface PhotoStrip {
  url: string;
  height: number;
  width: number;
  modules: PhotoModuleData[];
}

/** One photographed module, ready to be cut out of its loaded strip. */
export interface PhotoRef {
  id: number;
  img: HTMLImageElement;
  stripH: number;
  data: PhotoModuleData;
}

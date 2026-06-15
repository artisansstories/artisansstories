export type AddonType = 'LASER_MONOGRAM';
export type MonogramStyle = 'INITIALS' | 'FULL_NAME';
export type MonogramFont = 'Anonymous Pro' | 'Happy Monkey' | 'Oregano';

export interface MonogramConfig {
  fonts: MonogramFont[];
  maxChars: number;
  styles: MonogramStyle[];
}

export interface MonogramData {
  text: string;
  font: MonogramFont;
  style: MonogramStyle;
}

export type AddonConfig =
  | { type: 'LASER_MONOGRAM'; config: MonogramConfig };

export type AddonData =
  | { type: 'LASER_MONOGRAM'; data: MonogramData };

export interface CartItemAddon {
  type: AddonType;
  data: MonogramData;
}

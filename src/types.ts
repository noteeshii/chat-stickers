export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type StickerEffect =
  "none" | "foil" | "holographic" | "polychrome" | "gold";

export type UserRole =
  "channelOwner" | "moderator" | "vip" | "subscriber" | "follower";

export type Sticker = {
  id: number;
  syncId: string;
  author: string;
  text: string;
  color: string;
  x: number;
  y: number;
  rotation: number;
  leaving: boolean;
  pinned: boolean;
  effect: StickerEffect;
  roles: UserRole[];
  customRewardId?: string | null;
};

export type OverlaySettings = {
  channel: string;
  lifetime: number;
  rewardMode: boolean;
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
  safeAreaExcluded: boolean;
};

export type OverlayProfile = {
  id: string;
  name: string;
  updatedAt: number;
  settings: OverlaySettings;
  clientCount?: number;
};

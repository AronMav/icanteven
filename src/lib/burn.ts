/** Every destruction scene must finish or cancel and release its resources. */
export type BurnHandle = { finished: Promise<void>; cancel: () => void };

export const EASE = [0.22, 1, 0.36, 1] as const;

export const THEME_EASE = [0.33, 0, 0.2, 1] as const;

export const pageEnter = {
  initial: { opacity: 0, y: 7 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE },
};

export const tabSwap = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: EASE },
};

export const listItem = (i: number) => ({
  initial: { opacity: 0, x: -6 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.28, ease: EASE, delay: Math.min(i * 0.04, 0.2) },
});

export const cardStagger = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, ease: EASE, delay: Math.min(i * 0.045, 0.2) },
});

export const NAV_SPRING = { type: "spring" as const, stiffness: 390, damping: 33 };

export const hoverLift = { y: -1 };
export const tapScale = { scale: 0.98 };

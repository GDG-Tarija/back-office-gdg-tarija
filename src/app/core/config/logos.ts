const CLOUDINARY_BASE = 'https://res.cloudinary.com/dopkch3x9/image/upload';

export const LOGOS = {
  icon: {
    src: `${CLOUDINARY_BASE}/v1769174223/logoGDG_Tarija_nox4y2.svg`,
    alt: 'GDG Tarija',
  },
  horizontal: {
    src: `${CLOUDINARY_BASE}/v1752286109/gdg_tarija_logo_t3xzpo.svg`,
    alt: 'GDG Tarija',
  },
  square: {
    src: `${CLOUDINARY_BASE}/v1753129644/logoGDGTarija_lyzyzo.svg`,
    alt: 'GDG Tarija',
  },
} as const;

import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';

/** Escala del azul de marca (500 = #4285f4). Con texto blanco el mínimo AA es 700. */
const BLUE = {
  50: '#eef4fe',
  100: '#d2e3fc',
  200: '#aecbfa',
  300: '#8ab4f8',
  400: '#669df6',
  500: '#4285f4',
  600: '#1a73e8',
  700: '#1967d2',
  800: '#185abc',
  900: '#174ea6',
  950: '#123a7d',
};

export const GdgPreset = definePreset(Aura, {
  semantic: {
    primary: BLUE,
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
        highlight: {
          background: '{primary.100}',
          focusBackground: '{primary.200}',
          color: '{primary.900}',
          focusColor: '{primary.900}',
        },
      },
      dark: {
        primary: {
          color: '{primary.300}',
          contrastColor: '#0b1b33',
          hoverColor: '{primary.200}',
          activeColor: '{primary.100}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: 'rgba(255,255,255,.87)',
          focusColor: 'rgba(255,255,255,.87)',
        },
      },
    },
  },
});

import { App } from './app';
import './styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

// Block browser gestures (pinch-zoom, pull-to-refresh, long-press menus) that
// would otherwise fight the touch controls.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const app = new App(canvas, ui);
app.start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is best-effort */
    });
  });
}

// Handy for debugging from the console.
(window as unknown as { lanternfall: App }).lanternfall = app;

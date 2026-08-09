import { startApp } from './app';

startApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

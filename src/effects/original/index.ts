import { defineEffect } from '../../core/effect';

// The plain camera. Also the smallest possible effect.
export default defineEffect({
  id: 'original',
  name: 'No filter',
  icon: '📷',
  order: 0,
  description: 'Just the camera.',
  create: () => ({}),
});

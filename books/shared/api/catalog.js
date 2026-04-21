import { api } from './core.js';

/** Fetch genres list. */
export async function getGenres() {
  return api.get('/genres');
}


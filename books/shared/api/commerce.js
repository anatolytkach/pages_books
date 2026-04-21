import { api } from './core.js';

/** Get active offers for a book. */
export async function getBookOffers(bookId) {
  return api.get(`/books/${bookId}/offers`);
}

/** Create a Stripe checkout session for an offer. */
export async function createCheckout(bookId, offerId) {
  return api.post(`/books/${bookId}/checkout`, { body: { offer_id: offerId } });
}


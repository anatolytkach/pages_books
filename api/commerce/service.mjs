import { can, PERMISSIONS } from "../permissions/policy.mjs";
import { resolveReaderBookEntitlement } from "../entitlements/service.mjs";

function normalizeText(value) {
  return String(value || "").trim();
}

export async function listCommerceEntitlements({ sbFetch, userId }) {
  const { data, error } = await sbFetch("entitlements", {
    params: `user_id=eq.${userId}&is_active=eq.true&select=*,books:book_id(id,title,author,cover_url,content_id)`,
  });
  if (error) return { error, status: 500 };
  return { data: data || [], status: 200 };
}

export async function listCommerceBookOffers({ sbFetch, bookId }) {
  const { data, error } = await sbFetch("book_offers", {
    params: `book_id=eq.${bookId}&is_active=eq.true&select=*`,
  });
  if (error) return { error, status: 500 };
  return { data: data || [], status: 200 };
}

function validateOfferCreateBody(body) {
  if (!body || !body.offer_type) {
    return { error: "offer_type is required", status: 400 };
  }
  if (!["purchase", "rental"].includes(body.offer_type)) {
    return { error: "offer_type must be 'purchase' or 'rental'", status: 400 };
  }
  if (body.price_cents === undefined || body.price_cents < 0) {
    return { error: "price_cents is required and must be >= 0", status: 400 };
  }
  if (body.offer_type === "rental" && (!body.rental_days || body.rental_days < 1)) {
    return { error: "rental_days is required for rental offers", status: 400 };
  }
  return null;
}

function buildOfferCreatePayload({ bookId, body, userId }) {
  const offer = {
    book_id: bookId,
    offer_type: body.offer_type,
    price_cents: body.price_cents,
    currency: body.currency || "USD",
    created_by_user_id: userId,
  };
  if (body.offer_type === "rental") offer.rental_days = body.rental_days;
  return offer;
}

function buildOfferUpdatePayload(body) {
  const allowed = ["price_cents", "currency", "rental_days", "is_active"];
  const updates = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }
  return updates;
}

async function fetchBookPolicyFacts({ sbFetch, bookId }) {
  if (!bookId) return null;
  const { data: book } = await sbFetch("books", {
    params: `id=eq.${bookId}&select=id,published_by_user_id,published_by_tenant_id`,
    single: true,
  });
  return book || null;
}

async function checkOwnedBookOfferManagementAccess({ sbFetch, bookId, userId }) {
  const book = await fetchBookPolicyFacts({ sbFetch, bookId });
  return !!book && String(book.published_by_user_id || "") === String(userId || "");
}

export async function createCommerceOffer({ sbFetch, bookId, userId, body, policyContext = null }) {
  const validationError = validateOfferCreateBody(body);
  if (validationError) return validationError;

  const book = await fetchBookPolicyFacts({ sbFetch, bookId });
  if (!book) {
    return { error: "Book not found or not owned by you", status: 404 };
  }

  const decision = await can({ userId, policyContext }, PERMISSIONS.offerManage, {
    bookId,
    book,
    checkOfferManagementAccess: ({ bookId: currentBookId, userId: currentUserId }) =>
      checkOwnedBookOfferManagementAccess({ sbFetch, bookId: currentBookId, userId: currentUserId }),
  });
  if (!decision.allowed) {
    return { error: "Book not found or not owned by you", status: 404 };
  }

  const { data, error } = await sbFetch("book_offers", {
    method: "POST",
    body: buildOfferCreatePayload({ bookId, body, userId }),
    single: true,
  });
  if (error) return { error, status: 400 };
  return { data, status: 201 };
}

export async function updateCommerceOffer({ sbFetch, offerId, userId, body, policyContext = null }) {
  const updates = buildOfferUpdatePayload(body || {});
  if (!Object.keys(updates).length) {
    return { error: "No fields to update", status: 400 };
  }

  const { data: existingOffer } = await sbFetch("book_offers", {
    params: `id=eq.${offerId}&select=id,book_id`,
    single: true,
  });
  if (!existingOffer) return { error: "Offer not found", status: 404 };

  const book = await fetchBookPolicyFacts({ sbFetch, bookId: existingOffer.book_id });
  const decision = await can({ userId, policyContext }, PERMISSIONS.offerManage, {
    bookId: existingOffer.book_id,
    book,
    checkOfferManagementAccess: ({ bookId: currentBookId, userId: currentUserId }) =>
      checkOwnedBookOfferManagementAccess({ sbFetch, bookId: currentBookId, userId: currentUserId }),
  });
  if (!decision.allowed) return { error: "Offer not found", status: 404 };

  const { data, error } = await sbFetch("book_offers", {
    method: "PATCH",
    params: `id=eq.${offerId}&select=*`,
    body: updates,
    single: true,
  });
  if (error) return { error, status: 400 };
  if (!data) return { error: "Offer not found", status: 404 };
  return { data, status: 200 };
}

export async function getCommerceEntitlementView({ sbFetch, bookId, user }) {
  return resolveReaderBookEntitlement({ sbFetch, bookId, user });
}

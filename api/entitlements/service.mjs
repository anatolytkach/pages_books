function normalizeText(value) {
  return String(value || "").trim();
}

export async function getActiveUserTenantIdsForReaderEntitlements({ sbFetch, userId }) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return [];
  const { data, error } = await sbFetch("tenant_memberships", {
    params: `user_id=eq.${normalizedUserId}&is_active=eq.true&select=tenant_id`,
  });
  if (error || !Array.isArray(data)) return [];
  return [...new Set(data.map((row) => normalizeText(row.tenant_id)).filter(Boolean))];
}

export async function resolveReaderMembershipGrant({ sbFetch, book, userId }) {
  const normalizedUserId = normalizeText(userId);
  if (!book || !normalizedUserId) return "";
  if (normalizeText(book.published_by_user_id) === normalizedUserId) {
    return "publisher";
  }
  const visibility = normalizeText(book.visibility);
  const tenantId = normalizeText(book.published_by_tenant_id);
  if (visibility !== "tenant_only" || !tenantId) return "";
  const tenantIds = await getActiveUserTenantIdsForReaderEntitlements({ sbFetch, userId: normalizedUserId });
  return tenantIds.includes(tenantId) ? "tenant_membership" : "";
}

export async function resolveReaderEntitlementGrant({ sbFetch, bookId, userId }) {
  const normalizedUserId = normalizeText(userId);
  const normalizedBookId = normalizeText(bookId);
  if (!normalizedUserId || !normalizedBookId) return null;
  const { data: entitlements } = await sbFetch("entitlements", {
    params: `user_id=eq.${normalizedUserId}&book_id=eq.${normalizedBookId}&is_active=eq.true&select=*&order=created_at.desc`,
  });
  if (entitlements && entitlements.length > 0) {
    for (const ent of entitlements) {
      if (ent.entitlement_type === "purchase") {
        return { access: "full", type: "purchase" };
      }
      if (ent.entitlement_type === "rental" && (!ent.expires_at || new Date(ent.expires_at) > new Date())) {
        return { access: "full", type: "rental", expires_at: ent.expires_at };
      }
    }
  }
  return null;
}

export async function listActiveReaderOffers({ sbFetch, bookId }) {
  const normalizedBookId = normalizeText(bookId);
  if (!normalizedBookId) return [];
  const { data: offers } = await sbFetch("book_offers", {
    params: `book_id=eq.${normalizedBookId}&is_active=eq.true&select=*`,
  });
  return Array.isArray(offers) ? offers : [];
}

export async function getReaderAccessBookByContentId({ sbFetch, contentId }) {
  const { data: book } = await sbFetch("books", {
    params: `content_id=eq.${contentId}&select=id,title,author,annotation,cover_url,status,is_free,visibility,published_by_tenant_id,published_by_user_id`,
    single: true,
  });
  return book || null;
}

export async function resolveReaderContentAccess({ sbFetch, contentId, user = null }) {
  const book = await getReaderAccessBookByContentId({ sbFetch, contentId });
  if (!book) return { access: "full", type: "free", book: null, offers: [] };
  if (book.is_free) return { access: "full", type: "free", book, offers: [] };
  if (book.status !== "published") return { access: "full", type: "unpublished", book, offers: [] };

  if (user) {
    const membershipGrant = await resolveReaderMembershipGrant({
      sbFetch,
      book,
      userId: user.sub,
    });
    if (membershipGrant === "publisher") {
      return { access: "full", type: "publisher", book, offers: [] };
    }
    if (membershipGrant === "tenant_membership") {
      return { access: "full", type: "tenant_membership", book, offers: [] };
    }

    const entitlementGrant = await resolveReaderEntitlementGrant({
      sbFetch,
      bookId: book.id,
      userId: user.sub,
    });
    if (entitlementGrant) {
      return { ...entitlementGrant, book, offers: [] };
    }
  }

  const offers = await listActiveReaderOffers({ sbFetch, bookId: book.id });
  if (!offers.length) return { access: "full", type: "free", book, offers: [] };
  return { access: "none", type: "offers_required", book, offers };
}

export async function canConsumeReaderBook({ sbFetch, book, user = null }) {
  if (!book) return false;
  if (book.status !== "published" || book.is_free || book.visibility === "public") {
    return true;
  }
  if (user) {
    const membershipGrant = await resolveReaderMembershipGrant({
      sbFetch,
      book,
      userId: user.sub,
    });
    if (membershipGrant) return true;

    const entitlementGrant = await resolveReaderEntitlementGrant({
      sbFetch,
      bookId: book.id,
      userId: user.sub,
    });
    if (entitlementGrant) return true;
  }
  return false;
}

export async function resolveReaderBookEntitlement({ sbFetch, bookId, user = null }) {
  const { data: book } = await sbFetch("books", {
    params: `id=eq.${bookId}&select=id,is_free,status,visibility,published_by_tenant_id,published_by_user_id`,
    single: true,
  });
  if (!book) return { error: "Book not found", status: 404 };
  if (book.is_free) {
    return { data: { access: "full", type: "free" }, status: 200 };
  }
  if (!user) {
    const offers = await listActiveReaderOffers({ sbFetch, bookId });
    return { data: { access: "none", offers }, status: 200 };
  }

  const membershipGrant = await resolveReaderMembershipGrant({
    sbFetch,
    book,
    userId: user.sub,
  });
  if (membershipGrant) {
    return { data: { access: "full", type: "tenant_membership" }, status: 200 };
  }

  const entitlementGrant = await resolveReaderEntitlementGrant({
    sbFetch,
    bookId,
    userId: user.sub,
  });
  if (entitlementGrant) {
    return { data: entitlementGrant, status: 200 };
  }

  const offers = await listActiveReaderOffers({ sbFetch, bookId });
  if (!offers.length) {
    return { data: { access: "full", type: "free" }, status: 200 };
  }
  return { data: { access: "none", offers }, status: 200 };
}

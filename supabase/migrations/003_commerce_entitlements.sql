-- ============================================================
-- Migration 003: Commerce & Entitlements
-- ============================================================

-- What's for sale/rent on a book
CREATE TABLE book_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    offer_type TEXT NOT NULL CHECK (offer_type IN (
        'purchase', 'rental', 'library_license', 'subscription_inclusion'
    )),
    created_by_tenant_id UUID REFERENCES tenants(id),
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    rental_days INTEGER CHECK (
        (offer_type = 'rental' AND rental_days > 0)
        OR (offer_type != 'rental' AND rental_days IS NULL)
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_book_offers_book ON book_offers(book_id) WHERE is_active = true;

-- User's right to access a book
CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    entitlement_type TEXT NOT NULL CHECK (entitlement_type IN (
        'purchase', 'rental', 'library_borrow', 'subscription', 'institutional'
    )),
    granted_by_tenant_id UUID REFERENCES tenants(id),
    offer_id UUID REFERENCES book_offers(id),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,                  -- NULL = permanent (purchase)
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entitlements_user_book ON entitlements(user_id, book_id) WHERE is_active = true;
CREATE INDEX idx_entitlements_user ON entitlements(user_id) WHERE is_active = true;

-- Stripe-connected payout accounts for tenants/publishers
CREATE TABLE payout_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_account_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'active', 'disabled'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id)
);

-- Payment transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    book_id UUID NOT NULL REFERENCES books(id),
    offer_id UUID NOT NULL REFERENCES book_offers(id),
    entitlement_id UUID REFERENCES entitlements(id),
    stripe_checkout_session_id TEXT,
    stripe_payment_intent_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    platform_fee_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'completed', 'failed', 'refunded'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_stripe ON transactions(stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL;

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON book_offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payout_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE book_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- book_offers: active offers on published books are public
CREATE POLICY "Active offers on published books are viewable"
    ON book_offers FOR SELECT
    USING (
        is_active = true
        AND book_id IN (SELECT id FROM books WHERE status = 'published')
    );

-- book_offers: creators see all their offers
CREATE POLICY "Creators see own offers"
    ON book_offers FOR SELECT
    USING (created_by_user_id = auth.uid());

-- book_offers: authenticated book publishers can create offers
CREATE POLICY "Book publishers can create offers"
    ON book_offers FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by_user_id = auth.uid()
        AND book_id IN (
            SELECT id FROM books
            WHERE published_by_user_id = auth.uid()
               OR published_by_tenant_id IN (
                   SELECT tenant_id FROM tenant_memberships
                   WHERE user_id = auth.uid()
                   AND role IN ('owner', 'admin', 'publisher')
                   AND is_active = true
               )
        )
    );

-- book_offers: creators can update
CREATE POLICY "Offer creators can update"
    ON book_offers FOR UPDATE
    USING (
        created_by_user_id = auth.uid()
        OR created_by_tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin', 'publisher')
            AND is_active = true
        )
    );

-- entitlements: users see only their own
CREATE POLICY "Users see own entitlements"
    ON entitlements FOR SELECT
    USING (user_id = auth.uid());

-- entitlements: created by service role (via Worker with service key) — no direct user insert
-- The Worker creates entitlements after successful Stripe payment
CREATE POLICY "Service role creates entitlements"
    ON entitlements FOR INSERT
    WITH CHECK (false);  -- blocked for anon/authenticated; service_role bypasses RLS

-- payout_accounts: tenant owners see their own
CREATE POLICY "Tenant owners see payout accounts"
    ON payout_accounts FOR SELECT
    USING (
        tenant_id IN (
            SELECT tenant_id FROM tenant_memberships
            WHERE user_id = auth.uid() AND role = 'owner' AND is_active = true
        )
    );

-- transactions: users see own transactions
CREATE POLICY "Users see own transactions"
    ON transactions FOR SELECT
    USING (user_id = auth.uid());

-- transactions: created by service role only
CREATE POLICY "Service role creates transactions"
    ON transactions FOR INSERT
    WITH CHECK (false);  -- blocked for anon/authenticated; service_role bypasses RLS

WePub Permissions & Access Business Model v1
1. Purpose

This spec defines how access should work for:

anonymous readers
signed-in readers
individual publishers
publisher organizations and their members
superusers

It separates:

visibility
read access
administrative permissions
local-only anonymous reader state
server-side personal cabinet state
2. Core principles
2.1 Permissions and entitlements are different
Permissions

Used for management and operational authority:

create title
edit metadata
publish
manage organization members
manage entitlements
Entitlements

Used for reader consumption access:

purchased access
rental
subscription
complimentary access
organization-granted reading access

These must remain separate.

2.2 Anonymous reader state is separate from both

Unsigned readers can:

read certain books
make notes
accumulate My Library

But this state lives only in:

browser local storage / IndexedDB

It is not a user account, not a permission, and not a database entitlement.

2.3 Visibility and readability are different

A book can be:

visible in catalog
but not readable

Example:

public paid book visible to everyone
readable only by entitled signed-in readers
2.4 Publisher access and reader access are different

A publisher may:

manage a title
preview a draft
publish/unpublish/delete
without that being modeled as a reader entitlement.

A reader may:

read a purchased title
without any title-management permission.
3. Actor model
3.1 Anonymous Reader

Not signed in.

Can:

browse public catalog
view public title metadata
read books that are:
published public
free to read
not entitlement-gated
make notes
accumulate My Library locally

Cannot:

purchase paid access
persist notes/library across devices
read entitlement-gated paid books
access personal cabinet

Storage:

all notes and library are local-only
3.2 Signed-in Reader

Signed-in user whose primary function is reading.

Can:

do everything an anonymous reader can
persist notes to DB
persist My Library to DB
access personal cabinet
purchase reader entitlements
read entitlement-gated books they own or are granted

Cannot by default:

manage titles
publish drafts
manage organization members
manage offers or entitlements for books
3.3 Individual Publisher

A single-user publisher, not an organization.

Can:

onboard as publisher
create title drafts
upload manuscript/source
review protected draft
publish draft
unpublish
delete own books
manage entitlements/offers for own books
make a book:
public and free
public and paid

Important:

no organization-only visibility concept is needed for individual publishers
drafts are visible only to the individual publisher and superuser
3.4 Publisher Organization Member

Member of a publishing organization.

Can have a scoped permission set such as:

manage organization members
create drafts
review drafts
publish drafts
unpublish
delete
manage entitlements
manage offers

Organization books may be:

public
or organization-only

Drafts are visible only to authorized org members and superuser.

3.5 Superuser

Platform-wide unrestricted authority.

Can:

do everything
inspect and manage any organization, publisher, title, entitlement, or user path

Should be:

rare
auditable
4. Resource model

Permissions and access decisions apply to these resource types:

platform
organization
organization member
publisher profile
title
edition
source asset
publishing job
offer
entitlement
library item
note / annotation
note package
5. Title lifecycle and visibility model
5.1 Lifecycle states

At minimum:

draft
published
unpublished
deleted or soft-deleted equivalent

Drafts are never public.

5.2 Visibility values
draft_private

Meaning:

title is a draft
visible only to:
individual publisher owner
authorized organization members
superuser
published_public

Meaning:

title is visible in public catalog
visible to signed-in and unsigned readers

Readable only if:

free/public-read rules allow it
or reader has required entitlement
published_org_only

Meaning:

title is visible only to members of the owning organization
not visible in public catalog to outsiders
relevant only for organization-owned titles

Readable by:

organization members according to org access rules
superuser

Note:

individual publishers do not use published_org_only
6. Read-access model

A user may read a book if one of the following rules grants access.

6.1 Anonymous read access

Allowed when all are true:

title state = published
visibility = published_public
book is marked free to read
no entitlement is required

This is the only read path for unsigned users.

6.2 Signed-in reader read access

Allowed when any are true:

anonymous read access rules apply
reader has a valid entitlement
title is organization-only and reader is an authorized org member
reader has an explicit preview/internal access path
user is superuser
6.3 Publisher/operator preview access

Allowed when:

individual publisher owns the title
or org member has scoped title/draft preview/manage access
or superuser

This is not modeled as ordinary customer entitlement.

7. Anonymous reader state model
7.1 Anonymous My Library

Unsigned readers can save titles they have opened/read.

Storage:

local browser storage only

Properties:

device/browser specific
not shared across devices
not visible in server-side account data
7.2 Anonymous notes

Unsigned readers can create notes/highlights.

Storage:

local browser storage only

Properties:

tied to local device/browser
not available cross-device
not visible in personal cabinet
7.3 Sign-in transition

When anonymous reader signs in:

local notes and My Library remain available locally
system should offer explicit import/merge into account

Recommended product behavior:

prompt on first sign-in:
import local notes
import local My Library
imported records become server-side account data

Do not silently overwrite server data.

8. Signed-in reader model
8.1 Personal cabinet

For signed-in readers, personal cabinet includes:

My Library
notes/highlights
purchased/granted entitlements
optionally reading history/progress

Storage:

DB-backed
cross-device
8.2 Reader-side capabilities

These are user capabilities, not publisher/admin permissions.

Suggested capabilities:

library.view_own
library.sync_own
note.create_own
note.edit_own
note.delete_own
note.sync_own
entitlement.purchase_self
entitlement.view_own
9. Publisher permission model
9.1 Permission philosophy

Use:

permissions as the real model
templates as convenience bundles

Do not use hard-wired role logic as the source of truth.

9.2 Suggested permission scopes

Use these scopes:

platform
organization
title

This is sufficient for the current business model.

Possible later additions:

edition
publisher
imprint
9.3 Core permission catalog
Platform permissions
platform.superuser
platform.audit.view
Organization permissions
organization.view
organization.members.manage
organization.permissions.manage
Title/catalog permissions
title.create
title.view_public
title.view_draft
title.view_org_restricted
title.edit_metadata
title.delete
title.publish
title.unpublish
Publishing/pipeline permissions
source.upload
draft.review
artifact.reprocess
Commerce/entitlement management permissions
entitlement.manage
offer.manage
sales.view
Reader-side capabilities
library.view_own
library.sync_own
note.create_own
note.edit_own
note.delete_own
note.sync_own
entitlement.purchase_self
10. Individual publisher model
10.1 Scope

Individual publisher permissions are scoped to:

own titles
10.2 Effective default permission bundle

An individual publisher should automatically receive:

title.create
title.view_draft
title.edit_metadata
source.upload
draft.review
title.publish
title.unpublish
title.delete
entitlement.manage
offer.manage

Scope:

own titles only
10.3 Visibility constraints

Individual publisher books may be:

published_public and free
published_public and paid

Not needed:

published_org_only
11. Publisher organization model
11.1 Organization-wide default rule

Organization titles belong to the organization scope.

11.2 Template bundles for admin UX

These are templates only, not security truth.

Organization Admin
organization.view
organization.members.manage
organization.permissions.manage
title.create
title.view_draft
title.edit_metadata
title.publish
title.unpublish
title.delete
entitlement.manage
offer.manage
Editorial / Publishing Operator
title.create
title.view_draft
title.edit_metadata
source.upload
draft.review
optionally title.publish
Catalog Editor
title.view_draft
title.edit_metadata
Commerce Manager
entitlement.manage
offer.manage
optionally sales.view
11.3 Organization book visibility

Org-owned published books may be:

published_public
published_org_only
12. Business rules table
12.1 Can view title metadata?
Actor	Draft private	Published public	Published org-only
Anonymous reader	No	Yes	No
Signed-in reader	No	Yes	Only if org member
Individual publisher owner	Own drafts only	Own books yes	N/A
Org member with title visibility	Yes if permitted	Yes	Yes if org member/permitted
Superuser	Yes	Yes	Yes
12.2 Can read book?
Actor	Public free	Public paid	Org-only
Anonymous reader	Yes	No	No
Signed-in reader without entitlement	Yes if free	No	Only if org grants access
Signed-in reader with entitlement	Yes	Yes	If entitlement/org access applies
Individual publisher owner	Own books yes	Own books yes	N/A
Org member with preview/manage rights	According to scoped preview/manage rights	According to scoped preview/manage rights	Yes if org access applies
Superuser	Yes	Yes	Yes
12.3 Can manage book lifecycle?Ye
Actor	Create	Publish	Unpublish	Delete
Anonymous reader	No	No	No	No
Signed-in reader	No	No	No	No
Individual publisher owner	Yes	Yes	Yes	Yes
Org member with scoped permissions	As granted	As granted	As granted	As granted
Superuser	Yes	Yes	Yes	Yes
12.4 Can manage org members?
Actor	Manage org members
Anonymous reader	No
Signed-in reader	No
Individual publisher	No
Org admin / authorized member	Yes
Superuser	Yes
13. Entitlement model
13.1 Entitlement types

At minimum:

purchase
rental
subscription
complimentary
org_access
13.2 Entitlement ownership

Entitlements belong to:

signed-in readers
or organization access scope

Unsigned readers do not have DB entitlements.

14. Visibility + access decision order

For any read attempt, resolve in this order:

Step 1 — title state

If not published:

deny unless publisher preview/admin path applies
Step 2 — visibility

If published_org_only:

require org membership/authorized org access

If published_public:

continue
Step 3 — public/free rule

If book is public and free and no entitlement is required:

allow anonymous or signed-in reader
Step 4 — entitlement rule

If entitlement required:

require valid entitlement for signed-in reader
Step 5 — preview/internal override

If user is authorized publisher/operator/superuser:

allow according to preview/manage rules

This decision path should be centralized.

15. Storage model implications
15.1 Anonymous state

Client-side only:

local library
local notes
15.2 Signed-in state

DB-backed:

personal library
notes
entitlements
reading history/progress if applicable
15.3 Publisher-side state

DB-backed:

drafts
publishing jobs
catalog metadata
offers
entitlement assignments
16. Design decisions locked by this spec

These are now explicit design decisions:

Anonymous users may browse and read only public free non-entitlement books.
Anonymous notes and My Library are local-only.
Signed-in readers may persist notes and My Library to DB.
Signed-in readers may purchase reading entitlements.
Individual publishers may publish books as:
public and free
public and paid
Organization publishers may publish books as:
public
organization-only
Drafts are visible only to authorized publisher-side users and superuser.
Permissions and entitlements remain separate.
Visibility and readability remain separate.
Superuser can do everything.
17. Recommended next artifacts

From this business model, the next concrete specs should be:

Permission Catalog v1
exact keys
scope support
default bundles/templates
Access Decision Matrix
can view / can read / can manage per actor/resource/state
Data Model Mapping
how organizations, titles, visibility, entitlements, and personal cabinet map to storage
Anonymous-to-Signed-In Migration Flow
how local notes/library import into account

===================================================================================================
## Canonical Terms And Access Model

  ### Canonical vocabulary

  Use these terms consistently in docs, code reviews, and implementation discussions.

  - Permission = can manage/operate
  - Capability = can use own feature
  - Entitlement = can read
  - Visibility = can see
  - Lifecycle state = where the title is in workflow/publication

  ### Meaning of each term

  Permission
  Administrative or operational authority over a resource or workflow.

  Examples:

  - title.publish
  - title.edit_metadata
  - organization.members.manage
  - offer.manage

  Capability
  A user-side product ability, usually self-scoped.

  Examples:

  - library.view_own
  - library.sync_own
  - note.create_own
  - entitlement.purchase_self

  Entitlement
  A right to consume or read a title.

  Examples:

  - purchase
  - rental
  - subscription
  - complimentary
  - org-granted reading access

  Entitlements are for reading/access decisions, not for publisher or admin authority.

  Visibility
  A rule determining who may see that a title exists in a given context.

  Current schema interpretation:

  - public = publicly visible
  - tenant_only = org-only visible
  - private = private/draft-style visible only through authorized publisher-side access

  Visibility is not the same as readability.

  Lifecycle state
  The workflow/publication state of a title.

  Current canonical values:

  - draft
  - processing
  - ready
  - published
  - unpublished
  - failed

  Lifecycle state is not the same as visibility.

  ### Canonical reader access rule

  Reader access is determined by the canonical evaluator:

  lifecycle state -> visibility -> public/free -> entitlement -> preview/admin override

  This evaluator is the single source of truth for any “can this actor open/read this book?” decision.

  ### Canonical evaluation order

  Step 1: Lifecycle state
  If the title is not published, deny ordinary reader access.
  Only preview/admin override candidates may continue.

  Step 2: Visibility
  - If tenant_only, continue only for authorized org-member or override paths
  - If private, continue only for preview/admin override paths

  Step 3: Public/free
  Allow reading without entitlement only when:

  - lifecycle state = published
  - visibility = public
  - is_free = true

  Step 4: Entitlement
  If public/free did not grant access, allow only if the actor has a valid entitlement.

  Step 5: Preview/admin override
  If no ordinary reader path granted access, allow only if the actor has explicit preview/manage authority over the title.

  This includes:

  - individual publisher owner
  - authorized org publisher/operator
  - superuser

  Preview/admin override is not ordinary reader entitlement.

  ### Canonical interpretation rule

  Use this wording in reviews:

  - Permission answers: can this actor manage or operate this resource?
  - Capability answers: can this actor use this feature for their own account/workflow?
  - Entitlement answers: can this actor read this title?
  - Visibility answers: can this actor see this title exists?
  - Lifecycle state answers: where is this title in its workflow/publication process?

  ### Canonical reminder

  Do not collapse these concepts:

  - permission is not entitlement
  - visibility is not readability
  - preview/admin override is not reader entitlement
  - lifecycle state is not visibility

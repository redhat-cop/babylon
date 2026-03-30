# Multi Asset Workshop

The Multi Asset Workshop feature allows organizers to bundle multiple workshop sessions (catalog-backed labs and external URLs) into a single event with a branded public landing page. Attendees access a portal URL and pick from the available labs; organizers manage scheduling, seats, branding, and asset lifecycle from the authenticated UI.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [User Roles](#user-roles)
- [Routes and Navigation](#routes-and-navigation)
- [Feature Flag](#feature-flag)
- [Creating a Multi Asset Workshop](#creating-a-multi-asset-workshop)
- [Managing a Multi Asset Workshop (Detail Page)](#managing-a-multi-asset-workshop-detail-page)
- [Listing Multi Asset Workshops](#listing-multi-asset-workshops)
- [Public Landing Page (Attendee View)](#public-landing-page-attendee-view)
- [Catalog Item Selector Modal](#catalog-item-selector-modal)
- [External Workshop Modal](#external-workshop-modal)
- [Purpose and Activity Options](#purpose-and-activity-options)
- [Kubernetes Resources](#kubernetes-resources)
- [API Endpoints](#api-endpoints)
- [Admin Features](#admin-features)
- [File Inventory](#file-inventory)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      Authenticated UI                        │
│                                                              │
│  MultiWorkshopList ──► MultiWorkshopCreate                   │
│        │                      │                              │
│        │                      │  createMultiWorkshop()       │
│        ▼                      ▼                              │
│  MultiWorkshopDetail ◄────────┘                              │
│        │                                                     │
│        ├─ patchMultiWorkshop()  (edit, reorder, dates)       │
│        ├─ deleteMultiWorkshop() (delete event)               │
│        ├─ deleteAssetFromMultiWorkshop()                     │
│        ├─ lockWorkshop() / addOwnerReferenceToWorkshopAndLock│
│        │                                                     │
│        ├─ CatalogItemSelectorModal (pick catalog items)      │
│        └─ ExternalWorkshopModal   (add external URLs)        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                     Public Landing Page                       │
│                                                              │
│  MultiWorkshopLanding ──► /api/event/{namespace}/{name}      │
│        │                                                     │
│        ├─ Hero image + branding                              │
│        ├─ Workshop cards (lab links or external URLs)         │
│        └─ Seat availability per workshop                     │
└──────────────────────────────────────────────────────────────┘
```

Data flows through **SWR** (stale-while-revalidate) for server state, with no Redux. Optimistic updates are used for asset reordering. The backend is a Kubernetes custom resource (`MultiWorkshop` CRD) managed through the Babylon API proxy.

---

## User Roles

| Role | Capabilities |
|------|-------------|
| **Regular user** | Create, list, edit, and delete multi asset workshops in their own namespace. Limited to 30 seats. Must provide Salesforce IDs for customer-facing purposes. Cannot see catalog items without the `multi-asset` label. Cannot use the "Ready by date" feature. |
| **Admin** | All regular capabilities plus: up to 200 seats, access to all catalog items (not limited by the `multi-asset` label), "Ready by date" scheduling (beta), access to all service namespaces, admin-only purpose categories (Asset Development, Admin), can bypass system ordering blocks. |
| **Attendee** (unauthenticated) | View the public landing page, access available workshop labs and external links. |

---

## Routes and Navigation

### Authenticated Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/multi-workshop` | `MultiWorkshopList` | List all multi asset workshops (redirects to user namespace) |
| `/multi-workshop/:namespace` | `MultiWorkshopList` | List multi asset workshops in a namespace |
| `/multi-workshop/create` | `MultiWorkshopCreate` | Create a new multi asset workshop |
| `/multi-workshop/:namespace/:name` | `MultiWorkshopDetail` | View/edit a specific multi asset workshop |

### Public Route

| Route | Component | Description |
|-------|-----------|-------------|
| `/event/:namespace/:name` | `MultiWorkshopLanding` | Public attendee-facing landing page |

### Navigation

- **Side nav**: "Multi Asset Workshop" link appears under the user's namespace when `multiworkshops_enabled` is `true` in the interface config.
- **Admin nav**: "Multi-Workshops" link under `/admin/multiworkshops` for admin users.

---

## Feature Flag

The feature is gated by the `multiworkshops_enabled` flag in the interface configuration.

- **RHPDS** (`catalog/ui/src/public/interfaces/rhpds.json`): `"multiworkshops_enabled": true`
- **RHDP Partners** (`catalog/ui/src/public/interfaces/rhdp-partners.json`): hidden (not enabled)

The flag controls the visibility of the "Multi Asset Workshop" nav link. The underlying API routes still exist regardless of this flag.

---

## Creating a Multi Asset Workshop

**Route**: `/multi-workshop/create`

### Form Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Project** | Yes (admin only, if multiple namespaces) | Select the target namespace via `ProjectSelector` |
| **Workshop Name** | Yes | Display name shown to attendees on the landing page |
| **Description** | No | Markdown description shown on the landing page |
| **Background Image URL** | No | URL for the hero banner image on the landing page |
| **Logo Image URL** | No | URL for the logo displayed in the landing page header |
| **Start Provisioning** | Yes | Date/time when workshop environments begin provisioning |
| **Ready by Date** | No | Admin-only beta feature. When enabled, environments target readiness by this date, with an 8-hour lead time applied automatically for provisioning. Toggled via a switch labeled with a `BetaBadge`. |
| **Auto-destroy** | Yes | Date/time when all workshop environments are destroyed. Must be after the start/ready-by date. |
| **Number of Seats** | Yes | How many attendees can join. Max 30 for regular users, 200 for admins. |
| **Activity / Purpose** | Yes | Why the workshop is being run (see [Purpose Options](#purpose-and-activity-options)) |
| **Salesforce ID(s)** | Conditional | Required when the selected purpose has `sfdcRequired: true`. Supports multiple Salesforce campaign/project/opportunity IDs. |
| **Workshop Assets** | Yes (at least 1) | Catalog items to include. Each asset is selected via the [Catalog Item Selector Modal](#catalog-item-selector-modal). Assets can have optional custom display names and descriptions. |

### Estimates

When catalog items have associated metrics (fetched by asset UUID), the create form displays:

- **Estimated provisioning time**: maximum across all selected assets
- **Estimated cost**: calculated from duration × hourly cost estimates, accounting for multiuser vs single-user seat logic

### Validation and Guards

- Workshop ordering blocked by system status: shows a danger alert (non-admin users cannot proceed)
- Quota exceeded: shows a warning and disables the create button
- Disabled user: if the API returns 403, a `UserDisabledModal` is shown
- All required fields must be filled before the form is submittable

### After Creation

On successful creation, the user is redirected to the detail page at `/multi-workshop/{namespace}/{name}`.

---

## Managing a Multi Asset Workshop (Detail Page)

**Route**: `/multi-workshop/:namespace/:name`

The detail page has three tabs: **Details**, **Workshop Assets**, and **YAML**.

### Details Tab

Displays and allows editing of the workshop metadata:

| Field | Editable | Notes |
|-------|----------|-------|
| **Display Name** | Yes | Inline editable via `EditableText`. Updates both `displayName` and `name` in the spec. |
| **Name** | No | Kubernetes resource name. Shown with an OpenShift Console link. |
| **Portal URL** | No | Link to `/event/{namespace}/{name}`. Opens in a new tab. This is the URL to share with attendees. |
| **Start Provisioning** | Yes | `DateTimePicker`. Only shown if provisioning hasn't started yet (start date is in the future or not set). |
| **Start Now** | Action | Button to immediately set `startDate` to the current time. Opens a confirmation modal. |
| **End Date** | Yes | `DateTimePicker` for the auto-destroy date. |
| **Description** | Yes | Inline editable text area. |
| **Background Image** | Yes | URL input for the landing page hero. |
| **Logo Image** | Yes | URL input for the landing page header logo. |
| **Created** | No | Timestamp of when the resource was created. |
| **Seats** | No | Read-only display of the configured number of seats. |
| **Activity / Purpose** | No | Read-only display of the configured purpose and Salesforce items. |

### Workshop Assets Tab

Manage the assets (labs) included in the multi asset workshop:

#### Adding Assets

- **Add preprovisioned asset**: Opens a modal showing available workshops (from the same namespace + shared workshops via service accesses). Filters out workshops that are already assets, have owner references, or are being deleted. Supports search filtering and multi-select.
- **Add External Asset**: Opens the [External Workshop Modal](#external-workshop-modal) to add a link to an external resource.

When adding a preprovisioned workshop, the system:
1. Locks the workshop (`lockWorkshop` or `addOwnerReferenceToWorkshopAndLock`)
2. Patches the multi asset workshop to include the new asset

#### Asset Table Columns

| Column | Description |
|--------|-------------|
| **Name** | Links to the workshop detail page (for Workshop type) or opens the external URL. Shows "Not created yet" for pending assets. |
| **Display Name** | Inline editable. The name shown to attendees on the landing page. |
| **Description** | Inline editable. Shown on the landing page card. |
| **Status** | `External`, `Created`, or `Pending`. For created workshops, shows `AssetWorkshopStatus` with resource claim details and scheduled status. |
| **Auto-destroy** | Shows the lifespan end from the associated workshop. |
| **Actions** | Delete button to remove the asset (with confirmation modal). |

#### Reordering Assets

Assets can be **drag-and-drop reordered** using PatternFly's `DragDropSort`. The order determines the display order on the landing page. Reordering is optimistically updated in the UI and then patched to the server; on error, the previous order is restored.

#### Deleting Assets

- For **Workshop-type assets**: the confirmation modal notes that the associated workshop will also be deleted.
- For **External assets**: only the asset reference is removed.

### YAML Tab

Read-only Monaco editor showing the full `MultiWorkshop` custom resource as YAML. Useful for debugging and inspecting the raw resource state.

---

## Listing Multi Asset Workshops

**Route**: `/multi-workshop/:namespace`

### Features

- **Search**: Keyword search input filters across name, namespace, description, and display name (case-insensitive, AND logic for multiple words separated by spaces).
- **Infinite scroll**: Uses Kubernetes continue-token pagination with `useSWRInfinite`. Loads the next page when scrolling within 500px of the bottom.
- **Auto-refresh**: Data refreshes every 8 seconds.
- **Bulk delete**: Select multiple rows via checkboxes and delete them with a single confirmation.
- **Per-row delete**: Trash icon on each row.
- **Create button**: Navigates to `/multi-workshop/create`.

### Table Columns

| Column | Description |
|--------|-------------|
| Name | Links to the detail page |
| Description | Truncated description text |
| Total Assets | Count of workshop assets |
| Seats | Number of configured seats |
| Start provisioning | Formatted start date |
| Auto-destroy | Formatted end date |
| Created | Relative time since creation (`TimeInterval`) |
| Actions | Delete button |

### Empty States

- **No namespace**: Prompt to select a namespace
- **No workshops found** (with search): Message indicating no results match the filter
- **No workshops** (without search): Call-to-action to create the first multi asset workshop

---

## Public Landing Page (Attendee View)

**Route**: `/event/:namespace/:name`

This is the page shared with attendees. It requires **no authentication**.

### Layout

1. **Fixed header**: Dark background with the Demo Platform logo and an optional custom logo (from `spec.logoImage`).
2. **Hero section**: Full-width banner using `spec.backgroundImage` (falls back to a bundled default hero image). Overlaid with the workshop title and description.
3. **Workshop cards grid**: Each asset is displayed as a card with:
   - Display name and description
   - Available seat count (for Workshop-type assets, when `availableSeats` is present)
   - Click action: opens the workshop or external URL in a new tab
4. **Footer**: Standard platform footer.

### Card States

| State | Appearance |
|-------|------------|
| **Available (Workshop)** | Clickable card linking to `/workshop/{workshopId}` |
| **Available (External)** | Clickable card opening `asset.url` in a new tab |
| **Unavailable (Workshop)** | Muted, non-clickable card showing "Workshop unavailable" |
| **Unavailable (External)** | Muted, non-clickable card showing "External workshop unavailable" |

### Data Fetching

- Uses the **public** API endpoint `/api/event/{namespace}/{name}` (no auth required)
- Auto-refreshes every **8 seconds**
- Shows a spinner while loading, and an error alert if the workshop is not found

---

## Catalog Item Selector Modal

Used during **create** and when adding assets in the **detail** page to browse and select catalog items.

### Behavior

- **Non-admin users**: Only see catalog items labeled with `babylon.gpte.redhat.com/multi-asset: "true"`.
- **Admin users**: See all catalog items.

### Features

- **Catalog namespace dropdown**: Filter by catalog namespace
- **Search**: Fuse.js fuzzy search (minimum 3 characters, extended search syntax supported)
- **Category chips**: Filter by catalog item categories
- **Multi-select mode**: Enabled by default. Toggle checkbox to switch between multi-select and single-select.
  - **Multi-select**: Check multiple items, then click "Add Selected (N)".
  - **Single-select**: Click a card to select it and immediately close the modal.
- **Virtualized grid**: Uses `react-window` `FixedSizeGrid` for performance with large catalogs.

---

## External Workshop Modal

Used from the **detail** page to add an external URL as a workshop asset.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| **URL** | Yes | Must be a valid URL |
| **Display Name** | Yes | Name shown on the landing page card |
| **Description** | No | Description shown on the landing page card |

Validation ensures the URL is parseable before allowing confirmation.

---

## Purpose and Activity Options

When creating a multi asset workshop, users must select a purpose categorized by activity type. Options are defined in `purposeOptions.json`.

### Activity Categories

| Category | Audience | SFDC Required | Role Restrictions |
|----------|----------|---------------|-------------------|
| **Customer Facing** | Demos, workshops, PoCs for customers | Yes (most) | None |
| **Partner Facing** | Partner demos, enablement, events | Mixed | None |
| **Practice / Enablement** | Internal training, learning, practice | Mixed | None |
| **Brand Event** | Summit, AnsibleFest, RH1, ETX, etc. | No | Requires specific roles (e.g., `rhpds-devs-rh1`, `rhpds-admins`, `rhpds-devs-summit`) |
| **Asset Development** | Building custom or community demos | No | Requires `rhpds-devs` or `rhpds-admins` |
| **Admin** | Asset maintenance, QA, internal admin tasks | No | Requires `rhpds-admins` |

When a purpose requires Salesforce (`sfdcRequired: true`), the user must provide at least one Salesforce campaign, project, or opportunity ID.

Some purposes have `requireUserInput: true`, which prompts for a free-text explanation (the "Other" options).

---

## Kubernetes Resources

The feature is backed by three Kubernetes Custom Resource Definitions (CRDs) under the `babylon.gpte.redhat.com` API group:

| CRD | Plural | Description |
|-----|--------|-------------|
| `MultiWorkshop` | `multiworkshops` | The top-level event resource containing metadata, schedule, and asset references |
| `Workshop` | `workshops` | Individual workshop session (child of MultiWorkshop via owner references) |
| `WorkshopProvision` | `workshopprovisions` | Provisioning instruction for a workshop (concurrency, count, parameters, pool) |

### Ownership Model

- A `MultiWorkshop` **owns** its child `Workshop` resources via Kubernetes owner references.
- Child workshops are annotated with `babylon.gpte.redhat.com/multiworkshop-source` and `babylon.gpte.redhat.com/multiworkshop-uid`.
- Deleting a `MultiWorkshop` cascades deletion to owned workshops (via Kubernetes garbage collection).

CRD definitions live in `helm/crds/`.

---

## API Endpoints

### Authenticated (Kubernetes API Proxy)

| Path | Method | Description |
|------|--------|-------------|
| `/apis/babylon.gpte.redhat.com/v1/namespaces/{ns}/multiworkshops` | GET | List multi asset workshops |
| `/apis/babylon.gpte.redhat.com/v1/namespaces/{ns}/multiworkshops/{name}` | GET | Get a specific multi asset workshop |
| `/apis/babylon.gpte.redhat.com/v1/namespaces/{ns}/multiworkshops` | POST | Create a multi asset workshop |
| `/apis/babylon.gpte.redhat.com/v1/namespaces/{ns}/multiworkshops/{name}` | PATCH | Update a multi asset workshop |
| `/apis/babylon.gpte.redhat.com/v1/namespaces/{ns}/multiworkshops/{name}` | DELETE | Delete a multi asset workshop |

### Public (Catalog API)

| Path | Method | Description |
|------|--------|-------------|
| `/api/event/{namespace}/{name}` | GET | Public read-only endpoint for the landing page (no auth required). Returns workshop data with available seat counts. |

---

## Admin Features

### Admin Multi-Workshop List

**Route**: `/admin/multiworkshops`

Admins have a dedicated view showing **all** multi asset workshops across all namespaces, with bulk delete capabilities.

### Ops Page Integration

The Ops page (`/admin/ops`) groups workshops by their parent `MultiWorkshop` using the `multiworkshop-source` annotation, displaying the multi asset workshop's `displayName` as the group title and linking to both the detail page and the public portal URL.

### Services Page Integration

In the Services list, workshops that belong to a multi asset workshop display a **"Multi Asset Workshop"** label based on the `multiworkshop-source` annotation.

---

## File Inventory

| File | Purpose |
|------|---------|
| `MultiWorkshopCreate.tsx` | Create form with catalog item selection, scheduling, seats, SFDC, and cost estimates |
| `MultiWorkshopList.tsx` | Paginated list with search, infinite scroll, bulk delete |
| `MultiWorkshopDetail.tsx` | Detail/edit view with tabs for metadata, assets (drag-and-drop), and YAML |
| `MultiWorkshopLanding.tsx` | Public attendee-facing landing page with hero and workshop cards |
| `CatalogItemSelectorModal.tsx` | Modal for browsing and selecting catalog items with search, categories, and multi-select |
| `ExternalWorkshopModal.tsx` | Modal for adding external URL assets |
| `LabIcon.tsx` | Red Hat lab SVG icon used in landing page cards |
| `purposeOptions.json` | Purpose/activity definitions with SFDC rules and role restrictions |
| `multiworkshop-create.css` | Styles for the create form |
| `multiworkshop-list.css` | Styles for the list page |
| `multiworkshop-detail.css` | Styles for the detail page and drag-and-drop rows |
| `multiworkshop-landing.css` | Styles for the public landing page (hero, cards, header) |

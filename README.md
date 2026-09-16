# Vaango (வாங்கோ) — Hyperlocal Marketplace Platform

> **Phase 3: Shopkeeper MVP Complete**

Vaango is a hyperlocal, multi-vertical marketplace platform designed to connect neighborhood customers with local shops, pre-orders, and appointments without waiting in lines.

### Core Loop (Phase 2 Customer + Phase 3 Shopkeeper):
```text
Customer submits pre-order request
↓
Shopkeeper receives request in real-time Inbox
↓
Accept / Reject (with required reason)
↓
Start preparing order
↓
Mark Ready for counter pickup (preserves timestamp)
↓
Customer receives real-time notification
↓
Customer collects items at storefront
↓
Shopkeeper marks Completed
```

---

## 1. Technology Stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript (Strict Mode)
- **Styling**: Vanilla CSS Design Tokens (Semantic CSS variables, Light & Dark modes)
- **Typography**: Nunito (Google Fonts)
- **Database & Auth**: PostgreSQL via Supabase (Auth, RLS Policies, Database Migrations)
- **Realtime**: Supabase Realtime for instant request status updates
- **State Management**: React Context (`LocationContext`, `CartContext`, `AuthContext`, `ThemeContext`, `ToastContext`)
- **PWA**: Installable web application with manifest, custom icons, and offline caching service worker

---

## 2. Quick Start & Local Setup

### Prerequisites
- Node.js (v18+)
- npm (v9+)

### Installation
```bash
# Clone and enter the repository
cd e:/Vango

# Install dependencies
npm install

# Run TypeScript check and production build
npm run build

# Start development server
npm run dev
```
The application will be available at `http://localhost:3000`.

---

## 3. Customer Features Implemented in Phase 2

1. **Alphabetical Location Selector**:
   - Curated locations ordered alphabetically: **Chennai**, **Coimbatore**, **Gobichettipalayam** (launch town), **Madurai**.
   - Preserved in browsing context and `localStorage`.
2. **Customer Home Experience**:
   - Answers *"What do you want to do?"* with 3 large interactive choices:
     - 🛒 **Order something**: active Group A flow (Groceries, Bakery, Restaurant, Pharmacy, Stationery).
     - 📅 **Book an appointment**: clearly badged as Phase 3 • Coming Soon.
     - 🔧 **Get a service**: clearly badged as Phase 3 • Coming Soon.
3. **Shop Discovery & Tanglish Search**:
   - Location + Category filtered shop listings with open status, addresses, and delivery options.
   - Search utility supporting English, Tamil, and Tanglish keyword aliases (e.g. `thakkali` → `tomato`, `vengayam` → `onion`, `arisi` → `rice`, `paal` → `milk`).
4. **Shop Storefront & Catalogue**:
   - Product catalogue with prices, units, and clear stock status.
   - Obvious "Add" button (≥ 52px touch area).
   - Inline quantity controls (`- 2 +`) once added.
   - Out-of-stock products are visibly flagged and disabled from being added to the cart.
5. **Persistent Cart & Authoritative Validation**:
   - Persistent per-shop cart with item count, subtotal, and total amount.
   - Special instructions / notes textarea.
   - Conflict warning when adding items from a different shop.
   - Authoritative calculation: backend/server-side source of truth for total estimates.
   - Authentication check before submitting a request (preserves cart state).
6. **Request Lifecycle & Confirmation**:
   - Generated unique reference code (`ORD-XXXX`).
   - Initial status is strictly `REQUESTED` (not pre-accepted).
   - Post-submission confirmation screen with order reference and live tracking link.
7. **Live Visual Timeline & Realtime Updates**:
   - Human-readable timeline:
     - `REQUESTED`: Request Sent to Shop
     - `ACCEPTED`: Shop Accepted Your Order
     - `PREPARING`: Preparing Your Order
     - `READY`: Ready for Pickup (with counter collection prompt)
     - `COMPLETED`: Completed
     - Exception branches: `DELAYED`, `CANCELLED`, `REJECTED`.
   - Realtime event listener via Supabase Realtime (`requests:id=eq.{id}`).
   - High-priority in-app toast notifications on status changes.
   - **Interactive Developer Simulator Panel**: Allows testing status transitions directly in the UI.
8. **Request History**:
   - Customer request ledger (`/orders`) displaying active and past orders with clickable tracking links.
9. **Language Foundation (i18n)**:
   - Lightweight dictionary foundation (`src/lib/i18n.ts`) supporting English & Tamil toggle.

---

## 4. Phase 2 Scope Boundaries

Explicitly deferred to Phase 3+:
- Full shopkeeper merchant dashboard
- Full platform admin management console
- Appointment booking & service request workflows
- Payment gateway integration (Customer pays shopkeeper directly upon pickup/delivery)
- Ratings, reviews, and advertisements
- Customer behavioral data selling (strictly prohibited by product privacy principles)

---

## 5. Phase 3 Readiness

The database, state machine, requests ledger, and audit events are fully prepared for **Phase 3: Shopkeeper MVP**, where merchant users will receive, accept, prepare, and complete customer pre-orders in realtime.

# Part Finder - Year Make Model Parts Finder

## Overview
A Year/Make/Model parts finder web app that connects to the WPS (Western Power Sports) API for parts catalog data and BigCommerce for e-commerce integration. Built for a powersports dealer to let customers browse compatible parts by selecting their vehicle. Includes an embeddable widget for BigCommerce stores.

## Architecture
- **Frontend**: React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui components
- **Backend**: Express.js (Node.js) + TypeScript
- **Database**: PostgreSQL with Drizzle ORM (for caching/future features)
- **APIs**: WPS Data Depot API v4, BigCommerce REST API v3
- **Deployment**: Autoscale, build: `npm run build`, run: `node ./dist/index.cjs`

## Key Files
- `server/routes.ts` - API routes (vehicle data, parts browsing, BigCommerce)
- `server/wps-api.ts` - WPS API client (items, vehicle fitment endpoints)
- `server/bigcommerce-api.ts` - BigCommerce API client (products, store info)
- `server/vehicle-data.ts` - Local vehicle database (types, makes, models, years) with search terms for WPS matching
- `server/index.ts` - Express server setup with CORS and iframe-friendly headers
- `client/src/pages/home.tsx` - Main YMM selector page with parts grid
- `client/src/pages/embed.tsx` - Standalone embeddable widget (self-contained styles, no external CSS deps)
- `client/src/pages/embed-instructions.tsx` - Embed code snippets and BigCommerce setup guide
- `shared/schema.ts` - Database schema (Drizzle ORM)

## Pages
- `/` - Full app with header, status badges, and parts finder
- `/embed` - Minimal embeddable widget (for iframe embedding into BigCommerce)
- `/embed-instructions` - Copy-paste code snippets and step-by-step BigCommerce guide

## Embedding
- The `/embed` page is a self-contained widget with inline styles (no Tailwind dependency)
- Uses ResizeObserver + postMessage for auto-height in iframe contexts
- CORS headers allow cross-origin API requests from BigCommerce store domains
- X-Frame-Options header removed to allow iframe embedding

## Environment Variables
- `WPS_API_KEY` - WPS Data Depot API token (required for parts data)
- `BIGCOMMERCE_STORE_HASH` - BigCommerce store hash
- `BIGCOMMERCE_ACCESS_TOKEN` - BigCommerce API access token
- `DATABASE_URL` - PostgreSQL connection string (auto-provisioned)

## How It Works
1. Customer selects vehicle type (Dirt Bike, ATV, UTV, Street, Dual Sport)
2. Year, Make, and Model dropdowns populated from local vehicle database
3. After selection, WPS catalog is searched using the model's search terms (e.g. "CRF450R", "CRF 450R", "Honda CRF")
4. Search uses `filter[name][like]` on both WPS items and products endpoints
5. Results are grouped by actual WPS product_type categories (Engine, Exhaust, Clutch, etc.)
6. Parts display with images, SKU, pricing, stock status, and Add to Cart buttons
7. Category tabs show only categories that have matching parts, with counts

## WPS API Notes
- Items endpoint works with current API token
- Vehicle fitment endpoints (`/vehiclemakes`, `/vehiclemodels`, etc.) return 403 — requires additional permissions from WPS sales rep
- When fitment permissions are granted, the app has routes ready to use them (`/api/wps/fitment-check`, `/api/wps/vehicle/:id/items`)
- Vehicle-specific search: `filter[name][like]` on `/items` and `/products` endpoints finds parts matching a vehicle model
- Valid WPS `product_type` values: Engine, Exhaust, Suspension, Brakes, Body, Electrical, Handlebars, Wheels, Tires, Clutch, Chains, Sprockets, Tools, Chemicals, Luggage, Accessories
- New endpoint: `/api/parts/vehicle-search?terms=CRF450R,CRF+450R` searches both items and products by name, returns grouped results

## Order System
- Built-in cart and checkout flow within the embed widget
- Customers add parts to cart, enter contact info, and submit orders
- Orders stored in PostgreSQL `orders` table with status tracking
- API: `POST /api/orders` (create), `GET /api/orders` (list all), `PATCH /api/orders/:id/status` (update status)
- Order statuses: pending, confirmed, ordered, shipped, completed, cancelled
- Dealer can view and manage orders via the API

## BigCommerce Integration (requires valid API token)
- Store info and products endpoints are wired up
- SKU lookup: `/api/bigcommerce/lookup-skus` (POST) checks which WPS SKUs exist in BigCommerce catalog
- Add to cart: `/api/bigcommerce/add-to-cart` (POST) creates a cart via Server-to-Server API and returns redirect URL
- Currently returns 403 — API token needs Products (read) and Carts (modify) scopes
- Routes: `/api/bigcommerce/products`, `/api/bigcommerce/store`, `/api/bigcommerce/lookup-skus`, `/api/bigcommerce/add-to-cart`

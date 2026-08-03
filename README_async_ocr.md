# async-ocr README

This branch implements the P0 scope: async OCR worker + fast webhook response + transactional insertion + outbox skeleton.

What is included:
- migrations/001_unordered_goods_and_outbox.sql — creates ocr_jobs, outbox, and unordered_goods tables/indexes if missing.
- src/db/index.ts — lightweight Postgres helper (Pool + runTransaction).
- src/webhook/parseUpdate.ts — normalize incoming updates.
- src/webhook/routeUpdate.ts — thin webhook handler that persists ocr_jobs and returns 200 quickly.
- src/workers/ocrWorker.ts — BullMQ worker skeleton that processes ocr jobs and performs transactional insert of event + outbox.
- src/outbox/sender.ts — simple outbox sender skeleton.

How to run (local):
1) Ensure environment variables: DATABASE_URL, REDIS_URL
2) Apply migration: psql $DATABASE_URL -f migrations/001_unordered_goods_and_outbox.sql
3) Start worker: node -r ts-node/register src/workers/ocrWorker.ts
4) Wire webhook handler into your HTTP server (Express example):

  import express from 'express';
  import { createWebhookHandler } from './src/webhook/routeUpdate';
  const app = express();
  app.use(express.json());
  app.post('/webhook', createWebhookHandler());
  app.listen(3000);

Notes:
- The code is intentionally minimal and contains placeholders for model calls (vision/Tesseract) and external API integrations. Replace with your real integrations and add robust validation, error handling, and tests.

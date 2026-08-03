-- 001_unordered_goods_and_outbox.sql
-- Migration: create tables for jobs (OCR jobs) and outbox; create unordered_goods tables if missing (safe CREATE IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS unordered_goods_events (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  chat_id TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unordered_goods_items (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES unordered_goods_events(id) ON DELETE CASCADE,
  item_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- OCR jobs table: stores jobs created by webhook, to be processed by worker
CREATE TABLE IF NOT EXISTS ocr_jobs (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT,
  event_id BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, manual_review
  attempt INT NOT NULL DEFAULT 0,
  input JSONB,
  result JSONB,
  failed_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_external_id ON ocr_jobs(external_id);

-- Outbox table for reliable notification delivery
CREATE TABLE IF NOT EXISTS outbox (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sending, sent, failed
  attempts INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_scheduled ON outbox(status, scheduled_at);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_unordered_goods_events_created_at ON unordered_goods_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unordered_goods_items_event_id ON unordered_goods_items(event_id);

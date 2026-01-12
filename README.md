# Distributed Job Queue & Worker System

## Overview

Enterprise-grade distributed job queue & worker system for asynchronous job processing.

## Features

- Modular, multi-type job processing (video/audio, PDF, image, ML, email, ETL)
- Queue-based architecture with Redis/BullMQ
- Retry & backoff logic
- Dockerized for local development
- Ready for multi-tenant, production-grade deployment

## Local Setup

1. Clone repo
2. Copy `.env.example` to `.env` and fill in env variables
3. Run `docker-compose up --build`
4. API will be available on http://localhost:3000

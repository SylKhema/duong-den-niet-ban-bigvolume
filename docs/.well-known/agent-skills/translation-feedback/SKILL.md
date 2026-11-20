---
name: translation-feedback
description: Look up public editorial corrections, check feedback receipt status, and guide readers on submitting translation corrections or questions for Đường Đến Niết-bàn on nibbanagamini.org.
---

# Translation Feedback & Public Corrections Log

Use this skill when a user wants to report a translation error, typo, or terminology question in *Đường Đến Niết-bàn* (*Nibbānagāminipaṭipadā*), check the status of a previously submitted feedback receipt code, or review published editorial corrections.

## Overview

- **Feedback & Receipt Lookup Page:** `https://nibbanagamini.org/gop-y.html` (supports `?ui=vi` and `?ui=en`, and direct lookup via `?id=GY-...`)
- **Public Corrections Log:** `https://nibbanagamini.org/hieu-dinh.html`
- **Editor Contact Email:** `info@nibbanagamini.org`
- **No Account Required:** Submitting feedback, checking receipt status, and reading published corrections require no login or authentication.
- **Admin Portal Excluded:** `/review.html` is strictly for authorized human editors (`Disallow: /review.html` in `robots.txt`); agents must not attempt to access or sign in to `/review.html`.

## 1. Checking Public Corrections

- Direct users to `https://nibbanagamini.org/hieu-dinh.html` (or invoke the `get_public_corrections` WebMCP tool when visiting `/hieu-dinh.html`).
- Only items explicitly approved and published by the editorial team appear in the public log (`status` of `resolved` or `unchanged`). Pending submissions are not shown publicly.

## 2. Checking Feedback Receipt Status

- Feedback receipt codes have the format `GY-<uuid-v4>` (39 characters).
- Open `https://nibbanagamini.org/gop-y.html?id=<receipt-code>` or use the declarative WebMCP form `lookup_feedback_status` on `/gop-y.html`.
- Returned status values: `new` (Received), `reviewing` (Under review), `needs-info` (More information needed), `approved` (Correction approved), `resolved` (Corrected), `unchanged` (Wording kept with explanation), `duplicate` (Duplicate).

## 3. Submitting Translation Feedback

- Feedback can be submitted anonymously (name and email are optional) via the form on `https://nibbanagamini.org/gop-y.html` (exposed declaratively to browser agents as `submit_translation_feedback`).
- Required fields:
  - `series`: `"big"` (Complete Edition, volumes 1–5) or `"mini"` (Abridged Edition, volumes 1–9)
  - `volume`: integer (`1`–`5` for `big`, `1`–`9` for `mini`)
  - `language`: `"vi"`, `"en"`, or `"bi"`
  - `category`: `"translation"`, `"typo"`, `"terminology"`, `"question"`, or `"other"`
  - `message`: 5 to 4000 characters describing the issue or question
  - `consent`: explicit user agreement to store the feedback for editorial review
- Optional fields: `suggestion` (up to 4000 chars), `reference` (up to 1500 chars), `name` (up to 100 chars), `email` (up to 254 chars).
- **Privacy & Consent Rule:** Never submit feedback on behalf of a user without their explicit confirmation, and never include passwords, financial data, health records, or unrelated personal information.
- Remind the user to save the returned `GY-...` receipt code after submission.

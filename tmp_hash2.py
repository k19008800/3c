#!/usr/bin/env python3
import hashlib
h = hashlib.md5(open("/3cloud/api/src/db/migrations/2026-07-22-content-filters.sql", "rb").read()).hexdigest()[:8]
print(h)

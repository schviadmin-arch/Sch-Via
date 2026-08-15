---
name: Imported backend boundaries
description: Durable guidance for integrating uploaded backend code into workspace artifacts without letting incomplete optional adapters break the default runtime.
---

When an uploaded backend is copied into a new artifact, optional persistence adapters and their supporting modules may not arrive as a complete dependency graph. The default runtime must not statically load an unfinished adapter if the application is configured for another persistence mode.

**Why:** The SchVIA integration failed at startup first on malformed duplicated adapter code and then on a missing database module, even though the application was intended to run with JSON persistence.

**How to apply:** Validate imported modules with `node --check`, make optional adapters lazy or explicitly unavailable until their dependencies are present, then restart the workflow and test health, login, state, mutation, and logout.
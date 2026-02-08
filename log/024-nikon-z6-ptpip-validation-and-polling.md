## 2026-02-07 - Nikon Z6 PTP/IP validation + polling implementation

Context: picking up SAB-84 (Nikon Z6 PTP/IP validation) and SAB-31 (implement Nikon polling).

- Validated Nikon Z6 speaks standard PTP/IP on TCP 15740:
  - Confirmed INIT_COMMAND handshake (INIT_COMMAND_ACK)
  - Confirmed INIT_EVENT handshake (INIT_EVENT_ACK)
  - Added laptop scripts for repeatable verification:
    - `scripts/scan-ptpip.py` scans a /24 for open TCP 15740.
    - `scripts/ptpip-handshake.py` performs PTP/IP command+event handshake.

- Implemented Nikon event polling in the SabaiPicsStudio Swift stack:
  - Added PTP opcode mapping + command builder:
    - `apps/studio/SabaiPicsStudio/Services/PTPIPCommand.swift` adds `Nikon_GetEvent (0x90C7)` + `PTPCommand.nikonGetEvent()`.
  - Replaced the Nikon event source stub with a real polling loop:
    - `apps/studio/SabaiPicsStudio/Services/NikonEventSource.swift`
    - Polls `0x90C7` on the command channel with 50-200ms adaptive interval.
    - Parses Nikon event payload (u16 count + repeated [u16 code, u32 param1]) based on libgphoto2 `ptp_unpack_Nikon_EC`.
    - Triggers existing GetObjectInfo + download pipeline for `0xC101` (ObjectAddedInSDRAM) handles.
  - Wired Nikon event source to use the command channel (not the event channel):
    - `apps/studio/SabaiPicsStudio/Services/PTPIPSession.swift` factory now constructs `NikonEventSource(commandConnection, transactionManager, commandQueue, photoOps)`.

- Dev tooling: fixed the vendored GPhoto2Example UI (connect button tap + keyboard dismissal) and added Local Network permission string.

- Refactor: session-owned I/O + unified download pipeline (prep for multi-vendor stability):
  - `apps/studio/SabaiPicsStudio/Services/PTPIPSession.swift`
    - Added `executeOperation(...)` as the canonical command-channel boundary (serialized + deadline-based).
    - Moved standard event-channel monitoring into `PTPIPSession` via `PTPIPEventMonitorDelegate` + `eventObjectAddedStream()`.
    - Added a unified photo pipeline: vendor strategies enqueue object handles; session does `GetObjectInfo -> RAW filter -> JPEG download -> delegate callbacks`.
    - Fixed direct-connect flow to start monitoring via `startEventMonitoring()` (avoid missing standard event channel) and to avoid double-start.
  - `apps/studio/SabaiPicsStudio/Services/StandardEventSource.swift`
    - No longer owns the event channel; consumes `session.eventObjectAddedStream()` and enqueues handles into the session pipeline.
  - `apps/studio/SabaiPicsStudio/Services/SonyEventSource.swift`
    - Sony-only strategy (in-memory handle gating + logical handle synthesis); enqueues jobs into the session pipeline using `maxBytes` partial transfer.
  - `apps/studio/SabaiPicsStudio/Services/CanonEventSource.swift` + `apps/studio/SabaiPicsStudio/Services/NikonEventSource.swift`
    - Strategy-only: poll/parse events and enqueue handles into the session pipeline (no per-handle downloads).

- Disconnect detection: session-owned teardown + transport signals (no strategy involvement)
  - `apps/studio/SabaiPicsStudio/Services/PTPIPSession.swift`
    - Added `teardownOnce(reason:)` to make disconnect teardown idempotent and safe when triggered by transport callbacks.
    - Added NWConnection state handlers for command/event channels; `.failed/.cancelled` and long `.waiting` trigger teardown (only after monitoring started).
    - Event channel disconnect/error now triggers session teardown instead of only flipping `isConnected`.

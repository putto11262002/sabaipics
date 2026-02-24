# TODO

## Completed

- [x] Remove global `enabled` field from color/image pipeline settings
- [x] Auto-edit and LUT each have independent toggles
- [x] Remove LUT creation from reference image feature

## In Progress: Auto-Edit Presets Feature

### Schema (DONE)

- [x] Created `auto_edit_presets` table with migration
- [x] Updated `EventSettings.colorGrade` to use `autoEditPresetId`/`autoEditIntensity`
- [x] Renamed `intensity` → `lutIntensity`, `style` → `autoEditPresetId`
- [x] Added 8 built-in presets to migration seed

### API Routes (IN PROGRESS)

- [x] Created `/studio/auto-edit` routes (GET/POST/PATCH/DELETE)
- [x] Created preview endpoint `/studio/auto-edit/:id/preview`
- [x] Updated `image-pipeline-schema.ts` with new fields
- [ ] Fix remaining type errors in upload-consumer.ts (style → autoEditPresetId)
- [ ] Fix remaining type errors in events/index.ts (intensity → lutIntensity)
- [ ] Update Modal client to accept preset params instead of style

### Frontend (PENDING)

- [ ] Create hooks: `useAutoEditPresets`, `useCreateAutoEditPreset`, etc.
- [ ] Update sidebar navigation: Studio > LUTs + Auto Edit
- [ ] Create `/studio/auto-edit` list page
- [ ] Create auto-edit preview page
- [ ] Update Event Settings card to use `autoEditPresetId`

### Remaining Type Errors

- `src/api/src/queue/upload-consumer.ts`: Lines 642-700 use old `style`/`intensity`
- `src/api/src/routes/events/index.ts`: Lines 163, 232, 263, 306, 377, 408 use old schema
- `src/api/src/routes/studio/auto-edit.ts`: Import `Result` issue (line 65, 70)

## Upcoming

- [ ] **Upload consumer optimization** — Current batch size is 1 (due to OOM with Photon/memory constraints). Explore:
  - No buffer reading or image parsing touching the worker
  - Scale out horizontally

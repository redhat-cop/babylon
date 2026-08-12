# Tenant Cluster Visibility - Ops UI Wireframe

## Current WorkshopBar (Before)

```
┌────────────────────────────────────────────────────────────────────────┐
│ workshop-name-abc123                                        [PROD] [🔴 Stop in 2h] │
│ user-namespace · 15/20 seats · Provisioning: 18/20                    │
└────────────────────────────────────────────────────────────────────────┘
```

## New WorkshopBar (After) - With Cluster Badge

```
┌────────────────────────────────────────────────────────────────────────┐
│ workshop-name-abc123  🖥️ ocpv02-abc   [PROD] [🔴 Stop in 2h]          │
│ user-namespace · 15/20 seats · Provisioning: 18/20                    │
└────────────────────────────────────────────────────────────────────────┘
                      ↑
              Cluster badge (short name)
```

## Tooltip Enhancement (Hover on workshop bar)

### Current Tooltip
```
┌─────────────────────────────────┐
│ Workshop Details                │
├─────────────────────────────────┤
│ Name: workshop-name-abc123      │
│ Namespace: user-namespace       │
│ Stage: prod                     │
│ Seats: 15/20                    │
│ Stop: 2026-08-14 15:30 UTC      │
│ Destroy: 2026-08-15 09:00 UTC   │
└─────────────────────────────────┘
```

### New Tooltip (With Cluster Info)
```
┌─────────────────────────────────────────────────┐
│ Workshop Details                                │
├─────────────────────────────────────────────────┤
│ Name: workshop-name-abc123                      │
│ Namespace: user-namespace                       │
│ Stage: prod                                     │
│ Tenant Cluster: ocpv02-abc123 (tcp-prod-multi) │ ← NEW
│ Cluster Status: available (18/50 placements)   │ ← NEW
│ Seats: 15/20                                    │
│ Stop: 2026-08-14 15:30 UTC                      │
│ Destroy: 2026-08-15 09:00 UTC                   │
└─────────────────────────────────────────────────┘
```

## Cluster Filter (New Filter Dropdown)

### Filter Bar (Top of Ops Page)
```
┌────────────────────────────────────────────────────────────────────┐
│ Filters:                                                           │
│ [Stage: All ▼] [Status: All ▼] [Region: All ▼] [Cluster: All ▼]  │ ← NEW
│ [🔍 Search...                                            ]         │
└────────────────────────────────────────────────────────────────────┘
```

### Cluster Dropdown (Expanded)
```
┌─────────────────────────────────────┐
│ All Clusters (187)                  │ ← Shows total count
├─────────────────────────────────────┤
│ ocpv01-abc123 (24)                  │
│ ocpv02-xyz789 (31)                  │
│ ocpv03-def456 (18)                  │
│ ocpv08-ghi789 (42)                  │
│ ocpvdev01-test (12)                 │
│ ─────────────────────────────────── │
│ No Cluster (60)                     │ ← Workshops without assignment
└─────────────────────────────────────┘
```

## Timeline View (Cluster Grouping - Future Enhancement)

### Option A: Cluster Swimlanes
```
Timeline
├── 📍 ocpv01-abc123 (tcp-prod-multi)
│   ├── ▓▓▓▓▓ workshop-1
│   ├── ▓▓▓▓▓ workshop-2
│   └── ▓▓▓▓▓ workshop-3
├── 📍 ocpv02-xyz789 (tcp-prod-multi)
│   ├── ▓▓▓▓▓ workshop-4
│   └── ▓▓▓▓▓ workshop-5
└── 📍 No Cluster
    └── ▓▓▓▓▓ workshop-6
```

### Option B: Keep Namespace Grouping (Add Cluster Badges Only)
```
Timeline
├── 📁 user-alice-redhat-com
│   ├── ▓▓▓▓▓ workshop-1 🖥️ ocpv01
│   └── ▓▓▓▓▓ workshop-2 🖥️ ocpv01
├── 📁 user-bob-redhat-com
│   └── ▓▓▓▓▓ workshop-3 🖥️ ocpv02
└── 📁 user-carol-redhat-com
    └── ▓▓▓▓▓ workshop-4
```

## Badge Styling

### Cluster Badge Visual Design
```css
.timeline-bar__badge--cluster {
  background: #e7f1fa;      /* Light blue */
  color: #151515;           /* Dark text */
  border: 1px solid #c7c7c7;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85em;
  font-family: monospace;
}
```

### Badge States
- **Available**: `🖥️ ocpv02-abc` (blue background)
- **Disabled**: `🖥️ ocpv02-abc` (gray background, strikethrough)
- **Pending**: `🖥️ ocpv02-abc` (yellow background, loading spinner)
- **No Cluster**: (no badge shown)

## Cluster Capacity Indicator (Future Enhancement)

### In Timeline Legend/Header
```
┌────────────────────────────────────────────────────────────────┐
│ Cluster Capacity Overview                                     │
├────────────────────────────────────────────────────────────────┤
│ ocpv01-abc123: ████████████░░░░░░░░ 24/50 (48%)   🟢 Healthy │
│ ocpv02-xyz789: ████████████████░░░░ 31/50 (62%)   🟡 Moderate│
│ ocpv03-def456: ████████░░░░░░░░░░░░ 18/50 (36%)   🟢 Healthy │
│ ocpv08-ghi789: ████████████████████ 42/50 (84%)   🔴 High    │
└────────────────────────────────────────────────────────────────┘
```

## Mobile/Narrow Screen Behavior

### Cluster Badge on Small Screens
```
┌──────────────────────────────────┐
│ workshop-name-abc123             │
│ 🖥️ ocpv02  [PROD]  [🔴 2h]      │ ← Shortened cluster name
│ user-ns · 15/20 · 18/20          │
└──────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Data Layer (No Visual Changes Yet)
- Fetch TenantClusterPools
- Build cluster lookup map
- Add `getWorkshopCluster()` helper
- **User sees:** No visible changes

### Phase 2: Display Cluster Badges
- Add cluster badge to WorkshopBar
- Enhance tooltip with cluster info
- **User sees:** 🖥️ badges appear on workshop bars

### Phase 3: Cluster Filtering
- Add cluster dropdown to filter bar
- Filter workshops by selected cluster
- **User sees:** New "Cluster" dropdown in filters

### Phase 4: Capacity Indicators (Future)
- Show cluster utilization percentages
- Health status (green/yellow/red)
- **User sees:** Cluster capacity overview panel

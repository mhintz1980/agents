**PumpTracker Lite — Developer Implementation Spec (Build-Ready)**

## **0\) Scope (what ships in Lite)**

Local-first single-user web app with:

* Dashboard (KPIs, donuts by Customer/Model, build-time trend, capacity vs scheduled, Gantt-ish order timeline, details table, value breakdown).  
* Persistent toolbar with universal filters \+ “Add PO” modal (multi-line items).  
* Kanban board with drag & drop; stage collapse/expand.  
* Bulk CSV/JSON upload to replace dataset (PapaParse).  
* Optional Supabase adapter (toggle on/off).

Non-goals: auth, multi-user realtime, CI/CD, automated tests, full mobile.

---

## **1\) Architecture**

**Runtime:** React 18 \+ Vite \+ TypeScript \+ Tailwind \+ ShadCN \+ Zustand \+ Recharts \+ dnd-kit \+ PapaParse.  
 **Data model:** In-memory store, optional persistence to `localStorage`.  
 **Adapters:** `LocalAdapter` (default), `SupabaseAdapter` (drop-in, off by default).  
 **Charts:** Recharts primitives only (LineChart, AreaChart, PieChart, RadialBarChart).  
 **Routing:** Single-page (no routes required), sections as tabs/anchors.

### **High-level flow**

App  
 ├─ Header  
 ├─ Toolbar (FilterBar \+ AddPOButton)  
 ├─ Dashboard  
 │   ├─ KpiStrip  
 │   ├─ WorkloadDistribution (Donuts)  
 │   ├─ BuildTimeTrend  
 │   ├─ CapacityRadials  
 │   ├─ OrderTimeline (Gantt-lite)  
 │   └─ OrderTable  
 └─ KanbanBoard  
     ├─ StageColumn\[\*\]  
     └─ PumpCard  
Modals  
 ├─ AddPoModal (multi-line editor)  
 └─ PumpDetailsModal  
Data  
 ├─ store (Zustand)  
 ├─ adapters (LocalAdapter | SupabaseAdapter)  
 └─ parsers (PapaParse CSV/JSON)

---

## **2\) Data Model & Types**

// src/types.ts  
export type Stage \=  
  | "NOT STARTED"  
  | "FABRICATION"  
  | "POWDER COAT"  
  | "ASSEMBLY"  
  | "TESTING"  
  | "SHIPPING"  
  | "CLOSED";

export type Priority \= "Low" | "Normal" | "High" | "Rush" | "Urgent";

export interface Pump {  
  id: string;              // uuid  
  serial: number;          // 4-digit unique  
  po: string;  
  customer: string;  
  model: string;  
  stage: Stage;  
  priority: Priority;  
  powder\_color?: string;  
  last\_update: string;     // ISO  
  value: number;           // numeric  
  scheduledEnd?: string;   // ISO  
  // derived, non-persistent:  
  promiseDate?: string;    // from PO line  
}

export interface PoLine {  
  model: string;  
  quantity: number;  
  color?: string;  
  promiseDate?: string; // ISO  
  valueEach?: number;  
}

export interface AddPoPayload {  
  po: string;  
  customer: string;  
  lines: PoLine\[\]; // expands to multiple Pump entries  
}

export interface Filters {  
  po?: string;  
  customer?: string;  
  model?: string;  
  priority?: Priority | "";  
  stage?: Stage | "";  
  q?: string; // search  
  dateFrom?: string; // ISO (optional for trend)  
  dateTo?: string;   // ISO  
}

**Supabase table (`pump`):** mirrors `Pump` (snake\_case); PK `id (text)`, unique `serial (int4)`. Indexes on `po`, `customer`, `model`, `stage`, `priority`, `scheduled_end`.

---

## **3\) State Store (Zustand)**

// src/store.ts  
import { create } from "zustand";  
import { persist } from "zustand/middleware";  
import { Pump, Filters, AddPoPayload, Stage } from "./types";  
import { nanoid } from "nanoid";

type DataAdapter \= {  
  load: () \=\> Promise\<Pump\[\]\>;  
  replaceAll: (rows: Pump\[\]) \=\> Promise\<void\>;  
  upsertMany: (rows: Pump\[\]) \=\> Promise\<void\>;  
  update: (id: string, patch: Partial\<Pump\>) \=\> Promise\<void\>;  
};

interface AppState {  
  pumps: Pump\[\];  
  filters: Filters;  
  collapsedStages: Record\<Stage, boolean\>;  
  adapter: DataAdapter;  
  setAdapter: (a: DataAdapter) \=\> void;

  // actions  
  load: () \=\> Promise\<void\>;  
  setFilters: (f: Partial\<Filters\>) \=\> void;  
  clearFilters: () \=\> void;  
  addPO: (payload: AddPoPayload) \=\> void;  
  moveStage: (id: string, to: Stage) \=\> void;  
  replaceDataset: (rows: Pump\[\]) \=\> void;

  // selectors  
  filtered: () \=\> Pump\[\];  
}

export const useApp \= create\<AppState\>()(  
  persist(  
    (set, get) \=\> ({  
      pumps: \[\],  
      filters: {},  
      collapsedStages: {  
        "NOT STARTED": false, FABRICATION: false, "POWDER COAT": false,  
        ASSEMBLY: false, TESTING: false, SHIPPING: false, CLOSED: false  
      },  
      adapter: /\* injected in App.tsx \*/,  
      setAdapter: (a) \=\> set({ adapter: a }),

      load: async () \=\> {  
        const rows \= await get().adapter.load();  
        set({ pumps: rows });  
      },  
      setFilters: (f) \=\> set({ filters: { ...get().filters, ...f } }),  
      clearFilters: () \=\> set({ filters: {} }),

      addPO: ({ po, customer, lines }) \=\> {  
        const expanded: Pump\[\] \= lines.flatMap((line, i) \=\>  
          Array.from({ length: line.quantity || 1 }).map(() \=\> ({  
            id: nanoid(),  
            serial: genSerial(get().pumps), // ensure unique 4-digit  
            po,  
            customer,  
            model: line.model,  
            stage: "NOT STARTED",  
            priority: "Normal",  
            powder\_color: line.color,  
            last\_update: new Date().toISOString(),  
            value: line.valueEach ?? 0,  
            scheduledEnd: line.promiseDate  
          }))  
        );  
        const next \= \[...get().pumps, ...expanded\];  
        set({ pumps: next });  
        get().adapter.upsertMany(expanded);  
      },

      moveStage: (id, to) \=\> {  
        const next \= get().pumps.map(p \=\>  
          p.id \=== id ? { ...p, stage: to, last\_update: new Date().toISOString() } : p  
        );  
        set({ pumps: next });  
        get().adapter.update(id, { stage: to, last\_update: new Date().toISOString() });  
      },

      replaceDataset: (rows) \=\> {  
        set({ pumps: rows });  
        get().adapter.replaceAll(rows);  
      },

      filtered: () \=\> applyFilters(get().pumps, get().filters),  
    }),  
    { name: "pumptracker-lite" }  
  )  
);

// utils  
function genSerial(existing: Pump\[\]) {  
  const used \= new Set(existing.map(p \=\> p.serial));  
  for (let s \= 1000; s \<= 9999; s++) if (\!used.has(s)) return s;  
  return Math.floor(1000 \+ Math.random() \* 9000); // fallback  
}

function applyFilters(rows: Pump\[\], f: Filters) {  
  const q \= f.q?.toLowerCase();  
  return rows.filter(r \=\> {  
    if (f.po && r.po \!== f.po) return false;  
    if (f.customer && r.customer \!== f.customer) return false;  
    if (f.model && r.model \!== f.model) return false;  
    if (f.priority && r.priority \!== f.priority) return false;  
    if (f.stage && r.stage \!== f.stage) return false;  
    if (q && \!JSON.stringify(r).toLowerCase().includes(q)) return false;  
    return true;  
  });  
}

---

## **4\) Adapters**

### **LocalAdapter (default)**

// src/adapters/local.ts  
import { Pump } from "@/types";

const KEY \= "pumptracker-data-v1";

export const LocalAdapter \= {  
  async load(): Promise\<Pump\[\]\> {  
    const raw \= localStorage.getItem(KEY);  
    return raw ? JSON.parse(raw) : seed(); // seed() returns mock rows  
  },  
  async replaceAll(rows: Pump\[\]) {  
    localStorage.setItem(KEY, JSON.stringify(rows));  
  },  
  async upsertMany(rows: Pump\[\]) {  
    const all \= await this.load();  
    const byId \= new Map(all.map(r \=\> \[r.id, r\]));  
    rows.forEach(r \=\> byId.set(r.id, r));  
    localStorage.setItem(KEY, JSON.stringify(\[...byId.values()\]));  
  },  
  async update(id: string, patch: Partial\<Pump\>) {  
    const all \= await this.load();  
    const next \= all.map(r \=\> (r.id \=== id ? { ...r, ...patch } : r));  
    localStorage.setItem(KEY, JSON.stringify(next));  
  },  
};

### **SupabaseAdapter (optional, interchangeable)**

// src/adapters/supabase.ts  
import { createClient } from "@supabase/supabase-js";  
import { Pump } from "@/types";

const supabase \= createClient(import.meta.env.VITE\_SUPABASE\_URL, import.meta.env.VITE\_SUPABASE\_ANON\_KEY);

export const SupabaseAdapter \= {  
  async load(): Promise\<Pump\[\]\> {  
    const { data, error } \= await supabase.from("pump").select("\*");  
    if (error) throw error;  
    return data as Pump\[\];  
  },  
  async replaceAll(rows: Pump\[\]) {  
    await supabase.from("pump").delete().neq("id", ""); // delete all  
    if (rows.length) await supabase.from("pump").upsert(rows);  
  },  
  async upsertMany(rows: Pump\[\]) {  
    if (rows.length) await supabase.from("pump").upsert(rows);  
  },  
  async update(id: string, patch: Partial\<Pump\>) {  
    await supabase.from("pump").update(patch).eq("id", id);  
  },  
};

**Toggle:** in `App.tsx`, choose adapter via env or UI switch:

setAdapter(import.meta.env.VITE\_USE\_SUPABASE ? SupabaseAdapter : LocalAdapter);

---

## **5\) UI: Components & Behaviors**

### **Persistent Toolbar**

* Always visible below header; contains FilterBar \+ AddPO button.  
* Filters update `store.filters` immediately; all views react.

### **FilterBar (controlled)**

* Inputs: PO (select), Customer (select), Model (select), Priority (select), Stage (select), Search (text).  
* Options are derived from current dataset (unique values).  
* Include “Clear” button to reset filters.

### **AddPoModal (multi-line)**

* Fields: PO (text), Customer (text).  
* Lines: dynamic rows with Model (text), Quantity (int), Color (text), Promise Date (date), Value Each (number).  
* “Add line” and “Remove line”.  
* Submit → expands into `Pump[]` and calls `addPO` action.

### **Dashboard widgets**

* **KPI Strip:**  
  * Avg Build Time (mean of (scheduledEnd \- last\_update?) or provide derived using historic; for Lite, compute avg of `scheduledEnd - orderStart` if available else mock).  
  * Shop Efficiency (proxy: ratio of CLOSED vs total within date window).  
  * On-time Orders (\# with `scheduledEnd` ≥ `last_update` when stage \=== CLOSED).  
  * Late Orders (\# with `scheduledEnd` \< `last_update`, stage \!== CLOSED counts as at-risk).  
* **Workload Donuts:** Pie or RadialBar by `customer` and by `model` (counts).  
* **Build Time Trend:** AreaChart over weeks; compute average (group by ISO week on closed items).  
* **Capacity Radials:** For each week in visible window, `scheduled count` vs `capacity` (configurable number, default 20); over-capacity flagged red.  
* **Order Timeline (Gantt-lite):** Horizontal list grouped by PO; each pump is a bar from (mock start) to `scheduledEnd`; color by stage; today marker. Implement with simple CSS grid \+ div widths (no heavy lib).  
* **Order Table:** Sortable; columns: Serial, PO, Customer, Model, Stage, Priority, Value, Scheduled End, Last Update. Row click opens PumpDetailsModal.  
* **Value Breakdown:** Two small pies: value by Customer, value by Model.

### **Kanban Board**

* Columns: the 7 stages.  
* Each column: header with count \+ collapse/expand toggle.  
* Cards show: PO, Model, Customer, Serial, Color, Value, Scheduled End. Tags for Priority/Rush/Urgent.  
* Drag & drop with `@dnd-kit/core`. On drop → `moveStage` \+ toast (ShadCN `useToast`).

---

## **6\) Directory Structure**

src/  
  adapters/  
    local.ts  
    supabase.ts  
  components/  
    toolbar/  
      FilterBar.tsx  
      AddPoButton.tsx  
      AddPoModal.tsx  
    dashboard/  
      KpiStrip.tsx  
      Donuts.tsx  
      BuildTimeTrend.tsx  
      CapacityRadials.tsx  
      OrderTimeline.tsx  
      OrderTable.tsx  
      ValueBreakdown.tsx  
    kanban/  
      KanbanBoard.tsx  
      StageColumn.tsx  
      PumpCard.tsx  
    modals/  
      PumpDetailsModal.tsx  
  hooks/  
    useKpis.ts  
    useAggregations.ts  
  lib/  
    charts.ts  
    csv.ts  
    format.ts  
    seed.ts  
  store.ts  
  types.ts  
  App.tsx  
  main.tsx

---

## **7\) Chart Implementation (Recharts)**

**Donuts**

\<PieChart width={220} height={160}\>  
  \<Pie data={data} dataKey="count" nameKey="key" innerRadius={48} outerRadius={64} /\>  
  \<Tooltip /\>  
  \<Legend verticalAlign="bottom" height={36} /\>  
\</PieChart\>

**Build Time Trend**

\<AreaChart data={weekly}\>  
  \<defs\>\<linearGradient id="g" .../\>\</defs\>  
  \<XAxis dataKey="week" /\>  
  \<YAxis /\>  
  \<Tooltip /\>  
  \<Area type="monotone" dataKey="avgDays" stroke="\#2563eb" fill="url(\#g)" /\>  
\</AreaChart\>

**Capacity Radials** Use `RadialBarChart` per period or small multiples; compute `pct = scheduled/capacity`.

---

## **8\) CSV/JSON Upload (PapaParse)**

// src/lib/csv.ts  
import Papa from "papaparse";  
import { Pump } from "@/types";

export function parseCsv(file: File): Promise\<Pump\[\]\> {  
  return new Promise((resolve, reject) \=\> {  
    Papa.parse(file, {  
      header: true,  
      skipEmptyLines: true,  
      complete: ({ data }) \=\> resolve(normalize(data as any\[\])),  
      error: reject,  
    });  
  });  
}

function normalize(rows: any\[\]): Pump\[\] {  
  return rows.map((r) \=\> ({  
    id: r.id || crypto.randomUUID(),  
    serial: Number(r.serial),  
    po: r.po,  
    customer: r.customer,  
    model: r.model,  
    stage: r.stage,  
    priority: r.priority,  
    powder\_color: r.powder\_color || r.color,  
    last\_update: toIso(r.last\_update),  
    value: Number(r.value ?? 0),  
    scheduledEnd: toIso(r.scheduledEnd || r.scheduled\_end),  
  }));  
}  
const toIso \= (v?: string) \=\> (v ? new Date(v).toISOString() : undefined);

**Upload workspace behavior**

* Drag-and-drop area \+ file picker.  
* Preview 5 rows \+ “Replace dataset” button.  
* On confirm → `replaceDataset(rows)`.

---

## **9\) Gantt-lite Implementation**

* Use a fixed time window (e.g., dateFrom/dateTo or min/max scheduledEnd).  
* Convert dates to % across container width.  
* Render bars as absolutely-positioned divs (height 8–10px), color-coded by stage; overdue (today \> scheduledEnd) gets red outline.

const px \= scaleX(date); // map ISO date \-\> pixel  
\<div className="relative h-32"\>  
  {items.map(it \=\> (  
    \<div  
      key={it.id}  
      className={clsx("absolute h-2 rounded-full", overdue(it) ? "ring-2 ring-red-500" : "bg-blue-500")}  
      style={{ left: px(it.start), width: px(it.scheduledEnd) \- px(it.start), top: rowY(it.po) }}  
    /\>  
  ))}  
\</div\>

*For Lite, derive `start` as `last_update` minus estimated duration by stage, or seed with mock `start`.*

---

## **10\) Accessibility & Performance**

* All interactive elements use keyboard focus states; DnD: provide “Move to stage” dropdown fallback via card kebab menu.  
* Virtualize large tables if \>500 rows (optional for Lite).  
* Debounce filter inputs (150ms).  
* Memoize aggregations with `useMemo` and `useAggregations` hook.

---

## **11\) Error Handling & Toasts**

* Upload: show row count, invalid rows count, and fail fast if required columns missing (`serial`, `po`, `customer`, `model`, `stage`).  
* DnD move: optimistic update; on adapter error, rollback and show destructive toast.  
* Supabase errors: banner with retry.

---

## **12\) Seed Data (mock)**

`seed()` returns \~60–120 pumps:

* 6 customers × 3 models × \~4–6 stages distribution.  
* Serial unique 1000–9999.  
* `scheduledEnd` spread over ±6 weeks.  
* 10–15% marked `Rush`/`Urgent`.

---

## **13\) Acceptance Criteria (per feature)**

**Toolbar & Filters**

* \[ \] Filters persist until cleared.  
* \[ \] All dashboard widgets and Kanban respect filters.  
* \[ \] Clear button resets all and view refreshes in \<100ms on 500 rows.

**Add PO Modal**

* \[ \] Adding lines expands to N pumps with unique serials.  
* \[ \] Required: PO, Customer, at least one line with Model.  
* \[ \] Closing modal without save doesn’t mutate data.

**Kanban**

* \[ \] Dragging a card updates stage and timestamp.  
* \[ \] Column toggle hides/shows cards; count reflects filtered cards only.

**Dashboard**

* \[ \] KPI numbers update instantly with filters.  
* \[ \] Donuts show accurate percentages (sum=100%).  
* \[ \] Trend line renders at least 8 periods when data spans 2+ months.  
* \[ \] Gantt bars show overdue state correctly.  
* \[ \] Table sorts by any column ascending/descending.

**Bulk Upload**

* \[ \] CSV with headers replaces dataset entirely after confirm.  
* \[ \] JSON array of Pump objects accepted.  
* \[ \] On malformed rows, show preview with flagged rows; confirm disabled if \>5% invalid.

**Supabase Adapter (optional)**

* \[ \] Switching adapter reloads from remote.  
* \[ \] Upserts on PO add; updates on stage move.

---

## **14\) Manual QA Checklist (1 pass, 30–45 min)**

* Seed loads; counts match spec.  
* Apply each filter independently \+ combined; verify via table and donuts.  
* Add PO with 3 lines; confirm 3 new cards appear in NOT STARTED; serials unique.  
* Drag a card across 3 stages; verify toasts and table/stage update.  
* Collapse two columns; counts decrement in board total.  
* Upload CSV; dataset size changes; filters still apply.  
* Switch to Supabase (if configured); repeat add/move; verify network calls.

---

## **15\) Build & Run**

pnpm create vite pumptracker-lite \--template react-ts  
cd pumptracker-lite  
pnpm i tailwindcss @radix-ui/react-slot class-variance-authority clsx lucide-react \\  
  @tanstack/react-table @dnd-kit/core @dnd-kit/sortable recharts zustand papaparse nanoid \\  
  sonner @supabase/supabase-js  
\# Tailwind setup...  
pnpm dev

**ShadCN**: generate `Button`, `Dialog`, `Input`, `Select`, `Toast` (or use `sonner`) components.

---

## **16\) Implementation Notes & Pseudocode**

**Move card (Kanban)**

onDragEnd(({ active, over }) \=\> {  
  if (\!over) return;  
  const to \= over.id as Stage;  
  moveStage(active.id as string, to);  
  toast.success(\`Moved to ${to}\`);  
});

**KPIs hook (sketch)**

export function useKpis(pumps: Pump\[\]) {  
  return useMemo(() \=\> {  
    const closed \= pumps.filter(p \=\> p.stage \=== "CLOSED");  
    const onTime \= closed.filter(p \=\> \!p.scheduledEnd || new Date(p.last\_update) \<= new Date(p.scheduledEnd));  
    const lateOpen \= pumps.filter(p \=\> p.scheduledEnd && new Date() \> new Date(p.scheduledEnd) && p.stage \!== "CLOSED");  
    const avgBuildDays \= avg(closed.map(p \=\> diffDays(p)));  
    return {  
      avgBuildTime: round(avgBuildDays,1),  
      shopEfficiency: closed.length / Math.max(1, pumps.length),  
      onTimeOrders: onTime.length,  
      lateOrders: lateOpen.length,  
    };  
  }, \[pumps\]);  
}

---

## **17\) Milestones & Sequencing (no dates)**

**Phase 1 — Scaffolding & Store (0–0.5 weeks)**

* Vite \+ TS \+ Tailwind \+ ShadCN; Zustand store; seed data.

**Phase 2 — Toolbar & Dashboard Core (0.5–1 weeks)**

* FilterBar wired; KPI, Donuts, Trend minimal.

**Phase 3 — Kanban & Modals (1–1.5 weeks)**

* dnd-kit board; AddPoModal; PumpDetailsModal.

**Phase 4 — Timeline, Upload, Supabase Adapter (1.5–2 weeks)**

* Gantt-lite; CSV/JSON replace; adapter toggle.

---

## **18\) Upgrade Path to Full Supabase**

* Keep schema identical; add DB constraints (unique(serial), indexes on `stage`, `po`).  
* Add RLS/auth later; Lite remains local-first by default.  
* For multi-user, swap Zustand persistence for server-sync (Supabase) and add optimistic merge on DnD.

---

## **19\) Dev UX niceties (fast iteration)**

* Add a **Capacity** number input in toolbar (default 20\) to drive capacity radials.  
* Add a **“Generate 500 rows”** seed button for perf smoke test.  
* Include **Export JSON** button to download current dataset.
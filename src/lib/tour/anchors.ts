// Where tours and tips point: every `data-tour="…"` id the guided tours use, in one list (docs/help-and-tours.md).
// A component marks its element with `{...tourAnchor("plan-palette")}`; a step names the id. Pure: no browser code.
//
// `fallback` is an existing, language-independent selector the engine also tries (a data-testid, an element id), so a
// step can find its element before the `data-tour` attribute is added there. A missing anchor never blocks a tour: the
// card is shown in the middle of the screen instead.

export const TOUR_ANCHORS = {
  // App header and account menu (src/components/AppHeader.tsx, AccountMenu.tsx)
  "nav-jobs": { file: "src/components/AppHeader.tsx", what: "Jobs link in the header" },
  "nav-tasks": { file: "src/components/AppHeader.tsx", what: "Tasks link in the header" },
  "nav-money": { file: "src/components/AppHeader.tsx", what: "Money link in the header (office)" },
  "account-menu": { file: "src/components/AccountMenu.tsx", what: "Avatar button that opens the account menu" },
  // Jobs list (src/components/ProjectsList.tsx)
  "jobs-new": { file: "src/components/ProjectsList.tsx", what: "New job button" },
  // Job header and tabs (src/components/nav/JobTabs.tsx: both the header strip and the phone bottom bar)
  "job-tab-overview": { file: "src/components/nav/JobTabs.tsx", what: "Overview tab button" },
  "job-tab-plan": { file: "src/components/nav/JobTabs.tsx", what: "Plan tab button" },
  "job-tab-takeoff": { file: "src/components/nav/JobTabs.tsx", what: "Takeoff tab button" },
  "job-tab-tasks": { file: "src/components/nav/JobTabs.tsx", what: "Tasks tab button" },
  "job-tab-photos": { file: "src/components/nav/JobTabs.tsx", what: "Photos tab button" },
  "job-tab-money": { file: "src/components/nav/JobTabs.tsx", what: "Money tab button" },
  "job-tab-field": { file: "src/components/nav/JobTabs.tsx", what: "Field tab button (phones: inside More)" },
  "job-tab-more": { file: "src/components/nav/JobTabs.tsx", what: "More button of the phone bottom bar" },
  // Plan upload (src/components/ProjectView.tsx, src/components/SheetsTab.tsx, src/components/sheetIndex/*)
  "plan-sheets": { file: "src/components/ProjectView.tsx", what: "Manage sheets button in the job header", fallback: '[data-testid="manage-sheets-open"]' },
  "plan-upload": { file: "src/components/ProjectView.tsx / SheetsTab.tsx", what: "Upload plans button (empty Plan tab and the sheets drawer)" },
  "plan-pages": { file: "src/components/SheetsTab.tsx or sheetIndex/*", what: "The post-upload pages screen (skip pages, floor names)" },
  // Plan editor (src/components/editor/*)
  "plan-canvas": { file: "src/components/editor/PlanCanvas.tsx", what: "The plan itself", fallback: "[data-plan-canvas]" },
  "plan-mode": { file: "src/components/editor/viewer/ModeToggle.tsx", what: "View / Edit switch" },
  "plan-palette": { file: "src/components/editor/Palette.tsx", what: "Device menu (the list of devices to place)" },
  "plan-devices-button": { file: "src/components/editor/PlanEditor.tsx", what: "Devices button that opens the device menu on narrow screens" },
  "plan-find-similar": { file: "src/components/editor/viewer/PlanToolbar.tsx", what: "Find similar tool", fallback: '[data-testid="find-similar-button"]' },
  "plan-sensors": { file: "src/components/editor/viewer/PlanToolbar.tsx", what: "Sensors (Add alarm sensors) tool", fallback: '[data-testid="alarm-sensors-button"]' },
  "plan-more": { file: "src/components/editor/viewer/PlanToolbar.tsx", what: "More tools button (phones)", fallback: '[data-testid="plan-more"]' },
  // Takeoff, Money (src/components/TakeoffTab.tsx, src/components/money/MoneyTab.tsx, EstimateTab, documents)
  "takeoff-table": { file: "src/components/TakeoffTab.tsx", what: "The per-floor count" },
  "money-step-pricing": { file: "src/components/money/MoneyTab.tsx", what: "Money › Pricing step" },
  "money-step-quote": { file: "src/components/money/MoneyTab.tsx", what: "Money › Quote step" },
  "money-step-changes": { file: "src/components/money/MoneyTab.tsx", what: "Money › Change orders step" },
  "money-step-invoices": { file: "src/components/money/MoneyTab.tsx", what: "Money › Invoices & payments step" },
  "pricing-send": { file: "src/components/EstimateTab.tsx", what: "Send to client on Pricing" },
  "quote-new": { file: "src/components/documents/DocumentsTab.tsx", what: "New quote from job pricing" },
  // Tasks, photos, field (src/components/tasks/*, photos/*, field/FieldTab.tsx)
  "tasks-add": { file: "src/components/tasks/TaskList.tsx, src/components/TasksBoard.tsx", what: "Add task button" },
  "photos-take": { file: "src/components/photos/PhotosTab.tsx", what: "Take photo button" },
  "field-checklists": { file: "src/components/field/FieldTab.tsx", what: "Checklists & forms section button" },
  "field-daily-log": { file: "src/components/field/FieldTab.tsx", what: "Daily log section button" },
  // Settings and help
  "settings-help": { file: "src/components/SettingsForm.tsx", what: "Help & tips card", fallback: "#help" },
  "settings-payments": { file: "src/components/documents/OnlinePaymentsPanel.tsx", what: "Online payments card", fallback: "#payments" },
} as const satisfies Record<string, { file: string; what: string; fallback?: string }>;

export type TourAnchorId = keyof typeof TOUR_ANCHORS;

export const isTourAnchor = (id: string): id is TourAnchorId => Object.hasOwn(TOUR_ANCHORS, id);

/** Props for the element a step points at: `<button {...tourAnchor("jobs-new")}>`. */
export const tourAnchor = (id: TourAnchorId) => ({ "data-tour": id });

/** CSS selector for an anchor: its `data-tour` attribute, then the fallback (if any). */
export function anchorSelector(id: TourAnchorId): string {
  const a = TOUR_ANCHORS[id] as { file: string; what: string; fallback?: string };
  return a.fallback ? `[data-tour="${id}"], ${a.fallback}` : `[data-tour="${id}"]`;
}

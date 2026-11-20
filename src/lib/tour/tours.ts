// The guided tours and the one-time tips: the words and where each step points (docs/help-and-tours.md).
// Written for the job tabs Overview · Plan · Takeoff · Tasks · Photos · Money · Field (phones: Plan · Tasks · Photos ·
// Money · More in the bottom bar). A job step names its tab; `whenOpen` is an element the step points at instead while
// it's on screen (the pages screen after an upload). Text is English (the i18n key) wrapped in msg(); translations
// live in src/lib/i18n/<lang>/help.ts.
import { msg } from "../i18n/msg";
import type { TipId, TourDef, TourId } from "./model";

export const TOURS: Record<TourId, TourDef> = {
  "first-job": {
    id: "first-job",
    title: msg("Your first job"),
    summary: msg("Plans in, devices placed, doors and windows counted, quote out. Uses a sample plan, so nothing of yours changes."),
    minutes: 2,
    audience: "office",
    steps: [
      {
        id: "new-job",
        at: { page: "jobs" },
        anchor: "jobs-new",
        title: msg("Start a job"),
        body: msg("Every job starts here: the address and the client. For this tour we made a sample job for you."),
      },
      {
        id: "upload",
        at: { page: "job", tab: "plan" },
        anchor: "plan-sheets",
        whenOpen: "plan-pages",
        title: msg("Upload plans and name pages"),
        body: msg("Add the PDF or phone photos. On Choose and name pages, untick pages you don't need. Names are read from each page, scans too; tap a name to change it."),
      },
      {
        id: "edit",
        at: { page: "job", tab: "plan" },
        anchor: "plan-mode",
        title: msg("Switch to Edit"),
        body: msg("View is for looking around. Edit is for placing devices; the plan gets a blue frame so you know taps change things."),
      },
      {
        id: "place",
        at: { page: "job", tab: "plan" },
        anchor: "plan-palette",
        phoneAnchor: "plan-devices-button",
        title: msg("Place devices"),
        body: msg("Tap a device in the list, then tap the plan where it goes. Keep tapping to place more. Tap Done when you're finished."),
      },
      {
        id: "find-similar",
        at: { page: "job", tab: "plan" },
        anchor: "plan-find-similar",
        phoneAnchor: "plan-more",
        title: msg("Count doors and windows"),
        body: msg("Find similar: tap one door on the plan and it finds the others like it. Check them, then Accept all."),
      },
      {
        id: "sensors",
        at: { page: "job", tab: "plan" },
        anchor: "plan-sensors",
        phoneAnchor: "plan-more",
        title: msg("Add alarm sensors"),
        body: msg("Once doors and windows are counted, Add alarm sensors puts a contact on each one in a single step. Tap one to leave it out."),
      },
      {
        id: "takeoff",
        at: { page: "job", tab: "takeoff" },
        anchor: "takeoff-table",
        title: msg("Check the takeoff"),
        body: msg("Every device and wire run, floor by floor. It counts only what's on the plan, so fix a count on the plan, not here."),
      },
      {
        id: "pricing",
        at: { page: "job", tab: "money", params: { step: "pricing" } },
        anchor: "money-step-pricing",
        office: true,
        title: msg("Price it"),
        body: msg("Prices come from your Price list. Change a price for this job only, add labor or a markup; the total updates as you go."),
      },
      {
        id: "quote",
        at: { page: "job", tab: "money", params: { step: "quote" } },
        anchor: "money-step-quote",
        office: true,
        title: msg("Make the quote"),
        body: msg("Create the quote from the job's pricing, then Finalize: it gets a number and the prices lock."),
      },
      {
        id: "send",
        at: { page: "job", tab: "money", params: { step: "quote" } },
        anchor: "quote-new",
        office: true,
        title: msg("Send it"),
        body: msg("Send to client, or Get client link and text it. The client opens it on their phone, approves and signs. You'll see it here."),
      },
    ],
  },
  "crew-day": {
    id: "crew-day",
    title: msg("Crew: a day on site"),
    summary: msg("The plan, your tasks, photos, checklists and the daily log, on a phone or iPad."),
    minutes: 2,
    audience: "crew",
    steps: [
      {
        id: "my-tasks",
        at: { page: "tasks" },
        anchor: "nav-tasks",
        title: msg("Your tasks"),
        body: msg("Tasks shows what's assigned to you on every job, overdue first. Tick one when it's done."),
      },
      {
        id: "plan",
        at: { page: "job", tab: "plan" },
        anchor: "plan-canvas",
        title: msg("Read the plan"),
        body: msg("Pinch to zoom, drag to move. Tap a device to see what it is, its room and its notes. Stay in View so nothing moves by accident."),
      },
      {
        id: "tasks",
        at: { page: "job", tab: "tasks" },
        anchor: "job-tab-tasks",
        title: msg("The job's tasks"),
        body: msg("The Tasks tab (on phones, in the bar at the bottom): everything to do on this job. Open a task to see its spot on the plan, add a photo, mark it done."),
      },
      {
        id: "photos",
        at: { page: "job", tab: "photos" },
        anchor: "photos-take",
        title: msg("Take photos"),
        body: msg("Photos is a tab of its own. Take photo saves it to this job with the date and place. No signal? It uploads when you're back online."),
      },
      {
        id: "checklists",
        at: { page: "job", tab: "field", params: { section: "checklists" } },
        anchor: "field-checklists",
        title: msg("Checklists"),
        body: msg("Work through the job's checklists and forms. A No answer can become a task for someone."),
      },
      {
        id: "daily-log",
        at: { page: "job", tab: "field", params: { section: "logs" } },
        anchor: "field-daily-log",
        title: msg("Daily log"),
        body: msg("Before you leave: who was on site, hours, work done, deliveries and photos. Sign it and the office has it."),
      },
    ],
  },
  "office-money": {
    id: "office-money",
    title: msg("Office: quotes, invoices, payments"),
    summary: msg("From the job's pricing to a quote the client approves, change orders, invoices and getting paid."),
    minutes: 2,
    audience: "office",
    steps: [
      {
        id: "money",
        at: { page: "jobs" },
        anchor: "nav-money",
        office: true,
        title: msg("Money for every job"),
        body: msg("What's unpaid and overdue across all jobs, and quotes waiting for the client."),
      },
      {
        id: "pricing",
        at: { page: "job", tab: "money", params: { step: "pricing" } },
        anchor: "money-step-pricing",
        office: true,
        title: msg("Pricing"),
        body: msg("Your numbers for this job: devices from the takeoff times your prices, plus labor, wire and markup. The client doesn't see this page."),
      },
      {
        id: "quote",
        at: { page: "job", tab: "money", params: { step: "quote" } },
        anchor: "money-step-quote",
        office: true,
        title: msg("Quote"),
        body: msg("What the client approves. Finalize it, then Send to client. When they approve, you can bill the deposit in one tap."),
      },
      {
        id: "changes",
        at: { page: "job", tab: "money", params: { step: "changes" } },
        anchor: "money-step-changes",
        office: true,
        title: msg("Change orders"),
        body: msg("Extra work after the quote is approved. The client approves each change order the same way."),
      },
      {
        id: "invoices",
        at: { page: "job", tab: "money", params: { step: "invoices" } },
        anchor: "money-step-invoices",
        office: true,
        title: msg("Invoices and payments"),
        body: msg("Bill the deposit, progress or the remaining balance. Record payment when a check comes in."),
      },
      {
        id: "online",
        at: { page: "settings", hash: "payments" },
        anchor: "settings-payments",
        office: true,
        title: msg("Get paid online"),
        body: msg("Connect your Stripe account here and clients can pay invoices by card from the link you send."),
      },
    ],
  },
};

export const TOUR_LIST: TourDef[] = [TOURS["first-job"], TOURS["crew-day"], TOURS["office-money"]];

/** One-line tips, shown once on the first visit to each place (never on client pages). */
/** `edge`: where the tip sits. "middle" (the plan) keeps clear of the plan's own controls: mid-screen on phones,
 *  above the plan toolbar on larger screens. */
export const TIPS: Record<TipId, { text: string; edge: "top" | "bottom" | "middle"; guide: string }> = {
  plan: { text: msg("Tap Edit, tap a device in the list, then tap the plan to place it."), edge: "middle", guide: "place-devices" },
  takeoff: { text: msg("Counts come only from the devices and wire on the plan. To change a count, change the plan."), edge: "bottom", guide: "takeoff-pricing" },
  money: { text: msg("Work left to right: Pricing, Quote, Change orders, then Invoices & payments."), edge: "bottom", guide: "quotes-invoices" },
  tasks: { text: msg("Tick a task when it's done. Open it to see the spot on the plan or add a photo."), edge: "bottom", guide: "crew" },
  photos: { text: msg("Photos are saved on this device first and upload when you're online."), edge: "bottom", guide: "crew" },
};

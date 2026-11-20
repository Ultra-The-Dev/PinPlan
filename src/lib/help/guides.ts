// The Help center's guides (/help, /help/<id>): short, step by step, with screenshots of the real app
// (public/help/*.webp, made by scripts/help-screens.mjs from the demo job, English UI). Text is English wrapped in
// msg(); translations in src/lib/i18n/<lang>/help.ts. Written for the job tabs Overview · Plan · Takeoff · Tasks ·
// Photos · Money · Field (docs/navigation.md). How to add one: docs/help-and-tours.md.
import { msg } from "../i18n/msg";
import type { TourId } from "../tour/model";

export interface HelpShot {
  /** File in public/help/ (scripts/help-screens.mjs writes it). */
  src: string;
  alt: string;
  device: "desktop" | "phone";
}

export interface HelpStep {
  title: string;
  text: string;
  shot?: HelpShot;
}

export interface HelpGuide {
  id: string;
  /** Sheet number in the guide index, like a plan set: H-01, H-02… */
  number: string;
  title: string;
  summary: string;
  audience: "office" | "crew" | "everyone";
  steps: HelpStep[];
  /** Short notes after the steps. */
  notes?: string[];
  /** A tour that shows the same thing on the real screens. */
  tour?: TourId;
}

/** Image sizes the screenshot script writes (CSS px × device pixel ratio). */
export const SHOT_SIZE: Record<HelpShot["device"], { w: number; h: number }> = {
  desktop: { w: 1280, h: 800 },
  phone: { w: 780, h: 1688 },
};

export const AUDIENCE_LABEL: Record<HelpGuide["audience"], string> = {
  office: msg("Office"),
  crew: msg("Crew"),
  everyone: msg("Everyone"),
};

export const GUIDES: HelpGuide[] = [
  {
    id: "first-quote",
    number: "H-01",
    title: msg("Your first quote"),
    summary: msg("From a new job to a quote the client approves on their phone, in five steps."),
    audience: "office",
    tour: "first-job",
    steps: [
      {
        title: msg("Create the job"),
        text: msg("On Jobs, tap New job. Type the address and the client's name, then Create & upload plans."),
        shot: { src: "/help/new-job.webp", alt: msg("The New job form with the job address and client name"), device: "desktop" },
      },
      { title: msg("Add the plans"), text: msg("Pick the PDF of the plans, or take photos of paper plans. On Choose and name pages, untick the pages you don't need and check the floor names.") },
      { title: msg("Place the devices"), text: msg("On Plan, switch to Edit, tap a device in the list, then tap the plan where it goes.") },
      { title: msg("Check the count and the price"), text: msg("Takeoff shows the count per floor. Money › Pricing multiplies it by your Price list.") },
      {
        title: msg("Send the quote"),
        text: msg("Money › Quote: create the quote from the job's pricing, Finalize, then Send to client or Get client link."),
        shot: { src: "/help/quote.webp", alt: msg("A finalized quote with the Send to client button"), device: "desktop" },
      },
    ],
    notes: [msg("The client approves and signs on the link. The quote then shows Approved, and you can bill the deposit in one tap.")],
  },
  {
    id: "upload-plans",
    number: "H-02",
    title: msg("Upload plans and name pages"),
    summary: msg("Bring in a PDF plan set or phone photos, skip the pages you don't need and name the floors."),
    audience: "office",
    steps: [
      { title: msg("Open the job's Plan"), text: msg("A new job opens on Plan. Tap Upload plans (later: Manage sheets › Upload PDF or photos; on a phone the button is called Sheets).") },
      { title: msg("Pick the files"), text: msg("Choose one or more PDFs, or photos of paper plans. A photo is straightened for you; drag the corners if it needs help.") },
      {
        title: msg("Choose and name pages"),
        text: msg("After the upload, Choose and name pages shows every page. Untick the ones you don't need (cover sheet, specs, duplicates). Names are read from each page, scanned pages too, so 1st Fl, 2nd Fl and Basement are usually right already; tap a name to change it."),
        shot: { src: "/help/pages.webp", alt: msg("Choose and name pages: page thumbnails with tick boxes and the floor names read from each page"), device: "desktop" },
      },
      {
        title: msg("Skipped a page, or a name is wrong?"),
        text: msg("Nothing is final. On the plan, tap ⋯ next to the floor name to rename it. To delete sheets: Manage sheets › Select sheets, tick them, then Delete selected. A skipped page can be added later by uploading the PDF again."),
      },
      { title: msg("Set the scale if you need lengths"), text: msg("A printed scale like 1/4\" = 1'-0\" is found on PDF pages. Otherwise tap Scale on the plan and measure one known length.") },
    ],
    notes: [msg("Plans are stored on this device and synced to your team, so they open with no signal on site.")],
  },
  {
    id: "place-devices",
    number: "H-03",
    title: msg("Place devices"),
    summary: msg("Tap a device, tap the plan. Move, copy, label and delete them."),
    audience: "everyone",
    tour: "first-job",
    steps: [
      { title: msg("Switch to Edit"), text: msg("The plan opens in View so nothing moves by accident. Tap Edit; the plan gets a blue frame.") },
      {
        title: msg("Pick a device and tap the plan"),
        text: msg("Tap a device in the list on the left (on a phone, tap Devices first), then tap the plan where it goes. Keep tapping to place more of the same; tap Done when you're finished."),
        shot: { src: "/help/plan-edit.webp", alt: msg("The plan in Edit mode with the device list and placed devices"), device: "desktop" },
      },
      { title: msg("Change a device"), text: msg("Tap a device to select it: drag to move it, or set its room, label, notes and brand & model in the panel. Delete removes it; Undo brings it back.") },
      {
        title: msg("Its photos and tasks"),
        text: msg("A device with photos or tasks shows them on its card: tap N photos to open the Photos tab for that device, or N tasks for its tasks. New ones are made in the Photos and Tasks tabs."),
        shot: { src: "/help/device-links.webp", alt: msg("A selected camera's card with its photos and tasks"), device: "desktop" },
      },
      {
        title: msg("On a phone"),
        text: msg("The same, sized for your thumb: Devices opens the list as a sheet, two fingers move and zoom the plan. The bar at the bottom has Plan, Tasks, Photos, Money and More (Overview, Takeoff, Field)."),
        shot: { src: "/help/plan-phone.webp", alt: msg("The plan on a phone with the Devices button and the tab bar at the bottom"), device: "phone" },
      },
    ],
    notes: [msg("Device letters and colours come from your trades (Settings › Company), so everyone reads the plan the same way.")],
  },
  {
    id: "doors-windows",
    number: "H-04",
    title: msg("Count doors and windows and add alarm sensors"),
    summary: msg("Find similar counts every door or window from one example. Add alarm sensors puts a contact on each one."),
    audience: "office",
    tour: "first-job",
    steps: [
      { title: msg("Open Find similar"), text: msg("In Edit, tap Find similar in the plan tools (on a phone: More › Find similar). Count as: Door.") },
      {
        title: msg("Show it one door"),
        text: msg("Tap one door symbol on the plan, or drag a box around it. Every door like it is found, turned or mirrored too. Read tags finds D1, D2… labels instead."),
        shot: { src: "/help/find-similar.webp", alt: msg("Find similar showing the doors it found on the plan"), device: "desktop" },
      },
      { title: msg("Check and accept"), text: msg("Suggestions don't count until you accept them. Tap a wrong one to reject it, then Accept all. Do the same for windows.") },
      {
        title: msg("Add alarm sensors"),
        text: msg("Tap Sensors (or Add alarm sensors on the card). Choose door contacts, window contacts and glass-break detectors, tap a door or window to leave it out, then Place sensors."),
        shot: { src: "/help/sensors.webp", alt: msg("Add alarm sensors with door and window contacts shown on the plan"), device: "desktop" },
      },
    ],
    notes: [msg("Doors and windows show in the Takeoff under Openings. They stay off the quote until you give them a price.")],
  },
  {
    id: "takeoff-pricing",
    number: "H-05",
    title: msg("Takeoff and pricing"),
    summary: msg("The count per floor, and how it turns into a price."),
    audience: "office",
    steps: [
      {
        title: msg("Read the takeoff"),
        text: msg("Takeoff lists every device and wire run per floor, with the job total. It only counts what's on the plan: to change a number, change the plan."),
        shot: { src: "/help/takeoff.webp", alt: msg("The takeoff table with counts per floor"), device: "desktop" },
      },
      { title: msg("Export it"), text: msg("CSV for a spreadsheet, or Marked-up plans PDF to print the plans with every device on them.") },
      {
        title: msg("Price it"),
        text: msg("Money › Pricing multiplies the count by your Price list and adds labor, wire and markup. Change a price for this job only by typing over it."),
        shot: { src: "/help/pricing.webp", alt: msg("Money › Pricing with unit prices and the total"), device: "desktop" },
      },
      { title: msg("Optional items"), text: msg("Tick Optional item on a device and the client can add it on the quote; it's listed separately and not in the total.") },
    ],
  },
  {
    id: "quotes-invoices",
    number: "H-06",
    title: msg("Quotes, change orders, invoices and online payments"),
    summary: msg("The money steps of a job, left to right, and getting paid by card."),
    audience: "office",
    tour: "office-money",
    steps: [
      { title: msg("Quote"), text: msg("Money › Quote › New quote from job pricing. Edit the lines if you need to, then Finalize: it gets a number and the prices lock.") },
      { title: msg("Send to client"), text: msg("Send to client emails a link; Get client link copies it so you can text it. The client approves and signs on their phone.") },
      { title: msg("Change orders"), text: msg("Extra work after approval goes on a change order. The client approves each one the same way.") },
      {
        title: msg("Invoices"),
        text: msg("From the approved quote: Bill the deposit, then progress or the remaining balance. Finalize the invoice and send it."),
        shot: { src: "/help/invoice.webp", alt: msg("An invoice with Record payment"), device: "desktop" },
      },
      { title: msg("Payments"), text: msg("Record payment for a check or a transfer. To let clients pay by card, connect Stripe in Settings › Quotes & invoices › Online payments.") },
    ],
    notes: [msg("Quotes, invoices, PDFs and client links are always in English, whatever language your team uses.")],
  },
  {
    id: "crew",
    number: "H-07",
    title: msg("Crew guide: tasks, photos, checklists and daily logs"),
    summary: msg("A day on site with the iPad or iPhone app, or this website on a phone."),
    audience: "crew",
    tour: "crew-day",
    steps: [
      {
        title: msg("Your tasks"),
        text: msg("Tasks in the header shows what's assigned to you on every job, overdue first. Inside a job, the Tasks tab has everything to do there; on a phone it's in the bar at the bottom. Mine, Overdue and Filter narrow the list."),
        shot: { src: "/help/crew-tasks.webp", alt: msg("A job's Tasks tab on a phone"), device: "phone" },
      },
      { title: msg("The plan"), text: msg("Open the job's Plan to see every device. Pinch to zoom. Stay in View unless the office asked you to change things.") },
      {
        title: msg("Photos"),
        text: msg("The job's Photos tab › Take photo. Each photo keeps the date and the place, and you can draw on it. Filter finds photos by tag, date or person. No signal? It uploads later."),
        shot: { src: "/help/crew-photos.webp", alt: msg("A job's Photos tab on a phone"), device: "phone" },
      },
      { title: msg("Checklists and forms"), text: msg("Field › Checklists & forms (on a phone: More › Field, or Field in the bar for technicians). A No answer can become a task for someone.") },
      {
        title: msg("Daily log"),
        text: msg("Field › Daily log before you leave: crew, hours, work done, deliveries, photos. Sign it."),
        shot: { src: "/help/daily-log.webp", alt: msg("The daily log on a phone"), device: "phone" },
      },
    ],
    notes: [msg("Technicians never see prices, quotes or invoices.")],
  },
  {
    id: "team-roles",
    number: "H-08",
    title: msg("Team and roles"),
    summary: msg("Invite the office and the crew. Who sees what."),
    audience: "office",
    steps: [
      { title: msg("Invite someone"), text: msg("Settings › Team › Invite someone. Make a code for each person and text or email it. They sign up with it and join your company.") },
      { title: msg("Pick the role"), text: msg("Owner and Office see everything, prices included. Technician sees plans, devices, tasks, photos and checklists, never prices.") },
      { title: msg("Assign work"), text: msg("Give a task to a team member; it shows on their Tasks. Change a role or remove someone from Settings › Team.") },
    ],
  },
  {
    id: "offline-sync",
    number: "H-09",
    title: msg("Offline use and sync"),
    summary: msg("Keep working with no signal. What syncs, and when."),
    audience: "everyone",
    steps: [
      { title: msg("Everything is saved on your device first"), text: msg("Jobs, plans, devices, photos and logs are stored on the phone, iPad or computer, so they open and save with no connection.") },
      { title: msg("It syncs by itself"), text: msg("When you're back online, changes go to your team and theirs come to you. The cloud badge in the header shows anything still waiting.") },
      { title: msg("Open jobs once while online"), text: msg("Open a job (and its plans) once while you have signal, so the plans are on the device before you go to site.") },
      { title: msg("If something won't sync"), text: msg("Tap the cloud badge to see what's waiting and retry. Don't clear the browser's data while something is waiting: it's only on this device.") },
    ],
  },
  {
    id: "languages",
    number: "H-10",
    title: msg("Languages"),
    summary: msg("Use the app in English, Russian, Spanish, Portuguese, Ukrainian, Polish, Chinese or Vietnamese."),
    audience: "everyone",
    steps: [
      {
        title: msg("Choose your language"),
        text: msg("Open the account menu (your initials, top right) and pick the language. It's saved on your account, so it follows you to other devices."),
        shot: { src: "/help/languages.webp", alt: msg("The account menu with the language list"), device: "desktop" },
      },
      { title: msg("iPad and iPhone"), text: msg("The app follows the device's language. To use another language for this app only, open the iPhone or iPad Settings, find the app and pick its Language.") },
      { title: msg("What stays in English"), text: msg("Everything the client sees: quotes, invoices, PDFs, emails and client links. Names and notes stay as they were typed.") },
    ],
    notes: [msg("Screenshots in Help show the English screens; yours look the same in your language.")],
  },
];

export const guideById = (id: string) => GUIDES.find((g) => g.id === id) ?? null;

/** Match a search against the translated title and summary (`tr` is the active language's t()). Case and accents ignored. */
export function searchGuides(q: string, tr: (s: string) => string): HelpGuide[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return GUIDES;
  return GUIDES.filter((g) => {
    const hay = fold(`${tr(g.title)} ${tr(g.summary)} ${g.title} ${g.number}`);
    return words.every((w) => hay.includes(w));
  });
}

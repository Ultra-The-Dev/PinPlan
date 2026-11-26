// Text made in src/lib follows the app's language (docs/i18n.md): English by default (the other tests), Russian here.
// Client-facing data tables stay English (msg() is the identity); only what the app shows is translated.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/i18n/dictionaries";
import { bannerFor, billingSummary, type TeamBilling } from "@/lib/billingLogic";
import { RU_AREAS } from "@/lib/i18n/ru";
import { STATUS_LABEL } from "@/lib/documents";
import { PROJECT_STATUS_LABEL, projectStatusLabel } from "@/lib/statusStyle";
import { transition, newRfi } from "@/lib/rfis";
import { accountDeleteReply, joinReply, ROLE_INFO, signupProblem, teamErrorMessage } from "@/lib/teamLogic";
import { passwordStrength } from "@/lib/onboardingLogic";
import { setToastAction, toast, useToasts } from "@/lib/toast";
import { READ_ONLY_MESSAGE } from "@/lib/canEdit";
import { tradePack } from "@/lib/trades";
import { FORM_CATEGORIES, validateForm, validateTemplate } from "@/lib/forms/forms";
import { brokenReason } from "@/lib/sheetIndex";

const NOW = new Date("2026-11-19T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const billing = (p: Partial<TeamBilling> = {}): TeamBilling => ({
  status: "trialing",
  trialEndsAt: inDays(10),
  currentPeriodEnd: null,
  seatLimit: null,
  members: 2,
  canWork: true,
  hasSubscription: false,
  billingEmail: null,
  ...p,
});

// Russian loads on first use like every language: have it in memory so setLocale switches at once.
beforeAll(() => loadDictionary("ru"));
beforeEach(() => setLocale("ru", { remember: false }));
afterEach(() => setLocale("en", { remember: false }));

describe("src/lib text in Russian", () => {
  it("plan status and banners, with Russian plurals and dates", () => {
    expect(billingSummary(billing(), NOW)).toMatchObject({ label: "Пробный период", detail: "Осталось 10 дней." });
    expect(billingSummary(billing({ trialEndsAt: inDays(1) }), NOW).detail).toBe("Остался 1 день.");
    expect(billingSummary(billing({ status: "active", currentPeriodEnd: "2026-12-19T00:00:00Z" }), NOW).detail).toMatch(/^Продление 19 дек/);
    expect(bannerFor(billing({ trialEndsAt: inDays(2.5) }), "owner", NOW)?.text).toBe(
      "Бесплатный пробный период закончится через 3 дня. Оформите подписку, чтобы продолжить работу.",
    );
    expect(bannerFor(billing({ trialEndsAt: inDays(2.5) }), "tech", NOW)?.text).toMatch(/Попросите офис/);
  });

  it("team forms and server replies", () => {
    expect(signupProblem({ email: "a@b.co", password: "short" })).toBe("Пароль должен быть не короче 10 символов.");
    expect(joinReply(400, { error: "That invite code isn't valid any more. Ask for a new one." })).toEqual({
      kind: "error",
      message: "Этот код приглашения больше не действует. Попросите новый.",
    });
    // Unknown server text is shown as it came.
    expect(joinReply(400, { error: "Something new" })).toEqual({ kind: "error", message: "Something new" });
    expect(accountDeleteReply(418, null)).toEqual({ kind: "error", message: "Не удалось удалить аккаунт (418)." });
    expect(teamErrorMessage({ message: "That invite has expired. Ask for a new one." })).toBe("Срок приглашения истёк. Попросите новое.");
    expect(passwordStrength("abc").hint).toBe("Ещё 7 символов.");
  });

  it("labels kept in data stay English; the functions that show them translate", () => {
    expect(PROJECT_STATUS_LABEL.estimate).toBe("Quoting");
    expect(projectStatusLabel("estimate")).toBe("Смета");
    expect(STATUS_LABEL.paid).toBe("Paid");
    expect(ROLE_INFO.tech.name).toBe("Technician");
    expect(tradePack("electrical").run.many).toBe("Circuits");
  });

  it("errors thrown to the screen", () => {
    const rfi = newRfi("r1", "p1", 1, null, "2026-11-19T00:00:00Z");
    expect(() => transition(rfi, "answer", "Sam", "2026-11-19T00:00:00Z")).toThrow("Нельзя ответить на запрос со статусом «черновик»");
  });

  it("form checks and broken sheet links", () => {
    const template = {
      id: "f",
      name: "Test",
      category: "test" as const,
      version: 1,
      fields: [
        { id: "a", type: "number" as const, label: "Volts", required: true, min: 5 },
        { id: "s", type: "signature" as const, label: "Sign", required: true },
      ],
    };
    expect(validateForm({ template, values: { a: 2 }, signatures: [] }).map((i) => i.message)).toEqual(["Не меньше 5", "Нужна подпись"]);
    expect(validateTemplate({ ...template, name: "" })).toEqual(["Дайте форме название"]);
    expect(FORM_CATEGORIES.find((c) => c.id === "test")?.name).toBe("Test record");
    expect(brokenReason({ target: { kind: "url", url: "nope" } } as never, { sheets: [], documents: [], photos: [] })).toBe("Неверный веб-адрес у ссылки.");
  });

  it("the read-only toast keeps its button when translated", () => {
    setToastAction(READ_ONLY_MESSAGE, { label: "Plan & billing", href: "/settings#billing" });
    useToasts.setState({ toasts: [] });
    toast("Объекты только для просмотра: пробный период или подписка закончились. Смотреть и экспортировать можно. См. «Настройки» → «Тариф и оплата».", "error");
    expect(useToasts.getState().toasts[0].action).toEqual({ label: "Тариф и оплата", href: "/settings#billing" });
  });

  it("“Overdue” reads right for a task (feminine) and an invoice (masculine) alike: the neuter «Просрочено»", async () => {
    const { t } = await import("@/lib/i18n");
    expect(t("Overdue")).toBe("Просрочено");
  });

  it("a task's history reads in the app's language; the stored English text is unchanged", async () => {
    const { applyTaskChange, eventText, newTask } = await import("@/lib/tasks");
    const at = "2026-11-19T12:00:00Z";
    let task = newTask({ id: "t1", projectId: "p1", number: 1, title: "Mount the keypad" }, "Mike", at);
    task = applyTaskChange(task, { status: "done", due: "2026-11-25", assignee: "Ann", photoIds: ["a", "b"], x: 0.5, y: 0.5, sheetId: "s1" }, "Mike", at);
    task = applyTaskChange(task, { checklist: [{ id: "c1", text: "Rack, labeled", done: true }] }, "Mike", at);
    task = applyTaskChange(task, { assignee: null }, "Mike", at);
    const lines = (task.activity ?? []).map(eventText);
    expect(lines).toEqual([
      "создал(а) задачу",
      "сменил(а) статус: Открыто → Выполнена",
      "изменил(а) «срок»: 2026-11-25",
      "назначил(а): Ann",
      "Добавлено 2 фото",
      "поставил(а) на план",
      "Добавлен 1 пункт",
      "снял(а) исполнителя: Ann",
    ]);
    // What is stored stays English (the PDF and the iPad read it).
    expect(task.activity?.map((e) => e.text).filter(Boolean)).toEqual(["due date", "Added 2 photos", "placed on the plan", "Added 1 item"]);
    expect(eventText({ id: "e", at, by: "Mike", kind: "checklist", text: "Checked “Rack, labeled”, Removed 3 items" })).toBe("Отмечено «Rack, labeled», Удалено 3 пункта");
    expect(eventText({ id: "e", at, by: "Mike", kind: "checklist", text: "something an older version wrote" })).toBe("something an older version wrote");
    setLocale("en", { remember: false });
    expect(lines.length && (task.activity ?? []).map(eventText)).toEqual([
      "created the task",
      "changed status Open → Completed",
      "set due date to 2026-11-25",
      "assigned Ann",
      "Added 2 photos",
      "placed on the plan",
      "Added 1 item",
      "unassigned Ann",
    ]);
  });

  it("every lib-strings plural has the Russian forms", () => {
    for (const v of Object.values(RU_AREAS["lib-strings"] ?? {})) if (typeof v === "object") expect(Object.keys(v)).toEqual(expect.arrayContaining(["one", "few", "many"]));
  });
});

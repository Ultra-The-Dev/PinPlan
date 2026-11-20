// Ukrainian translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTableUk from "./SubprocessorTableUk";

export const subprocessorsUk: LegalTranslation = {
  title: "Субпідрядники з обробки даних",
  intro: (
    <p>
      Ці компанії розміщують і обслуговують частини Northpin для нас і можуть обробляти Дані Замовника від нашого імені. Кожна з них пов’язана договором, який
      обмежує використання даних наданням нам її послуг. Як ми поводимося з даними, описано в нашій <Link href="/privacy">Політиці конфіденційності</Link> та{" "}
      <Link href="/legal/dpa">Угоді про обробку даних</Link>.
    </p>
  ),
  children: (
    <>
      <h2 id="list">Поточні субпідрядники</h2>
      <SubprocessorTableUk />

      <h2 id="not-subprocessors">Сервіси, які ви обираєте самі</h2>
      <p>
        Якщо ви підключаєте інтеграцію, наприклад Billdu, відомості про об’єкти та клієнтів, які ви вирішуєте надіслати, потрапляють до цього сервісу згідно з
        вашою власною угодою з його постачальником; він не є нашим субпідрядником. Карта об’єктів завантажує фрагменти карти OpenStreetMap безпосередньо у вашому
        браузері; OpenStreetMap отримує вашу IP-адресу та показану ділянку карти, але не Дані Замовника.
      </p>

      <h2 id="changes">Зміни цього списку</h2>
      <p>
        Ми оновлюємо цю сторінку до того, як новий субпідрядник почне обробляти Дані Замовника. Щоб отримувати лист про зміни, напишіть на{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> з електронної пошти свого акаунта. Замовники, на яких поширюється наша Угода про обробку даних, можуть заперечити
        проти нового субпідрядника, як описано в ній.
      </p>
    </>
  ),
};

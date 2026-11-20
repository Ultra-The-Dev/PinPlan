// Polish translation of /legal/subprocessors, for convenience only: the English page governs.
import Link from "next/link";
import { Ph, type LegalTranslation } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";
import SubprocessorTablePl from "./SubprocessorTablePl";

export const subprocessorsPl: LegalTranslation = {
  title: "Podmioty przetwarzające",
  intro: (
    <p>
      Te firmy hostują i obsługują dla nas części Northpin i mogą przetwarzać Dane Usługobiorcy w naszym imieniu. Każdą z nich wiąże umowa, która ogranicza
      wykorzystanie danych do świadczenia jej usługi na naszą rzecz. Sposób, w jaki postępujemy z danymi, opisują nasza{" "}
      <Link href="/privacy">Polityka prywatności</Link> oraz <Link href="/legal/dpa">Umowa powierzenia przetwarzania danych</Link>.
    </p>
  ),
  children: (
    <>
      <h2 id="list">Aktualne podmioty przetwarzające</h2>
      <SubprocessorTablePl />

      <h2 id="not-subprocessors">Usługi, z których decydujesz się korzystać</h2>
      <p>
        Jeśli podłączysz integrację, taką jak Billdu, dane zleceń i klientów, które zdecydujesz się wysłać, trafiają do tej usługi na podstawie Twojej własnej
        umowy z jej dostawcą; nie jest ona naszym podmiotem przetwarzającym. Mapa zleceń pobiera kafelki mapy z OpenStreetMap bezpośrednio w Twojej przeglądarce;
        OpenStreetMap otrzymuje Twój adres IP i wyświetlany obszar mapy, ale nie Dane Usługobiorcy.
      </p>

      <h2 id="changes">Zmiany tej listy</h2>
      <p>
        Aktualizujemy tę stronę, zanim nowy podmiot przetwarzający zacznie przetwarzać Dane Usługobiorcy. Aby otrzymywać wiadomość e-mail o zmianach, napisz na adres{" "}
        <Ph>{COMPANY.privacyEmail}</Ph> z adresu e-mail swojego konta. Usługobiorcy objęci naszą Umową powierzenia przetwarzania danych mogą sprzeciwić się nowemu
        podmiotowi przetwarzającemu w sposób w niej opisany.
      </p>
    </>
  ),
};

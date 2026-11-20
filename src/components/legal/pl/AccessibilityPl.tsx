// Polish translation of /accessibility, for convenience only: the English page governs. Keep it in step.
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY } from "@/lib/legal";

const S = {
  goal: { id: "goal", title: "Nasz cel" },
  done: { id: "done", title: "Co robimy" },
  limits: { id: "limitations", title: "Znane ograniczenia" },
  feedback: { id: "feedback", title: "Zgłoś nam barierę" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

export const accessibilityPl: LegalTranslation = {
  title: "Dostępność",
  toc,
  intro: (
    <p>
      Chcemy, aby z Northpin mógł korzystać każdy — w ekipie, w biurze i po stronie klienta — niezależnie od tego, jakiego urządzenia lub technologii
      wspomagającej używa.
    </p>
  ),
  children: (
    <>
      <Section item={S.goal}>
        <p>
          Dążymy do spełnienia{" "}
          <a href="https://www.w3.org/TR/WCAG22/" rel="noopener noreferrer">
            Wytycznych dotyczących dostępności treści internetowych (WCAG) 2.2
          </a>{" "}
          na poziomie AA na naszej stronie internetowej, w aplikacji internetowej i na stronach otwieranych przez Twoich klientów (wyceny, faktury, zlecenia zmiany,
          zapytania RFI i raporty zdjęciowe). Jest to cel, do którego dążymy, a nie zapewnienie, że już dziś spełnia go każda strona.
        </p>
      </Section>

      <Section item={S.done}>
        <ul>
          <li>
            Tekst i elementy sterujące są projektowane z myślą o wysokim kontraście, a z publicznej strony można korzystać za pomocą klawiatury, z widocznym fokusem
            i linkiem pomijania nawigacji.
          </li>
          <li>Strony mają prawdziwe nagłówki, etykiety i punkty orientacyjne, aby czytniki ekranu mogły się po nich poruszać.</li>
          <li>
            Strony dopasowują układ do telefonów, tabletów i komputerów, a publiczna strona uwzględnia ustawienie ograniczenia ruchu na Twoim urządzeniu.
          </li>
          <li>Urządzenia na planach są oznaczone literami i nazwami, a nie tylko kolorem, a zestawienia ilości są zawsze dostępne w postaci tabel.</li>
        </ul>
      </Section>

      <Section item={S.limits}>
        <ul>
          <li>
            <strong>Umieszczanie urządzeń na planie</strong> odbywa się dotykiem, rysikiem lub myszą na rysunku. Zestawienia ilości, wyceny i listy tworzone na
            podstawie planu można czytać i edytować za pomocą klawiatury i czytnika ekranu, ale przypięcia urządzenia w konkretnym miejscu rysunku na razie nie.
          </li>
          <li>
            <strong>Powiększanie gestem szczypania</strong> jest w przeglądarce wyłączone, aby szczypanie powiększało plan, a nie stronę. Aby powiększyć tekst, użyj
            ustawienia rozmiaru tekstu lub powiększenia w przeglądarce.
          </li>
          <li>
            <strong>Arkusze planu</strong> to obrazy przesłanych przez Ciebie rysunków, więc ich tekst jest czytelny tylko w takim stopniu jak w pliku źródłowym.
          </li>
          <li>
            <strong>Eksporty PDF</strong> (zestawienia ilości, wyceny, faktury, raporty) nie są jeszcze oznaczone tagami dla czytników ekranu. Te same informacje są
            dostępne na ekranie i w formacie CSV.
          </li>
          <li>
            <strong>Dokumenty tworzone przez Twoją firmę</strong> (warunki, notatki, zdjęcia i podpisy w wycenach i raportach) są dostępne tylko w takim stopniu,
            w jakim dostępna jest ich treść.
          </li>
        </ul>
      </Section>

      <Section item={S.feedback}>
        <p>
          Jeśli korzystanie z czegoś w Northpin jest dla Ciebie trudne lub niemożliwe, napisz na adres <Ph>{COMPANY.supportEmail}</Ph>, podając stronę lub ekran,
          co próbowałeś(-aś) zrobić oraz urządzenie i technologię wspomagającą, z których korzystasz. Staramy się odpowiadać w ciągu dwóch dni roboczych i wspólnie
          z Tobą znajdziemy rozwiązanie lub inny sposób wykonania zadania. Klienci firmy korzystającej z Northpin mogą też poprosić firmę, która przesłała im link, o dokument w
          innym formacie.
        </p>
      </Section>
    </>
  ),
};

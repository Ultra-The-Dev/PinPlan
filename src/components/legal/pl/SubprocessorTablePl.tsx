// The subprocessor table in Polish (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Polish description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const PL: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "Baza danych, uwierzytelnianie użytkowników i przechowywanie plików",
    data: "Dane konta i wszystkie synchronizowane Dane Usługobiorcy (zlecenia, plany, zdjęcia, wyceny, faktury, zapisy z terenu i pliki)",
  },
  "Cloudflare, Inc.": {
    purpose: "Hosting strony internetowej i aplikacji, funkcje serwerowe, dostarczanie treści, DNS i przekazywanie poczty e-mail",
    data: "Żądania przechodzące przez usługę, adresy IP, logi serwera",
  },
  "Stripe, Inc.": {
    purpose: "Rozliczanie subskrypcji i obsługa płatności",
    data: "Dane kontaktowe do rozliczeń, nazwa firmy, dane karty płatniczej (przechowywane przez Stripe, nie przez nas), faktury",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "Wiadomości e-mail transakcyjne (linki do logowania, zaproszenia, powiadomienia o wycenach i rozliczeniach)",
    data: "Adres e-mail i imię i nazwisko odbiorcy, treść wiadomości",
  },
  "Anthropic, PBC": {
    purpose: "Funkcje AI: odczytywanie planów pięter, sugerowanie urządzeń, podpisy zdjęć i wersje robocze dziennika budowy",
    data: "Obrazy arkuszy planu, zdjęcia ze zleceń i powiązany tekst, które zdecydujesz się przesłać do funkcji AI",
  },
  "Apple Inc.": {
    purpose: "Dystrybucja aplikacji na iOS przez App Store (oraz zakupy w aplikacji, jeśli są oferowane)",
    data: "Informacje, które Apple zbiera na własnych warunkach, gdy pobierasz lub kupujesz coś przez App Store",
  },
};

const LOCATION_PL: Record<string, string> = {
  "United States": "Stany Zjednoczone",
  "United States (global edge network)": "Stany Zjednoczone (globalna sieć brzegowa)",
};

export default function SubprocessorTablePl() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Dostawca</th>
            <th>Cel</th>
            <th>Jakie dane</th>
            <th>Lokalizacja</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{PL[s.name]?.purpose ?? s.purpose}</td>
              <td>{PL[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_PL[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

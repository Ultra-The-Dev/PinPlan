// The subprocessor table in Spanish (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Spanish description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const ES: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "Base de datos, autenticación de usuarios y almacenamiento de archivos",
    data: "Datos de la cuenta y todos los Datos del Cliente sincronizados (obras, planos, fotos, cotizaciones, facturas, registros de campo y archivos)",
  },
  "Cloudflare, Inc.": {
    purpose: "Alojamiento del sitio web y de la aplicación, funciones sin servidor, entrega de contenido, DNS y reenvío de correo electrónico",
    data: "Solicitudes que pasan por el servicio, direcciones IP, registros del servidor",
  },
  "Stripe, Inc.": {
    purpose: "Facturación de la suscripción y procesamiento de pagos",
    data: "Contacto de facturación, nombre de la empresa, datos de la tarjeta de pago (en poder de Stripe, no de nosotros), facturas",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "Correo electrónico transaccional (enlaces de inicio de sesión, invitaciones, avisos de propuestas y de facturación)",
    data: "Dirección de correo electrónico y nombre del destinatario, contenido del mensaje",
  },
  "Anthropic, PBC": {
    purpose: "Funciones de IA: lectura de planos de planta, sugerencia de dispositivos, leyendas de fotos y borradores de bitácoras diarias",
    data: "Imágenes de hojas de planos, fotos de obra y texto relacionado que usted decida enviar a una función de IA",
  },
  "Apple Inc.": {
    purpose: "Distribución de la aplicación para iOS a través del App Store (y compras dentro de la aplicación, si se ofrecen)",
    data: "Información que Apple recopila conforme a sus propios términos cuando usted descarga o compra a través del App Store",
  },
};

const LOCATION_ES: Record<string, string> = {
  "United States": "Estados Unidos",
  "United States (global edge network)": "Estados Unidos (red perimetral global)",
};

export default function SubprocessorTableEs() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Finalidad</th>
            <th>Datos implicados</th>
            <th>Ubicación</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{ES[s.name]?.purpose ?? s.purpose}</td>
              <td>{ES[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_ES[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

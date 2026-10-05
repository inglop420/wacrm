export type GradientTheme = 'legma' | 'navy' | 'emerald' | 'purple' | 'dark';
export type CalloutTheme = 'warning' | 'info' | 'success' | 'purple';

export interface CalloutRow {
  label: string;
  value: string;
}

export interface FeatureItem {
  emoji: string;
  title: string;
  description: string;
}

export interface LegmaTemplateData {
  presetId?: string;
  name: string;
  subject: string;
  headerTitle: string;
  headerSubtitle: string;
  gradient: GradientTheme;
  greeting: string;
  introParagraph: string;
  
  // Callout Box
  hasCallout: boolean;
  calloutTheme: CalloutTheme;
  calloutTitle: string;
  calloutRows: CalloutRow[];
  calloutHighlightLabel?: string;
  calloutHighlightValue?: string;
  calloutFooterNote?: string;

  // Features list
  hasFeatures: boolean;
  featuresTitle?: string;
  features: FeatureItem[];

  // CTA Button
  hasCta: boolean;
  ctaText: string;
  ctaUrl: string;

  // Notes & Footer
  closingNote: string;
  footerSentToNote: string;
  footerCopyright: string;
}

export const GRADIENTS: Record<GradientTheme, { label: string; css: string; ctaCss: string; previewClass: string }> = {
  legma: {
    label: 'LEGMA Oficial (Azul a Morado)',
    css: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    ctaCss: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    previewClass: 'from-blue-600 to-purple-600',
  },
  navy: {
    label: 'Azul Ejecutivo Legal',
    css: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
    ctaCss: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
    previewClass: 'from-blue-900 to-blue-600',
  },
  emerald: {
    label: 'Verde Éxito / Boletín',
    css: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
    ctaCss: 'linear-gradient(135deg, #065f46 0%, #059669 100%)',
    previewClass: 'from-emerald-800 to-emerald-600',
  },
  purple: {
    label: 'Púrpura Premium',
    css: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    ctaCss: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    previewClass: 'from-purple-900 to-purple-600',
  },
  dark: {
    label: 'Grafito Oscuro',
    css: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    ctaCss: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    previewClass: 'from-slate-900 to-slate-700',
  },
};

export const CALLOUT_THEMES: Record<CalloutTheme, {
  label: string;
  bg: string;
  border: string;
  titleColor: string;
  textColor: string;
  badgeBg: string;
  badgeColor: string;
}> = {
  warning: {
    label: 'Ámbar (Credenciales / Alerta)',
    bg: '#fef3c7',
    border: '#f59e0b',
    titleColor: '#92400e',
    textColor: '#78350f',
    badgeBg: '#ffffff',
    badgeColor: '#1e293b',
  },
  info: {
    label: 'Azul (Propuesta / Información)',
    bg: '#eff6ff',
    border: '#3b82f6',
    titleColor: '#1e40af',
    textColor: '#1e3a8a',
    badgeBg: '#ffffff',
    badgeColor: '#1e3a8a',
  },
  success: {
    label: 'Verde (Confirmación / Cita)',
    bg: '#ecfdf5',
    border: '#10b981',
    titleColor: '#065f46',
    textColor: '#047857',
    badgeBg: '#ffffff',
    badgeColor: '#065f46',
  },
  purple: {
    label: 'Púrpura (Oferta Especial)',
    bg: '#f5f3ff',
    border: '#8b5cf6',
    titleColor: '#5b21b6',
    textColor: '#4c1d95',
    badgeBg: '#ffffff',
    badgeColor: '#4c1d95',
  },
};

/**
 * Plantillas predefinidas corporativas homologadas para LEGMA
 */
export const LEGMA_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  badge: string;
  data: LegmaTemplateData;
}> = [
  {
    id: 'legma-bienvenida',
    name: 'Bienvenida & Credenciales (Oficial)',
    description: 'Plantilla institucional con credenciales temporales, lista de beneficios y botón de inicio de sesión.',
    badge: 'Institucional',
    data: {
      presetId: 'legma-bienvenida',
      name: 'Bienvenida a LEGMA con Credenciales',
      subject: '¡Bienvenido a LEGMA, {{contact.name}}! Tus accesos a la plataforma',
      headerTitle: 'LEGMA',
      headerSubtitle: 'Legal Manager Asistente',
      gradient: 'legma',
      greeting: '¡Bienvenido, {{contact.name}}! 👋',
      introParagraph: 'Nos alegra mucho que te unas a <strong>LEGMA</strong>, la plataforma de inteligencia artificial diseñada específicamente para abogados y firmas jurídicas en México.',
      hasCallout: true,
      calloutTheme: 'warning',
      calloutTitle: '🔑 Tus Credenciales de Acceso',
      calloutRows: [
        { label: 'Email', value: '{{contact.email}}' },
      ],
      calloutHighlightLabel: 'Contraseña temporal:',
      calloutHighlightValue: '{{password_temporal}}',
      calloutFooterNote: '⚠️ Te recomendamos cambiar esta contraseña después de tu primer inicio de sesión por motivos de seguridad.',
      hasFeatures: true,
      featuresTitle: 'Con LEGMA podrás:',
      features: [
        {
          emoji: '⚖️',
          title: 'Boletín Judicial',
          description: 'Recibe alertas automáticas y oportunas cuando haya actualizaciones en tus expedientes.',
        },
        {
          emoji: '📚',
          title: 'Biblioteca Legal',
          description: 'Consulta legislación, códigos y jurisprudencia federal al instante.',
        },
        {
          emoji: '💬',
          title: 'Asistente IA',
          description: 'Obtén análisis inmediatos sobre procedimientos legales y redacción de escritos.',
        },
      ],
      hasCta: true,
      ctaText: 'Iniciar Sesión en LEGMA',
      ctaUrl: 'https://avaasistente.vercel.app/login',
      closingNote: 'Si tienes alguna pregunta, no dudes en contactarnos.<br>Estamos aquí para ayudarte.',
      footerSentToNote: 'Este correo fue enviado a {{contact.email}}.',
      footerCopyright: '© 2026 LEGMA - Legal Manager Asistente. Todos los derechos reservados.',
    },
  },
  {
    id: 'legma-propuesta',
    name: 'Propuesta Comercial & Cotización',
    description: 'Enfocada en el cierre comercial: incluye detalles de la cotización, valor acordado y enlace a la propuesta.',
    badge: 'Ventas',
    data: {
      presetId: 'legma-propuesta',
      name: 'Envío de Propuesta Comercial',
      subject: 'Propuesta de Solución Legal Tech para {{contact.company}} - LEGMA',
      headerTitle: 'LEGMA',
      headerSubtitle: 'Legal Manager Asistente • Soluciones Corporativas',
      gradient: 'legma',
      greeting: 'Estimado/a {{contact.name}},',
      introParagraph: 'Un placer saludarte. Conforme a lo conversado con nuestro equipo comercial, te presentamos la propuesta formal de automatización jurídica y gestión digital para <strong>{{contact.company}}</strong>.',
      hasCallout: true,
      calloutTheme: 'info',
      calloutTitle: '📋 Resumen de la Propuesta Comercial',
      calloutRows: [
        { label: 'Solución', value: '{{deal.title}}' },
        { label: 'Empresa', value: '{{contact.company}}' },
        { label: 'Inversión Total', value: '{{deal.value}} MXN' },
      ],
      calloutHighlightLabel: 'Condiciones de pago:',
      calloutHighlightValue: 'Facturación mensual con garantía de servicio',
      calloutFooterNote: '⏰ Esta propuesta y condiciones preferenciales tienen vigencia de 15 días naturales.',
      hasFeatures: true,
      featuresTitle: 'Beneficios clave incluidos en tu propuesta:',
      features: [
        {
          emoji: '⚡',
          title: 'Ahorro de hasta 15 horas/semana',
          description: 'Monitoreo automatizado sin necesidad de revisión manual del boletín diario.',
        },
        {
          emoji: '🛡️',
          title: 'Seguridad y Privacidad Bancaria',
          description: 'Expedientes cifrados de extremo a extremo conforme a normativa mexicana.',
        },
        {
          emoji: '👥',
          title: 'Onboarding & Capacitación VIP',
          description: 'Sesión personalizada de inducción para todos los abogados de tu despacho.',
        },
      ],
      hasCta: true,
      ctaText: 'Revisar y Aceptar Propuesta',
      ctaUrl: 'https://crm.legma.com.mx',
      closingNote: 'Cualquier duda o ajuste a los alcances, responde directamente a este correo o avísanos por WhatsApp.',
      footerSentToNote: 'Este correo fue enviado a {{contact.email}}.',
      footerCopyright: '© 2026 LEGMA - Legal Manager Asistente. Todos los derechos reservados.',
    },
  },
  {
    id: 'legma-demo',
    name: 'Seguimiento & Agendar Demostración',
    description: 'Plantilla de prospección y seguimiento post-contacto para agendar una videollamada de 15 minutos.',
    badge: 'Prospección',
    data: {
      presetId: 'legma-demo',
      name: 'Invitación a Demostración en Vivo',
      subject: '¿Agendamos una breve demostración de LEGMA para {{contact.company}}?',
      headerTitle: 'LEGMA',
      headerSubtitle: 'Inteligencia Artificial para Abogados',
      gradient: 'navy',
      greeting: 'Hola {{contact.name}} 👋',
      introParagraph: 'Espero que estés teniendo una excelente semana. Sé lo demandante que es la operación diaria en <strong>{{contact.company}}</strong>, por lo que quiero ser muy breve.',
      hasCallout: true,
      calloutTheme: 'success',
      calloutTitle: '🎯 Sesión Demostrativa de 15 Minutos',
      calloutRows: [
        { label: 'Formato', value: 'Videollamada 1 a 1 vía Google Meet' },
        { label: 'Objetivo', value: 'Conocer tus expedientes y mostrarte el monitoreo en vivo' },
      ],
      calloutHighlightLabel: 'Beneficio exclusivo:',
      calloutHighlightValue: 'Acceso de prueba sin costo por 7 días',
      calloutFooterNote: 'Sin compromiso de compra. Queremos que experimentes el ahorro de tiempo real.',
      hasFeatures: true,
      featuresTitle: 'Lo que revisaremos en la llamada:',
      features: [
        {
          emoji: '🔍',
          title: 'Auditoría rápida de tus acuerdos',
          description: 'Carga de prueba de 3 expedientes para ver las alertas en tiempo real.',
        },
        {
          emoji: '🤖',
          title: 'Demostración del Asistente Legal IA',
          description: 'Respuestas a preguntas complejas sobre jurisprudencia y tesis aplicables.',
        },
      ],
      hasCta: true,
      ctaText: 'Elegir Fecha y Hora para la Demo',
      ctaUrl: 'https://crm.legma.com.mx',
      closingNote: '¿Tienes 15 minutos esta semana? Estaré encantado de mostrarte la herramienta.',
      footerSentToNote: 'Este correo fue enviado a {{contact.email}}.',
      footerCopyright: '© 2026 LEGMA - Legal Manager Asistente. Todos los derechos reservados.',
    },
  },
  {
    id: 'legma-alerta',
    name: 'Alerta de Expediente / Notificación',
    description: 'Notificación oficial de acuerdo judicial, cambio procesal o recordatorio urgente de término.',
    badge: 'Alertas',
    data: {
      presetId: 'legma-alerta',
      name: 'Notificación de Boletín Judicial',
      subject: '⚖️ Alerta de Boletín Judicial: Nuevo acuerdo en expediente {{deal.title}}',
      headerTitle: 'LEGMA',
      headerSubtitle: 'Sistema de Alertas Procesales en Tiempo Real',
      gradient: 'dark',
      greeting: 'Estimado/a {{contact.name}},',
      introParagraph: 'El motor de búsqueda automática de <strong>LEGMA</strong> ha detectado una nueva publicación relacionada con los expedientes asignados a tu cuenta.',
      hasCallout: true,
      calloutTheme: 'warning',
      calloutTitle: '⚖️ Resumen del Movimiento Procesal',
      calloutRows: [
        { label: 'Expediente / Asunto', value: '{{deal.title}}' },
        { label: 'Juzgado / Sala', value: 'Juzgado de Distrito en Materia Civil' },
        { label: 'Fecha de publicación', value: 'Boletín del día de hoy' },
      ],
      calloutHighlightLabel: 'Tipo de acuerdo:',
      calloutHighlightValue: 'Acuerdo dictado - Se concede vista a las partes',
      calloutFooterNote: 'Revisa de inmediato el acuerdo completo para computar tus términos procesales.',
      hasFeatures: false,
      features: [],
      hasCta: true,
      ctaText: 'Ver Expediente en la Plataforma',
      ctaUrl: 'https://avaasistente.vercel.app/dashboard',
      closingNote: 'Esta es una notificación automática generada por tu suscripción a LEGMA.',
      footerSentToNote: 'Notificación enviada a {{contact.email}}.',
      footerCopyright: '© 2026 LEGMA - Legal Manager Asistente. Todos los derechos reservados.',
    },
  },
];

/**
 * Compila el objeto de datos en el HTML final homologado con CSS inline,
 * altamente compatible con Gmail, Outlook, Apple Mail, etc.
 */
export function generateLegmaHtml(data: LegmaTemplateData): string {
  const gradientInfo = GRADIENTS[data.gradient] || GRADIENTS.legma;
  const calloutTheme = CALLOUT_THEMES[data.calloutTheme] || CALLOUT_THEMES.warning;

  // Serializa los datos en Base64 para poder reconstruirlos si el usuario edita
  let base64Meta = '';
  try {
    if (typeof window !== 'undefined') {
      base64Meta = window.btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    } else {
      base64Meta = Buffer.from(JSON.stringify(data)).toString('base64');
    }
  } catch {
    base64Meta = '';
  }

  // Genera filas de la caja destacada
  const calloutRowsHtml = (data.calloutRows || [])
    .filter((r) => r.label.trim() || r.value.trim())
    .map(
      (r) => `
        <tr>
            <td style="padding: 4px 0;">
                <p style="margin: 0; color: ${calloutTheme.textColor}; font-size: 14px;">
                    <strong>${r.label}:</strong> ${r.value}
                </p>
            </td>
        </tr>`,
    )
    .join('');

  // Genera el bloque destacado interior (ej. contraseña o monto)
  const calloutHighlightHtml = data.calloutHighlightValue
    ? `
        <tr>
            <td style="padding: 10px 0 6px 0;">
                ${
                  data.calloutHighlightLabel
                    ? `<p style="margin: 0 0 4px 0; color: ${calloutTheme.textColor}; font-size: 14px;"><strong>${data.calloutHighlightLabel}</strong></p>`
                    : ''
                }
                <div style="margin: 4px 0 0 0; padding: 12px; background: ${calloutTheme.badgeBg}; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 17px; font-weight: 700; color: ${calloutTheme.badgeColor}; letter-spacing: 0.5px; text-align: center; border: 1px solid rgba(0,0,0,0.06);">
                    ${data.calloutHighlightValue}
                </div>
            </td>
        </tr>`
    : '';

  // Genera la nota al pie de la caja
  const calloutFooterNoteHtml = data.calloutFooterNote
    ? `
        <tr>
            <td style="padding: 8px 0 0 0;">
                <p style="margin: 4px 0 0 0; color: ${calloutTheme.titleColor}; font-size: 12px; font-style: italic; line-height: 1.4;">
                    ${data.calloutFooterNote}
                </p>
            </td>
        </tr>`
    : '';

  // Bloque completo de la caja destacada
  const calloutBoxHtml = data.hasCallout
    ? `
    <!-- Highlight Callout Box -->
    <table role="presentation" style="width: 100%; background: ${calloutTheme.bg}; border-left: 4px solid ${calloutTheme.border}; border-radius: 8px; margin: 24px 0; border-collapse: collapse;">
        <tr>
            <td style="padding: 20px 24px;">
                <p style="margin: 0 0 12px 0; color: ${calloutTheme.titleColor}; font-size: 13px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                    ${data.calloutTitle}
                </p>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    ${calloutRowsHtml}
                    ${calloutHighlightHtml}
                    ${calloutFooterNoteHtml}
                </table>
            </td>
        </tr>
    </table>`
    : '';

  // Genera características / beneficios
  const featuresHtml =
    data.hasFeatures && data.features && data.features.length > 0
      ? `
    <!-- Features List -->
    ${
      data.featuresTitle
        ? `<p style="color: #334155; font-size: 15px; font-weight: 600; line-height: 1.6; margin: 22px 0 12px 0;">${data.featuresTitle}</p>`
        : ''
    }
    <table role="presentation" style="width: 100%; margin: 12px 0 20px 0; border-collapse: collapse;">
        ${data.features
          .map(
            (f) => `
        <tr>
            <td style="padding: 9px 0; vertical-align: top; width: 28px; font-size: 18px;">
                ${f.emoji}
            </td>
            <td style="padding: 9px 0 9px 8px; vertical-align: top;">
                <p style="margin: 0; color: #475569; font-size: 15px; line-height: 1.5;">
                    <strong style="color: #1e293b;">${f.title}:</strong> ${f.description}
                </p>
            </td>
        </tr>`,
          )
          .join('')}
    </table>`
      : '';

  // Genera botón CTA
  const ctaHtml = data.hasCta
    ? `
    <!-- Primary CTA Button -->
    <div style="text-align: center; margin: 32px 0 24px 0;">
        <a href="${data.ctaUrl}"
           style="display: inline-block; padding: 14px 34px; background: ${gradientInfo.ctaCss}; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.2px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25);">
            ${data.ctaText}
        </a>
    </div>`
    : '';

  // Nota de cierre
  const closingHtml = data.closingNote
    ? `
    <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 26px 0 0 0; text-align: center;">
        ${data.closingNote}
    </p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f7fa; -webkit-font-smoothing: antialiased;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="padding: 36px 12px;">
                <table role="presentation" style="max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-collapse: collapse;">
                    <!-- Header -->
                    <tr>
                        <td style="background: ${gradientInfo.css}; padding: 38px 28px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 30px; font-weight: 700; letter-spacing: -0.5px;">${data.headerTitle}</h1>
                            ${
                              data.headerSubtitle
                                ? `<p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 15px; font-weight: 400;">${data.headerSubtitle}</p>`
                                : ''
                            }
                        </td>
                    </tr>
                    
                    <!-- Content Area -->
                    <tr>
                        <td style="padding: 36px 30px;">
                            ${
                              data.greeting
                                ? `<h2 style="margin: 0 0 18px 0; color: #1e293b; font-size: 22px; font-weight: 700;">${data.greeting}</h2>`
                                : ''
                            }
                            
                            <div style="color: #475569; font-size: 15px; line-height: 1.65; margin: 0 0 18px 0;">
                                ${data.introParagraph}
                            </div>
                            
                            ${calloutBoxHtml}
                            ${featuresHtml}
                            ${ctaHtml}
                            ${closingHtml}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #f8fafc; padding: 22px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.55;">
                                ${data.footerSentToNote}<br>
                                ${data.footerCopyright}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
<!-- __LEGMA_BUILDER_DATA__:${base64Meta} -->`;
}

/**
 * Intenta extraer los datos del builder estructurado a partir del HTML.
 * Si no los encuentra, retorna null para que el editor se abra en modo HTML nativo.
 */
export function parseLegmaHtml(html: string): LegmaTemplateData | null {
  if (!html) return null;
  const match = html.match(/<!-- __LEGMA_BUILDER_DATA__:([A-Za-z0-9+/=]+) -->/);
  if (!match || !match[1]) return null;

  try {
    let jsonStr = '';
    if (typeof window !== 'undefined') {
      jsonStr = decodeURIComponent(escape(window.atob(match[1])));
    } else {
      jsonStr = Buffer.from(match[1], 'base64').toString('utf-8');
    }
    return JSON.parse(jsonStr) as LegmaTemplateData;
  } catch (err) {
    console.warn('Could not parse embedded Legma builder data:', err);
    return null;
  }
}

/**
 * Reemplaza variables dinámicas con datos de prueba realistas para la vista previa
 */
export function interpolateSampleData(html: string): string {
  return html
    .replace(/\{\{contact\.name\}\}/g, 'Lic. Luis Alonso Ruvalcaba')
    .replace(/\{\{contact\.company\}\}/g, 'Corporativo Jurídico Legma S.C.')
    .replace(/\{\{contact\.email\}\}/g, 'alonsoruvalcaba2014@gmail.com')
    .replace(/\{\{contact\.phone\}\}/g, '+52 (55) 8432-1980')
    .replace(/\{\{deal\.title\}\}/g, 'Licenciamiento Anual LEGMA IA (10 abogados)')
    .replace(/\{\{deal\.value\}\}/g, '$28,500 MXN')
    .replace(/\{\{deal\.stage\}\}/g, 'Propuesta Comercial Enviada')
    .replace(/\{\{password_temporal\}\}/g, 'LgM@2026!xT9');
}

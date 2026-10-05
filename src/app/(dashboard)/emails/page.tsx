import { EmailModule } from '@/components/email/email-module';

export const metadata = {
  title: 'Módulo de Correos | WACRM',
  description: 'Gestor de plantillas, envíos automáticos y métricas de correo.',
};

export default function EmailsPage() {
  return (
    <div className="container mx-auto max-w-7xl py-2">
      <EmailModule />
    </div>
  );
}

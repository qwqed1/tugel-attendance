import type { Metadata, Viewport } from 'next';
import { Golos_Text, Unbounded } from 'next/font/google';
import Script from 'next/script';
import { Suspense } from 'react';
import { AppProvider } from '@/lib/app';
import { Gate } from '@/components/gate';
import './globals.css';

const golos = Golos_Text({ variable: '--font-golos', subsets: ['latin', 'cyrillic', 'cyrillic-ext'] });
const unbounded = Unbounded({ variable: '--font-unbounded', subsets: ['latin', 'cyrillic', 'cyrillic-ext'] });

export const metadata: Metadata = {
  title: 'Түгел — сабаққа қатысу',
  description: 'Студенттердің сабаққа қатысуын есепке алуға арналған Telegram Mini App',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="kk" className={`${golos.variable} ${unbounded.variable} antialiased`}>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <AppProvider>
          <div className="relative mx-auto min-h-dvh w-full max-w-[520px] bg-paper shadow-[0_0_80px_rgb(0_0_0/0.12)]">
            <Suspense>
              <Gate>{children}</Gate>
            </Suspense>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}

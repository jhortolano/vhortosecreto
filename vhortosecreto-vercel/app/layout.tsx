import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Voto Secreto",
  description: "Encuestas secretas y anónimas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
